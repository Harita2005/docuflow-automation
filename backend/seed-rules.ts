import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function seed() {
  try {
    // IT / PO Workflow Rule
    const rule1 = await prisma.notificationRule.create({
      data: {
        name: "Mechanism 1: PO Invoices RACI",
        trigger_event: "Approve",
        subject: "[PO System] Approval Required",
        target_workflow: "Standard PO Invoice Workflow", // IT/PO workflow
        enabled: true,
        recipients: {
          create: [
            { recipient_type: "TO", recipient_source: "Dynamic", value: "PO Owner" },
            { recipient_type: "CC", recipient_source: "Custom", value: "po-director@company.com" }
          ]
        }
      }
    });
    console.log("Created Rule for PO Workflow:", rule1.name);

    // HR / Non-PO Workflow Rule
    const rule2 = await prisma.notificationRule.create({
      data: {
        name: "Mechanism 1: Non-PO Invoices RACI",
        trigger_event: "Approve",
        subject: "[Non-PO] High Value Approval",
        target_workflow: "High-Value Non-PO Routing", // HR/Non-PO workflow
        enabled: true,
        recipients: {
          create: [
            { recipient_type: "TO", recipient_source: "Dynamic", value: "Current Approver" },
            { recipient_type: "CC", recipient_source: "Custom", value: "finance-vp@company.com" }
          ]
        }
      }
    });
    console.log("Created Rule for Non-PO Workflow:", rule2.name);

  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
