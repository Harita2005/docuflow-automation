import { prisma } from "./server-db";
import nodemailer from "nodemailer";

export async function dispatchConfigurableEmail(invoice: any, action: string, performedBy: string, comments: string, fallbackRecipients: any[], workflowName?: string) {
  try {
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
        rejectUnauthorized: false
      }
    });

    // 1. Fetch enabled rules for this action
    const allRules = await prisma.notificationRule.findMany({
      where: { trigger_event: action, enabled: true },
      include: { template: true, recipients: true }
    });

    // 2. Filter by target workflow
    const rules = allRules.filter(r => !r.target_workflow || r.target_workflow === "" || r.target_workflow === workflowName);

    if (rules.length === 0) {
      console.log(`[Email Dispatcher] No active rules for action: ${action} on workflow: ${workflowName || 'Global'}. Using default fallback email dispatch.`);
      
      if (!fallbackRecipients || fallbackRecipients.length === 0) {
        console.log(`[Email Dispatcher] No fallback recipients resolved to notify.`);
        return;
      }

      // Dev Override: Redirect all outgoing emails to harita010905@gmail.com for testing
      let toEmails = fallbackRecipients.map(r => r.email).filter(Boolean);
      if (toEmails.length > 0) {
        toEmails = ["harita010905@gmail.com"];
      } else {
        console.log(`[Email Dispatcher] Fallback list contains no email addresses.`);
        return;
      }

      const subject = `[Notification] ${action} Event on Document ${invoice.invoice_number || invoice.id}`;
      const review_url = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/review/${invoice.id}`;
      const message = fallbackRecipients[0].message || `Document ${invoice.invoice_number || invoice.id} has reached stage: ${action}.`;

      const finalHtml = `
        <div style="font-family: sans-serif; padding: 25px; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
          <h2 style="font-size: 16px; font-weight: 800; color: #0f172a; margin-top: 0; margin-bottom: 12px; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px; text-transform: uppercase; tracking-wider;">Document Alert</h2>
          <p style="font-size: 13px; line-height: 1.6; color: #334155; margin-bottom: 24px;">
            ${message}
          </p>
          <div style="margin-top: 24px; border-top: 1px solid #f1f5f9; padding-top: 20px;">
            <p style="font-size: 12px; color: #64748b; margin-bottom: 12px; font-weight: 500;">Review details and perform approvals using the button below:</p>
            <a href="${review_url}" style="display: inline-block; background-color: #2563eb; color: #ffffff; font-size: 11px; font-weight: bold; text-decoration: none; padding: 10px 20px; border-radius: 8px; box-shadow: 0 4px 12px rgba(37,99,235,0.15);">Open Document</a>
          </div>
        </div>
      `;

      try {
        await transporter.sendMail({
          from: `"${config.sender_name || 'Workflow Automation'}" <${config.sender_email || config.username}>`,
          to: toEmails.join(", "),
          subject,
          html: finalHtml
        });
        
        await prisma.emailLog.create({
          data: {
            notification_rule_id: null,
            event: action,
            sender: config.sender_email || config.username || "System",
            recipients: toEmails.join(", "),
            cc: null,
            bcc: null,
            subject,
            status: "Sent",
            error_message: null,
            sent_at: new Date()
          }
        });
        console.log(`[Email Dispatcher] Fallback email sent successfully to ${toEmails.join(", ")}`);
      } catch (err: any) {
        console.error(`[Email Dispatcher] Fallback email send failed:`, err.message);
        await prisma.emailLog.create({
          data: {
            notification_rule_id: null,
            event: action,
            sender: config.sender_email || config.username || "System",
            recipients: toEmails.join(", "),
            cc: null,
            bcc: null,
            subject,
            status: "Failed",
            error_message: err.message,
            sent_at: null
          }
        });
      }
      return;
    }

    // Resolve performedBy to actual user's name
    let performedByName = performedBy;
    if (performedBy) {
      const dbUser = await prisma.user.findFirst({
        where: {
          OR: [
            { email: performedBy },
            { username: performedBy }
          ]
        }
      });
      if (dbUser) {
        performedByName = dbUser.name;
      } else if (performedBy.includes("@")) {
        performedByName = performedBy.split("@")[0].replace(/[._]/g, ' ');
        performedByName = performedByName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      }
    }

    const placeholders: Record<string, string> = {
      "{{InvoiceNumber}}": invoice.invoice_number || invoice.id,
      "{{VendorName}}": invoice.vendor_name || "Unknown Vendor",
      "{{Amount}}": invoice.amount ? `₹${invoice.amount.toLocaleString()}` : "N/A",
      "{{ApproverName}}": performedByName,
      "{{Department}}": invoice.department || "N/A",
      "{{PO Number}}": invoice.po_number || "N/A",
      "{{Workflow Name}}": "Workflow", // Optional mapping
      "{{ApprovalLink}}": `${process.env.FRONTEND_URL || 'http://localhost:5173'}/review/${invoice.id}`,
      "{{review_url}}": `${process.env.FRONTEND_URL || 'http://localhost:5173'}/review/${invoice.id}`,
      "{{approval_link}}": `${process.env.FRONTEND_URL || 'http://localhost:5173'}/review/${invoice.id}`
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
          } else if (rec.value === "RACI Members") {
            emails = fallbackRecipients.filter(r => r.type === "RACI_NOTIFICATION").map(r => r.email);
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

      // Dev Override: Redirect all outgoing emails to harita010905@gmail.com for testing
      if (toEmails.length > 0 || ccEmails.length > 0 || bccEmails.length > 0) {
        toEmails = ["harita010905@gmail.com"];
        ccEmails = [];
        bccEmails = [];
      }

      if (toEmails.length === 0 && ccEmails.length === 0 && bccEmails.length === 0) {
        console.log(`[Email Dispatcher] No resolved recipients for rule ${rule.name}`);
        continue;
      }

      const subject = replacePlaceholders(rule.subject || "");
      const textBody = replacePlaceholders(rule.template?.text_body || "");
      let htmlBody = replacePlaceholders(rule.template?.html_body || "");

      const approvalLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/review/${invoice.id}`;
      let finalHtml = htmlBody || `<p>${textBody}</p>`;
      if (!finalHtml.includes(approvalLink)) {
        finalHtml += `
          <div style="margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 15px; font-family: sans-serif;">
            <p style="font-size: 12px; color: #64748b; margin-bottom: 12px;">You can review and act on this document by clicking the button below:</p>
            <a href="${approvalLink}" style="display: inline-block; background-color: #2563eb; color: #ffffff; font-size: 11px; font-weight: bold; text-decoration: none; padding: 8px 16px; border-radius: 6px; box-shadow: 0 1px 2px 0 rgba(0,0,0,0.05);">Open Document</a>
          </div>
        `;
      }

      let status = "Queued";
      let errorMsg = "";

      try {
        await transporter.sendMail({
          from: `"${config.sender_name || 'Workflow Automation'}" <${config.sender_email || config.username}>`,
          to: toEmails.join(", "),
          ...(ccEmails.length > 0 && { cc: ccEmails.join(", ") }),
          ...(bccEmails.length > 0 && { bcc: bccEmails.join(", ") }),
          subject,
          text: textBody,
          html: finalHtml
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
