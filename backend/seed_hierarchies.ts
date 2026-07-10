import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const workflowsData = [
  // AP INVOICE AND AP DEBIT NOTE
  { docType: "AP INVOICE AND AP DEBIT NOTE", name: "AP Invoice - Workflow 1", steps: ["ATTACHMENT STATUS", "FIRST APPROVAL", "SECOND APPROVAL", "IA APPROVAL", "FINAL APPROVAL"] },
  { docType: "AP INVOICE AND AP DEBIT NOTE", name: "AP Invoice - Workflow 2", steps: ["ATTACHMENT STATUS", "FIRST APPROVAL", "IA APPROVAL", "FINAL APPROVAL"] },
  { docType: "AP INVOICE AND AP DEBIT NOTE", name: "AP Invoice - Workflow 3", steps: ["ATTACHMENT STATUS", "IA APPROVAL", "FINAL APPROVAL"] },
  { docType: "AP INVOICE AND AP DEBIT NOTE", name: "AP Invoice - Workflow 4", steps: ["ATTACHMENT STATUS", "IA APPROVAL"] },
  { docType: "AP INVOICE AND AP DEBIT NOTE", name: "AP Invoice - Workflow 5", steps: ["ATTACHMENT STATUS", "FIRST APPROVAL", "IA APPROVAL"] },
  { docType: "AP INVOICE AND AP DEBIT NOTE", name: "AP Invoice - Workflow 6", steps: ["ATTACHMENT STATUS", "FIRST APPROVAL", "SECOND APPROVAL", "IA APPROVAL", "3RD APPROVAL", "FINAL APPROVAL"] },
  
  // AR CREDITNOTE
  { docType: "AR CREDITNOTE", name: "AR CreditNote - Workflow 1", steps: ["ATTACHMENT STATUS", "FIRST APPROVAL", "IA APPROVAL", "FINAL APPROVAL"] },
  { docType: "AR CREDITNOTE", name: "AR CreditNote - Workflow 2", steps: ["ATTACHMENT STATUS", "IA APPROVAL", "FINAL APPROVAL"] },
  { docType: "AR CREDITNOTE", name: "AR CreditNote - Workflow 3", steps: ["ATTACHMENT STATUS", "IA APPROVAL"] },

  // VCC PURCHASE INVOICE
  { docType: "VCC PURCHASE INVOICE", name: "VCC Purchase Invoice - Workflow 1", steps: ["ATTACHMENT STATUS", "FIRST APPROVAL", "IA APPROVAL", "FINAL APPROVAL"] },
  { docType: "VCC PURCHASE INVOICE", name: "VCC Purchase Invoice - Workflow 2", steps: ["ATTACHMENT STATUS", "IA APPROVAL", "FINAL APPROVAL"] },
  { docType: "VCC PURCHASE INVOICE", name: "VCC Purchase Invoice - Workflow 3", steps: ["ATTACHMENT STATUS", "IA APPROVAL", "FINAL APPROVAL"] },
  { docType: "VCC PURCHASE INVOICE", name: "VCC Purchase Invoice - Workflow 4", steps: ["ATTACHMENT STATUS", "IA APPROVAL"] },

  // JOURNAL ENTRY
  { docType: "JOURNAL ENTRY", name: "Journal Entry - Workflow 1", steps: ["ATTACHMENT STATUS", "IA APPROVAL", "FINAL APPROVAL"] },

  // OCR AND INHOUSE OCR
  { docType: "OCR AND INHOUSE OCR", name: "OCR - Workflow 1", steps: ["ATTACHMENT STATUS", "FIRST APPROVAL", "SECOND APPROVAL", "FINAL APPROVAL"] },
  { docType: "OCR AND INHOUSE OCR", name: "OCR - Workflow 2", steps: ["ATTACHMENT STATUS", "FIRST APPROVAL", "FINAL APPROVAL"] },
  { docType: "OCR AND INHOUSE OCR", name: "OCR - Workflow 3", steps: ["ATTACHMENT STATUS", "FIRST APPROVAL", "IA APPROVAL", "FINAL APPROVAL"] },
  { docType: "OCR AND INHOUSE OCR", name: "OCR - Workflow 4", steps: ["ATTACHMENT STATUS", "FIRST APPROVAL", "IA APPROVAL"] },
  { docType: "OCR AND INHOUSE OCR", name: "OCR - Workflow 5", steps: ["ATTACHMENT STATUS", "DEPARTMENT APPROVAL", "FIRST APPROVAL", "IA APPROVAL"] },
  { docType: "OCR AND INHOUSE OCR", name: "OCR - Workflow 6", steps: ["ATTACHMENT STATUS", "DEPARTMENT APPROVAL", "FIRST APPROVAL", "IA APPROVAL", "FINAL APPROVAL"] },

  // PROJECT BUDGET
  { docType: "PROJECT BUDGET", name: "Project Budget - Workflow 1", steps: ["ATTACHMENT STATUS", "FIRST APPROVAL", "SECOND APPROVAL", "FINAL APPROVAL"] },
  { docType: "PROJECT BUDGET", name: "Project Budget - Workflow 2", steps: ["ATTACHMENT STATUS", "IA APPROVAL"] },

  // NON - RETURNABLE
  { docType: "NON - RETURNABLE", name: "Non-Returnable - Workflow 1", steps: ["ATTACHMENT STATUS", "FIRST APPROVAL", "IA APPROVAL"] }
];

async function main() {
  console.log("Deleting existing WorkflowStepDefinitions...");
  await prisma.workflowStepDefinition.deleteMany({});

  console.log("Seeding WorkflowStepDefinitions for Approval Hierarchies...");
  for (const wf of workflowsData) {
    for (let i = 0; i < wf.steps.length; i++) {
      const stepName = wf.steps[i];
      
      // Determine action required
      let actionRequired = "Approve";
      if (stepName === "ATTACHMENT STATUS") {
        actionRequired = "Complete"; // As per PDF: Complete and Hold button
      }
      
      await prisma.workflowStepDefinition.create({
        data: {
          profile_name: wf.name,
          stage_number: i + 1,
          approver_target: stepName, // e.g. FIRST APPROVAL, IA APPROVAL etc.
          action_required: actionRequired,
          document_type: wf.docType
        }
      });
    }
  }
  
  console.log("WorkflowStepDefinitions seeded successfully!");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
