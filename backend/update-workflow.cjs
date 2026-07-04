const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updateWorkflow() {
  try {
    const wf = await prisma.workflow.findFirst({
      where: { workflow_name: "High-Value Non-PO Routing" }
    });

    if (wf) {
      await prisma.workflow.update({
        where: { id: wf.id },
        data: {
          workflow_json: JSON.stringify({
            nodes: [
              { id: "step-1", type: "approval", label: "Department Head Review", approver: "department_manager@company.com" },
              { id: "step-2", type: "approval", label: "General Manager Final Approval", approver: "gm@company.com" }
            ],
            edges: [
              { source: "step-1", target: "step-2" }
            ]
          })
        }
      });
      console.log("Updated High-Value Non-PO Routing to use Department Head and GM.");
    } else {
      console.log("Workflow not found.");
    }
  } catch (error) {
    console.error("Error updating:", error);
  } finally {
    await prisma.$disconnect();
  }
}

updateWorkflow();
