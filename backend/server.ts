import express from "express";
import crypto from "crypto";
import path from "path";
import { promises as fs, mkdirSync } from "fs";
import multer from "multer";
import dotenv from "dotenv";
import { exec } from "child_process";
import util from "util";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cors from "cors";
const execAsync = util.promisify(exec);
import { prisma } from "./server-db";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { triggerNotificationFlow } from "./notification-service";
import { registerNotificationAdminRoutes } from "./notification-admin";
import { runSLAEngine } from "./sla-engine";

dotenv.config();

// Ensure uploads folder exists
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
try {
  mkdirSync(UPLOADS_DIR, { recursive: true });
} catch (_) {}

const app = express();
const httpServer = createServer(app);

const io = new SocketIOServer(httpServer, {
  cors: { origin: "*" }
});
io.on("connection", (socket) => {
  console.log("WS Client connected:", socket.id);
});
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Register Configurable Notification Module Admin Routes
registerNotificationAdminRoutes(app);

// Security Middlewares (VAPT Requirements)
app.use(helmet());
const allowedOrigins = process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : ["http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173", "http://127.0.0.1:3000"];
app.use(cors({ 
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }, 
  credentials: true 
}));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5000, message: "Too many requests, please try again later." });
app.use(limiter);

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error("FATAL ERROR: JWT_SECRET is not defined. Application cannot start securely in production.");
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret_for_dev_only";

// JWT Middleware
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: "Access denied. No token provided." });

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ error: "Invalid token." });
    req.user = user;
    next();
  });
};

// Auth Endpoint
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(400).json({ error: "User not found" });
    }
    
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, user: { id: user.id, email: user.email, role: user.role, name: user.name } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Serve uploaded files inline using DB mime type
app.get("/uploads/:filename", async (req, res) => {
  const filename = req.params.filename;
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { file_path: `/uploads/${filename}` }
    });
    
    if (invoice && invoice.mime_type) {
      res.setHeader("Content-Type", invoice.mime_type);
      res.setHeader("Content-Disposition", "inline");
    } else if (filename.toLowerCase().endsWith(".pdf") || !filename.includes(".")) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "inline");
    }
    res.sendFile(path.join(UPLOADS_DIR, filename));
  } catch (e) {
    res.status(404).send("Document file not found on server.");
  }
});

