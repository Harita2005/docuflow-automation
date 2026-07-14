import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const workflows = [
  { prefix: "AP INVOICE", flows: [
    ["ATTACHMENT STATUS", "FIRST APPROVAL", "SECOND APPROVAL", "IA APPROVAL", "FINAL APPROVAL"],
    ["ATTACHMENT STATUS", "FIRST APPROVAL", "IA APPROVAL", "FINAL APPROVAL"],
    ["ATTACHMENT STATUS", "IA APPROVAL", "FINAL APPROVAL"],
    ["ATTACHMENT STATUS", "IA APPROVAL"],
    ["ATTACHMENT STATUS", "FIRST APPROVAL", "IA APPROVAL"],
    ["ATTACHMENT STATUS", "FIRST APPROVAL", "SECOND APPROVAL", "IA APPROVAL", "3RD APPROVAL", "FINAL APPROVAL"]
  ]},
  { prefix: "AP DEBIT NOTE", flows: [
    ["ATTACHMENT STATUS", "FIRST APPROVAL", "SECOND APPROVAL", "IA APPROVAL", "FINAL APPROVAL"],
    ["ATTACHMENT STATUS", "FIRST APPROVAL", "IA APPROVAL", "FINAL APPROVAL"],
    ["ATTACHMENT STATUS", "IA APPROVAL", "FINAL APPROVAL"],
    ["ATTACHMENT STATUS", "IA APPROVAL"],
    ["ATTACHMENT STATUS", "FIRST APPROVAL", "IA APPROVAL"],
    ["ATTACHMENT STATUS", "FIRST APPROVAL", "SECOND APPROVAL", "IA APPROVAL", "3RD APPROVAL", "FINAL APPROVAL"]
  ]},
  { prefix: "AR CREDITNOTE", flows: [
    ["ATTACHMENT STATUS", "FIRST APPROVAL", "IA APPROVAL", "FINAL APPROVAL"],
    ["ATTACHMENT STATUS", "IA APPROVAL", "FINAL APPROVAL"],
    ["ATTACHMENT STATUS", "IA APPROVAL"]
  ]},
  { prefix: "VCC PURCHASE INVOICE", flows: [
    ["ATTACHMENT STATUS", "FIRST APPROVAL", "IA APPROVAL", "FINAL APPROVAL"],
    ["ATTACHMENT STATUS", "IA APPROVAL", "FINAL APPROVAL"],
    ["ATTACHMENT STATUS", "IA APPROVAL", "FINAL APPROVAL"],
    ["ATTACHMENT STATUS", "IA APPROVAL"]
  ]},
  { prefix: "JOURNAL ENTRY", flows: [
    ["ATTACHMENT STATUS", "IA APPROVAL", "FINAL APPROVAL"]
  ]},
  { prefix: "OCR AND INHOUSE OCR", flows: [
    ["ATTACHMENT STATUS", "FIRST APPROVAL", "SECOND APPROVAL", "FINAL APPROVAL"],
    ["ATTACHMENT STATUS", "FIRST APPROVAL", "FINAL APPROVAL"],
    ["ATTACHMENT STATUS", "FIRST APPROVAL", "IA APPROVAL", "FINAL APPROVAL"],
    ["ATTACHMENT STATUS", "FIRST APPROVAL", "IA APPROVAL"],
    ["ATTACHMENT STATUS", "DEPARTMENT APPROVAL", "FIRST APPROVAL", "IA APPROVAL"],
    ["ATTACHMENT STATUS", "DEPARTMENT APPROVAL", "FIRST APPROVAL", "IA APPROVAL", "FINAL APPROVAL"]
  ]},
  { prefix: "PROJECT BUDGET", flows: [
    ["ATTACHMENT STATUS", "FIRST APPROVAL", "SECOND APPROVAL", "FINAL APPROVAL"],
    ["ATTACHMENT STATUS", "IA APPROVAL"]
  ]},
  { prefix: "NON - RETURNABLE", flows: [
    ["ATTACHMENT STATUS", "FIRST APPROVAL", "IA APPROVAL"]
  ]}
];

async function main() {
  try {
    // 1. Delete existing Vendor Payment workflows
    await prisma.workflowStepDefinition.deleteMany({
      where: { workflowProfile: { workflow_type: 'Vendor Payment' } }
    });
    const deleted = await prisma.workflowProfile.deleteMany({
      where: { workflow_type: 'Vendor Payment' }
    });
    console.log(`Deleted ${deleted.count} old Vendor Payment workflows.`);

    // 2. Insert new workflows
    let count = 0;
    for (const group of workflows) {
      let wfIndex = 1;
      for (const flow of group.flows) {
        const profileName = `${group.prefix} - WORKFLOW ${wfIndex}`;
        
        await prisma.workflowProfile.create({
          data: {
            profile_name: profileName,
            workflow_type: 'Vendor Payment',
            description: `Auto-generated workflow for ${group.prefix}`,
            status: 'Active',
            approval_threshold: 100,
            rejection_handling: 'Return to Previous Step',
            steps: {
              create: flow.map((stepName, index) => {
                const isAttachment = stepName === "ATTACHMENT STATUS";
                return {
                  stage_number: index + 1,
                  step_name: stepName,
                  role: isAttachment ? "Employee" : "Manager",
                  approver_type: "Role Based",
                  approver_target: isAttachment ? "Department Head" : "Finance Manager",
                  action_required: isAttachment ? "Complete, Hold" : "Approve, Reject, Hold",
                  permissions: isAttachment ? "Edit" : "Approve Only",
                  document_type: "Invoice"
                };
              })
            }
          }
        });
        
        wfIndex++;
        count++;
      }
    }
    
    console.log(`Successfully created ${count} new Vendor Payment workflows.`);
  } catch (err) {
    console.error('Error seeding vendor payment workflows:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
