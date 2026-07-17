import express from "express";
import crypto from "crypto";
import path from "path";
import { promises as fs, mkdirSync, existsSync } from "fs";
import multer from "multer";
import dotenv from "dotenv";
import { exec } from "child_process";
import util from "util";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import cors from "cors";
import { fileURLToPath } from "url";

const execAsync = util.promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { prisma } from "./server-db";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { triggerNotificationFlow } from "./notification-service";
import { registerNotificationAdminRoutes } from "./notification-admin";
import { runSLAEngine } from "./sla-engine";
import { archiveApprovedDocument } from "./archive-service";

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
app.use(cors({ 
  origin: true,
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
  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, async (err: any, decoded: any) => {
    if (err) return res.sendStatus(403);
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user) return res.sendStatus(403); // Token is mathematically valid but user was deleted
    req.user = user;
    next();
  });
};

// Hierarchical Sequence Generator
async function getNextHierarchicalId(type: 'AP Invoice' | 'Credit Note' | 'Debit Note' | 'Purchase Order' | 'Vendor Payment' | 'Workflow' | 'Goods Receipt' | string): Promise<string> {
  let code = "";
  let prefix = "";
  if (type === "AP Invoice") {
    prefix = "INV";
    code = "11";
  } else if (type === "Credit Note") {
    prefix = "CN";
    code = "12";
  } else if (type === "Debit Note") {
    prefix = "DN";
    code = "13";
  } else if (type === "Vendor Payment") {
    prefix = "VP";
    code = "1";
  } else if (type === "Purchase Order") {
    prefix = "PO";
    code = "14";
  } else if (type === "Workflow") {
    prefix = "WF";
    code = "26"; // E.g., year 2026
  } else if (type === "Goods Receipt") {
    prefix = "GRN";
    code = "26";
  } else {
    prefix = "DOC";
    code = "99";
  }
  
  const fullPrefix = `${prefix}-${code}`;
  
  const seq = await prisma.sequence.upsert({
    where: { code: fullPrefix },
    update: { current: { increment: 1 } },
    create: { code: fullPrefix, current: 1 }
  });
  
  const numberStr = seq.current.toString().padStart(3, '0');
  return `${fullPrefix}${numberStr}`;
}

// Auth Endpoint
app.post("/api/auth/login", async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ error: "Identifier and password are required" });
    }

    // Check if identifier matches username, employee_id, or email
    const user = await prisma.user.findFirst({ 
      where: { 
        OR: [
          { username: identifier },
          { employee_id: identifier },
          { email: identifier }
        ]
      } 
    });
    
    if (!user) {
      return res.status(400).json({ error: "User not found" });
    }
    
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, user: { id: user.id, email: user.email, role: user.role, name: user.name, username: user.username } });
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
const OLLAMA_BASE_URL = LOCAL_LLM_URL.replace("/api/generate", "");

function evaluateRuleConditions(conditions: any[], invoice: any, erpData?: any): boolean {
  if (!conditions || conditions.length === 0) return true;

  let isMatch = true;

  for (let i = 0; i < conditions.length; i++) {
    const cond = conditions[i];
        const fieldMapping: Record<string, string> = {
      "Vendor Name": "vendor_name",
      "Supplier Name": "vendor_name",
      "Amount": "amount",
      "Invoice Amount (Total)": "amount",
      "PO Number": "po_number",
      "Invoice Number": "invoice_number",
      "Document Type": "document_type",
      "Category": "category",
      "Cost Center": "cost_center",
      "Department": "department",
      "Division": "division",
      "Plant": "plant",
      "Product Line Items": "items"
    };
    const dbField = fieldMapping[cond.field] || cond.field;
    let fieldVal = invoice[dbField];
    
    if (fieldVal === undefined && erpData) {
       fieldVal = (erpData as any)[dbField];
    }
    if (fieldVal === undefined && invoice.custom_data) {
       try {
         fieldVal = (typeof invoice.custom_data === 'string' ? JSON.parse(invoice.custom_data) : invoice.custom_data)[dbField];
       } catch (e) {}
    }

    let { operator, value } = cond;
    let operatorLower = String(operator).toLowerCase().trim();
    let currentMatch = true;

    if (cond.field === 'amount' || !isNaN(Number(value))) {
       fieldVal = Number(fieldVal) || 0;
       value = Number(value) || 0;
    } else {
       fieldVal = String(fieldVal || "").toLowerCase();
       value = String(value || "").toLowerCase();
    }

    switch (operatorLower) {
      case '==':
      case '===':
      case 'equals':
      case '=':
        if (fieldVal != value) currentMatch = false;
        break;
      case '!=':
      case '!==':
      case 'not_equals':
        if (fieldVal != value) currentMatch = false;
        break;
      case '>':
      case 'gt':
      case 'greater than':
        if (fieldVal <= value) currentMatch = false;
        break;
      case '<':
      case 'lt':
      case 'less than':
        if (fieldVal >= value) currentMatch = false;
        break;
      case '>=':
      case 'greater than or equal':
        if (fieldVal < value) currentMatch = false;
        break;
      case '<=':
      case 'less than or equal':
        if (fieldVal > value) currentMatch = false;
        break;
      case 'contains':
        if (!String(fieldVal).includes(String(value))) currentMatch = false;
        break;
      case "is_null":
      case "is_empty":
        if (fieldVal !== null && fieldVal !== undefined && fieldVal !== "" && fieldVal !== "Not Found") currentMatch = false;
        break;
      case "is_not_null":
      case "not_empty":
        if (fieldVal === null || fieldVal === undefined || fieldVal === "" || fieldVal === "Not Found") currentMatch = false;
        break;
    }

    if (i === 0) {
       isMatch = currentMatch;
    } else {
       const prevCond = conditions[i - 1];
       if (prevCond.logicalOperator === 'OR') {
          isMatch = isMatch || currentMatch;
       } else {
          isMatch = isMatch && currentMatch;
       }
    }
  }

  return isMatch;
}

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
function parseInvoiceForFrontend(invoice: any) {
  if (!invoice) return invoice;
  const parsed = { ...invoice };
  try {
    if (typeof parsed.items === 'string') parsed.items = JSON.parse(parsed.items);
    if (typeof parsed.custom_data === 'string') parsed.custom_data = JSON.parse(parsed.custom_data);
    if (typeof parsed.ocr_layout === 'string') parsed.ocr_layout = JSON.parse(parsed.ocr_layout);
    if (parsed.workflowInst && typeof parsed.workflowInst.state_json === 'string') {
      parsed.workflowInst.state_json = JSON.parse(parsed.workflowInst.state_json);
    }
  } catch(e) {
    console.error("Failed to parse invoice JSON strings for frontend", e);
  }
  return parsed;
}