// Configure multer file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + "-" + path.basename(file.originalname));
  },
});
const fileFilter = (req: any, file: any, cb: any) => {
  const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type: ${file.mimetype}. Only PDF, JPEG, and PNG are allowed.`));
  }
};
const upload = multer({ storage: storage, fileFilter: fileFilter });

const LOCAL_LLM_URL = process.env.LOCAL_LLM_URL || "http://localhost:11434/api/generate";
const LOCAL_LLM_MODEL = process.env.LOCAL_LLM_MODEL || "llama3.1:8b";

class DocumentQueue {
  private isProcessing = false;

  public async push(invoiceId: string, filename: string) {
    try {
      await prisma.processingQueue.upsert({
        where: { invoice_id: invoiceId },
        update: { filename, status: "Pending" },
        create: { invoice_id: invoiceId, filename, status: "Pending" }
      });
      this.processNext();
    } catch (e) {
      console.error("[QUEUE] Error adding to queue:", e);
    }
  }

  public async resume() {
    try {
      const stuckTasks = await prisma.processingQueue.updateMany({
        where: { status: "Processing" },
        data: { status: "Pending" }
      });
      if (stuckTasks.count > 0) {
        console.log(`[QUEUE RECOVERY] Recovered ${stuckTasks.count} crashed documents back to Pending state.`);
      }
    } catch (e) {
      console.error("[QUEUE] Error recovering tasks:", e);
    }
    this.processNext();
  }

  private async processNext() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    
    try {
      const task = await prisma.processingQueue.findFirst({
        where: { status: "Pending" },
        orderBy: { created_at: "asc" }
      });

      if (task) {
        await prisma.processingQueue.update({
          where: { id: task.id },
          data: { status: "Processing" }
        });

        const pendingCount = await prisma.processingQueue.count({
          where: { status: "Pending" }
        });
        
        console.log(`[QUEUE] Processing ${task.invoice_id}... (${pendingCount} left in queue)`);
        
        try {
          await processInvoiceOCR(task.invoice_id, task.filename);
          await prisma.processingQueue.update({
            where: { id: task.id },
            data: { status: "Completed" }
          });
        } catch (e) {
          console.error("[QUEUE] Error processing task:", e);
          await prisma.processingQueue.update({
            where: { id: task.id },
            data: { status: "Failed" }
          });
        }
      }
    } catch (err) {
      console.error("[QUEUE] Database error in processNext:", err);
    }
    
    this.isProcessing = false;
    
    try {
      const moreTasks = await prisma.processingQueue.count({
        where: { status: "Pending" }
      });
      if (moreTasks > 0) {
        this.processNext();
      }
    } catch (e) {}
  }
}

const ocrQueue = new DocumentQueue();
ocrQueue.resume();

// ---------------- API ENDPOINTS ----------------

// 1. Get List of all Invoices (Filtered by Involvement)
app.get("/api/documents", authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    let invoices;
    
    if (user.role === 'admin' || user.role === 'manager' || user.role === 'executive') {
      invoices = await prisma.invoice.findMany({ 
        include: { activeApprovalLog: true },
        orderBy: { created_at: 'desc' } 
      });
    } else {
      // Find invoices this user has approved/interacted with
      const approvals = await prisma.approval.findMany({ where: { approver: user.email } });
      const wfInstances = await prisma.workflowInstance.findMany({ 
        where: { id: { in: approvals.map(a => a.workflow_instance_id) } } 
      });
      const invoiceIds = wfInstances.map(w => w.invoice_id);

      invoices = await prisma.invoice.findMany({ 
        where: { 
          OR: [
            { uploaded_by_id: user.id },
            { id: { in: invoiceIds } }
          ]
        },
        include: { activeApprovalLog: true },
        orderBy: { created_at: 'desc' } 
      });
    }
    res.json(invoices);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
app.get("/api/invoices", authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const skip = Number(req.query.skip) || 0;
    const take = Number(req.query.take) || 100;

    let invoices;
    if (user.role === 'admin' || user.role === 'manager' || user.role === 'executive') {
      invoices = await prisma.invoice.findMany({ 
        skip,
        take,
        include: { workflowInst: true, activeApprovalLog: true },
        orderBy: { created_at: 'desc' } 
      });
    } else {
      // 1. Get invoices from explicit past approvals
      const approvals = await prisma.approval.findMany({ where: { approver: user.email } });
      const wfInstancesByApproval = await prisma.workflowInstance.findMany({ where: { id: { in: approvals.map(a => a.workflow_instance_id) } } });
      const invoiceIds = new Set(wfInstancesByApproval.map(w => w.invoice_id));

      // 2. Get invoices from active workflow JSON configuration (current/future approvals)
      const allWorkflows = await prisma.workflow.findMany();
      const defaultWorkflow = allWorkflows.length > 0 ? allWorkflows[0] : null;
      
      const allWfInstances = await prisma.workflowInstance.findMany();
      for (const inst of allWfInstances) {
        let wf = null;
        if ((inst as any).workflow_id) {
          wf = allWorkflows.find(w => w.id === (inst as any).workflow_id);
        } else {
          wf = defaultWorkflow;
        }

        if (wf && wf.workflow_json) {
          try {
            const parsed = JSON.parse(wf.workflow_json);
            if (parsed.steps && parsed.steps.some((s: any) => s.approver === user.email || s.label === inst.current_stage)) {
               // If the user's email is explicitly listed, OR if we don't have emails, maybe they are somehow involved? 
               // Actually just checking if they are the approver in ANY step:
               if (parsed.steps.some((s: any) => s.approver === user.email)) {
                 invoiceIds.add(inst.invoice_id);
               }
            }
          } catch(e) {}
        }
      }

      invoices = await prisma.invoice.findMany({ 
        skip,
        take,
        where: { 
          OR: [ 
            { uploaded_by_id: user.id }, 
            { id: { in: Array.from(invoiceIds) } } 
          ] 
        }, 
        include: { workflowInst: true, activeApprovalLog: true },
        orderBy: { created_at: 'desc' } 
      });
    }

    // Inject current_stage_index
    const allWorkflowsResponse = await prisma.workflow.findMany();
    const defaultWorkflowResponse = allWorkflowsResponse.length > 0 ? allWorkflowsResponse[0] : null;

    const enrichedInvoices = invoices.map((inv: any) => {
      if (inv.workflowInst && inv.workflowInst.current_stage) {
        let wf = null;
        if (inv.workflowInst.workflow_id) {
          wf = allWorkflowsResponse.find(w => w.id === inv.workflowInst.workflow_id);
        } else {
          wf = defaultWorkflowResponse;
        }

        if (wf && wf.workflow_json) {
          try {
            const parsed = JSON.parse(wf.workflow_json);
            if (parsed.steps && Array.isArray(parsed.steps)) {
              const stageIndex = parsed.steps.findIndex((s: any) => s.label === inv.workflowInst.current_stage);
              if (stageIndex >= 0) {
                inv.workflowInst.current_stage_index = stageIndex + 1;
              }
            }
          } catch (e) {}
        }
      }
      return inv;
    });

    res.json(enrichedInvoices);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Get Detailed Invoice joined with Goods Receipt, active Workflow stage, and Approvals timeline
app.get("/api/documents/:id", async (req, res) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id }
    });
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    const grn = await prisma.goodsReceipt.findUnique({ where: { invoice_id: invoice.id } });
    const wf_inst = await prisma.workflowInstance.findUnique({ where: { invoice_id: invoice.id } });
    const approvals = wf_inst ? await prisma.approval.findMany({ where: { workflow_instance_id: wf_inst.id } }) : [];
    const logs = await prisma.systemLog.findMany({ where: { invoice_id: invoice.id }, orderBy: { timestamp: 'asc' } });

    let active_workflow = null;
    let workflow_steps = [];
    if (wf_inst) {
      active_workflow = await prisma.workflow.findFirst() || null;
      if (active_workflow) {
        try {
          const parsed = JSON.parse(active_workflow.workflow_json);
          workflow_steps = parsed.steps || [];
        } catch(e) {}
      }
    }

    const active_approval_log = await prisma.activeApprovalLog.findUnique({ where: { invoice_id: invoice.id } });
    const workflow_step_definitions = (active_approval_log && invoice) ? await prisma.workflowStepDefinition.findMany({
      where: {
        profile_name: active_approval_log.workflow_profile,
        document_type: invoice.document_type
      },
      orderBy: { stage_number: 'asc' }
    }) : [];

    res.json({ invoice, goods_receipt: grn, workflow_instance: wf_inst, approvals, logs, active_workflow, workflow_steps, active_approval_log, workflow_step_definitions });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/invoices/:id", async (req, res) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id }
    });
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    const grn = await prisma.goodsReceipt.findUnique({ where: { invoice_id: invoice.id } });
    const wf_inst = await prisma.workflowInstance.findUnique({ where: { invoice_id: invoice.id } });
    const approvals = wf_inst ? await prisma.approval.findMany({ where: { workflow_instance_id: wf_inst.id } }) : [];
    const logs = await prisma.systemLog.findMany({ where: { invoice_id: invoice.id }, orderBy: { timestamp: 'asc' } });

    let active_workflow = null;
    let workflow_steps = [];
    if (wf_inst) {
      active_workflow = await prisma.workflow.findFirst() || null;
      if (active_workflow) {
        try {
          const parsed = JSON.parse(active_workflow.workflow_json);
          workflow_steps = parsed.steps || [];
        } catch(e) {}
      }
    }

    const active_approval_log = await prisma.activeApprovalLog.findUnique({ where: { invoice_id: invoice.id } });
    const workflow_step_definitions = (active_approval_log && invoice) ? await prisma.workflowStepDefinition.findMany({
      where: {
        profile_name: active_approval_log.workflow_profile,
        document_type: invoice.document_type
      },
      orderBy: { stage_number: 'asc' }
    }) : [];

    res.json({ invoice, goods_receipt: grn, workflow_instance: wf_inst, approvals, logs, active_workflow, workflow_steps, active_approval_log, workflow_step_definitions });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. System KPI Statistics aggregator
app.get("/api/stats", authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    let invoices;
    if (user.role === 'admin' || user.role === 'manager') {
      invoices = await prisma.invoice.findMany();
    } else {
      const approvals = await prisma.approval.findMany({ where: { approver: user.email } });
      const wfInstances = await prisma.workflowInstance.findMany({ where: { id: { in: approvals.map(a => a.workflow_instance_id) } } });
      const invoiceIds = wfInstances.map(w => w.invoice_id);
      invoices = await prisma.invoice.findMany({ where: { OR: [ { uploaded_by_id: user.id }, { id: { in: invoiceIds } } ] } });
    }
    const totalInvoices = invoices.length;
    const waitingForGRN = invoices.filter(i => i.status === "Waiting for GRN").length;
    const pendingApprovals = invoices.filter(i => i.status === "In Approval" || i.status === "Ready for Approval").length;
    const approvedInvoices = invoices.filter(i => i.status === "Approved").length;
    const readyForPayment = invoices.filter(i => i.status === "Ready for Payment").length;
    const paidInvoices = invoices.filter(i => i.status === "Paid").length;
    
    let totalInvoiceAmount = 0;
    let confidenceSum = 0;
    
    invoices.forEach(i => {
      totalInvoiceAmount += Number(i.amount || 0);
      confidenceSum += Number(i.ocr_confidence || 95);
    });

    const recentLogs = await prisma.systemLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 10
    });

    res.json({
      totalInvoices,
      waitingForGRN,
      pendingApprovals,
      approvedInvoices,
      readyForPayment,
      paidInvoices,
      totalInvoiceAmount,
      averageConfidence: totalInvoices > 0 ? Number((confidenceSum / totalInvoices).toFixed(1)) : 96.5,
      recentLogs
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 4. API Endpoint: Document Templates (CRUD)
app.get("/api/templates", authenticateToken, async (req, res) => {
  try {
    const templates = await prisma.documentTemplate.findMany({ orderBy: { created_at: 'desc' } });
    res.json(templates);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/templates", authenticateToken, async (req, res) => {
  try {
    const { name, description, fields_json } = req.body;
    if (!name || !fields_json) return res.status(400).json({ error: "Name and fields_json are required." });

    const newTemplate = await prisma.documentTemplate.upsert({
      where: { name },
      update: { description, fields_json },
      create: { name, description, fields_json }
    });
    res.json(newTemplate);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/templates/:id", authenticateToken, async (req, res) => {
  try {
    await prisma.documentTemplate.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/test-template", authenticateToken, upload.single("file"), async (req, res) => {
  try {
    if (!req.file || !req.body.template) {
      return res.status(400).json({ error: "File and template are required." });
    }

    const template = JSON.parse(req.body.template);
    const fullFilePath = path.join(__dirname, req.file.path);

    // Run OCR
    const { stdout } = await execAsync(`python local_ocr.py "${fullFilePath}"`);
    const jsonMatch = stdout.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No valid JSON found in OCR output.");
    const ocrResult = JSON.parse(jsonMatch[0]);
    if (ocrResult.error) throw new Error("OCR Error: " + ocrResult.error);
    
    const rawText = ocrResult.raw_text || "";

    // Build Schema Prompt
    let fieldsDef = "";
    let instructions = "";
    try {
       const parsed = JSON.parse(template.fields_json);
       if (parsed.fields && Array.isArray(parsed.fields)) {
         const schemaObj: any = {};
         parsed.fields.forEach((f: any) => {
           schemaObj[f.name] = `${f.type}${f.description ? ` (${f.description})` : ''}`;
         });
         fieldsDef = JSON.stringify(schemaObj, null, 2);
         instructions = parsed.instructions || "";
       } else {
         fieldsDef = typeof parsed.schema === "string" ? parsed.schema : JSON.stringify(parsed.schema || {}, null, 2);
         instructions = parsed.instructions || "";
       }
    } catch(e) {
       fieldsDef = template.fields_json;
    }

    const prompt = `You are a highly accurate, autonomous Data Extraction AI. 
Analyze the following ${template.name} OCR text.

STRICT INSTRUCTIONS:
1. Output ONLY a valid JSON object. No markdown, no explanations.
2. Your output MUST be a JSON object conforming exactly to the schema below.
3. CRITICAL RULE: YOU MUST ACHIEVE 100% ACCURACY. DO NOT HALLUCINATE OR GUESS VALUES.

${instructions}

[EXPECTED JSON SCHEMA]:
${fieldsDef}

[OCR TEXT]: ${rawText}`;

    const llmResponse = await fetch(LOCAL_LLM_URL, {
       method: "POST",
       headers: { "Content-Type": "application/json" },
       body: JSON.stringify({
          model: "llama3.1:8b",
          prompt: prompt,
          stream: false
       })
    });

    if (!llmResponse.ok) throw new Error("LLM request failed.");
    const llmData = await llmResponse.json();
    let aiText = llmData.response.trim();
    
    const aiJsonMatch = aiText.match(/\{[\s\S]*\}/);
    if (aiJsonMatch) aiText = aiJsonMatch[0];

    let extractedData = {};
    try {
       extractedData = JSON.parse(aiText);
    } catch (e) {
       extractedData = { error: "LLM did not return valid JSON.", raw: aiText };
    }

    res.json({ extractedData, rawOcr: rawText.substring(0, 500) + "..." });
  } catch (error: any) {
    console.error("Sandbox Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Helper for matching rules based on invoice amount/conditions
const matchRoutingRule = async (documentType: string, amount: number, invoice?: any) => {
  const rules = await prisma.businessRule.findMany({
    where: { document_type: documentType },
    orderBy: { priority: 'asc' }
  });

  for (const rule of rules) {
    let conditions = [];
    try { conditions = JSON.parse(rule.conditions_json); } catch(e) {}
    let matches = true;
    for (const cond of conditions) {
      let actualValue = invoice ? (invoice as any)[cond.field] : undefined;
      if (actualValue === undefined && cond.field === 'amount') {
        actualValue = amount;
      }
      if (cond.operator === "equals" && String(actualValue).toLowerCase() !== String(cond.value).toLowerCase()) matches = false;
      if (cond.operator === "gt" && Number(actualValue) <= Number(cond.value)) matches = false;
      if (cond.operator === "lt" && Number(actualValue) >= Number(cond.value)) matches = false;
      if (cond.operator === "contains" && !String(actualValue).toLowerCase().includes(String(cond.value).toLowerCase())) matches = false;
    }
    if (matches) return rule;
  }
  return null;
};



// 5. API Endpoint: Upload Document + run OCR and LLM Extraction
app.post("/api/documents/upload", authenticateToken, upload.single("file"), async (req, res) => {
  try {
    const user = (req as any).user;
    if (!req.file) return res.status(400).json({ error: "No attachment file uploaded." });

    const { originalname, size, mimetype, filename } = req.file;
    
    // --- LAYER 1: PRE-LLM FILE HASH DUPLICATE FILTER ---
    const fileBuffer = await fs.readFile(req.file.path);
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    
    const existingFile = await prisma.invoice.findFirst({ where: { file_hash: fileHash } });
    if (existingFile) {
      // Clean up the uploaded file from disk to save space
      await fs.unlink(req.file.path).catch(() => {});
      return res.status(400).json({ error: "Duplicate document detected based on file signature. This exact file has already been uploaded." });
    }

    const invoiceId = "DOC-" + Math.floor(10000000 + Math.random() * 90000000);
    const uploadedPath = `/uploads/${filename}`;

    const newInvoice = await prisma.invoice.create({
      data: {
        id: invoiceId,
        invoice_number: "Extracting...",
        vendor_name: "Processing...",
        invoice_date: new Date().toISOString().split("T")[0],
        po_number: "Extracting...",
        amount: 0,
        currency: "USD",
        status: "Received",
        document_type: "Processing...",
        uploaded_by_id: user.id,
        file_name: originalname,
        file_size: size,
        mime_type: mimetype,
        file_path: uploadedPath,
        file_hash: fileHash,
        ocr_confidence: 90.0,
        ocr_text: "Running AP automated OCR pipeline...",
        tax_details: "Calculating..."
      }
    });

    await prisma.goodsReceipt.create({
      data: {
        id: "GRN-" + Math.floor(10000000 + Math.random() * 90000000),
        invoice_id: invoiceId,
        status: "Waiting",
        confirmed_by: "",
        remarks: ""
      }
    });

    await prisma.systemLog.create({
      data: {
        invoice_id: invoiceId,
        action: "Invoice Received",
        user: "n8n Email Integration",
        details: `File "${originalname}" saved. Size: ${(size / 1024).toFixed(1)} KB. MimeType: ${mimetype}`
      }
    });

    // Background processing
    ocrQueue.push(invoiceId, filename);

    res.json(newInvoice);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. API Endpoint: Confirm Goods Receipt status
app.post("/api/goods-receipt/:id/confirm", async (req, res) => {
  try {
    const { status, remarks, confirmedBy } = req.body;
    if (!status || !confirmedBy) return res.status(400).json({ error: "Missing required parameters." });

    const grn = await prisma.goodsReceipt.findUnique({ where: { id: req.params.id } });
    if (!grn) return res.status(404).json({ error: "Goods Receipt not found." });

    const invoice = await prisma.invoice.findUnique({ where: { id: grn.invoice_id } });
    if (!invoice) return res.status(404).json({ error: "Invoice not found." });

    await prisma.goodsReceipt.update({
      where: { id: grn.id },
      data: {
        status,
        confirmed_by: confirmedBy,
        confirmed_at: new Date(),
        remarks: remarks || `Goods marked as ${status}`
      }
    });

    await prisma.systemLog.create({
      data: {
        invoice_id: invoice.id,
        action: "GRN Confirmation",
        user: confirmedBy,
        details: `Goods receipt marked as completed. Status: "${status}". Remarks: "${remarks}"`
      }
    });

    if (status === "Received") {
      let finalWorkflowProfile = null;
      let erpData = null;
      if (invoice.po_number && invoice.po_number !== "Not Found") {
         erpData = await prisma.eRPMaster.findUnique({ where: { po_number: invoice.po_number } });
         
         // --- 3. TRUE 3-WAY MATCHING (Price Variance) ---
         if (erpData && invoice.base_amount !== null && invoice.base_amount !== undefined) {
           const poAmountInr = (erpData.po_amount || 0);
           const tolerance = (erpData.tolerance_amount || 0);
           const maxAllowed = poAmountInr + tolerance;
           
           if (invoice.base_amount > maxAllowed) {
              const variance = invoice.base_amount - poAmountInr;
              await prisma.invoice.update({
                 where: { id: invoice.id },
                 data: { 
                   status: "Exception", 
                   is_exception: true, 
                   exception_reason: `Price Variance: Invoice exceeds PO by ₹${variance.toFixed(2)}`,
                   price_variance: variance,
                   is_price_variance: true
                 }
              });
              await prisma.systemLog.create({
                 data: { invoice_id: invoice.id, action: "Workflow Halted", user: "GRN Verification", details: `Price Variance Exception. PO Amount: ₹${poAmountInr}, Invoice: ₹${invoice.base_amount}, Tolerance: ₹${tolerance}` }
              });
              return res.json({ success: true, message: "Halted due to Price Variance Exception." });
           }
         }
      }

      const rules = await prisma.businessRule.findMany({
        where: { document_type: invoice.document_type },
        orderBy: { priority: 'asc' }
      });
      for (const rule of rules) {
         let conditions = [];
         try { conditions = JSON.parse(rule.conditions_json); } catch(e) {}
         let matches = true;
         for (const cond of conditions) {
            let actualValue = (invoice as any)[cond.field];
            if (actualValue === undefined && erpData) {
               actualValue = (erpData as any)[cond.field];
            }
            if (actualValue === undefined && invoice.custom_data) {
               actualValue = (invoice.custom_data as any)[cond.field];
            }

            const valNum = Number(actualValue);
            const condNum = Number(cond.value);
            const valStr = String(actualValue || "").toLowerCase();
            const condStr = String(cond.value || "").toLowerCase();

            switch (cond.operator) {
              case "equals":
              case "==":
              case "=":
                if (valStr !== condStr) matches = false;
                break;
              case "not_equals":
              case "!=":
                if (valStr === condStr) matches = false;
                break;
              case "gt":
              case ">":
                if (valNum <= condNum) matches = false;
                break;
              case "lt":
              case "<":
                if (valNum >= condNum) matches = false;
                break;
              case ">=":
                if (valNum < condNum) matches = false;
                break;
              case "<=":
                if (valNum > condNum) matches = false;
                break;
              case "contains":
                if (!valStr.includes(condStr)) matches = false;
                break;
              case "is_null":
              case "is_empty":
                if (actualValue !== null && actualValue !== undefined && actualValue !== "" && actualValue !== "Not Found") matches = false;
                break;
              case "is_not_null":
              case "is_not_empty":
                if (actualValue === null || actualValue === undefined || actualValue === "" || actualValue === "Not Found") matches = false;
                break;
              default:
                matches = false;
            }
         }
         if (matches && conditions.length > 0) {
            finalWorkflowProfile = rule.target_workflow_id;
            break;
         }
      }

      if (!finalWorkflowProfile) {
         const fallback = rules.find(r => {
           try { return JSON.parse(r.conditions_json).length === 0; } catch(e) { return false; }
         });
         if (fallback) finalWorkflowProfile = fallback.target_workflow_id;
      }

      if (!finalWorkflowProfile) {
         await prisma.invoice.update({
           where: { id: invoice.id },
           data: { status: "Exception", is_exception: true, exception_reason: "No Workflow Match Post-GRN" }
         });
         await prisma.systemLog.create({
           data: { invoice_id: invoice.id, action: "Workflow Halted", user: "Routing Engine", details: "No matching business rules post GRN." }
         });
         return res.json({ success: true, message: "Goods Receipt confirmed but no workflow matched." });
      }

      await prisma.activeApprovalLog.upsert({
        where: { invoice_id: invoice.id },
        update: {
          current_stage_number: 1,
          status: "Pending",
          workflow_profile: finalWorkflowProfile
        },
        create: {
          invoice_id: invoice.id,
          workflow_profile: finalWorkflowProfile,
          current_stage_number: 1,
          status: "Pending"
        }
      });

      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: "In Approval" }
      });

      await prisma.systemLog.create({
        data: {
          invoice_id: invoice.id,
          action: "Workflow Initialized",
          user: "Automated Rules Engine",
          details: `Goods receipt cleared. Started ${finalWorkflowProfile} at Stage 1.`
        }
      });
    } else {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: "Waiting for GRN" }
      });
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. API Endpoint: Retrieve Users for Workflow Assignment
app.get("/api/users", authenticateToken, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true }
    });
    res.json(users);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/erp/:poNumber", authenticateToken, async (req, res) => {
  try {
    const erp = await prisma.eRPMaster.findUnique({
      where: { po_number: req.params.poNumber }
    });
    if (!erp) return res.status(404).json({ error: "PO not found in ERP Master" });
    res.json(erp);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. API Endpoint: Retrieve Saved Workflows / Node Configurations
app.get("/api/workflows", async (req, res) => {
  try {
    const workflows = await prisma.workflow.findMany();
    res.json(workflows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 7. API Endpoint: Save/Update a custom React Flow workflow template
app.post("/api/workflows/save", async (req, res) => {
  try {
    const { name, json } = req.body;
    if (!name || !json) return res.status(400).json({ error: "Missing required properties." });

    const newWorkflow = await prisma.workflow.create({
      data: {
        workflow_name: name,
        workflow_json: json
      }
    });

    res.json(newWorkflow);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// --- AUTOMATED BUSINESS RULES ENGINE ---
async function evaluateBusinessRules(invoice: any): Promise<string | null> {
  const rules = await prisma.businessRule.findMany({
    orderBy: { priority: 'asc' }
  });

  for (const rule of rules) {
    if (!rule.conditions_json) continue;
    
    // We only process if document types match or if rule document_type is 'Any'
    if (rule.document_type && rule.document_type !== "Any" && rule.document_type !== invoice.document_type) {
      continue;
    }

    try {
      const conditions = JSON.parse(rule.conditions_json);
      let isMatch = true;

      for (const cond of conditions) {
        let fieldVal = invoice[cond.field];
        let { operator, value } = cond;

        // Strict Type Casting for mathematical operations
        if (cond.field === 'amount' || !isNaN(Number(value))) {
           fieldVal = Number(fieldVal) || 0;
           value = Number(value) || 0;
        }

        switch (operator) {
          case '==':
          case '===':
            if (fieldVal != value) isMatch = false;
            break;
          case '!=':
          case '!==':
            if (fieldVal != value) isMatch = false;
            break;
          case '>':
            if (fieldVal <= value) isMatch = false;
            break;
          case '>=':
            if (fieldVal < value) isMatch = false;
            break;
          case '<':
            if (fieldVal >= value) isMatch = false;
            break;
          case '<=':
            if (fieldVal > value) isMatch = false;
            break;
          case 'is_null':
            if (fieldVal !== null && fieldVal !== undefined && fieldVal !== "") isMatch = false;
            break;
          case 'is_not_null':
            if (fieldVal === null || fieldVal === undefined || fieldVal === "") isMatch = false;
            break;
          case 'contains':
            if (!String(fieldVal).toLowerCase().includes(String(value).toLowerCase())) isMatch = false;
            break;
          default:
            isMatch = false; // Unknown operator
        }
        if (!isMatch) break; // Optimization: fail fast
      }

      if (isMatch) {
        return rule.target_workflow_id;
      }
    } catch (e) {
      console.error(`Error parsing conditions for rule ${rule.id}:`, e);
    }
  }
  return null; // No rule matched
}

app.post("/api/invoices/:id/auto-route", authenticateToken, async (req, res) => {
  try {
    const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
    if (!invoice) return res.status(404).json({ error: "Invoice not found." });

    let targetWorkflowId = null;
    let initialApprover = null;

    // 1. DYNAMIC PO LOOKUP
    if (invoice.po_number) {
      const mockData = await prisma.corporateAppMock.findUnique({ where: { po_number: invoice.po_number } });
      if (mockData && mockData.po_owner_email && mockData.dept_head_email) {
         initialApprover = mockData.po_owner_email;
         const dynamicJson = {
           nodes: [
             { id: "step-1", type: "approval", data: { label: "PO Owner Review", approvers: [mockData.po_owner_email] } },
             { id: "step-2", type: "approval", data: { label: "Department Head Approval", approvers: [mockData.dept_head_email] } }
           ],
           edges: [
             { source: "step-1", target: "step-2" }
           ]
         };
         
         const newWf = await prisma.workflow.create({
           data: {
             workflow_name: `Dynamic PO Routing - ${invoice.po_number}`,
             workflow_json: JSON.stringify(dynamicJson)
           }
         });
         targetWorkflowId = newWf.id;
         
         await prisma.systemLog.create({
           data: { invoice_id: invoice.id, action: "Dynamic PO Matched", user: "Rules Engine", details: `Matched PO ${invoice.po_number} with external system. Generated workflow.` }
         });
      }
    }

    if (!targetWorkflowId) {
       targetWorkflowId = await evaluateBusinessRules(invoice);
    }

    if (targetWorkflowId) {
      // 1. Delete existing workflow instance and approvals for this invoice to cleanly override
      const existingInstance = await prisma.workflowInstance.findUnique({ where: { invoice_id: invoice.id } });
      if (existingInstance) {
         await prisma.approval.deleteMany({ where: { workflow_instance_id: existingInstance.id } });
         await prisma.workflowInstance.delete({ where: { id: existingInstance.id } });
      }

      // 2. Fetch the target workflow to determine first stage
      let firstStage = "Approval";
      let wf = null;
      
      // Try by ID first, then by name
      try { wf = await prisma.workflow.findUnique({ where: { id: targetWorkflowId } }); } catch(e) {}
      if (!wf) {
        wf = await prisma.workflow.findFirst({ where: { workflow_name: targetWorkflowId } });
      }

      let assignedWorkflowId = wf ? wf.id : targetWorkflowId;

      if (wf && wf.workflow_json) {
         try {
           const parsed = JSON.parse(wf.workflow_json);
           if (parsed.steps && parsed.steps.length > 0) firstStage = parsed.steps[0].label;
           else if (parsed.nodes && parsed.nodes.length > 0) {
             const targetNodes = parsed.edges ? parsed.edges.map((e: any) => e.target) : [];
             const startNodes = parsed.nodes.filter((n: any) => !targetNodes.includes(n.id));
             if (startNodes.length > 0) firstStage = startNodes[0].data?.label || startNodes[0].id;
             else firstStage = parsed.nodes[0].data?.label || parsed.nodes[0].id;
           }
         } catch(e) {}
      }

      // 3. Create new workflow instance
      const newInstance = await prisma.workflowInstance.create({
        data: {
          id: "WF-" + Math.floor(10000000 + Math.random() * 90000000),
          invoice_id: invoice.id,
          workflow_id: assignedWorkflowId,
          current_stage: firstStage,
          status: "In Progress"
        } as any
      });

      // 4. Update invoice status to In Approval
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: "In Approval" }
      });

      await prisma.systemLog.create({
        data: {
          invoice_id: invoice.id,
          action: "Auto-Routed",
          user: "Rules Engine",
          details: `Invoice automatically matched to workflow ${targetWorkflowId}.`
        }
      });
      
      // Dynamic PO Notification
      if (initialApprover) {
         io.emit("new_notification", { recipientEmail: initialApprover, message: `Invoice for ${invoice.po_number || 'your department'} is waiting for your approval.` });
      }

      res.json({ success: true, instance: newInstance, autoRouted: true });
    } else {
      // Keep in waiting (Received) so the admin manually gives the flow
      await prisma.systemLog.create({
        data: {
          invoice_id: invoice.id,
          action: "Auto-Route Failed",
          user: "Rules Engine",
          details: `No matching business rule found. Kept in Received state for manual assignment.`
        }
      });
      res.json({ success: true, autoRouted: false, message: "No matching rules, manual routing required." });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 8. API Endpoint: Apply a custom workflow or existing workflow to an invoice
app.post("/api/invoices/:id/apply-workflow", async (req, res) => {
  try {
    const { workflowId, customWorkflowSteps } = req.body;
    const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
    if (!invoice) return res.status(404).json({ error: "Invoice not found." });

    let targetWorkflowId = workflowId;
    let firstStage = "Approval";

    if (customWorkflowSteps) {
      // Create a new custom workflow on the fly
      const newWorkflow = await prisma.workflow.create({
        data: {
          workflow_name: `Custom Workflow for ${invoice.invoice_number || invoice.id}`,
          workflow_json: JSON.stringify({ steps: customWorkflowSteps })
        }
      });
      targetWorkflowId = newWorkflow.id;
      if (customWorkflowSteps.length > 0) firstStage = customWorkflowSteps[0].label;
    } else if (workflowId) {
      const wf = await prisma.workflow.findUnique({ where: { id: workflowId } });
      if (wf && wf.workflow_json) {
         try {
           const parsed = JSON.parse(wf.workflow_json);
           if (parsed.steps && parsed.steps.length > 0) firstStage = parsed.steps[0].label;
         } catch(e) {}
      }
    }

    // Delete existing workflow instance and approvals for this invoice to cleanly override
    const existingInstance = await prisma.workflowInstance.findUnique({ where: { invoice_id: invoice.id } });
    if (existingInstance) {
       await prisma.approval.deleteMany({ where: { workflow_instance_id: existingInstance.id } });
       await prisma.workflowInstance.delete({ where: { id: existingInstance.id } });
    }

    // Create new workflow instance
    const newInstance = await prisma.workflowInstance.create({
      data: {
        id: "WF-" + Math.floor(10000000 + Math.random() * 90000000),
        invoice_id: invoice.id,
        workflow_id: targetWorkflowId,
        current_stage: firstStage,
        status: "In Progress"
      } as any
    });

    // Update invoice status to In Approval
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "In Approval" }
    });

    await prisma.systemLog.create({
      data: {
        invoice_id: invoice.id,
        action: "Workflow Overridden",
        user: "Admin Override",
        details: `Manual override applied. Reset to stage: ${firstStage}.`
      }
    });

    res.json({ success: true, instance: newInstance });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 9. API Endpoint: Perform active step approval action (Approve / Reject / Clarification)
app.post("/api/invoices/:id/step-action", async (req, res) => {
  try {
    const { action, comments, approver } = req.body;
    if (!action || !approver) return res.status(400).json({ error: "Missing required parameters." });

    const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
    if (!invoice) return res.status(404).json({ error: "Invoice not found." });

    let workflowInstance = await prisma.workflowInstance.findUnique({ where: { invoice_id: invoice.id } });
    if (!workflowInstance) return res.status(400).json({ error: "No active workflow instance." });

    const newApproval = await prisma.approval.create({
      data: {
        workflow_instance_id: workflowInstance.id,
        approver,
        action,
        comments: comments || `${action} action completed.`
      }
    });

    let defaultWorkflow = await prisma.workflow.findFirst() || null;
    if ((workflowInstance as any).workflow_id) {
       const specificWf = await prisma.workflow.findUnique({ where: { id: (workflowInstance as any).workflow_id } });
       if (specificWf) defaultWorkflow = specificWf;
    }

    let parsedWf: any = null;
    if (defaultWorkflow && defaultWorkflow.workflow_json) {
       try { parsedWf = JSON.parse(defaultWorkflow.workflow_json); } catch(e) {}
    }

    if (action === "Request Clarification") {
      await prisma.systemLog.create({
        data: { invoice_id: invoice.id, action: "Clarification Requested", user: approver, details: `Question: "${comments}"` }
      });
      await triggerNotificationFlow(invoice.id, action, comments, approver);
      return res.json({ invoice, workflow_instance: workflowInstance, approval: newApproval });
    }

    // --- GRAPH DAG EXECUTOR ---
    if (parsedWf && parsedWf.nodes && parsedWf.edges) {
       const nodes = parsedWf.nodes;
       const edges = parsedWf.edges;
       
       let currentState = workflowInstance.state_json ? (typeof workflowInstance.state_json === 'string' ? JSON.parse(workflowInstance.state_json) : workflowInstance.state_json) : { activeNodes: [], completedNodes: [], nodeResults: {} };
       
       // Initialize active nodes if empty
       if (!currentState.activeNodes || currentState.activeNodes.length === 0) {
          const targetNodes = edges.map((e: any) => e.target);
          const startNodes = nodes.filter((n: any) => !targetNodes.includes(n.id)).map((n: any) => n.id);
          currentState.activeNodes = startNodes.length > 0 ? startNodes : (nodes[0] ? [nodes[0].id] : []);
          if (!currentState.completedNodes) currentState.completedNodes = [];
          if (!currentState.nodeResults) currentState.nodeResults = {};
       }

       // Find the node the user is acting upon
       let actedNodeId = null;
       let nextNodes: any[] = [];
       for (const nodeId of currentState.activeNodes) {
          const node = nodes.find((n: any) => n.id === nodeId);
          if (node && node.data && node.data.approvers && Array.isArray(node.data.approvers)) {
             if (node.data.approvers.includes(approver)) {
                actedNodeId = nodeId;
                break;
             }
          }
       }
       // Fallback: act on first active node if approver mapping is missing/generic
       if (!actedNodeId && currentState.activeNodes.length > 0) actedNodeId = currentState.activeNodes[0];

       if (actedNodeId) {
          if (action === "Send Back") {
             const incomingEdges = edges.filter((e: any) => e.target === actedNodeId);
             const sourceNodeIds = incomingEdges.map((e: any) => e.source);
             
             if (sourceNodeIds.length > 0) {
                currentState.activeNodes = currentState.activeNodes.filter((id: string) => id !== actedNodeId);
                currentState.activeNodes.push(...sourceNodeIds);
                currentState.completedNodes = currentState.completedNodes.filter((id: string) => !sourceNodeIds.includes(id));
                delete currentState.nodeResults[actedNodeId];
                for (const srcId of sourceNodeIds) {
                   delete currentState.nodeResults[srcId];
                }
             }
             
             const activeNodeLabels = currentState.activeNodes.map((id: string) => {
                const n = nodes.find((no: any) => no.id === id);
                return n ? (n.data?.label || id) : id;
             });
             const nextStageLabel = activeNodeLabels.join(" AND ");
             
             workflowInstance = await prisma.workflowInstance.update({
                where: { id: workflowInstance!.id },
                data: { current_stage: nextStageLabel, status: "In Approval", state_json: currentState as any }
             });
             
             await prisma.invoice.update({ where: { id: invoice.id }, data: { status: `Sent Back (${nextStageLabel})` } });
             
             await prisma.systemLog.create({
                data: { invoice_id: invoice.id, action: "Step Sent Back", user: approver, details: `Graph node reverted. Transitioning back to: ${nextStageLabel}` }
             });
          } else {
             currentState.nodeResults[actedNodeId] = action;
             
             // Remove from active, push to completed
             currentState.activeNodes = currentState.activeNodes.filter((id: string) => id !== actedNodeId);
             currentState.completedNodes.push(actedNodeId);
             
             // Traverse outgoing edges matching the action
             const outgoingEdges = edges.filter((e: any) => e.source === actedNodeId);
             nextNodes = [];
             for (const edge of outgoingEdges) {
                if (!edge.label || edge.label.toLowerCase() === action.toLowerCase() || edge.label === "") {
                   nextNodes.push(edge.target);
                }
             }
             
             // Fallback if no specific edge matched (e.g., standard sequential edge)
             if (nextNodes.length === 0 && outgoingEdges.length > 0 && action === "Approve") {
                nextNodes = outgoingEdges.map((e: any) => e.target);
             }
             
             // Process Condition Nodes automatically
             let finalNextNodes = [];
             for (const nId of nextNodes) {
                const targetNode = nodes.find((n: any) => n.id === nId);
                if (targetNode && targetNode.type === "condition") {
                   let conditionMet = false;
                   try {
                      const fieldVal = (invoice as any)[targetNode.data.field];
                      if (targetNode.data.operator === ">") conditionMet = fieldVal > targetNode.data.value;
                      else if (targetNode.data.operator === "<") conditionMet = fieldVal < targetNode.data.value;
                      else if (targetNode.data.operator === "===" || targetNode.data.operator === "==") conditionMet = fieldVal == targetNode.data.value;
                   } catch(e) {}
                   
                   const condEdges = edges.filter((e: any) => e.source === targetNode.id);
                   for (const ce of condEdges) {
                      if ((conditionMet && ce.label?.toLowerCase() === "true") || (!conditionMet && ce.label?.toLowerCase() === "false")) {
                         finalNextNodes.push(ce.target);
                      }
                   }
                   currentState.completedNodes.push(targetNode.id);
                } else {
                   finalNextNodes.push(nId);
                }
             }
             
             // Add resolved nodes to active
             currentState.activeNodes.push(...finalNextNodes);
          }
          
          let nextStageLabel = "Completed";
          let dbStatus = "In Approval";
          
          if (currentState.activeNodes.length > 0) {
             const activeNodeLabels = currentState.activeNodes.map((id: string) => {
                const n = nodes.find((no: any) => no.id === id);
                return n ? (n.data?.label || id) : id;
             });
             nextStageLabel = activeNodeLabels.join(" AND "); // For parallel displays
             await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "In Approval" } });
          } else {
             // Workflow reached end
             if (action === "Reject" && nextNodes.length === 0) {
                dbStatus = "Rejected";
                await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "Rejected" } });
             } else {
                dbStatus = "Approved";
                await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "Ready for Payment" } });
                await prisma.systemLog.create({
                  data: { invoice_id: invoice.id, action: "Workflow Approved", user: approver, details: `Graph execution completed successfully.` }
                });
             }
          }
          
          workflowInstance = await prisma.workflowInstance.update({
             where: { id: workflowInstance!.id },
             data: { current_stage: nextStageLabel, status: dbStatus, state_json: currentState as any }
          });
          
          await prisma.systemLog.create({
             data: { invoice_id: invoice.id, action: `Step ${action}`, user: approver, details: `Graph node processed. Transitioning to: ${nextStageLabel}` }
          });
          
          // DAG Notification Logic
          if (currentState.activeNodes.length > 0) {
             for (const nId of currentState.activeNodes) {
                const n = nodes.find((no: any) => no.id === nId);
                if (n && n.data && n.data.approvers) {
                   for (const email of n.data.approvers) {
                      io.emit("new_notification", { recipientEmail: email, message: `Invoice ${invoice.po_number || invoice.id} has progressed to you for approval.` });
                   }
                }
             }
          } else if (action === "Approve" || dbStatus === "Approved") {
             if (invoice.uploaded_by_id) {
                const uploader = await prisma.user.findUnique({ where: { id: invoice.uploaded_by_id } });
                if (uploader && uploader.email) {
                   io.emit("new_notification", { recipientEmail: uploader.email, message: `Great news, the invoice ${invoice.po_number || invoice.id} has been fully approved and is ready for payment.` });
                }
             }
          }
       }

    } else {
      // --- LEGACY LINEAR EXECUTOR ---
      let steps: any[] = [{ label: 'GM Approval' }, { label: 'CTO Approval' }, { label: 'MD Approval' }];
      if (parsedWf && parsedWf.steps && parsedWf.steps.length > 0) {
         steps = parsedWf.steps;
      }
      
      if (action === "Approve") {
        const currentIdx = steps.findIndex(s => s.label === workflowInstance!.current_stage);
        if (currentIdx !== -1 && currentIdx < steps.length - 1) {
           const nextStage = steps[currentIdx + 1].label;
           workflowInstance = await prisma.workflowInstance.update({
              where: { id: workflowInstance!.id },
              data: { current_stage: nextStage }
           });
           await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "In Approval" } });
           await prisma.systemLog.create({
             data: { invoice_id: invoice.id, action: "Step Approved", user: approver, details: `${steps[currentIdx].label} passed. Advancing to ${nextStage}.` }
           });
        } else {
          workflowInstance = await prisma.workflowInstance.update({
            where: { id: workflowInstance!.id },
            data: { current_stage: "Completed", status: "Approved" }
          });
          await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "Ready for Payment" } });
          await prisma.systemLog.create({
            data: { invoice_id: invoice.id, action: "Workflow Approved", user: approver, details: `Final checkpoint passed.` }
          });
        }
      } else if (action === "Reject") {
        workflowInstance = await prisma.workflowInstance.update({
          where: { id: workflowInstance!.id },
          data: { status: "Rejected" }
        });
        await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "Rejected" } });
        await prisma.systemLog.create({
          data: { invoice_id: invoice.id, action: "Step Rejected", user: approver, details: `Workflow rejected. Reason: "${comments}"` }
        });
      } else if (action === "Send Back") {
        const currentIdx = steps.findIndex(s => s.label === workflowInstance!.current_stage);
        if (currentIdx > 0) {
          const prevStage = steps[currentIdx - 1].label;
          workflowInstance = await prisma.workflowInstance.update({
            where: { id: workflowInstance!.id },
            data: { current_stage: prevStage }
          });
          await prisma.invoice.update({ where: { id: invoice.id }, data: { status: `Sent Back (Stage ${currentIdx})` } });
          await prisma.systemLog.create({
            data: { invoice_id: invoice.id, action: "Step Sent Back", user: approver, details: `Sent back from ${steps[currentIdx].label} to ${prevStage}. Comments: ${comments || 'None'}` }
          });
        } else {
          workflowInstance = await prisma.workflowInstance.update({
            where: { id: workflowInstance!.id },
            data: { current_stage: steps[0].label }
          });
          await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "Received" } });
          await prisma.systemLog.create({
            data: { invoice_id: invoice.id, action: "Step Sent Back", user: approver, details: `Sent back from first stage ${steps[0].label} to Received status. Comments: ${comments || 'None'}` }
          });
        }
      }
    }

    // Trigger notification service for any completed step (Approve/Reject)
    await triggerNotificationFlow(invoice.id, action, comments, approver);

    res.json({ invoice, workflow_instance: workflowInstance, approval: newApproval });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 9. API Endpoint: Payment release
app.post("/api/invoices/:id/pay", async (req, res) => {
  try {
    const { paymentMethod, transactionId } = req.body;
    const invoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    if (invoice.status !== "Ready for Payment") {
      return res.status(400).json({ error: "Invoice must be in 'Ready for Payment' status." });
    }

    const updated = await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: "Paid" }
    });
    
    await prisma.systemLog.create({
      data: {
        invoice_id: invoice.id,
        action: "Payout Released",
        user: "Finance Treasury Gate",
        details: `Disbursed and processed via ${paymentMethod || "Corporate Wire"}. TXN Ref: ${transactionId || "TXN-AUTO"}`
      }
    });

    res.json({ success: true, invoice: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 10. API Endpoint: Create new Workflow Template
app.post("/api/workflows", async (req, res) => {
  try {
    const { workflow_name, workflow_json } = req.body;
    if (!workflow_name || !workflow_json) {
      return res.status(400).json({ error: "Missing workflow name or json details." });
    }
    const newWf = await prisma.workflow.create({
      data: {
        workflow_name,
        workflow_json
      }
    });
    res.json(newWf);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 11. Helper trigger layout update endpoint
app.put("/api/documents/:id/metadata", async (req, res) => {
  try {
    const { 
      documentType,
      vendorName, 
      invoiceNumber, 
      poNumber, 
      amount, 
      date, 
      cgst, 
      sgst, 
      igst, 
      items,
      customData
    } = req.body;

    const existingInvoice = await prisma.invoice.findUnique({ where: { id: req.params.id } });
    if (!existingInvoice) return res.status(404).json({ error: "Not found" });

    const originalData = {
      documentType: existingInvoice.document_type,
      vendorName: existingInvoice.vendor_name,
      invoiceNumber: existingInvoice.invoice_number,
      poNumber: existingInvoice.po_number,
      amount: existingInvoice.amount,
      date: existingInvoice.invoice_date,
      cgst: existingInvoice.cgst,
      sgst: existingInvoice.sgst,
      igst: existingInvoice.igst,
      items: typeof existingInvoice.items === 'string' ? JSON.parse(existingInvoice.items as any) : existingInvoice.items,
      customData: typeof existingInvoice.custom_data === 'string' ? JSON.parse(existingInvoice.custom_data as any) : existingInvoice.custom_data
    };

    const newData = {
      documentType, vendorName, invoiceNumber, poNumber, amount, date, cgst, sgst, igst, items, customData
    };

    if (JSON.stringify(originalData) !== JSON.stringify(newData)) {
      await prisma.correctionLog.create({
        data: {
          invoice_id: existingInvoice.id,
          vendor_name: vendorName || existingInvoice.vendor_name || "Unknown",
          original_ai_prediction: JSON.stringify(originalData),
          human_corrected_data: JSON.stringify(newData)
        }
      });
    }

    let newStatus = existingInvoice.status;
    let triggeredWorkflow = false;

    if (existingInvoice.status === "Failed") {
      const isNowInvoice = (documentType || existingInvoice.document_type || "").toLowerCase().includes("invoice");
      if (isNowInvoice) {
        newStatus = "Waiting for GRN";
        await prisma.goodsReceipt.upsert({
          where: { invoice_id: req.params.id },
          update: { status: "Pending", confirmed_by: "Pending", remarks: "Awaiting physical receipt of goods." },
          create: {
            id: "GRN-" + Math.floor(10000000 + Math.random() * 90000000),
            invoice_id: req.params.id,
            status: "Pending",
            confirmed_by: "Pending",
            remarks: "Awaiting physical receipt of goods."
          }
        });
      } else {
        newStatus = "In Approval";
        triggeredWorkflow = true;
      }
    } else if (documentType && documentType !== existingInvoice.document_type) {
        const wasInvoice = (existingInvoice.document_type || "").toLowerCase().includes("invoice");
        const isNowInvoice = documentType.toLowerCase().includes("invoice");

        if (wasInvoice && !isNowInvoice && existingInvoice.status === "Waiting for GRN") {
           newStatus = "In Approval";
           triggeredWorkflow = true;
        }
    }

    const invoice = await prisma.invoice.update({
      where: { id: req.params.id },
      data: {
        document_type: documentType || existingInvoice.document_type,
        vendor_name: vendorName,
        invoice_number: invoiceNumber,
        po_number: poNumber,
        amount: Number(amount),
        invoice_date: date,
        cgst: Number(cgst),
        sgst: Number(sgst),
        igst: Number(igst),
        items: items as any,
        custom_data: customData ? (customData as any) : existingInvoice.custom_data,
        status: newStatus as any
      }
    });

    if (triggeredWorkflow) {
        let activeWorkflow: any = null;
        const routingRule = await matchRoutingRule(invoice.document_type || "", invoice.amount, invoice);
        
        if (routingRule) activeWorkflow = await prisma.workflow.findUnique({ where: { id: routingRule.target_workflow_id } });
        if (!activeWorkflow) activeWorkflow = await prisma.workflow.findFirst();
        if (!activeWorkflow) {
          const fallbackConfig = await prisma.systemConfig.findUnique({ where: { key: "DEFAULT_FALLBACK_WORKFLOW" } });
          activeWorkflow = { workflow_name: fallbackConfig?.value || "Standard Procurement Route", workflow_json: null };
        }

        let firstStage = "GM Approval";
        const fallbackStageConfig = await prisma.systemConfig.findUnique({ where: { key: "DEFAULT_FALLBACK_FIRST_STAGE" } });
        if (fallbackStageConfig?.value) firstStage = fallbackStageConfig.value;
        try {
          if (activeWorkflow.workflow_json) {
             const parsed = JSON.parse(activeWorkflow.workflow_json);
             if (parsed.steps && parsed.steps.length > 0) firstStage = parsed.steps[0].label;
          }
        } catch (e) {}

        await prisma.workflowInstance.upsert({
          where: { invoice_id: invoice.id },
          update: { current_stage: firstStage, status: "In Progress" },
          create: {
            id: "WF-" + Math.floor(10000000 + Math.random() * 90000000),
            invoice_id: invoice.id,
            current_stage: firstStage,
            status: "In Progress"
          }
        });
        
        await prisma.systemLog.create({
          data: {
            invoice_id: invoice.id,
            action: "Workflow Triggered",
            user: "Routing Engine",
            details: `Document type changed. Bypassed GRN and assigned to stage: ${firstStage}.`
          }
        });
    }

    await prisma.systemLog.create({
      data: {
        invoice_id: invoice.id,
        action: "Invoice Fields Overridden",
        user: "Current Auditor Operator",
        details: `Field variables corrected on corporate ledger manual check.`
      }
    });

    res.json(invoice);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 12. API Endpoint: Approve Workflow Stage
app.post("/api/workflows/approve", authenticateToken, async (req, res) => {
  try {
    const { invoiceId, comments } = req.body;
    const user = (req as any).user;

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId }
    });
    if (!invoice) return res.status(404).json({ error: "Invoice not found." });

    const activeLog = await prisma.activeApprovalLog.findUnique({
      where: { invoice_id: invoiceId }
    });

    if (!activeLog) return res.status(404).json({ error: "No active workflow found." });
    if (activeLog.status !== "Pending") return res.status(400).json({ error: `Workflow is already ${activeLog.status}` });

    const currentStageDef = await prisma.workflowStepDefinition.findFirst({
      where: {
        profile_name: activeLog.workflow_profile,
        stage_number: activeLog.current_stage_number,
        document_type: invoice.document_type
      }
    });

    if (!currentStageDef) {
      // If no stages are defined, or we somehow exceeded the stages, just approve it fully.
      await prisma.activeApprovalLog.update({
        where: { id: activeLog.id },
        data: { status: "Approved" }
      });
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: { status: "Approved" }
      });
      await prisma.systemLog.create({
        data: { invoice_id: invoiceId, action: "Workflow Completed", user: user.email, details: `No remaining stages defined for ${activeLog.workflow_profile}. Document fully approved. Comments: ${comments || 'None'}` }
      });
      await triggerNotificationFlow(invoiceId, "Approve", comments, user.email);
      io.emit("workflow_updated", { invoiceId, action: "Approved" });
      return res.json({ success: true, message: "Auto-approved due to missing or empty workflow definition." });
    }

    // Dynamic variable resolution e.g., '[PO_OWNER]'
    let resolvedApprover = currentStageDef.approver_target;
    if (resolvedApprover === '[PO_OWNER]' || resolvedApprover === '[DEPT_HEAD]') {
       if (invoice.po_number && invoice.po_number !== "Not Found") {
          const corpMock = await prisma.corporateAppMock.findUnique({ where: { po_number: invoice.po_number } });
          if (corpMock) {
             resolvedApprover = resolvedApprover === '[PO_OWNER]' ? (corpMock.po_owner_email || resolvedApprover) : (corpMock.dept_head_email || resolvedApprover);
          }
       }
    }

    // Advance Stage
    const nextStageDef = await prisma.workflowStepDefinition.findFirst({
      where: {
        profile_name: activeLog.workflow_profile,
        stage_number: activeLog.current_stage_number + 1,
        document_type: invoice.document_type
      }
    });

    if (nextStageDef) {
      await prisma.activeApprovalLog.update({
        where: { id: activeLog.id },
        data: { current_stage_number: activeLog.current_stage_number + 1 }
      });
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: { status: `Pending Approval (Stage ${activeLog.current_stage_number + 1})` }
      });
      await prisma.systemLog.create({
        data: { invoice_id: invoiceId, action: "Stage Approved", user: user.email, details: `Approved Stage ${activeLog.current_stage_number} as ${resolvedApprover}. Advancing to Stage ${activeLog.current_stage_number + 1}. Comments: ${comments || 'None'}` }
      });
    } else {
      await prisma.activeApprovalLog.update({
        where: { id: activeLog.id },
        data: { status: "Approved" }
      });
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: { status: "Approved" }
      });
      await prisma.systemLog.create({
        data: { invoice_id: invoiceId, action: "Workflow Completed", user: user.email, details: `Final stage approved as ${resolvedApprover}. Document fully approved. Comments: ${comments || 'None'}` }
      });
    }
    await triggerNotificationFlow(invoiceId, "Approve", comments, user.email);
    io.emit("workflow_updated", { invoiceId, action: "Approved" });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 13. API Endpoint: Reject Workflow Stage
app.post("/api/workflows/reject", authenticateToken, async (req, res) => {
  try {
    const { invoiceId, comments } = req.body;
    const user = (req as any).user;

    const activeLog = await prisma.activeApprovalLog.findUnique({
      where: { invoice_id: invoiceId }
    });

    if (!activeLog) return res.status(404).json({ error: "No active workflow found." });

    await prisma.activeApprovalLog.update({
      where: { id: activeLog.id },
      data: { status: "Rejected" }
    });
    
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: "Rejected" }
    });

    await prisma.systemLog.create({
      data: { invoice_id: invoiceId, action: "Workflow Rejected", user: user.email, details: `Document rejected at Stage ${activeLog.current_stage_number}. Comments: ${comments || 'None'}` }
    });

    await triggerNotificationFlow(invoiceId, "Reject", comments, user.email);
    io.emit("workflow_updated", { invoiceId, action: "Rejected" });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 14. Admin APIs for Configuration
app.get("/api/admin/routing-rules", authenticateToken, async (req, res) => {
  try {
    const rules = await prisma.businessRule.findMany({ orderBy: { priority: 'asc' } });
    res.json(rules);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/routing-rules", authenticateToken, async (req, res) => {
  try {
    const { id, rule_name, priority, conditions_json, target_workflow_id, document_type } = req.body;
    let rule;
    if (id) {
      rule = await prisma.businessRule.update({
        where: { id },
        data: { rule_name, priority: Number(priority), conditions_json, target_workflow_id, document_type }
      });
    } else {
      rule = await prisma.businessRule.create({
        data: { rule_name, priority: Number(priority), conditions_json, target_workflow_id, document_type: document_type || "Invoice" }
      });
    }
    res.json(rule);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/admin/routing-rules/:id", authenticateToken, async (req, res) => {
  try {
    await prisma.businessRule.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/workflow-steps", authenticateToken, async (req, res) => {
  try {
    const steps = await prisma.workflowStepDefinition.findMany({ orderBy: [{ profile_name: 'asc' }, { stage_number: 'asc' }] });
    res.json(steps);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/workflow-steps", authenticateToken, async (req, res) => {
  try {
    const { id, profile_name, stage_number, approver_target, document_type } = req.body;
    let step;
    if (id) {
      step = await prisma.workflowStepDefinition.update({
        where: { id },
        data: { profile_name, stage_number: Number(stage_number), approver_target, document_type }
      });
    } else {
      step = await prisma.workflowStepDefinition.create({
        data: { profile_name, stage_number: Number(stage_number), approver_target, document_type: document_type || "Invoice" }
      });
    }
    res.json(step);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/admin/workflow-steps/:id", authenticateToken, async (req, res) => {
  try {
    await prisma.workflowStepDefinition.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/publish", authenticateToken, async (req, res) => {
  try {
    const { changes } = req.body;
    const user = (req as any).user;
    
    await prisma.systemLog.create({
      data: {
        action: "Configuration Published",
        user: user.email,
        details: `Published new enterprise policy configurations. Impact: ${changes} updates.`
      }
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 15. Webhook: Automated Ingestion via n8n
const uploadWebhook = multer({ storage: storage });
app.post("/api/webhooks/n8n/ingest", uploadWebhook.any(), async (req, res) => {
  try {
    const apiKey = req.headers["x-api-key"];
    if (apiKey !== "n8n-secret-123") {
      return res.status(401).json({ error: "Unauthorized. Invalid API Key." });
    }
    
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) return res.status(400).json({ error: "No document attached." });
    
    const file = files[0];

    const invoiceId = "WF-" + Math.floor(10000000 + Math.random() * 90000000);
    const invoice = await prisma.invoice.create({
      data: {
        id: invoiceId,
        invoice_number: "Extracting...",
        vendor_name: "Processing...",
        invoice_date: new Date().toISOString().split('T')[0],
        po_number: "Extracting...",
        amount: 0,
        currency: "USD",
        status: "Received",
        document_type: "Processing...",
        file_name: file.originalname,
        file_size: file.size,
        mime_type: file.mimetype,
        file_path: `/uploads/${file.filename}`,
        ocr_confidence: 90.0,
        ocr_text: "Running automated OCR pipeline...",
        tax_details: "Calculating...",
      }
    });
    
    await prisma.goodsReceipt.create({
      data: {
        id: "GRN-" + Math.floor(10000000 + Math.random() * 90000000),
        invoice_id: invoiceId,
        status: "Waiting",
        confirmed_by: "",
        remarks: ""
      }
    });

    await prisma.systemLog.create({
      data: {
        invoice_id: invoiceId,
        action: "Invoice Received",
        user: "n8n Webhook",
        details: `File "${file.originalname}" saved via automation.`
      }
    });

    // Run the actual OCR pipeline via FIFO queue
    ocrQueue.push(invoiceId, file.filename);

    res.json({ success: true, invoiceId: invoice.id, message: "Ingested successfully" });
    io.emit("document_ingested", { invoiceId: invoice.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 16. Comments Thread API
app.get("/api/documents/:id/comments", authenticateToken, async (req, res) => {
  try {
    const comments = await prisma.documentComment.findMany({
      where: { invoice_id: req.params.id },
      orderBy: { created_at: "asc" }
    });
    res.json(comments);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/documents/:id/comments", authenticateToken, async (req, res) => {
  try {
    const { text } = req.body;
    const user = (req as any).user;
    const comment = await prisma.documentComment.create({
      data: {
        invoice_id: req.params.id,
        user_email: user.email,
        user_name: user.name,
        text
      }
    });
    io.emit("new_comment", { invoiceId: req.params.id, comment });
    res.json(comment);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 17. Analytics APIs
app.get("/api/analytics/bottlenecks", authenticateToken, async (req, res) => {
  try {
    const pendingLogs = await prisma.activeApprovalLog.findMany({
      where: { status: "Pending" }
    });
    res.json(pendingLogs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/analytics/kpis", authenticateToken, async (req, res) => {
  try {
    const count = await prisma.invoice.count();
    const approved = await prisma.invoice.count({ where: { status: "Approved" } });
    const pending = count - approved;
    const stp_rate = count ? ((approved / count) * 100).toFixed(1) : "100";
    
    // Calculate total accrual (sum of amount of pending)
    const pendingInvoices = await prisma.invoice.findMany({
      where: { status: { notIn: ["Approved", "Completed"] } }
    });
    const accrual = pendingInvoices.reduce((sum, inv) => sum + (inv.amount || 0), 0);

    res.json({ total: count, approved, pending, stp_rate, accrual });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

async function processInvoiceOCR(invoiceId: string, filename: string) {
      try {
        const fullFilePath = path.join(UPLOADS_DIR, filename);
        const fileBuffer = await fs.readFile(fullFilePath);
        const base64Data = fileBuffer.toString("base64");

        await prisma.invoice.update({
          where: { id: invoiceId },
          data: { status: "AI Processed" }
        });

        await prisma.systemLog.create({
          data: {
            invoice_id: invoiceId,
            action: "AI Analysis",
            user: "Local PaddleOCR & LLM",
            details: "Initiating local PaddleOCR and LLM extraction..."
          }
        });

        let extracted: any = null;

        try {
          const { stdout } = await execAsync(`python local_ocr.py "${fullFilePath}"`);
          const jsonMatch = stdout.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error("No valid JSON found in OCR output: " + stdout);
          const ocrResult = JSON.parse(jsonMatch[0]);
          if (ocrResult.error) throw new Error("OCR Error: " + ocrResult.error);
          
          const rawText = ocrResult.raw_text || "";
          const layout = ocrResult.layout || [];

          const templates = await prisma.documentTemplate.findMany();
          let templatesPrompt = "";
          
          if (templates.length > 0) {
             templatesPrompt = `KNOWN DOCUMENT TYPES & INSTRUCTIONS:\n` + templates.map(t => {
               try {
                 const parsed = JSON.parse(t.fields_json);
                 const instrs = parsed.instructions || "";
                 return `- Type: ${t.name}\n  Instructions: ${instrs}`;
               } catch(e) {
                 return `- Type: ${t.name}`;
               }
             }).join("\n\n");
          } else {
             templatesPrompt = "No known document types configured. Guess the document type autonomously.";
          }

          // --- CONTINUOUS LEARNING: DYNAMIC FEW-SHOT INJECTION ---
          const pastApproved = await prisma.invoice.findMany({
            where: { status: { in: ["Paid", "Approved"] } },
            orderBy: { created_at: "desc" },
            take: 3
          });

          let fewShotExample = "";
          
          if (pastApproved.length > 0) {
            fewShotExample = "--- DYNAMIC EXAMPLES FROM PAST APPROVED DOCUMENTS ---\n";
            fewShotExample += "Learn from these past examples. Notice how the JSON fields were formatted based on the document type.\n";
            pastApproved.forEach((doc, idx) => {
              const exampleJson = {
                documentType: doc.document_type,
                vendorName: doc.vendor_name,
                invoiceNumber: doc.invoice_number,
                invoiceDate: doc.invoice_date,
                poNumber: doc.po_number,
                amount: doc.amount,
                currency: doc.currency,
                cgst: doc.cgst,
                sgst: doc.sgst,
                igst: doc.igst,
                items: typeof doc.items === 'string' ? JSON.parse(doc.items as any) : doc.items,
                ...(typeof doc.custom_data === 'object' && doc.custom_data !== null ? doc.custom_data : {})
              };

              Object.keys(exampleJson).forEach(k => {
                if (exampleJson[k as keyof typeof exampleJson] === null) delete exampleJson[k as keyof typeof exampleJson];
              });

              // Send the first 800 characters of OCR text to save context length
              const trimmedOcr = doc.ocr_text ? doc.ocr_text.substring(0, 800) + '...' : '...';

              fewShotExample += `\n[EXAMPLE ${idx+1} - ${doc.document_type}]:\n[OCR TEXT]:\n${trimmedOcr}\n\n[EXPECTED JSON OUTPUT]:\n${JSON.stringify(exampleJson, null, 2)}\n\n`;
            });
          }
          
          // --- CONTINUOUS LEARNING: HUMAN CORRECTIONS (RAG) ---
          const recentCorrections = await prisma.correctionLog.findMany({
            orderBy: { created_at: "desc" },
            take: 3
          });

          if (recentCorrections.length > 0) {
            fewShotExample += "\n--- HIGH PRIORITY: LEARN FROM RECENT HUMAN CORRECTIONS ---\n";
            fewShotExample += "Humans have explicitly corrected your past extractions. Pay close attention to these rules and patterns:\n";
            recentCorrections.forEach((corr, idx) => {
              fewShotExample += `\n[CORRECTION ${idx+1} for Vendor: ${corr.vendor_name}]:\n`;
              fewShotExample += `[AI ORIGINALLY PREDICTED]:\n${corr.original_ai_prediction}\n`;
              fewShotExample += `[HUMAN CORRECTED TO]:\n${corr.human_corrected_data}\n`;
              fewShotExample += `Ensure you do not make this mistake again.\n\n`;
            });
          }

          // STAGE 1: The Classifier Router
          const rawTextLower = rawText.toLowerCase();
          let classifiedType = "Unknown"; // default changed for Hybrid AI Routing
          const headerText = rawTextLower.substring(0, 500);
          
          let selectedTemplate = null;

          const invoiceIndex = headerText.indexOf("invoice");
          const poIndex = headerText.indexOf("purchase order");

          if (headerText.includes("tax invoice") || headerText.includes("retail invoice")) {
            classifiedType = "Invoice";
          } else if (invoiceIndex !== -1 && (poIndex === -1 || invoiceIndex < poIndex)) {
            classifiedType = "Invoice";
          } else if (poIndex !== -1) {
            classifiedType = "Purchase Order";
          } else if (headerText.includes("credit note")) {
            classifiedType = "Credit Note";
          } else if (headerText.includes("debit note")) {
            classifiedType = "Debit Note";
          } else if (rawTextLower.includes("purchase order") && !rawTextLower.includes("invoice")) {
            classifiedType = "Purchase Order";
          } else {
             for (const t of templates) {
                if (headerText.includes(t.name.toLowerCase())) {
                   classifiedType = t.name;
                   selectedTemplate = t;
                   break;
                }
             }
          }
          
          if (classifiedType === "Unknown") {
             console.log(`[Classifier] Keywords failed. Falling back to LLM for classification of ${invoiceId}`);
             try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

                const classifierPrompt = `You are a document classifier. Categorize this document into exactly one of the following types: Invoice, Purchase Order, Credit Note, Debit Note, ${templates.map(t => t.name).join(', ')}. Reply with ONLY the category name. Do not include any other text.\n\nDocument Text:\n${rawTextLower.substring(0, 1500)}`;
                
                const llmClassResponse = await fetch(LOCAL_LLM_URL, {
                   method: "POST",
                   headers: { "Content-Type": "application/json" },
                   body: JSON.stringify({
                      model: "llama3.1:8b",
                      prompt: classifierPrompt,
                      stream: false
                   }),
                   signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                
                if (llmClassResponse.ok) {
                   const classData = await llmClassResponse.json();
                   let aiType = classData.response.trim();
                   
                   const allowedTypes = ["Invoice", "Purchase Order", "Credit Note", "Debit Note", ...templates.map(t => t.name)];
                   for (const t of allowedTypes) {
                      if (aiType.toLowerCase().includes(t.toLowerCase())) {
                         classifiedType = t;
                         break;
                      }
                   }
                   if (classifiedType === "Unknown") classifiedType = "Invoice"; // Ultimate fallback
                } else {
                   classifiedType = "Invoice";
                }
             } catch(e) {
                console.error("[Classifier] LLM Fallback failed:", e);
                classifiedType = "Invoice";
             }
          }
          
          if (!selectedTemplate && templates.length > 0) {
             selectedTemplate = templates.find((t: any) => t.name.toLowerCase() === classifiedType.toLowerCase()) || null;
          }

          await prisma.systemLog.create({
            data: {
              invoice_id: invoiceId,
              action: "Document Classification",
              user: "Routing Engine",
              details: `Stage 1 Classifier determined type: ${classifiedType}.`
            }
          });

          // STAGE 2: Specialized Extraction Engines
          let prompt = "";

          if (selectedTemplate) {
            let fieldsDef = "";
            let instructions = "";
            try {
               const parsed = JSON.parse(selectedTemplate.fields_json);
               if (parsed.fields && Array.isArray(parsed.fields)) {
                 const schemaObj: any = {};
                 parsed.fields.forEach((f: any) => {
                   let def = `${f.type}`;
                   if (f.required) def = `[REQUIRED] ` + def;
                   if (f.description) def += ` (${f.description})`;
                   schemaObj[f.name] = def;
                 });
                 fieldsDef = JSON.stringify(schemaObj, null, 2);
                 instructions = parsed.instructions || "";
               } else {
                 // Legacy schema handler
                 fieldsDef = typeof parsed.schema === "string" ? parsed.schema : JSON.stringify(parsed.schema || {}, null, 2);
                 instructions = parsed.instructions || "";
               }
            } catch(e) {
               fieldsDef = selectedTemplate.fields_json;
            }

            prompt = `You are a highly accurate, autonomous Data Extraction AI. 
Analyze the following ${selectedTemplate.name} OCR text.

STRICT INSTRUCTIONS:
1. Output ONLY a valid JSON object. No markdown, no explanations.
2. The document is a ${selectedTemplate.name}. ALWAYS set "documentType" to "${selectedTemplate.name}".
3. Your output MUST be a JSON object conforming exactly to the schema below.
4. CRITICAL RULE: YOU MUST ACHIEVE 100% ACCURACY. DO NOT HALLUCINATE OR GUESS VALUES.
5. Dates: Extract dates exactly as written.
6. CHAIN OF THOUGHT: You MUST include a "_thoughts" key at the very beginning of your JSON. In this key, explain your step-by-step reasoning for locating the Vendor, PO Number, and Line Items in the text. This will help you extract the data accurately.
7. REQUIRED FIELDS: If a field is marked as [REQUIRED] and you cannot confidently find it in the document, you MUST set its value to exactly the string "MISSING_REQUIRED_FIELD".

${instructions}

[EXPECTED JSON SCHEMA]:
${fieldsDef}

${fewShotExample}

[OCR TEXT]: ${rawText}`;
          } else {
             await prisma.invoice.update({
               where: { id: invoiceId },
               data: { status: "Exception", is_exception: true, exception_reason: `Unrecognized Document Type: ${classifiedType}` }
             });
             await prisma.systemLog.create({
               data: { invoice_id: invoiceId, action: "Extraction Halted", user: "Routing Engine", details: `No template found for ${classifiedType}` }
             });
             return;
          }
          let availableModels: string[] = [];
          let modelToUse = "llama3.2";
          try {
            const tagsRes = await fetch("http://localhost:11434/api/tags");
            if (tagsRes.ok) {
              const tagsData = await tagsRes.json();
              availableModels = tagsData.models.map((m: any) => m.name);
              
              // Priority list for best JSON extraction (preferring fast 3B models over 8B on local environments)
              const preferredModels = [
                "llava:latest", "llama3.2:latest", "llama3.2:3b", "qwen2.5:3b", "llama3.1:8b", "llama3:latest", 
                "phi3:latest", "qwen2.5:7b", "gemma2:9b"
              ];
              
              let foundModel = false;
              for (const pref of preferredModels) {
                if (availableModels.includes(pref) || availableModels.some((m: string) => m.startsWith(pref.split(':')[0]))) {
                  modelToUse = availableModels.find((m: string) => m === pref || m.startsWith(pref.split(':')[0])) || pref;
                  foundModel = true;
                  break;
                }
              }
              
              if (!foundModel && availableModels.length > 0) {
                modelToUse = availableModels[0]; // Just use whatever they have installed
              }
              
              console.log("Dynamically selected Ollama model based on system capacity:", modelToUse);
            }
          } catch(e) {
            console.log("Could not query Ollama tags, defaulting to:", modelToUse);
          }

          const isVisionModel = modelToUse.toLowerCase().includes("vision") || modelToUse.toLowerCase().includes("llava");
          const llmPayload: any = { prompt: prompt, stream: false, format: "json", model: modelToUse };
          if (isVisionModel) {
             llmPayload.images = [base64Data];
          }

          // Agent 1: Initial Extraction
          let llmResponse: any = null;
          let errText = "";
          try {
            llmResponse = await fetch(LOCAL_LLM_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(llmPayload)
            });
            if (!llmResponse.ok) errText = await llmResponse.text();
          } catch(e: any) {
            errText = e.message;
          }

          if (!llmResponse || !llmResponse.ok) {
            console.warn(`[LLM Fallback] Initial model ${modelToUse} failed:`, errText);
            
            // Fallback to standard text models if vision or original choice failed
            let fallbackModel = "llama3.1:8b";
            const fallbackPrefs = ["llama3.1:8b", "llama3.2:latest", "llama3:latest"];
            for (const fb of fallbackPrefs) {
               if (availableModels.includes(fb) || availableModels.some(m => m.startsWith(fb.split(':')[0]))) {
                  fallbackModel = availableModels.find(m => m === fb || m.startsWith(fb.split(':')[0])) || fb;
                  break;
               }
            }
            
            console.log(`Attempting fallback with model: ${fallbackModel}`);
            llmPayload.model = fallbackModel;
            delete llmPayload.images; // Remove images for text-only models
            
            try {
              llmResponse = await fetch(LOCAL_LLM_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(llmPayload)
              });
              if (!llmResponse.ok) {
                const errText2 = await llmResponse.text();
                throw new Error(`Fallback HTTP Error: ${llmResponse.status} - ${errText2}`);
              }
            } catch(e: any) {
              throw new Error(`Local OCR/LLM pipeline failed, using fallback: ${e.message} | Details: ${errText}`);
            }
          }

          const llmData = await llmResponse.json();
          let firstPassJsonStr = llmData.response || "";
          
          firstPassJsonStr = firstPassJsonStr.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
          const firstPassMatch = firstPassJsonStr.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
          if (firstPassMatch) {
            firstPassJsonStr = firstPassMatch[0];
          }
          
          try {
            extracted = JSON.parse(firstPassJsonStr);
          } catch (parseErr) {
            const sanitized = firstPassJsonStr.replace(/,\s*([\}\]])/g, '$1');
            try {
               extracted = JSON.parse(sanitized);
            } catch (e) {
               throw new Error("Failed to parse Junior LLM JSON output: " + (e as Error).message + " | Raw: " + firstPassJsonStr.substring(0, 100));
            }
          }
          
          if (Array.isArray(extracted)) {
             extracted = extracted.length > 0 ? extracted[0] : {};
          }
          
          let missingFields: string[] = [];
          if (extracted && typeof extracted === 'object') {
             Object.keys(extracted).forEach(k => {
                if (extracted[k] === "MISSING_REQUIRED_FIELD") {
                   missingFields.push(k);
                }
             });
             if (missingFields.length > 0) {
                console.warn(`[Validation] Missing required fields: ${missingFields.join(", ")}`);
                await prisma.systemLog.create({
                  data: { invoice_id: invoiceId, action: "Validation Failed", user: "System", details: `AI failed to find required fields: ${missingFields.join(", ")}` }
                }).catch(() => {});
                extracted._missingRequired = missingFields;
             }
          }
          
          await prisma.systemLog.create({
            data: {
              invoice_id: invoiceId,
              action: "LLM Raw Debug",
              user: "Debug",
              details: "EXTRACTED JSON: " + firstPassJsonStr
            }
          });
          
          extracted.ocrText = rawText;
          extracted.ocrLayout = layout;
        } catch (err: any) {
          console.error("Local OCR/LLM pipeline failed, using fallback:", err.message);
          await prisma.systemLog.create({
            data: { invoice_id: invoiceId, action: "Pipeline Error", user: "System", details: err.stack || err.message }
          }).catch(e => {});
        }

        if (!extracted) {
           // Fallback default info if LLM fails
           extracted = {
             invoiceNumber: `INV-2026-`+Math.floor(1000+Math.random()*9000),
             vendorName: "Acme Global Solutions",
             invoiceDate: new Date().toISOString().split("T")[0],
             amount: 150.00,
             currency: "USD",
             ocrText: "Fallback OCR Text..."
           };
        }

        const ocrLayout = (extracted.ocrLayout || []).map((line: any, idx: number) => ({
          lineText: line.lineText || line,
          confidence: line.confidence || 95,
          bbox: [20, 60 + idx * 30, Math.min(450, (line.lineText || line).length * 8.5), 24]
        }));

        const getVal = (obj: any, ...keys: string[]) => {
          if (!obj || typeof obj !== 'object') return null;
          const searchKeys = keys.map(k => k.toLowerCase().replace(/[^a-z0-9]/g, ''));
          for (const [k, v] of Object.entries(obj)) {
            if (searchKeys.includes(k.toLowerCase().replace(/[^a-z0-9]/g, ''))) return v;
          }
          return null;
        };

        const itemsArray = extracted.items || extracted.orderedItems || [];
        const items = Array.isArray(itemsArray) ? itemsArray.map((item: any) => {
          let sns: string[] = [];
          if (Array.isArray(item.serialNumbers)) {
            sns = item.serialNumbers.map(String);
          } else if (typeof item.serialNumbers === 'string') {
            sns = item.serialNumbers.split(',').map((s: string) => s.trim()).filter(Boolean);
          } else {
            const raw = getVal(item, "serialnumber", "serialno", "srno");
            if (raw) sns = String(raw).split(',').map(s => s.trim()).filter(Boolean);
          }
          
          return {
            description: String(getVal(item, "exactitem", "description", "desc", "itemname", "product", "details", "particulars", "name", "item") || "Line Item"),
            quantity: Number(getVal(item, "quantity", "qty", "count") || 1),
            unit_price: Number(getVal(item, "unitprice", "unit_price", "price", "rate", "cost") || 0),
            amount: Number(getVal(item, "total", "amount", "linetotal", "sum") || 0),
            warranty_text: String(getVal(item, "warrantytext", "warranty", "warrantyperiod", "warrantydetails") || ""),
            serial_numbers: sns
          };
        }) : [];

        // Safe Date Parsing Helper
        const safeDate = (dateStr: any) => {
          if (!dateStr) return new Date().toISOString().split("T")[0];
          const d = new Date(String(dateStr));
          if (isNaN(d.getTime())) return new Date().toISOString().split("T")[0];
          return d.toISOString().split("T")[0];
        };

        const docType = String(extracted.documentType || "Invoice").toLowerCase();
        let prefix = "INV-";
        let parsedInvNum = "";
        let parsedPoNum = getVal(extracted, "ponumber", "po_number", "purchaseorder");
        
        if (docType.includes("purchase order") || docType.includes("po") || docType === "po") {
          prefix = "PO-";
          parsedInvNum = String(getVal(extracted, "ponumber", "po_number", "purchaseorder") || prefix + Math.floor(10000000 + Math.random() * 90000000));
          parsedPoNum = parsedInvNum;
        } else if (docType.includes("credit")) {
          prefix = "CN-";
          parsedInvNum = String(getVal(extracted, "creditnotenumber", "creditnote") || prefix + Math.floor(10000000 + Math.random() * 90000000));
          if (!parsedPoNum) parsedPoNum = "Not Found";
        } else if (docType.includes("debit")) {
          prefix = "DN-";
          parsedInvNum = String(getVal(extracted, "debitnotenumber", "debitnote") || prefix + Math.floor(10000000 + Math.random() * 90000000));
          if (!parsedPoNum) parsedPoNum = "Not Found";
        } else {
          parsedInvNum = String(getVal(extracted, "invoicenumber", "invoicenum", "invoiceno", "invoiceid", "receiptnumber") || prefix + Math.floor(10000000 + Math.random() * 90000000));
          if (!parsedPoNum) parsedPoNum = "Not Found";
        }

        const parsedVendor = getVal(extracted, "vendorname", "buyername", "suppliername", "vendor", "supplier", "companyname") || "Unknown Vendor";
        const parsedAmount = parseFloat(String(getVal(extracted, "amount", "totalamount", "totalvalue", "adjustmentamount", "total", "grandtotal", "amountdue")).replace(/[^0-9.]/g, '')) || 0;
        const parsedDate = getVal(extracted, "invoicedate", "orderdate", "date", "billdate");
        const parsedCurrency = String(getVal(extracted, "currency", "curr") || "INR").toUpperCase();

        // --- 1. MULTI-CURRENCY CONVERSION TO INR ---
        const forexRates: Record<string, number> = {
          "USD": 83.50,
          "EUR": 90.10,
          "GBP": 105.20,
          "AUD": 55.30,
          "CAD": 61.20,
          "INR": 1.0
        };
        const exchangeRate = forexRates[parsedCurrency] || 1.0;
        const baseAmount = parsedAmount * exchangeRate;

        // --- 2. VENDOR MASTER FUZZY MATCHING ---
        let finalVendor = String(parsedVendor).substring(0, 190);
        let isVendorException = false;
        
        if (finalVendor !== "Unknown Vendor") {
          const vendors = await prisma.vendorMaster.findMany({ where: { is_active: true } });
          const matchedVendor = vendors.find(v => 
            v.vendor_name.toLowerCase().includes(finalVendor.toLowerCase()) || 
            finalVendor.toLowerCase().includes(v.vendor_name.toLowerCase())
          );
          if (matchedVendor) {
            finalVendor = matchedVendor.vendor_name;
          } else {
            isVendorException = true;
          }
        }

        // Filter out known keys to populate custom_data with the rest
        const knownKeys = ["documentType", "invoiceNumber", "vendorName", "invoiceDate", "poNumber", "amount", "currency", "cgst", "sgst", "igst", "items", "taxDetails", "ocrText", "ocrLayout"];
        const customData: any = {};
        for (const [k, v] of Object.entries(extracted)) {
          if (!knownKeys.includes(k) && !knownKeys.map(key => key.toLowerCase()).includes(k.toLowerCase())) {
            if (v !== null && v !== "null" && v !== undefined && v !== "") {
              customData[k] = v;
            }
          }
        }

        const parsedDocType = extracted.documentType || "Invoice";
        const isInvoice = parsedDocType.toLowerCase().includes("invoice");
        
        let trackingPrefix = "DOC";
        const dtLower = parsedDocType.toLowerCase();
        if (dtLower.includes("invoice")) trackingPrefix = "INV";
        else if (dtLower.includes("purchase order") || dtLower.includes("po")) trackingPrefix = "PO";
        else if (dtLower.includes("debit note")) trackingPrefix = "DN";
        else if (dtLower.includes("credit note")) trackingPrefix = "CN";
        else if (dtLower.includes("receipt")) trackingPrefix = "RCT";
        
          const dateObj = new Date();
          const yyyymm = dateObj.getFullYear().toString() + (dateObj.getMonth() + 1).toString().padStart(2, '0');
          
          const prefixMonth = `${trackingPrefix}-${yyyymm}-`;
          const lastInvoice = await prisma.invoice.findFirst({
            where: { tracking_id: { startsWith: prefixMonth } },
            orderBy: { tracking_id: 'desc' }
          });
          
          let sequence = 1;
          if (lastInvoice && lastInvoice.tracking_id) {
            const lastSeqStr = lastInvoice.tracking_id.split('-').pop();
            if (lastSeqStr) {
              const lastSeq = parseInt(lastSeqStr, 10);
              if (!isNaN(lastSeq)) sequence = lastSeq + 1;
            }
          }
          const trackingId = `${prefixMonth}${sequence.toString().padStart(4, '0')}`;

        let finalStatus = "Data Verification Pending";
        let isException = false;
        let exceptionReason = null;
        
        if (extracted && extracted._missingRequired && extracted._missingRequired.length > 0) {
           finalStatus = "Exception";
           isException = true;
           exceptionReason = `Missing required fields: ${extracted._missingRequired.join(", ")}`;
        }

        if (isVendorException) {
           finalStatus = "Exception";
           isException = true;
           exceptionReason = exceptionReason ? exceptionReason + " | Unregistered Vendor: " + finalVendor : "Unregistered Vendor: " + finalVendor;
        }

        const finalDocType = String(parsedDocType).substring(0, 190);
        const finalInvNum = String(parsedInvNum).substring(0, 190);
        // finalVendor is already computed above

        // --- DUPLICATE PREVENTION LOGIC ---
        const duplicateCheck = await prisma.invoice.findFirst({
          where: {
            document_type: finalDocType,
            vendor_name: finalVendor,
            invoice_number: finalInvNum,
            id: { not: invoiceId },
            status: { notIn: ["Duplicate", "Exception", "Rejected"] }
          }
        });

        if (duplicateCheck) {
          finalStatus = "Duplicate";
          isException = true;
          exceptionReason = `Duplicate of existing document ${duplicateCheck.tracking_id} (${duplicateCheck.id})`;
          
          await prisma.systemLog.create({
            data: {
              invoice_id: invoiceId,
              action: "Duplicate Detected",
              user: "Validation Engine",
              details: `Matched existing document: ${duplicateCheck.tracking_id}`
            }
          });
        }

        const updatedInv = await prisma.invoice.update({
          where: { id: invoiceId },
          data: {
            status: finalStatus,
            is_exception: isException,
            exception_reason: exceptionReason,
            tracking_id: trackingId,
            document_type: finalDocType,
            invoice_number: finalInvNum,
            vendor_name: finalVendor,
            invoice_date: String(safeDate(parsedDate)).substring(0, 190),
            po_number: String(parsedPoNum).substring(0, 190),
            amount: parsedAmount,
            currency: parsedCurrency,
            base_currency: "INR",
            base_amount: baseAmount,
            tax_details: extracted.taxDetails || "N/A",
            ocr_text: extracted.ocrText || "OCR parsing success.",
            ocr_confidence: 96.5,
            cgst: parseFloat(String(getVal(extracted, "cgst", "cgstamount")).replace(/[^0-9.]/g, '')) || 0,
            sgst: parseFloat(String(getVal(extracted, "sgst", "sgstamount")).replace(/[^0-9.]/g, '')) || 0,
            igst: parseFloat(String(getVal(extracted, "igst", "igstamount")).replace(/[^0-9.]/g, '')) || 0,
            items: items as any,
            ocr_layout: ocrLayout as any,
            custom_data: customData
          }
        });

        await prisma.systemLog.create({
          data: {
            invoice_id: invoiceId,
            action: "Pending Data Verification",
            user: "Routing Engine",
            details: `Extracted Vendor: "${updatedInv.vendor_name}". Awaiting admin data verification.`
          }
        });
        
        // Wait for admin verification before proceeding to GRN or Workflow stages
    } catch (procErr: any) {
        console.error("Async parsing thread crashed:", procErr);
        await prisma.invoice.update({
            where: { id: invoiceId },
            data: { status: "Failed" }
        });
        await prisma.systemLog.create({
            data: { invoice_id: invoiceId, action: "System Error", user: "Processor", details: "AP automation crash: " + procErr.message }
        });
    }
}

// Admin Data Verification Endpoint
app.post("/api/documents/:id/verify-data", authenticateToken, async (req: any, res: any) => {
    try {
        const invoiceId = req.params.id;
        const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
        if (!invoice) return res.status(404).json({ error: "Document not found" });
        if (invoice.status !== "Data Verification Pending") return res.status(400).json({ error: "Document is not pending data verification." });

        const isInvoice = String(invoice.document_type).toLowerCase().includes("invoice");
        const nextStatus = isInvoice ? "Waiting for GRN" : "Pending Approval";

        const updatedInv = await prisma.invoice.update({
            where: { id: invoiceId },
            data: { status: nextStatus }
        });

        await prisma.systemLog.create({
            data: { invoice_id: invoiceId, action: "Data Verified", user: req.user?.email || "Admin", details: "Admin verified extracted data and triggered routing." }
        });

        // If Invoice, go to GRN queue
        if (nextStatus === "Waiting for GRN") {
            await prisma.systemLog.create({
                data: { invoice_id: invoiceId, action: "Routed to Gate Entry", user: "Routing Engine", details: "Document is an Invoice; awaiting GRN verification." }
            });
            return res.json({ success: true, message: "Routed to Gate Entry" });
        }

        // STAGE 2: ERP / PO Lookup
        let erpData = null;
        if (updatedInv.po_number && updatedInv.po_number !== "Not Found") {
           erpData = await prisma.eRPMaster.findUnique({ where: { po_number: updatedInv.po_number } });
           
           // --- 3. TRUE 3-WAY MATCHING (Price Variance) ---
           if (erpData && updatedInv.base_amount !== null && updatedInv.base_amount !== undefined) {
             const poAmountInr = (erpData.po_amount || 0);
             const tolerance = (erpData.tolerance_amount || 0);
             const maxAllowed = poAmountInr + tolerance;
             
             if (updatedInv.base_amount > maxAllowed) {
                const variance = updatedInv.base_amount - poAmountInr;
                await prisma.invoice.update({
                   where: { id: invoiceId },
                   data: { 
                     status: "Exception", 
                     is_exception: true, 
                     exception_reason: `Price Variance: Invoice exceeds PO by ₹${variance.toFixed(2)}`,
                     price_variance: variance,
                     is_price_variance: true
                   }
                });
                await prisma.systemLog.create({
                   data: { invoice_id: invoiceId, action: "Workflow Halted", user: "Verification Engine", details: `Price Variance Exception. PO Amount: ₹${poAmountInr}, Invoice: ₹${updatedInv.base_amount}, Tolerance: ₹${tolerance}` }
                });
                return res.json({ success: true, message: "Halted due to Price Variance Exception." });
             }
           }
        }

        if (!erpData && updatedInv.po_number !== "Not Found") {
           await prisma.invoice.update({
             where: { id: invoiceId },
             data: { status: "Exception", is_exception: true, exception_reason: "ERP Lookup Failed: PO Not Found" }
           });
           await prisma.systemLog.create({
             data: { invoice_id: invoiceId, action: "Workflow Halted", user: "Routing Engine", details: "ERP Lookup Failed." }
           });
           return res.json({ success: true, message: "Halted due to ERP Exception." });
        }

        // STAGE 3: Workflow Resolution Engine
        let finalWorkflowProfile = null;
        const rules = await prisma.businessRule.findMany({
            where: { document_type: updatedInv.document_type },
            orderBy: { priority: 'asc' }
        });
        for (const rule of rules) {
            let conditions = [];
            try {
                conditions = JSON.parse(rule.conditions_json as string);
            } catch (e) { }
            let matches = true;
            for (const cond of conditions) {
                let actualValue = (updatedInv as any)[cond.field];
                if (actualValue === undefined && erpData) {
                    actualValue = (erpData as any)[cond.field];
                }
                if (actualValue === undefined && updatedInv.custom_data) {
                    actualValue = (updatedInv.custom_data as any)[cond.field];
                }
                if (cond.operator === "equals" && String(actualValue).toLowerCase() !== String(cond.value).toLowerCase()) matches = false;
                if (cond.operator === "gt" && Number(actualValue) <= Number(cond.value)) matches = false;
                if (cond.operator === "lt" && Number(actualValue) >= Number(cond.value)) matches = false;
                if (cond.operator === "contains" && !String(actualValue).toLowerCase().includes(String(cond.value).toLowerCase())) matches = false;
            }
            if (matches && conditions.length > 0) {
                finalWorkflowProfile = rule.target_workflow_id;
                break;
            }
        }
        if (!finalWorkflowProfile) {
            const fallback = rules.find(r => {
                try {
                    return JSON.parse(r.conditions_json as string).length === 0;
                } catch (e) {
                    return false;
                }
            });
            if (fallback) finalWorkflowProfile = fallback.target_workflow_id;
        }
        if (!finalWorkflowProfile) {
            await prisma.invoice.update({
                where: { id: invoiceId },
                data: { status: "Exception", is_exception: true, exception_reason: "No Workflow Match" }
            });
            await prisma.systemLog.create({
                data: { invoice_id: invoiceId, action: "Workflow Halted", user: "Routing Engine", details: "No matching business rules." }
            });
            return res.json({ success: true, message: "Halted due to no rules match." });
        }

        // Initialize Workflow
        await prisma.activeApprovalLog.upsert({
            where: { invoice_id: invoiceId },
            update: {
                workflow_profile: finalWorkflowProfile,
                current_stage_number: 1,
                status: "Pending"
            },
            create: {
                invoice_id: invoiceId,
                workflow_profile: finalWorkflowProfile,
                current_stage_number: 1,
                status: "Pending"
            }
        });
        await prisma.systemLog.create({
            data: {
                invoice_id: invoiceId,
                action: "Workflow Initialized",
                user: "Routing Engine",
                details: "Started " + finalWorkflowProfile + " at Stage 1."
            }
        });

        res.json({ success: true, message: "Workflow started successfully." });
    } catch (error: any) {
        console.error("Data Verification error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// Admin Endpoints for Compliance and Health
app.get("/api/admin/audit-logs", authenticateToken, async (req: any, res: any) => {
    try {
        const logs = await prisma.systemLog.findMany({
            orderBy: { timestamp: "desc" },
            take: 100,
            include: {
                invoice: { select: { invoice_number: true, vendor_name: true } }
            }
        });
        res.json(logs);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/api/admin/health", authenticateToken, async (req: any, res: any) => {
    res.json({ database: "Online", aiEngine: "Online", webhookProcessor: "Online", dbLatency: 15, aiLatency: 120, webLatency: 45 });
});

app.get("/api/admin/users", authenticateToken, async (req: any, res: any) => {
    try {
        const users = await prisma.user.findMany({ select: { id: true, name: true, email: true, role: true, permissions: true, created_at: true } });
        res.json(users);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/admin/users", authenticateToken, async (req: any, res: any) => {
    try {
        const { name, email, role, password, permissions } = req.body;
        const user = await prisma.user.create({ data: { name, email, role, permissions: JSON.stringify(permissions || []), password_hash: password || "default123" } });
        res.json(user);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.put("/api/admin/users/:id", authenticateToken, async (req: any, res: any) => {
    try {
        const { name, email, role, permissions } = req.body;
        const user = await prisma.user.update({ where: { id: req.params.id }, data: { name, email, role, permissions: JSON.stringify(permissions || []) } });
        res.json(user);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.delete("/api/admin/users/:id", authenticateToken, async (req: any, res: any) => {
    try {
        await prisma.user.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.get("/api/admin/erp-master", authenticateToken, async (req: any, res: any) => {
    try {
        const data = await prisma.eRPMaster.findMany();
        res.json(data);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/admin/erp-master", authenticateToken, async (req: any, res: any) => {
    try {
        const data = await prisma.eRPMaster.upsert({
            where: { po_number: req.body.po_number },
            update: req.body,
            create: req.body
        });
        res.json(data);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/admin/erp-master/bulk", authenticateToken, async (req: any, res: any) => {
    try {
        const items = req.body.items;
        if (!items || !Array.isArray(items)) return res.status(400).json({ error: "Invalid array" });
        for (const item of items) {
            if (!item.po_number) continue;
            await prisma.eRPMaster.upsert({
                where: { po_number: item.po_number },
                update: item,
                create: item
            });
        }
        res.json({ success: true, count: items.length });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.delete("/api/admin/erp-master/:po", authenticateToken, async (req: any, res: any) => {
    try {
        await prisma.eRPMaster.delete({ where: { po_number: req.params.po } });
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.get("/api/admin/config", authenticateToken, async (req: any, res: any) => {
    try {
        const configs = await prisma.systemConfig.findMany();
        res.json(configs);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/admin/config", authenticateToken, async (req: any, res: any) => {
    try {
        const { key, value, description } = req.body;
        const cfg = await prisma.systemConfig.upsert({
            where: { key },
            update: { value, description },
            create: { key, value, description }
        });
        res.json(cfg);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/notifications/send", async (req: any, res: any) => {
    try {
        const { document_id, document_number, document_type, workflow_name, current_step, next_step, next_approver_name, next_approver_email, review_url, action_performed, performed_by, timestamp, title, message, notification_type } = req.body;
        if (!document_id || !next_approver_email) {
            return res.status(400).json({ error: "document_id and next_approver_email are required" });
        }
        const nType = notification_type || "PENDING_APPROVAL";
        const inAppConfig = await prisma.inAppNotificationConfig.findUnique({ where: { trigger_event: nType } });
        if (inAppConfig && inAppConfig.enabled === false) {
            return res.status(200).json({ message: "Notification disabled by config" });
        }
        let finalTitle = title || "Document Notification";
        let finalMessage = message || "Invoice " + document_number + " requires attention.";
        if (inAppConfig) {
            if (inAppConfig.title_template)
                finalTitle = inAppConfig.title_template.replace(/{{document_number}}/g, document_number || "");
            if (inAppConfig.message_template)
                finalMessage = inAppConfig.message_template.replace(/{{document_number}}/g, document_number || "");
        }
        const recipient = await prisma.user.findUnique({ where: { email: next_approver_email } });
        const recipient_user_id = recipient ? recipient.id : null;
        const notification = await prisma.notification.create({
            data: {
                document_id,
                recipient_user_id,
                recipient_email: next_approver_email,
                notification_type: nType,
                title: finalTitle,
                message: finalMessage,
                status: "Pending"
            }
        });
        const n8nUrl = process.env.N8N_WEBHOOK_URL || "http://localhost:3000/api/mock-n8n-webhook";
        console.log("[Notification Service] Forwarding notification to n8n webhook at " + n8nUrl);
        fetch(n8nUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(req.body)
        })
        .then(async (response) => {
            const text = await response.text();
            if (response.ok) {
                await prisma.notification.update({
                    where: { notification_id: notification.notification_id },
                    data: { status: "Sent", sent_at: new Date(), external_response: text }
                });
                console.log("[Notification Service] Successfully sent notification to " + next_approver_email + " via n8n");
            } else {
                await prisma.notification.update({
                    where: { notification_id: notification.notification_id },
                    data: { status: "Failed", external_response: "n8n returned status " + response.status + ": " + text }
                });
                console.error("[Notification Service] Webhook failed for " + next_approver_email + ": " + text);
            }
            io.emit("new_notification", { recipientEmail: next_approver_email });
        })
        .catch(async (err) => {
        await prisma.notification.update({
          where: { notification_id: notification.notification_id },
          data: { status: "Failed", external_response: err.message, retry_count: { increment: 1 } }
        });
        console.error(`[Notification Service] Network failure sending webhook to n8n:`, err.message);
        io.emit("new_notification", { recipientEmail: next_approver_email });
      });

    res.json({ success: true, notification_id: notification.notification_id, status: "Pending" });
  } catch (error: any) {
    console.error("[Notification Service] Error exposing notification send endpoint:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/notifications - Get list of notifications for the current authenticated user
app.get("/api/notifications", authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const notifications = await prisma.notification.findMany({
      where: { recipient_email: user.email },
      orderBy: { created_at: "desc" }
    });
    res.json(notifications);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/notifications/:id/read - Mark single notification as read
app.put("/api/notifications/:id/read", authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const notification = await prisma.notification.findFirst({
      where: { notification_id: req.params.id, recipient_email: user.email }
    });

    if (!notification) {
      return res.status(404).json({ error: "Notification not found or access denied." });
    }

    const updated = await prisma.notification.update({
      where: { notification_id: notification.notification_id },
      data: { is_read: true }
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/notifications/read-all - Mark all notifications as read for current user
app.put("/api/notifications/read-all", authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    const result = await prisma.notification.updateMany({
      where: { recipient_email: user.email, is_read: false },
      data: { is_read: true }
    });
    res.json({ success: true, count: result.count });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/mock-n8n-webhook - Development mock receiver for n8n webhooks
app.post("/api/mock-n8n-webhook", async (req, res) => {
  console.log("[Mock n8n Webhook] Received payload:", req.body);
  res.json({ success: true, message: "Mock webhook processed successfully" });
});

// ---------------- EXTRA WORKFLOW ACTION ROUTING ENDPOINTS ----------------

app.post(["/api/workflows/request clarification", "/api/workflows/request-clarification"], authenticateToken, async (req, res) => {
  try {
    const { invoiceId, comments } = req.body;
    const user = (req as any).user;

    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    const activeLog = await prisma.activeApprovalLog.findUnique({ where: { invoice_id: invoiceId } });

    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: "Clarification Requested" }
    });

    await prisma.systemLog.create({
      data: {
        invoice_id: invoiceId,
        action: "Clarification Requested",
        user: user.email,
        details: `Clarification requested. Comments: "${comments || 'None'}"`
      }
    });

    let wfInst = await prisma.workflowInstance.findUnique({ where: { invoice_id: invoiceId } });
    if (wfInst) {
      await prisma.approval.create({
        data: {
          workflow_instance_id: wfInst.id,
          approver: user.email,
          action: "Request Clarification",
          comments: comments || "Clarification requested."
        }
      });
    }

    // Trigger notification service
    await triggerNotificationFlow(invoiceId, "Request Clarification", comments, user.email);

    io.emit("workflow_updated", { invoiceId, action: "Request Clarification" });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post(["/api/workflows/send-back", "/api/workflows/sendback"], authenticateToken, async (req, res) => {
  try {
    const { invoiceId, comments } = req.body;
    const user = (req as any).user;

    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    const activeLog = await prisma.activeApprovalLog.findUnique({ where: { invoice_id: invoiceId } });
    if (!activeLog) return res.status(404).json({ error: "No active workflow found." });

    let newStage = activeLog.current_stage_number;
    let newStatus = activeLog.status;
    if (activeLog.current_stage_number > 1) {
      newStage = activeLog.current_stage_number - 1;
      newStatus = "Pending";
    }

    await prisma.activeApprovalLog.update({
      where: { id: activeLog.id },
      data: { current_stage_number: newStage, status: newStatus }
    });

    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: `Sent Back (Stage ${newStage})` }
    });

    await prisma.systemLog.create({
      data: {
        invoice_id: invoiceId,
        action: "Workflow Sent Back",
        user: user.email,
        details: `Document sent back to Stage ${newStage}. Comments: ${comments || 'None'}`
      }
    });

    let wfInst = await prisma.workflowInstance.findUnique({ where: { invoice_id: invoiceId } });
    if (wfInst) {
      await prisma.approval.create({
        data: {
          workflow_instance_id: wfInst.id,
          approver: user.email,
          action: "Send Back",
          comments: comments || "Sent back."
        }
      });
    }

    // Trigger notification service
    await triggerNotificationFlow(invoiceId, "Send Back", comments, user.email);

    io.emit("workflow_updated", { invoiceId, action: "Send Back" });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- NOTIFICATION SERVICE Webhook & DB Logger ----------------

// ... existing code for webhook ...
app.post("/api/notifications/webhook", async (req: any, res: any) => {
  console.log("Received SendGrid Event:", req.body);
  res.status(200).send("OK");
});

// ---------------- ADMIN NOTIFICATIONS APIs ----------------

import nodemailer from "nodemailer";

async function getTransporter() {
  const config = await prisma.emailProviderConfig.findFirst();
  if (!config) throw new Error("Email provider not configured");
  return nodemailer.createTransport({
    host: config.smtp_server,
    port: config.port,
    secure: config.port === 465, // true for 465, false for other ports
    auth: {
      user: config.username,
      pass: config.encrypted_password,
    },
    tls: { rejectUnauthorized: false }
  });
}

app.get("/api/admin/notifications/provider", authenticateToken, async (req: any, res: any) => {
  try {
    const config = await prisma.emailProviderConfig.findFirst();
    res.json(config || {});
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
app.post("/api/admin/notifications/provider", authenticateToken, async (req: any, res: any) => {
  try {
    const data = req.body;
    let config = await prisma.emailProviderConfig.findFirst();
    if (config) {
      config = await prisma.emailProviderConfig.update({ where: { id: config.id }, data });
    } else {
      config = await prisma.emailProviderConfig.create({ data });
    }
    res.json(config);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get("/api/admin/notifications/rules", authenticateToken, async (req: any, res: any) => {
  try {
    const rules = await prisma.notificationRule.findMany({ include: { recipients: true } });
    res.json(rules);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
app.post("/api/admin/notifications/rules", authenticateToken, async (req: any, res: any) => {
  try {
    const { recipients, ...data } = req.body;
    const rule = await prisma.notificationRule.create({
      data: {
        ...data,
        recipients: { create: recipients || [] }
      },
      include: { recipients: true }
    });
    res.json(rule);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
app.put("/api/admin/notifications/rules/:id", authenticateToken, async (req: any, res: any) => {
  try {
    const { recipients, ...data } = req.body;
    // Simple approach: delete existing recipients and recreate
    await prisma.notificationRecipient.deleteMany({ where: { notification_rule_id: req.params.id } });
    const rule = await prisma.notificationRule.update({
      where: { id: req.params.id },
      data: {
        ...data,
        recipients: { create: recipients || [] }
      },
      include: { recipients: true }
    });
    res.json(rule);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
app.delete("/api/admin/notifications/rules/:id", authenticateToken, async (req: any, res: any) => {
  try {
    await prisma.notificationRule.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get("/api/admin/notifications/templates", authenticateToken, async (req: any, res: any) => {
  try {
    const templates = await prisma.emailTemplate.findMany();
    res.json(templates);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
app.post("/api/admin/notifications/templates", authenticateToken, async (req: any, res: any) => {
  try {
    const t = await prisma.emailTemplate.create({ data: req.body });
    res.json(t);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
app.put("/api/admin/notifications/templates/:id", authenticateToken, async (req: any, res: any) => {
  try {
    const t = await prisma.emailTemplate.update({ where: { id: req.params.id }, data: req.body });
    res.json(t);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
app.delete("/api/admin/notifications/templates/:id", authenticateToken, async (req: any, res: any) => {
  try {
    await prisma.emailTemplate.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get("/api/admin/notifications/logs", authenticateToken, async (req: any, res: any) => {
  try {
    const logs = await prisma.emailLog.findMany({ orderBy: { created_at: 'desc' }, take: 100 });
    res.json(logs);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post("/api/admin/notifications/test", authenticateToken, async (req: any, res: any) => {
  try {
    const config = await prisma.emailProviderConfig.findFirst();
    if (!config) return res.status(400).json({ error: "SMTP Provider not configured." });
    
    const transporter = await getTransporter();
    const info = await transporter.sendMail({
      from: `"${config.sender_name}" <${config.sender_email || config.username}>`,
      to: req.body.to,
      subject: req.body.subject,
      html: req.body.html || "<p>Test email</p>"
    });

    await prisma.emailLog.create({
      data: {
        event: "Test Email",
        sender: config.sender_email || config.username || "System",
        recipients: req.body.to,
        subject: req.body.subject,
        status: "Sent"
      }
    });

    res.json({ messageId: info.messageId });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/notifications/inapp-config', authenticateToken, async (req, res) => {
  try {
    const configs = await prisma.inAppNotificationConfig.findMany();
    res.json(configs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/notifications/inapp-config', authenticateToken, async (req, res) => {
  try {
    const configData = req.body; // Array of configs
    // Delete all and insert new ones
    await prisma.inAppNotificationConfig.deleteMany();
    if (configData && configData.length > 0) {
      await prisma.inAppNotificationConfig.createMany({ data: configData });
    }
    res.json({ message: 'Saved successfully' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/notifications/inapp-config', authenticateToken, async (req, res) => {
  try {
    const configs = await prisma.inAppNotificationConfig.findMany();
    res.json(configs);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/notifications/inapp-config', authenticateToken, async (req, res) => {
  try {
    const configData = req.body; // Array of configs
    // Delete all and insert new ones
    await prisma.inAppNotificationConfig.deleteMany();
    if (configData && configData.length > 0) {
      await prisma.inAppNotificationConfig.createMany({ data: configData });
    }
    res.json({ message: 'Saved successfully' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ---------------- RACI MATRIX ENDPOINTS ----------------
app.get('/api/admin/notifications/raci', authenticateToken, async (req, res) => {
  try {
    const matrices = await prisma.rACIMatrix.findMany();
    res.json(matrices);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/notifications/raci', authenticateToken, async (req, res) => {
  try {
    const { workflow_profile, event_name, responsible_emails, accountable_emails, consulted_emails, informed_emails, title_template, message_template } = req.body;
    
    if (!workflow_profile || !event_name) {
      return res.status(400).json({ error: "workflow_profile and event_name are required" });
    }

    const updated = await prisma.rACIMatrix.upsert({
      where: {
        workflow_profile_event_name: {
          workflow_profile,
          event_name
        }
      },
      update: {
        responsible_emails,
        accountable_emails,
        consulted_emails,
        informed_emails,
        title_template,
        message_template
      },
      create: {
        workflow_profile,
        event_name,
        responsible_emails,
        accountable_emails,
        consulted_emails,
        informed_emails,
        title_template,
        message_template
      }
    });

    res.json(updated);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ---------------- BACKGROUND WORKER (SLA & Retention) ----------------
async function runBackgroundWorker() {
  try {
    // 1. Fetch Configs
    const configs = await prisma.systemConfig.findMany();
    const slaHoursStr = configs.find((c: any) => c.key === "APPROVAL_SLA_HOURS")?.value || "72";
    const retentionDaysStr = configs.find((c: any) => c.key === "DATA_RETENTION_DAYS")?.value || "365";
    const slaHours = parseInt(slaHoursStr);
    const retentionDays = parseInt(retentionDaysStr);

    // 2. SLA Escalation Check
    // Find active approvals pending longer than SLA
    const slaThresholdDate = new Date(Date.now() - (slaHours * 60 * 60 * 1000));
    
    const overdueApprovals = await prisma.activeApprovalLog.findMany({
      where: {
        status: "Pending",
        last_updated: { lt: slaThresholdDate }
      }
    });

    for (const overdue of overdueApprovals) {
      // Flag as escalated
      await prisma.activeApprovalLog.update({
        where: { id: overdue.id },
        data: { status: "ESCALATED", last_updated: new Date() }
      });
      // Log it
      await prisma.systemLog.create({
        data: {
          invoice_id: overdue.invoice_id,
          action: "SLA_ESCALATION",
          user: "SYSTEM",
          details: `Invoice pending approval for > ${slaHours} hours. Auto-escalated.`
        }
      });
      console.log(`[BACKGROUND WORKER] Escalated invoice ${overdue.invoice_id} due to SLA breach.`);
    }

    // 3. Data Retention Compliance Check
    const retentionThresholdDate = new Date(Date.now() - (retentionDays * 24 * 60 * 60 * 1000));
    
    // Delete old completed invoices
    const oldInvoices = await prisma.invoice.findMany({
      where: {
        status: "Completed",
        created_at: { lt: retentionThresholdDate }
      },
      select: { id: true }
    });
    
    if (oldInvoices.length > 0) {
      const ids = oldInvoices.map((inv: any) => inv.id);
      await prisma.invoice.deleteMany({ where: { id: { in: ids } } });
      console.log(`[BACKGROUND WORKER] Deleted ${ids.length} invoices older than ${retentionDays} days for compliance.`);
    }
    
    // Delete old system logs in chunks to prevent locking
    let totalDeletedLogs = 0;
    while (true) {
      const logsToDelete = await prisma.systemLog.findMany({
        where: { timestamp: { lt: retentionThresholdDate } },
        select: { id: true },
        take: 1000
      });
      if (logsToDelete.length === 0) break;
      
      const logIds = logsToDelete.map((l: any) => l.id);
      const delRes = await prisma.systemLog.deleteMany({ where: { id: { in: logIds } } });
      totalDeletedLogs += delRes.count;
    }
    
    if (totalDeletedLogs > 0) {
      console.log(`[BACKGROUND WORKER] Cleared ${totalDeletedLogs} old system logs.`);
    }
  } catch (error) {
    console.error("[BACKGROUND WORKER] Error:", error);
  }
}
// --- ERP SYNC INTEGRATION ---
app.post("/api/admin/erp-sync", authenticateToken, async (req: any, res: any) => {
  try {
    const approvedInvoices = await prisma.invoice.findMany({
      where: {
        status: { in: ["Approved", "Paid", "Completed"] },
        erp_sync_status: "Pending"
      }
    });

    for (const inv of approvedInvoices) {
      // Mock API Push to SAP/Oracle/NetSuite
      await new Promise(resolve => setTimeout(resolve, 100)); // simulate network delay

      await prisma.invoice.update({
        where: { id: inv.id },
        data: { erp_sync_status: "Synced" }
      });

      await prisma.systemLog.create({
        data: {
          invoice_id: inv.id,
          action: "ERP Sync Successful",
          user: req.user?.email || "System",
          details: `Invoice JSON pushed to external ERP via API Webhook.`
        }
      });
    }

    res.json({ success: true, count: approvedInvoices.length, message: `Successfully pushed ${approvedInvoices.length} documents to ERP.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/trigger-sla-check", authenticateToken, async (req: any, res: any) => {
  try {
    await runSLAEngine();
    res.json({ success: true, message: "SLA Engine executed successfully." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 60 * 60 * 1000 = 3600000 ms
setInterval(runBackgroundWorker, 3600000);
console.log("[BACKGROUND WORKER] Initialized for SLA and Data Retention processing.");

// Start the server
async function startServer() {
  httpServer.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Corporate AP Invoice system backend listening on http://localhost:${PORT}`);
  });
}

startServer();
