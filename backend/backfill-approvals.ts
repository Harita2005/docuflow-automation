import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log("Starting backfill of approval logs...");

  // Find all active logs
  const logs = await prisma.activeApprovalLog.findMany({
    include: { invoice: true }
  });

  for (const log of logs) {
    const currentStage = log.current_stage_number;
    if (currentStage > 1) {
      // There are completed stages!
      // Find the workflow steps that should have been approved
      const steps = await prisma.workflowStepDefinition.findMany({
        where: {
          profile_name: log.workflow_profile,
          stage_number: { lt: currentStage }
        }
      });

      // Ensure WorkflowInstance exists
      let wfInst = await prisma.workflowInstance.findUnique({
        where: { invoice_id: log.invoice_id }
      });
      if (!wfInst) {
        wfInst = await prisma.workflowInstance.create({
          data: {
            invoice_id: log.invoice_id,
            current_stage: `Stage ${log.current_stage_number}`,
            status: "Pending"
          }
        });
      }

      for (const step of steps) {
        // Resolve the email of the approver target if it matches a user's username
        let approverEmail = step.approver_target;
        const matchedUser = await prisma.user.findFirst({
          where: {
            OR: [
              { username: step.approver_target },
              { email: step.approver_target }
            ]
          }
        });
        if (matchedUser) {
          approverEmail = matchedUser.email;
        }

        // Check if approval record exists
        const existingApproval = await prisma.approval.findFirst({
          where: {
            workflow_instance_id: wfInst.id,
            approver: approverEmail
          }
        });

        if (!existingApproval) {
          await prisma.approval.create({
            data: {
              workflow_instance_id: wfInst.id,
              approver: approverEmail,
              action: "Approve",
              comments: `Backfilled approval for Stage ${step.stage_number} (${step.approver_target}).`
            }
          });
          console.log(`Backfilled approval for invoice ${log.invoice.invoice_number || log.invoice_id}, stage ${step.stage_number} by ${approverEmail}`);
        }
      }
    }
  }
  console.log("Backfill completed successfully.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
