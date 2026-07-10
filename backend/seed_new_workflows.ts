import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const documentTypes = [
  "AP INVOICE AND AP DEBIT NOTE",
  "AR CREDITNOTE",
  "VCC PURCHASE INVOICE",
  "JOURNAL ENTRY",
  "OCR AND INHOUSE OCR",
  "PROJECT BUDGET",
  "NON - RETURNABLE"
];

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
  console.log("Deleting existing Document Templates, Workflows, and Business Rules...");
  await prisma.businessRule.deleteMany({});
  await prisma.workflow.deleteMany({});
  await prisma.documentTemplate.deleteMany({});

  console.log("Seeding new Document Templates...");
  for (const docType of documentTypes) {
    await prisma.documentTemplate.create({
      data: {
        name: docType,
        description: `Template for ${docType}`,
        // Add some generic fields. Real fields can be configured later.
        fields_json: JSON.stringify([
          { name: "invoice_number", type: "string", required: false },
          { name: "amount", type: "number", required: false },
          { name: "vendor_name", type: "string", required: false }
        ])
      }
    });
  }

  console.log("Seeding new Workflows and Default Routing Rules...");
  for (const wfData of workflowsData) {
    const nodes = wfData.steps.map((step, index) => ({
      id: `step-${index + 1}`,
      type: "approval",
      label: step,
      approver: "TBD" // Can be configured later
    }));

    const edges = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      edges.push({
        source: nodes[i].id,
        target: nodes[i + 1].id
      });
    }

    const createdWf = await prisma.workflow.create({
      data: {
        workflow_name: wfData.name,
        workflow_json: JSON.stringify({ nodes, edges })
      }
    });

    // Create a dummy business rule so this workflow can be triggered if chosen
    // Adding priority incrementally or default priority 10
    await prisma.businessRule.create({
      data: {
        rule_name: `Default Rule for ${wfData.name}`,
        priority: 100, // Make it a low priority default
        conditions_json: JSON.stringify([]), // empty condition means it acts as a fallback or can be configured
        target_workflow_id: createdWf.id,
        document_type: wfData.docType
      }
    });
  }

  console.log("Seeding complete!");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
