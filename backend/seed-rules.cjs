const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seed() {
  try {
    // 1. Create Workflows
    console.log("Creating workflows...");
    const wf1 = await prisma.workflow.create({
      data: {
        workflow_name: "Standard PO Invoice Workflow",
        workflow_json: JSON.stringify({
          nodes: [
            { id: "step-1", type: "approval", label: "PO Owner Approval", approver: "[PO_OWNER]" }
          ],
          edges: []
        })
      }
    });

    const wf2 = await prisma.workflow.create({
      data: {
        workflow_name: "High-Value Non-PO Routing",
        workflow_json: JSON.stringify({
          nodes: [
            { id: "step-1", type: "approval", label: "Finance Review", approver: "finance_manager@company.com" },
            { id: "step-2", type: "approval", label: "MD Final Approval", approver: "md@company.com" }
          ],
          edges: [
            { source: "step-1", target: "step-2" }
          ]
        })
      }
    });

    const wf3 = await prisma.workflow.create({
      data: {
        workflow_name: "Low-Value Auto-Clearance",
        workflow_json: JSON.stringify({
          nodes: [
            { id: "step-1", type: "approval", label: "AP Desk Verification", approver: "ap.executive@company.com" }
          ],
          edges: []
        })
      }
    });

    // 2. Create Business Rules linking to those workflows
    console.log("Creating business rules...");
    await prisma.businessRule.create({
      data: {
        rule_name: "High Value Non-PO",
        priority: 1,
        conditions_json: JSON.stringify([
          { field: "amount", operator: ">=", value: 50000 },
          { field: "po_number", operator: "is_null", value: null }
        ]),
        target_workflow_id: wf2.id,
        document_type: "Invoice"
      }
    });

    await prisma.businessRule.create({
      data: {
        rule_name: "Standard PO Handling",
        priority: 2,
        conditions_json: JSON.stringify([
          { field: "po_number", operator: "is_not_null", value: null }
        ]),
        target_workflow_id: wf1.id,
        document_type: "Invoice"
      }
    });

    await prisma.businessRule.create({
      data: {
        rule_name: "Low Value Quick Clearance",
        priority: 3,
        conditions_json: JSON.stringify([
          { field: "amount", operator: "<", value: 10000 },
          { field: "po_number", operator: "is_null", value: null }
        ]),
        target_workflow_id: wf3.id,
        document_type: "Invoice"
      }
    });

    console.log("Successfully seeded 3 workflows and 3 business rules.");
  } catch (error) {
    console.error("Error seeding:", error);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
