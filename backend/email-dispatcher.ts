import { prisma } from "./server-db";
import nodemailer from "nodemailer";

export async function dispatchConfigurableEmail(invoice: any, action: string, performedBy: string, comments: string, fallbackRecipients: any[], workflowName?: string) {
  try {
    // 1. Fetch enabled rules for this action
    const allRules = await prisma.notificationRule.findMany({
      where: { trigger_event: action, enabled: true },
      include: { template: true, recipients: true }
    });

    // 2. Filter by target workflow
    const rules = allRules.filter(r => !r.target_workflow || r.target_workflow === "" || r.target_workflow === workflowName);

    if (rules.length === 0) {
      console.log(`[Email Dispatcher] No active rules for action: ${action} on workflow: ${workflowName || 'Global'}`);
      return;
    }

    const config = await prisma.emailProviderConfig.findFirst();
    if (!config) {
      console.warn(`[Email Dispatcher] Email provider not configured. Cannot send emails.`);
      return;
    }

    const transporter = nodemailer.createTransport({
      host: config.smtp_server,
      port: config.port,
      secure: config.port === 465,
      auth: {
        user: config.username,
        pass: config.encrypted_password,
      },
      tls: {
        rejectUnauthorized: config.tls_enabled
      }
    });

    const placeholders: Record<string, string> = {
      "{{InvoiceNumber}}": invoice.invoice_number || invoice.id,
      "{{VendorName}}": invoice.vendor_name || "Unknown Vendor",
      "{{Amount}}": invoice.amount ? `₹${invoice.amount.toLocaleString()}` : "N/A",
      "{{ApproverName}}": performedBy,
      "{{Department}}": invoice.department || "N/A",
      "{{PO Number}}": invoice.po_number || "N/A",
      "{{Workflow Name}}": "Workflow", // Optional mapping
      "{{ApprovalLink}}": `${process.env.FRONTEND_URL || 'http://localhost:5173'}/review/${invoice.id}`
    };

    const replacePlaceholders = (text: string) => {
      if (!text) return "";
      let result = text;
      for (const [key, val] of Object.entries(placeholders)) {
        result = result.replace(new RegExp(key, 'g'), val);
      }
      return result;
    };

    // Helper to get emails from a comma separated string
    const parseEmails = (str: string) => str.split(",").map(e => e.trim()).filter(e => e);

    for (const rule of rules) {
      let toEmails: string[] = [];
      let ccEmails: string[] = [];
      let bccEmails: string[] = [];

      // Resolve recipients
      for (const rec of rule.recipients) {
        let emails: string[] = [];
        if (rec.recipient_source === "Custom") {
          const rawValues = parseEmails(rec.value);
          for (const val of rawValues) {
            if (val.includes("@")) {
              emails.push(val);
            } else {
              const user = await prisma.user.findFirst({
                where: { OR: [{ employee_id: val }, { username: val }] }
              });
              if (user && user.email) emails.push(user.email);
            }
          }
        } else if (rec.recipient_source === "Dynamic") {
          if (rec.value === "Invoice Creator" && invoice.uploaded_by?.email) {
            emails.push(invoice.uploaded_by.email);
          } else if (rec.value === "Current Approver") {
            // Find current approver from fallback list
            emails = fallbackRecipients.filter(r => r.type === "PENDING_APPROVAL").map(r => r.email);
          } else if (rec.value === "Previous Approver") {
            emails.push(performedBy);
          } else if (rec.value === "Department Head" || rec.value === "PO Owner") {
             if (invoice.po_number) {
               const mock = await prisma.corporateAppMock.findUnique({ where: { po_number: invoice.po_number } });
               if (mock) {
                 if (rec.value === "Department Head" && mock.dept_head_email) emails.push(mock.dept_head_email);
                 if (rec.value === "PO Owner" && mock.po_owner_email) emails.push(mock.po_owner_email);
               }
             }
          }
        }

        if (rec.recipient_type === "TO") toEmails.push(...emails);
        else if (rec.recipient_type === "CC") ccEmails.push(...emails);
        else if (rec.recipient_type === "BCC") bccEmails.push(...emails);
      }

      toEmails = [...new Set(toEmails)];
      ccEmails = [...new Set(ccEmails)];
      bccEmails = [...new Set(bccEmails)];

      if (toEmails.length === 0 && ccEmails.length === 0 && bccEmails.length === 0) {
        console.log(`[Email Dispatcher] No resolved recipients for rule ${rule.name}`);
        continue;
      }

      const subject = replacePlaceholders(rule.subject || "");
      const htmlBody = replacePlaceholders(rule.template?.html_body || "");
      const textBody = replacePlaceholders(rule.template?.text_body || "");

      let status = "Queued";
      let errorMsg = "";

      try {
        await transporter.sendMail({
          from: `"${config.sender_name || 'Workflow Automation'}" <${config.sender_email || config.username}>`,
          to: toEmails.join(", "),
          cc: ccEmails.join(", "),
          bcc: bccEmails.join(", "),
          subject,
          text: textBody,
          html: htmlBody || `<p>${textBody}</p>`
        });
        status = "Sent";
      } catch (err: any) {
        status = "Failed";
        errorMsg = err.message;
        console.error(`[Email Dispatcher] Failed to send email for rule ${rule.name}:`, err);
      }

      // Log email
      await prisma.emailLog.create({
        data: {
          notification_rule_id: rule.id,
          event: action,
          sender: config.sender_email || config.username || "System",
          recipients: toEmails.join(", "),
          cc: ccEmails.join(", "),
          bcc: bccEmails.join(", "),
          subject,
          status,
          error_message: errorMsg,
          sent_at: status === "Sent" ? new Date() : null
        }
      });
    }

  } catch (error: any) {
    console.error("[Email Dispatcher] Error:", error.message);
  }
}