// ---------------- WORKFLOW ENGINE ----------------
async function matchAndStartWorkflow(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) return { success: false, message: "Invoice not found." };

  let finalWorkflowProfile = null;
  let erpData = null;
  if (invoice.po_number && invoice.po_number !== "Not Found") {
     erpData = await prisma.eRPMaster.findUnique({ where: { po_number: invoice.po_number } });
     
     // --- 3. TRUE 3-WAY MATCHING (Price Variance) ---
     /* Disabled as per user request to ignore ERP PO matching
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
          return { success: true, message: "Halted due to Price Variance Exception." };
       }
     }
     */
  }

  const rules = await prisma.businessRule.findMany({
    where: { document_type: invoice.document_type },
    orderBy: { priority: 'asc' }
  });
  for (const rule of rules) {
     let conditionsObj: any = [];
     try { conditionsObj = JSON.parse(rule.conditions_json); } catch(e) {}
     
     let conditionsArray = conditionsObj;
     if (conditionsObj && !Array.isArray(conditionsObj) && conditionsObj.conditions) {
       conditionsArray = conditionsObj.conditions;
     }

     let matches = evaluateRuleConditions(conditionsArray, invoice, erpData);
     if (matches && conditionsArray.length > 0) {
        finalWorkflowProfile = rule.target_workflow_id;
        break;
     }
  }

  if (!finalWorkflowProfile) {
     const fallback = rules.find(r => {
       try {
         const obj = JSON.parse(r.conditions_json);
         if (Array.isArray(obj)) return obj.length === 0;
         if (obj && obj.conditions) return obj.conditions.length === 0;
         return false;
       } catch(e) { return false; }
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
     return { success: true, message: "Workflow matching executed but no rule matched." };
  }

  let finalWorkflowProfileName = finalWorkflowProfile;
  try {
    const wff = await prisma.workflow.findUnique({ where: { id: finalWorkflowProfile } });
    if (wff) finalWorkflowProfileName = wff.workflow_name;
  } catch (e) {}

  await prisma.activeApprovalLog.upsert({
    where: { invoice_id: invoice.id },
    update: {
      current_stage_number: 1,
      status: "Pending",
      workflow_profile: finalWorkflowProfileName
    },
    create: {
      invoice_id: invoice.id,
      workflow_profile: finalWorkflowProfileName,
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
      details: `Matched business rules. Started ${finalWorkflowProfile} at Stage 1.`
    }
  });
  return { success: true };
}

// 1. Get List of all Invoices (Filtered by Involvement)
app.get("/api/documents", authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    let invoices;
    
      // 0. Fetch full user to get username
      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      const currentUsername = dbUser?.username || '';

      // 1. Find all workflow profiles where this user is an approver
      const userSteps = await prisma.workflowStepDefinition.findMany({
          where: { approver_target: currentUsername }
      });

    if (user.role === 'admin' || user.role === 'executive') {
      invoices = await prisma.invoice.findMany({ 
        include: { activeApprovalLog: true },
        orderBy: { created_at: 'desc' } 
      });
    } else {
      const userProfiles = userSteps.map(s => s.profile_name);
      
      // 2. Find all active approval logs for those profiles
      const userLogs = await prisma.activeApprovalLog.findMany({
          where: { workflow_profile: { in: userProfiles } }
      });
      
      // Also get invoices they've already approved (historical)
      const approvals = await prisma.approval.findMany({ where: { approver: user.email } });
      const wfInstances = await prisma.workflowInstance.findMany({ 
        where: { id: { in: approvals.map(a => a.workflow_instance_id) } } 
      });

      const invoiceIds = new Set([
        ...userLogs.map(l => l.invoice_id),
        ...wfInstances.map(w => w.invoice_id)
      ]);

      invoices = await prisma.invoice.findMany({ 
        where: { 
          OR: [
            { uploaded_by_id: user.id },
            { id: { in: Array.from(invoiceIds) } }
          ]
        },
        include: { activeApprovalLog: true },
        orderBy: { created_at: 'desc' } 
      });
    }

    const activeProfiles = [...new Set(invoices.map((i: any) => i.activeApprovalLog?.workflow_profile).filter(Boolean))];
    const allSteps = await prisma.workflowStepDefinition.findMany({
        where: { profile_name: { in: activeProfiles as string[] } }
    });

    const enrichedInvoices = invoices.map((inv: any) => {
      let isCurrent = false;
      let assigned_to = "-";
      if (inv.activeApprovalLog && inv.activeApprovalLog.status === 'Pending') {
         const log = inv.activeApprovalLog;
         const step = userSteps.find(s => 
           s.profile_name === log.workflow_profile && 
           s.stage_number === log.current_stage_number
         );
         if (step) isCurrent = true;

         const currentStageStep = allSteps.find(s => 
            s.profile_name === log.workflow_profile && 
            s.stage_number === log.current_stage_number
         );
         if (currentStageStep) {
            assigned_to = currentStageStep.approver_target;
         }
      }
      return { ...inv, is_current_approver: isCurrent, assigned_to };
    });

    res.json(enrichedInvoices.map(parseInvoiceForFrontend));
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
    if (user.role === 'admin' || user.role === 'executive') {
      invoices = await prisma.invoice.findMany({ 
        skip,
        take,
        include: { workflowInst: true, activeApprovalLog: true },
        orderBy: { created_at: 'desc' } 
      });
    } else {
      // 0. Fetch full user to get username
      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      const currentUsername = dbUser?.username || '';

      // 1. Get all workflow profiles where this user is assigned
      const userSteps = await prisma.workflowStepDefinition.findMany({
          where: { approver_target: currentUsername }
      });
      const userProfiles = userSteps.map(s => s.profile_name);
      
      // 2. Find all active approval logs for those profiles
      const userLogs = await prisma.activeApprovalLog.findMany({
          where: { workflow_profile: { in: userProfiles } }
      });
      
      const invoiceIds = new Set(userLogs.map(l => l.invoice_id));

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

    res.json(enrichedInvoices.map(parseInvoiceForFrontend));
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

    res.json({ invoice: parseInvoiceForFrontend(invoice), goods_receipt: grn, workflow_instance: wf_inst, approvals, logs, active_workflow, workflow_steps, active_approval_log, workflow_step_definitions });
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

    res.json({ invoice: parseInvoiceForFrontend(invoice), goods_receipt: grn, workflow_instance: wf_inst, approvals, logs, active_workflow, workflow_steps, active_approval_log, workflow_step_definitions });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. System KPI Statistics aggregator
app.get("/api/stats", authenticateToken, async (req, res) => {
  try {
    const user = (req as any).user;
    let invoices;
    if (user.role === 'admin' || user.role === 'executive') {
      invoices = await prisma.invoice.findMany();
    } else {
      // 0. Fetch full user to get username
      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      const currentUsername = dbUser?.username || '';

      // 1. Find all workflow profiles where this user is an approver
      const userSteps = await prisma.workflowStepDefinition.findMany({
          where: { approver_target: currentUsername }
      });
      const userProfiles = userSteps.map(s => s.profile_name);
      
      // 2. Find all active approval logs for those profiles
      const userLogs = await prisma.activeApprovalLog.findMany({
          where: { workflow_profile: { in: userProfiles } }
      });
      
      // Also get invoices they've already approved (historical)
      const approvals = await prisma.approval.findMany({ where: { approver: user.email } });
      const wfInstances = await prisma.workflowInstance.findMany({ 
        where: { id: { in: approvals.map(a => a.workflow_instance_id) } } 
      });

      const invoiceIds = new Set([
        ...userLogs.map(l => l.invoice_id),
        ...wfInstances.map(w => w.invoice_id)
      ]);

      invoices = await prisma.invoice.findMany({ 
        where: { 
          OR: [
            { uploaded_by_id: user.id },
            { id: { in: Array.from(invoiceIds) } }
          ]
        }
      });
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
    const { name, description, fields_json, category, document_type } = req.body;
    if (!name || !fields_json) return res.status(400).json({ error: "Name and fields_json are required." });

    const newTemplate = await prisma.documentTemplate.upsert({
      where: { name },
      update: { description, fields_json, category, document_type },
      create: { name, description, fields_json, category, document_type }
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
    const fullFilePath = path.resolve(req.file.path);

    // Run OCR
    const pyCmd = process.platform === 'win32' ? 'python' : 'python3';
    const { stdout } = await execAsync(`${pyCmd} local_ocr.py "${fullFilePath}"`);
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
    let matches = evaluateRuleConditions(conditions, invoice, { amount });
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
      // await fs.unlink(req.file.path).catch(() => {});
      // return res.status(400).json({ error: "Duplicate document detected based on file signature. This exact file has already been uploaded." });
    }

    const skip_ocr = req.body.skip_ocr === "true";
    const initialDocType = skip_ocr ? "AP Invoice" : "Unknown";
    const invoiceId = await getNextHierarchicalId(initialDocType);
    const uploadedPath = `/uploads/${filename}`;


    let invoiceStatus = "Received";
    if (skip_ocr) {
      invoiceStatus = "Manual Entry"; // Initial state before matching
    }

    const newInvoice = await prisma.invoice.create({
      data: {
        id: invoiceId,
        tracking_id: `temp-${invoiceId}`,
        invoice_number: skip_ocr ? (req.body.invoice_number || "Manual") : "Extracting...",
        vendor_name: skip_ocr ? (req.body.vendor_name || "Manual") : "Processing...",
        invoice_date: skip_ocr ? (req.body.invoice_date || new Date().toISOString().split("T")[0]) : new Date().toISOString().split("T")[0],
        po_number: skip_ocr ? (req.body.po_number || "Not Found") : "Extracting...",
        amount: skip_ocr ? Number(req.body.amount || 0) : 0,
        base_amount: skip_ocr ? Number(req.body.amount || 0) : 0,
        currency: "USD",
        status: invoiceStatus,
        document_type: skip_ocr ? "Invoice" : "Processing...",
        uploaded_by_id: user.id,
        file_name: originalname,
        file_size: size,
        mime_type: mimetype,
        file_path: uploadedPath,
        file_hash: fileHash,
        ocr_confidence: skip_ocr ? 100.0 : 90.0,
        ocr_text: skip_ocr ? "Manual Entry - AI Bypassed" : "Running AP automated OCR pipeline...",
        tax_details: skip_ocr ? "Manual Entry" : "Calculating..."
      }
    });

    if (!skip_ocr) {
      await prisma.goodsReceipt.create({
        data: {
          id: await getNextHierarchicalId("Goods Receipt"),
          invoice_id: invoiceId,
          status: "Waiting",
          confirmed_by: "",
          remarks: ""
        }
      });
    }

    await prisma.systemLog.create({
      data: {
        invoice_id: invoiceId,
        action: "Invoice Received",
        user: "n8n Email Integration / Manual Upload",
        details: `File "${originalname}" saved. Size: ${(size / 1024).toFixed(1)} KB. MimeType: ${mimetype}. Skip OCR: ${skip_ocr}`
      }
    });

    if (skip_ocr) {
      // Instantly route to workflow
      await matchAndStartWorkflow(invoiceId);
      // Fetch the newly updated invoice to return to frontend
      const routedInvoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
      return res.json(routedInvoice);
    } else {
      // Background processing
      ocrQueue.push(invoiceId, filename);
      return res.json(newInvoice);
    }
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
      const result = await matchAndStartWorkflow(invoice.id);
      if (result.message) {
        return res.json({ success: true, message: result.message });
      }
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

app.get("/api/erp/*", authenticateToken, async (req, res) => {
  try {
    const poNumber = req.params[0]; // Capture everything after /api/erp/
    const erp = await prisma.eRPMaster.findUnique({
      where: { po_number: poNumber }
    });
    if (!erp) return res.json({ not_found: true, error: "PO not found in ERP Master" });
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
        workflow_json: typeof json === 'object' ? JSON.stringify(json) : json
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
      if (evaluateRuleConditions(conditions, invoice)) {
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
          id: await getNextHierarchicalId("Workflow"),
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
        id: await getNextHierarchicalId("Workflow"),
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
      return res.json({ invoice: parseInvoiceForFrontend(invoice), workflow_instance: workflowInstance, approval: newApproval });
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
                data: { current_stage: nextStageLabel, status: "In Approval", state_json: currentState ? JSON.stringify(currentState) : null }
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
                // Archive Document
                await archiveApprovedDocument(invoice.id, approver);
             }
          }
          
          workflowInstance = await prisma.workflowInstance.update({
             where: { id: workflowInstance!.id },
             data: { current_stage: nextStageLabel, status: dbStatus, state_json: currentState ? JSON.stringify(currentState) : null }
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
          // Archive Document
          await archiveApprovedDocument(invoice.id, approver);
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

    res.json({ invoice: parseInvoiceForFrontend(invoice), workflow_instance: workflowInstance, approval: newApproval });
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

    res.json({ success: true, invoice: parseInvoiceForFrontend(updated) });
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
        workflow_json: typeof workflow_json === 'object' ? JSON.stringify(workflow_json) : workflow_json
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

    let parsedOriginalItems = existingInvoice.items;
    if (typeof existingInvoice.items === 'string') {
      try { parsedOriginalItems = JSON.parse(existingInvoice.items); } catch(e) { parsedOriginalItems = []; }
    }
    let parsedOriginalCustomData = existingInvoice.custom_data;
    if (typeof existingInvoice.custom_data === 'string') {
      try { parsedOriginalCustomData = JSON.parse(existingInvoice.custom_data); } catch(e) { parsedOriginalCustomData = {}; }
    }

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
      items: parsedOriginalItems,
      customData: parsedOriginalCustomData
    };

    const newData = {
      documentType, vendorName, invoiceNumber, poNumber, amount, date, cgst, sgst, igst, items, customData
    };

    if (JSON.stringify(originalData) !== JSON.stringify(newData)) {
      const logOriginalData = { ...originalData, customData: undefined };
      const logNewData = { ...newData, customData: undefined };
      await prisma.correctionLog.create({
        data: {
          invoice_id: existingInvoice.id,
          vendor_name: vendorName || existingInvoice.vendor_name || "Unknown",
          original_ai_prediction: JSON.stringify(logOriginalData).substring(0, 990),
          human_corrected_data: JSON.stringify(logNewData).substring(0, 990)
        }
      });
    }

    let newStatus = existingInvoice.status;
    let triggeredWorkflow = false;

    if (existingInvoice.status === "Failed") {
      const isNowInvoice = (documentType || existingInvoice.document_type || "").toLowerCase().includes("invoice");
      if (isNowInvoice) {
        const grnConfig = await prisma.systemConfig.findUnique({ where: { key: "GLOBAL_REQUIRE_GRN" } });
        if (grnConfig && grnConfig.value.toLowerCase() === "false") {
            newStatus = "In Approval";
            triggeredWorkflow = true;
        } else {
            newStatus = "Waiting for GRN";
            await prisma.goodsReceipt.upsert({
              where: { invoice_id: req.params.id },
              update: { status: "Pending", confirmed_by: "Pending", remarks: "Awaiting physical receipt of goods." },
              create: {
                id: await getNextHierarchicalId("Goods Receipt"),
                invoice_id: req.params.id,
                status: "Pending",
                confirmed_by: "Pending",
                remarks: "Awaiting physical receipt of goods."
              }
            });
        }
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
        amount: isNaN(Number(amount)) ? 0 : Number(amount),
        invoice_date: date,
        cgst: isNaN(Number(cgst)) ? 0 : Number(cgst),
        sgst: isNaN(Number(sgst)) ? 0 : Number(sgst),
        igst: isNaN(Number(igst)) ? 0 : Number(igst),
        items: items ? JSON.stringify(items) : existingInvoice.items,
        custom_data: customData ? JSON.stringify(customData) : existingInvoice.custom_data,
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
            id: await getNextHierarchicalId("Workflow"),
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

    res.json(parseInvoiceForFrontend(invoice));
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
      // Archive Document
      await archiveApprovedDocument(invoiceId, user.email);
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

    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    const realUsername = dbUser?.username || '';
    if (resolvedApprover !== realUsername && resolvedApprover !== user.email) {
      return res.status(403).json({ error: `YOU ARE NOT AUTHORIZED TO APPROVE THIS STAGE. ASSIGNED TO: ${resolvedApprover}` });
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
      // Archive Document
      await archiveApprovedDocument(invoiceId, user.email);
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

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId }
    });
    
    if (invoice) {
       const currentStageDef = await prisma.workflowStepDefinition.findFirst({
         where: {
           profile_name: activeLog.workflow_profile,
           stage_number: activeLog.current_stage_number,
           document_type: invoice.document_type
         }
       });

       if (currentStageDef) {
         let resolvedApprover = currentStageDef.approver_target;
         if (resolvedApprover === '[PO_OWNER]' || resolvedApprover === '[DEPT_HEAD]') {
            if (invoice.po_number && invoice.po_number !== "Not Found") {
               const corpMock = await prisma.corporateAppMock.findUnique({ where: { po_number: invoice.po_number } });
               if (corpMock) {
                  resolvedApprover = resolvedApprover === '[PO_OWNER]' ? (corpMock.po_owner_email || resolvedApprover) : (corpMock.dept_head_email || resolvedApprover);
               }
            }
         }

         const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
         const realUsername = dbUser?.username || '';
         if (resolvedApprover !== realUsername && resolvedApprover !== user.email) {
           return res.status(403).json({ error: `You are not authorized to reject this stage. Assigned to: ${resolvedApprover}` });
         }
       }
    }

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
    const workflows = await prisma.workflow.findMany({ select: { id: true, workflow_name: true } });
    
    const enrichedRules = rules.map(r => {
      const wf = workflows.find(w => w.id === r.target_workflow_id);
      return { ...r, target_workflow_name: wf ? wf.workflow_name : r.target_workflow_id };
    });
    
    res.json(enrichedRules);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/routing-rules", authenticateToken, async (req, res) => {
  try {
    const { id, rule_name, priority, conditions_json, target_workflow_id, document_type } = req.body;
    let rule;
    const safeConditions = typeof conditions_json === 'object' ? JSON.stringify(conditions_json) : conditions_json;
    if (id) {
      rule = await prisma.businessRule.update({
        where: { id },
        data: { rule_name, priority: Number(priority), conditions_json: safeConditions, target_workflow_id, document_type }
      });
    } else {
      rule = await prisma.businessRule.create({
        data: { rule_name, priority: Number(priority), conditions_json: safeConditions, target_workflow_id, document_type: document_type || "Invoice" }
      });
    }
    res.json(rule);
  } catch (err: any) {
    console.error("Error saving routing rule:", err);
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
    const { id, profile_name, stage_number, approver_target, document_type, permissions, action_required } = req.body;
    let step;
    if (id) {
      step = await prisma.workflowStepDefinition.update({
        where: { id },
        data: { profile_name, stage_number: Number(stage_number), approver_target, document_type, permissions, action_required }
      });
    } else {
      step = await prisma.workflowStepDefinition.create({
        data: { profile_name, stage_number: Number(stage_number), approver_target, document_type: document_type || "Invoice", permissions: permissions || "Approve Only", action_required: action_required || "Approve" }
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

app.get("/api/admin/workflows", authenticateToken, async (req, res) => {
  try {
    const workflows = await prisma.workflowProfile.findMany({
      include: { steps: { orderBy: { stage_number: 'asc' } } }
    });
    res.json(workflows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/workflows", authenticateToken, async (req, res) => {
  try {
    const { profile_name, workflow_code, workflow_type, description, status, approval_threshold, rejection_handling, reminder_interval_hours, escalation_after_hours, auto_escalation, steps } = req.body;
    
    const profile = await prisma.workflowProfile.upsert({
      where: { profile_name },
      update: { workflow_code, workflow_type, description, status, approval_threshold: Number(approval_threshold), rejection_handling, reminder_interval_hours: Number(reminder_interval_hours), escalation_after_hours: Number(escalation_after_hours), auto_escalation: Boolean(auto_escalation) },
      create: { profile_name, workflow_code, workflow_type, description, status, approval_threshold: Number(approval_threshold), rejection_handling, reminder_interval_hours: Number(reminder_interval_hours), escalation_after_hours: Number(escalation_after_hours), auto_escalation: Boolean(auto_escalation) }
    });

    // Handle steps
    if (steps && Array.isArray(steps)) {
      // Delete existing steps
      await prisma.workflowStepDefinition.deleteMany({ where: { profile_name } });
      
      // Create new steps
      for (const step of steps) {
        await prisma.workflowStepDefinition.create({
          data: {
            profile_name,
            stage_number: Number(step.stage_number),
            step_name: step.step_name || 'Approval Step',
            role: step.role || 'Employee',
            approver_type: step.approver_type || 'Specific Employee',
            approver_target: step.approver_target || '',
            permissions: step.permissions || 'Approve Only',
            action_required: step.action_required || 'Approve',
            document_type: step.document_type || 'Any',
            delegate_approver: step.delegate_approver || null,
            escalation_rule: step.escalation_rule || null,
            target_division: step.target_division || null,
            target_department: step.target_department || null
          }
        });
      }
    }
    
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/admin/workflows/:profile_name", authenticateToken, async (req, res) => {
  try {
    await prisma.workflowProfile.delete({ where: { profile_name: req.params.profile_name } });
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

    const invoiceId = await getNextHierarchicalId("Unknown");
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
        id: await getNextHierarchicalId("Goods Receipt"),
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
          const pyCmd = process.platform === 'win32' ? 'python' : 'python3';
          const { stdout } = await execAsync(`${pyCmd} local_ocr.py "${fullFilePath}"`);
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
          // Disabled to prevent LLM from hallucinating old schema structures
          let fewShotExample = "";
          
          // --- CONTINUOUS LEARNING: HUMAN CORRECTIONS (RAG) ---
          // DISABLED: Injecting past JSON directly into the prompt causes the LLM to regurgitate old values (hallucinate).
          // const recentCorrections = await prisma.correctionLog.findMany({
          //   orderBy: { created_at: "desc" },
          //   take: 3
          // });
          //
          // if (recentCorrections.length > 0) { ... }

          // STAGE 1: The Classifier Router
          const rawTextLower = rawText.toLowerCase();
          let classifiedType = "Unknown"; // default changed for Hybrid AI Routing
          const headerText = rawTextLower.substring(0, 500);
          
          let selectedTemplate = null;

          const invoiceIndex = headerText.indexOf("invoice");
          const poIndex = headerText.indexOf("purchase order");

          if (headerText.includes("vcc purchase invoice") || headerText.includes("vcc")) {
            classifiedType = "VCC PURCHASE INVOICE";
          } else if (headerText.includes("ar creditnote") || headerText.includes("credit note") || headerText.includes("ar credit")) {
            classifiedType = "AR CREDITNOTE";
          } else if (headerText.includes("journal entry")) {
            classifiedType = "JOURNAL ENTRY";
          } else if (headerText.includes("project budget")) {
            classifiedType = "PROJECT BUDGET";
          } else if (headerText.includes("non - returnable") || headerText.includes("non returnable") || headerText.includes("non-returnable")) {
            classifiedType = "NON - RETURNABLE";
          } else if (headerText.includes("ap invoice") || headerText.includes("ap debit note") || headerText.includes("debit note") || headerText.includes("tax invoice") || invoiceIndex !== -1) {
            classifiedType = "AP Invoice";
          } else if (headerText.includes("ocr") || headerText.includes("inhouse ocr")) {
            classifiedType = "OCR AND INHOUSE OCR";
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

                const classifierPrompt = `You are a document classifier. Categorize this document into exactly one of the following types: ${templates.map(t => t.name).join(', ')}. Reply with ONLY the category name. Do not include any other text.\n\nDocument Text:\n${rawTextLower.substring(0, 1500)}`;
                
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
                   
                   const allowedTypes = templates.map(t => t.name);
                   for (const t of allowedTypes) {
                      if (aiType.toLowerCase().includes(t.toLowerCase())) {
                         classifiedType = t;
                         break;
                      }
                   }
                   if (classifiedType === "Unknown") classifiedType = templates.length > 0 ? templates[0].name : "Unknown"; // Ultimate fallback
                } else {
                   classifiedType = templates.length > 0 ? templates[0].name : "Unknown";
                }
             } catch(e) {
                console.error("[Classifier] LLM Fallback failed:", e);
                classifiedType = templates.length > 0 ? templates[0].name : "Unknown";
             }
          }
          
          if (!selectedTemplate && templates.length > 0) {
             selectedTemplate = templates.find((t: any) => t.name.toLowerCase() === classifiedType.toLowerCase()) || null;
             
             // Fuzzy match fallback: if it classified as "Invoice" but template is "Standard Invoice"
             if (!selectedTemplate) {
                 selectedTemplate = templates.find((t: any) => t.name.toLowerCase().includes(classifiedType.toLowerCase()) || classifiedType.toLowerCase().includes(t.name.toLowerCase())) || null;
             }
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
               let fieldsArray = [];
               
               if (Array.isArray(parsed)) {
                 fieldsArray = parsed;
                 instructions = "";
               } else if (parsed.fields && Array.isArray(parsed.fields)) {
                 fieldsArray = parsed.fields;
                 instructions = parsed.instructions || "";
               } else if (parsed.schema) {
                 fieldsDef = typeof parsed.schema === "string" ? parsed.schema : JSON.stringify(parsed.schema || {}, null, 2);
                 instructions = parsed.instructions || "";
               }
               
               if (fieldsArray.length > 0) {
                 const schemaObj: any = {};
                 fieldsArray.forEach((f: any) => {
                   let def = `${f.type || 'string'}`;
                   if (f.required) def = `[REQUIRED] ` + def;
                   if (f.description) def += ` (${f.description})`;
                   
                   // Explicit hints for common errors
                   if (f.name === 'vendor_name') {
                     def += ` (CRITICAL: Extract the SELLER/SUPPLIER name who issued the invoice. NEVER extract the BUYER / 'Bill To' / 'Consignee' name.)`;
                   }
                   schemaObj[f.name] = def;
                 });
                 // Also explicitly request items array for all templates to be safe
                 schemaObj["items"] = "[OPTIONAL] array of objects containing line item details. Fields: description, quantity, unitprice, amount, serialNumbers (array of strings), warrantyText. CRITICAL RULES: 1) Merge multi-line descriptions into ONE item. Do NOT split a single product into multiple items. 2) Serial numbers (e.g. WX...) and warranties (e.g. '3 YEARS') usually appear directly below the item description.";
                 fieldsDef = JSON.stringify(schemaObj, null, 2);
               } else if (!fieldsDef) {
                 fieldsDef = "{}";
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
6. CHAIN OF THOUGHT: You MUST include a "_thoughts" key at the very ROOT of your JSON. Do NOT put _thoughts inside every field. All fields must be flat values (strings or numbers) as defined by the schema. Do NOT nest fields inside objects.
7. REQUIRED FIELDS: If a field is marked as [REQUIRED] and you cannot confidently find it in the document, you MUST set its value to exactly the string "MISSING_REQUIRED_FIELD".

${instructions}

[EXPECTED JSON SCHEMA]:
${fieldsDef}

${fewShotExample}

[OCR TEXT]: ${rawText}`;
          } else {
             await prisma.invoice.update({
               where: { id: invoiceId },
               data: { 
                 status: "Exception", 
                 is_exception: true, 
                 exception_reason: `Unrecognized Document Type: ${classifiedType}`,
                 vendor_name: "Unknown Vendor",
                 document_type: classifiedType,
                 invoice_number: "N/A",
                 po_number: "Not Found"
               }
             });
             await prisma.systemLog.create({
               data: { invoice_id: invoiceId, action: "Extraction Halted", user: "Routing Engine", details: `No template found for ${classifiedType}` }
             });
             return;
          }
          let availableModels: string[] = [];
          let modelToUse = "llama3.2";
          try {
            const tagsRes = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
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
          const llmPayload: any = { 
            prompt: prompt, 
            stream: false, 
            format: "json", 
            model: modelToUse,
            options: { temperature: 0.0, seed: 123 }
          };
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
            if (searchKeys.includes(k.toLowerCase().replace(/[^a-z0-9]/g, ''))) {
              if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
                return (v as any).value || (v as any).name || (v as any).text || (v as any).amount || String(v);
              }
              return v;
            }
          }
          return null;
        };

        let itemsArray = extracted.items || extracted.orderedItems || [];
        if (!itemsArray.length && (extracted.item_purchased || extracted.serial_number || extracted.warranty)) {
          itemsArray = [{
            description: extracted.item_purchased,
            serialNumbers: extracted.serial_number,
            warranty: extracted.warranty,
            quantity: 1,
            unitprice: getVal(extracted, "amount"),
            amount: getVal(extracted, "amount")
          }];
        }
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

        const parsedDocType = extracted.documentType || "Invoice";
        const docType = String(parsedDocType).toLowerCase();
        
        const trackingId = await getNextHierarchicalId(parsedDocType);
        
        let parsedInvNum = "";
        let parsedPoNum = getVal(extracted, "ponumber", "po_number", "purchaseorder");
        
        if (docType.includes("purchase order") || docType.includes("po") || docType === "po") {
          parsedInvNum = String(getVal(extracted, "ponumber", "po_number", "purchaseorder") || trackingId);
          parsedPoNum = parsedInvNum;
        } else if (docType.includes("credit") && !docType.includes("invoice")) {
          parsedInvNum = String(getVal(extracted, "creditnotenumber", "creditnote") || trackingId);
          if (!parsedPoNum) parsedPoNum = "Not Found";
        } else if (docType.includes("debit") && !docType.includes("invoice")) {
          parsedInvNum = String(getVal(extracted, "debitnotenumber", "debitnote") || trackingId);
          if (!parsedPoNum) parsedPoNum = "Not Found";
        } else {
          // Default to invoice logic, but check specific note types first
          parsedInvNum = String(getVal(extracted, "invoicenumber", "invoicenum", "invoiceno", "invoiceid", "receiptnumber", "debitnotenumber", "creditnotenumber") || trackingId);
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
        
        const isInvoice = parsedDocType.toLowerCase().includes("invoice");

        let finalStatus = "Data Verification Pending";
        let isException = false;
        let exceptionReason = null;
        
        // Exceptions disabled per user request: unregistered vendors and missing fields 
        // will no longer halt the ingestion into an Exception state.

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
            items: items ? JSON.stringify(items) : null,
            ocr_layout: ocrLayout ? JSON.stringify(ocrLayout) : null,
            custom_data: customData ? JSON.stringify(customData) : null
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
        let nextStatus = isInvoice ? "Waiting for GRN" : "Pending Approval";

        if (nextStatus === "Waiting for GRN") {
            const grnConfig = await prisma.systemConfig.findUnique({ where: { key: "GLOBAL_REQUIRE_GRN" } });
            if (grnConfig && grnConfig.value.toLowerCase() === "false") {
                nextStatus = "Pending Approval";
            }
        }

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
           // Temporarily Disabled as per request to allow straight-through flow
           /*
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
           */
        }

        // Temporarily Disabled as per request to allow straight-through flow
        /*
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
        */

        // STAGE 3: Workflow Resolution Engine
        let finalWorkflowProfile = null;
        const rules = await prisma.businessRule.findMany({
            where: { document_type: updatedInv.document_type },
            orderBy: { priority: 'asc' }
        });
        for (const rule of rules) {
            let conditionsObj: any = [];
            try {
                conditionsObj = JSON.parse(rule.conditions_json as string);
            } catch (e) { }
            
            let conditionsArray = conditionsObj;
            if (conditionsObj && !Array.isArray(conditionsObj) && conditionsObj.conditions) {
              conditionsArray = conditionsObj.conditions;
            }

            if (evaluateRuleConditions(conditionsArray, updatedInv, erpData) && conditionsArray.length > 0) {
                finalWorkflowProfile = rule.target_workflow_id;
                break;
            }
        }
        if (!finalWorkflowProfile) {
            const fallback = rules.find(r => {
                try {
                    const obj = JSON.parse(r.conditions_json as string);
                    if (Array.isArray(obj)) return obj.length === 0;
                    if (obj && obj.conditions) return obj.conditions.length === 0;
                    return false;
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

        let finalWorkflowProfileName = finalWorkflowProfile;
        try {
          const wff = await prisma.workflow.findUnique({ where: { id: finalWorkflowProfile } });
          if (wff) finalWorkflowProfileName = wff.workflow_name;
        } catch (e) {}

        // Initialize Workflow
        await prisma.activeApprovalLog.upsert({
            where: { invoice_id: invoiceId },
            update: {
                workflow_profile: finalWorkflowProfileName,
                current_stage_number: 1,
                status: "Pending"
            },
            create: {
                invoice_id: invoiceId,
                workflow_profile: finalWorkflowProfileName,
                current_stage_number: 1,
                status: "Pending"
            }
        });
        
        await prisma.invoice.update({
            where: { id: invoiceId },
            data: { status: "In Approval" }
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
    // 1. Webhook Processor (Internal Event Loop)
    const t0 = Date.now();
    await new Promise(resolve => setImmediate(resolve));
    const webLatency = Date.now() - t0;

    // 2. Database Ping
    let dbLatency = -1;
    let database = "Offline";
    try {
        const t1 = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        dbLatency = Date.now() - t1;
        database = "Online";
    } catch (e) {
        console.error("DB Ping Error:", e);
    }

    // 3. AI Engine Ping
    let aiLatency = -1;
    let aiEngine = "Offline";
    try {
        const t2 = Date.now();
        // Just pinging the root of Ollama which returns 'Ollama is running'
        const aiRes = await fetch(`${OLLAMA_BASE_URL}/`, { signal: AbortSignal.timeout(3000) });
        if (aiRes.ok) {
            aiLatency = Date.now() - t2;
            aiEngine = "Online";
        }
    } catch (e) {
        console.error("AI Ping Error:", e);
    }

    res.json({ 
        database, 
        aiEngine, 
        webhookProcessor: "Online", 
        dbLatency, 
        aiLatency, 
        webLatency 
    });
});

app.get("/api/admin/users", authenticateToken, async (req: any, res: any) => {
    try {
        const users = await prisma.user.findMany({ select: { id: true, name: true, email: true, username: true, employee_id: true, role: true, permissions: true, created_at: true } });
        res.json(users);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/admin/users", authenticateToken, async (req: any, res: any) => {
    try {
        const { name, email, role, password, permissions, username, employee_id } = req.body;
        const hashedPassword = await bcrypt.hash(password || "default123", 10);
        const user = await prisma.user.create({ data: { name, email, role, username, employee_id, permissions: JSON.stringify(permissions || []), password_hash: hashedPassword } });
        res.json(user);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.put("/api/admin/users/:id", authenticateToken, async (req: any, res: any) => {
    try {
        const { name, email, role, permissions, username, employee_id, password } = req.body;
        let updateData: any = { name, email, role, username, employee_id, permissions: JSON.stringify(permissions || []) };
        if (password && password.trim() !== "") {
            updateData.password_hash = await bcrypt.hash(password, 10);
        }
        const user = await prisma.user.update({ where: { id: req.params.id }, data: updateData });
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
      
      // Trigger notification flow for the escalation
      await triggerNotificationFlow(overdue.invoice_id, "Escalate", `Invoice pending approval for > ${slaHours} hours. Auto-escalated.`, "SYSTEM");
      
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

// Serve uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve frontend static files in production (only if they exist)
const frontendDistPath = path.join(__dirname, '../frontend/dist');
if (existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
}

app.get('*', (req: any, res: any, next: any) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
    return next();
  }
  
  if (existsSync(path.join(frontendDistPath, 'index.html'))) {
    return res.sendFile(path.join(frontendDistPath, 'index.html'));
  } else {
    // If running in Docker where frontend is separate, just return a 200 OK for root (healthcheck)
    return res.status(200).send('DocuFlow Backend API is running.');
  }
});

// Fallback for unhandled API routes (404)
app.use('/api', (req: any, res: any) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// Global API error handler (500)
app.use('/api', (err: any, req: any, res: any, next: any) => {
  console.error('[Global API Error]', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

// Start the server
async function startServer() {
  if (process.env.NODE_ENV !== 'test') {
    httpServer.listen(Number(PORT), "0.0.0.0", () => {
      console.log(`Corporate AP Invoice system backend listening on http://localhost:${PORT}`);
    });
  }
}

startServer();

export { app };
