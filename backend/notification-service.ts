import { prisma } from "./server-db";
import { dispatchConfigurableEmail } from "./email-dispatcher";

export interface NotificationPayload {
  document_id: string;
  document_number: string;
  document_type: string;
  workflow_name: string;
  current_step: string;
  next_step: string;
  next_approver_name: string;
  next_approver_email: string;
  review_url: string;
  action_performed: string;
  performed_by: string;
  timestamp: string;
  title: string;
  message: string;
  notification_type: string;
}

/**
 * Triggers the notification flow for a document based on the action performed.
 * Resolves the next recipient, prepares the payload, and sends it via POST to the /api/notifications/send endpoint.
 */
export async function triggerNotificationFlow(
  invoiceId: string,
  action: string,
  comments: string,
  performedBy: string
) {
  try {
    console.log(`[Notification Service] Triggering flow for Invoice: ${invoiceId}, Action: ${action}`);

    // 1. Fetch document and related state
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        uploaded_by: true,
        workflowInst: true,
        activeApprovalLog: true,
      },
    });

    if (!invoice) {
      console.error(`[Notification Service] Invoice not found: ${invoiceId}`);
      return;
    }

    const document_id = invoice.id;
    const document_number = invoice.invoice_number || invoice.id;
    const document_type = invoice.document_type || "Invoice";
    const performed_by = performedBy;
    const timestamp = new Date().toISOString();
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const review_url = `${frontendUrl}/review/${invoice.id}`;

    // Get workflow name
    let workflow_name = "Standard Linear Workflow";
    if (invoice.activeApprovalLog) {
      workflow_name = invoice.activeApprovalLog.workflow_profile;
    } else if (invoice.workflowInst) {
      const wf = await prisma.workflow.findUnique({
        where: { id: invoice.workflowInst.workflow_id || "" },
      }).catch(() => null);
      if (wf) {
        workflow_name = wf.workflow_name;
      }
    }

    // Determine current and next steps
    let current_step = "Initialized";
    let next_step = "Completed";

    if (invoice.activeApprovalLog) {
      current_step = `Stage ${invoice.activeApprovalLog.current_stage_number}`;
      next_step = `Stage ${invoice.activeApprovalLog.current_stage_number + 1}`;
    } else if (invoice.workflowInst) {
      current_step = invoice.workflowInst.current_stage;
    }

    // Define recipient lists
    const recipients: { email: string; name: string; type: string; title: string; message: string }[] = [];

    // Helper to find user name by email
    const getUserName = async (email: string) => {
      const u = await prisma.user.findUnique({ where: { email } });
      return u ? u.name : email.split("@")[0];
    };

    // Helper to get default admin emails
    const getAdminEmails = async () => {
      const admins = await prisma.user.findMany({ where: { role: "admin" } });
      return admins.length > 0 ? admins.map(a => a.email) : ["admin@company.com"];
    };

    const ownerEmail = invoice.uploaded_by?.email || "ap.executive@company.com";
    const ownerName = invoice.uploaded_by?.name || "Document Owner";
    const adminEmails = await getAdminEmails();

    const amountStr = `₹${(invoice.amount || 0).toLocaleString()}`;

    // 2. Resolve recipients based on action
    if (action === "Reject") {
      // Notify Owner and Administrators
      const title = "Document Workflow Rejected";
      const message = `Invoice ${document_number} from ${invoice.vendor_name} for ${amountStr} has been REJECTED by ${performedBy}. Comments: ${comments || "No comments provided."}`;

      recipients.push({ email: ownerEmail, name: ownerName, type: "REJECTED", title, message });
      for (const adminEmail of adminEmails) {
        const adminName = await getUserName(adminEmail);
        recipients.push({ email: adminEmail, name: adminName, type: "REJECTED", title, message });
      }
    } else if (action === "Request Clarification") {
      // Notify Owner
      const title = "Clarification Requested on Document";
      const message = `Clarification has been requested on Invoice ${document_number} from ${invoice.vendor_name} by ${performedBy}. Query: "${comments || "No details provided."}"`;

      recipients.push({ email: ownerEmail, name: ownerName, type: "CLARIFICATION", title, message });
    } else if (action === "Send Back") {
      // Notify Owner and previous stage if linear
      const title = "Document Sent Back";
      const message = `Invoice ${document_number} from ${invoice.vendor_name} for ${amountStr} has been SENT BACK by ${performedBy}. Comments: "${comments || "No comments provided."}"`;

      recipients.push({ email: ownerEmail, name: ownerName, type: "SENT_BACK", title, message });
    } else if (action === "Approve") {
      // Check if it is final approval
      let isFinal = false;
      if (invoice.activeApprovalLog && invoice.activeApprovalLog.status === "Approved") {
        isFinal = true;
      } else if (invoice.workflowInst && (invoice.workflowInst.status === "Approved" || invoice.workflowInst.current_stage === "Completed" || invoice.status === "Ready for Payment" || invoice.status === "Approved")) {
        isFinal = true;
      }

      if (isFinal) {
        // Notify Owner and Admin of Completion
        const title = "Document Workflow Completed";
        const message = `Invoice ${document_number} from ${invoice.vendor_name} for ${amountStr} has been FULLY APPROVED.`;

        recipients.push({ email: ownerEmail, name: ownerName, type: "COMPLETED", title, message });
        for (const adminEmail of adminEmails) {
          const adminName = await getUserName(adminEmail);
          recipients.push({ email: adminEmail, name: adminName, type: "COMPLETED", title, message });
        }
        
        // Notify all involved people
        const involvedEmails = new Set<string>();
        if (invoice.workflowInst) {
          const approvals = await prisma.approval.findMany({ where: { workflow_instance_id: invoice.workflowInst.id } });
          approvals.forEach(a => { if (a.approver.includes('@')) involvedEmails.add(a.approver); });
        }
        const logs = await prisma.systemLog.findMany({ where: { invoice_id: invoiceId, action: { in: ['Approved', 'Reviewed', 'Sent Back', 'Request Clarification'] } } });
        logs.forEach(l => { if (l.user.includes('@')) involvedEmails.add(l.user); });
        if (performedBy.includes('@')) involvedEmails.add(performedBy);

        involvedEmails.delete(ownerEmail);
        for (const admin of adminEmails) { involvedEmails.delete(admin); }

        for (const email of involvedEmails) {
          const name = await getUserName(email);
          recipients.push({ email, name, type: "COMPLETED", title, message });
        }
      } else {
        // It is approved but not final: Notify next approver(s)
        const nextEmails: string[] = [];

        // Scenario A: ActiveApprovalLog (WorkflowStepDefinition) system
        if (invoice.activeApprovalLog) {
          const nextStageDef = await prisma.workflowStepDefinition.findFirst({
            where: {
              profile_name: invoice.activeApprovalLog.workflow_profile,
              stage_number: invoice.activeApprovalLog.current_stage_number,
              document_type: invoice.document_type
            }
          });

          if (nextStageDef) {
            let nextApprover = nextStageDef.approver_target;
            if (nextApprover === '[PO_OWNER]' || nextApprover === '[DEPT_HEAD]') {
              if (invoice.po_number && invoice.po_number !== "Not Found") {
                const corpMock = await prisma.corporateAppMock.findUnique({ where: { po_number: invoice.po_number } });
                if (corpMock) {
                  nextApprover = nextApprover === '[PO_OWNER]' ? (corpMock.po_owner_email || nextApprover) : (corpMock.dept_head_email || nextApprover);
                }
              }
            }
            if (nextApprover && nextApprover.includes("@")) {
              nextEmails.push(nextApprover);
            }
          }
        }
        // Scenario B: WorkflowInstance Graph/Linear system
        else if (invoice.workflowInst) {
          const currentStage = invoice.workflowInst.current_stage;
          const wf = await prisma.workflow.findUnique({
            where: { id: invoice.workflowInst.workflow_id || "" }
          }).catch(() => null) || await prisma.workflow.findFirst().catch(() => null);

          if (wf && wf.workflow_json) {
            try {
              const parsed = JSON.parse(wf.workflow_json);
              
              // If graph execution
              if (parsed.nodes && parsed.edges) {
                const state = invoice.workflowInst.state_json ? (typeof invoice.workflowInst.state_json === 'string' ? JSON.parse(invoice.workflowInst.state_json) : invoice.workflowInst.state_json) : {};
                const activeNodeIds = state.activeNodes || [];
                for (const nodeId of activeNodeIds) {
                  const node = parsed.nodes.find((n: any) => n.id === nodeId);
                  if (node && node.data && node.data.approvers) {
                    const approversList = Array.isArray(node.data.approvers) ? node.data.approvers : [node.data.approvers];
                    for (const app of approversList) {
                      if (app && app.includes("@")) nextEmails.push(app);
                    }
                  }
                }
              }
              // If legacy linear
              else if (parsed.steps) {
                const currentIdx = parsed.steps.findIndex((s: any) => s.label === currentStage);
                if (currentIdx !== -1) {
                  const approver = parsed.steps[currentIdx].approver;
                  if (approver && approver.includes("@")) {
                    nextEmails.push(approver);
                  }
                }
              }
            } catch (e) {
              console.error("[Notification Service] Error parsing workflow JSON", e);
            }
          }
        }

        // Add recipients for next approvers
        const title = "Document Assigned for Your Approval";
        const message = `Invoice ${document_number} from ${invoice.vendor_name} for ${amountStr} is assigned to you and is pending your approval.`;
        next_step = current_step; // Next stage for notification payload

        if (nextEmails.length > 0) {
          for (const email of nextEmails) {
            const name = await getUserName(email);
            recipients.push({ email, name, type: "PENDING_APPROVAL", title, message });
          }
        } else {
          // Fallback if no next approver could be resolved: Notify Admin
          console.warn("[Notification Service] No next approver resolved, notifying admin as fallback.");
          for (const adminEmail of adminEmails) {
            const adminName = await getUserName(adminEmail);
            recipients.push({
              email: adminEmail,
              name: adminName,
              type: "PENDING_APPROVAL",
              title: "Document Approver Unresolved",
              message: `Invoice ${document_number} from ${invoice.vendor_name} needs approval but next approver was unresolved. Assigned to Admin.`
            });
          }
        }
      }
    }

    // 2.5 Inject RACI Matrix logic
    try {
      const raci = await prisma.rACIMatrix.findUnique({
        where: {
          workflow_profile_event_name: {
            workflow_profile: workflow_name,
            event_name: action
          }
        }
      });

      if (raci) {
        const replaceVars = (str: string) => {
          return str
            .replace(/\{\{document_number\}\}/g, document_number)
            .replace(/\{\{vendor_name\}\}/g, invoice.vendor_name)
            .replace(/\{\{amount\}\}/g, amountStr)
            .replace(/\{\{performed_by\}\}/g, performedBy)
            .replace(/\{\{comments\}\}/g, comments || "");
        };

        const customTitle = raci.title_template && raci.title_template.trim() !== "" ? replaceVars(raci.title_template) : null;
        const customMessage = raci.message_template && raci.message_template.trim() !== "" ? replaceVars(raci.message_template) : null;

        const addRaci = async (emailsStr: string, prefix: string) => {
          if (!emailsStr) return;
          try {
            const list = JSON.parse(emailsStr);
            for (const item of list) {
              if (item && item.includes("@")) {
                const name = await getUserName(item);
                recipients.push({ 
                  email: item, 
                  name, 
                  type: "RACI_NOTIFICATION", 
                  title: customTitle ? `${prefix} ${customTitle}` : `${prefix} ${action} Event on ${document_number}`, 
                  message: customMessage || `Invoice ${document_number} from ${invoice.vendor_name} for ${amountStr}. Action: ${action} by ${performedBy}. Comments: ${comments || "None"}`
                });
              }
            }
          } catch(e) {}
        };

        await addRaci(raci.responsible_emails, "[ACTION REQUIRED: Responsible]");
        await addRaci(raci.accountable_emails, "[FYI: Accountable]");
        await addRaci(raci.consulted_emails, "[CONSULT: Please Review]");
        await addRaci(raci.informed_emails, "[FYI: Informed]");
      }
    } catch (e) {
      console.error("[Notification Service] Error applying RACI matrix", e);
    }

    // 3. Dispatch notifications by calling our API endpoint
    
    // Deduplicate recipients by email to prevent double-notifying
    const uniqueRecipientsMap = new Map();
    for (const r of recipients) {
      if (r.email) {
        uniqueRecipientsMap.set(r.email, r);
      }
    }
    const uniqueRecipients = Array.from(uniqueRecipientsMap.values());
    
    console.log(`[Notification Service] Resolved recipients: ${JSON.stringify(uniqueRecipients)}`);
    
    // Fetch In-App configs to apply overrides and filter disabled notifications
    const inAppConfigs = await prisma.inAppNotificationConfig.findMany();
    
    for (const recipient of uniqueRecipients) {
      const config = inAppConfigs.find(c => c.trigger_event === recipient.type);
      
      if (config && !config.enabled) {
        console.log(`[Notification Service] Skipping in-app notification for ${recipient.email} because ${recipient.type} is disabled.`);
        continue;
      }
      
      let finalTitle = recipient.title;
      let finalMessage = recipient.message;
      
      if (config) {
        const replaceVars = (str: string) => {
          return str
            .replace(/\{\{document_number\}\}/g, document_number)
            .replace(/\{\{vendor_name\}\}/g, invoice.vendor_name)
            .replace(/\{\{amount\}\}/g, amountStr)
            .replace(/\{\{performed_by\}\}/g, performedBy)
            .replace(/\{\{comments\}\}/g, comments || "");
        };
        if (config.title_template && config.title_template.trim() !== "") finalTitle = replaceVars(config.title_template);
        if (config.message_template && config.message_template.trim() !== "") finalMessage = replaceVars(config.message_template);
      }

      const payload: NotificationPayload = {
        document_id,
        document_number,
        document_type,
        workflow_name,
        current_step,
        next_step,
        next_approver_name: recipient.name,
        next_approver_email: recipient.email,
        review_url,
        action_performed: action,
        performed_by,
        timestamp,
        title: finalTitle,
        message: finalMessage,
        notification_type: recipient.type,
      };

      const port = process.env.PORT || 3000;
      fetch(`http://127.0.0.1:${port}/api/notifications/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then(async (res) => {
        if (!res.ok) {
          const errText = await res.text();
          console.error(`[Notification Service] Failed to send notification to ${recipient.email}: ${errText}`);
        } else {
          console.log(`[Notification Service] Successfully triggered notification to ${recipient.email}`);
        }
      }).catch((err) => {
        console.error(`[Notification Service] Network error triggering notification to ${recipient.email}:`, err.message);
      });
    }

    // 4. Dispatch via new Configurable Email Notification Module
    await dispatchConfigurableEmail(invoice, action, performedBy, comments, recipients, workflow_name);

  } catch (error: any) {
    console.error("[Notification Service] Critical error in triggerNotificationFlow:", error.message);
  }
}
