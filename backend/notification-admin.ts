import { Express } from "express";
import { prisma } from "./server-db";
import nodemailer from "nodemailer";

export function registerNotificationAdminRoutes(app: Express) {
  // Provider Config
  app.get("/api/admin/notifications/provider", async (req, res) => {
    try {
      const config = await prisma.emailProviderConfig.findFirst();
      const responseConfig = {
        id: config?.id || "env",
        provider: config?.provider || "Microsoft 365",
        smtp_server: process.env.SMTP_HOST || config?.smtp_server || "smtp.office365.com",
        port: Number(process.env.SMTP_PORT) || config?.port || 587,
        username: process.env.SMTP_USER || config?.username || "",
        sender_email: process.env.SMTP_SENDER_EMAIL || config?.sender_email || "",
        sender_name: process.env.SMTP_SENDER_NAME || config?.sender_name || "",
        encrypted_password: process.env.SMTP_PASS ? "********" : (config?.encrypted_password || ""),
        tls_enabled: config?.tls_enabled ?? true
      };
      res.json(responseConfig);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/notifications/provider", async (req, res) => {
    try {
      const data = req.body;
      const config = await prisma.emailProviderConfig.findFirst();
      if (config) {
        const updated = await prisma.emailProviderConfig.update({
          where: { id: config.id },
          data
        });
        res.json(updated);
      } else {
        const created = await prisma.emailProviderConfig.create({ data });
        res.json(created);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Notification Rules
  app.get("/api/admin/notifications/rules", async (req, res) => {
    try {
      const rules = await prisma.notificationRule.findMany({
        include: { recipients: true, template: true }
      });
      res.json(rules);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/notifications/rules", async (req, res) => {
    try {
      const { name, trigger_event, subject, template_id, enabled, delay_minutes, recipients } = req.body;
      const rule = await prisma.notificationRule.create({
        data: {
          name, trigger_event, subject, template_id, enabled, delay_minutes,
          recipients: {
            create: recipients || []
          }
        },
        include: { recipients: true }
      });
      res.json(rule);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/admin/notifications/rules/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const { name, trigger_event, subject, template_id, enabled, delay_minutes, recipients } = req.body;
      
      // Update rule and replace recipients
      await prisma.notificationRecipient.deleteMany({ where: { notification_rule_id: id } });
      
      const rule = await prisma.notificationRule.update({
        where: { id },
        data: {
          name, trigger_event, subject, template_id, enabled, delay_minutes,
          recipients: {
            create: recipients || []
          }
        },
        include: { recipients: true }
      });
      res.json(rule);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/admin/notifications/rules/:id", async (req, res) => {
    try {
      await prisma.notificationRule.delete({ where: { id: req.params.id } });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Email Templates
  app.get("/api/admin/notifications/templates", async (req, res) => {
    try {
      const templates = await prisma.emailTemplate.findMany();
      res.json(templates);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/notifications/templates", async (req, res) => {
    try {
      const template = await prisma.emailTemplate.create({ data: req.body });
      res.json(template);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/admin/notifications/templates/:id", async (req, res) => {
    try {
      const template = await prisma.emailTemplate.update({
        where: { id: req.params.id },
        data: req.body
      });
      res.json(template);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/admin/notifications/templates/:id", async (req, res) => {
    try {
      await prisma.emailTemplate.delete({ where: { id: req.params.id } });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Logs
  app.get("/api/admin/notifications/logs", async (req, res) => {
    try {
      const logs = await prisma.emailLog.findMany({
        orderBy: { created_at: 'desc' },
        take: 100
      });
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Test Email
  app.post("/api/admin/notifications/test", async (req, res) => {
    try {
      const { to, subject, html } = req.body;
      const config = await prisma.emailProviderConfig.findFirst();
      
      const host = process.env.SMTP_HOST || config?.smtp_server;
      const port = Number(process.env.SMTP_PORT) || config?.port || 587;
      const user = process.env.SMTP_USER || config?.username;
      const pass = process.env.SMTP_PASS || config?.encrypted_password;
      const senderName = process.env.SMTP_SENDER_NAME || config?.sender_name || "Workflow Automation";
      const senderEmail = process.env.SMTP_SENDER_EMAIL || config?.sender_email || user || "noreply@company.com";

      if (!host || !user || !pass) {
        return res.status(400).json({ error: "Email provider not configured in environment or database" });
      }

      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465, // true for 465, false for other ports
        auth: {
          user,
          pass,
        },
        tls: {
          rejectUnauthorized: false
        }
      });

      const info = await transporter.sendMail({
        from: `"${senderName}" <${senderEmail}>`,
        to,
        subject,
        html: html || "<p>This is a test email from the Workflow Automation Notification Module.</p>",
      });

      res.json({ success: true, messageId: info.messageId });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
