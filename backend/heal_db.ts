import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log("Starting database healing process...");

  // Fetch all active approval logs
  const activeLogs = await prisma.activeApprovalLog.findMany();
  let updatedCount = 0;

  // UUID regex pattern
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  for (const log of activeLogs) {
    if (uuidRegex.test(log.workflow_profile)) {
      console.log(`Found log with UUID profile: ${log.workflow_profile} for Invoice ID: ${log.invoice_id}`);
      
      // Try to find the actual workflow name
      const workflow = await prisma.workflow.findUnique({
        where: { id: log.workflow_profile.toLowerCase() } // UUIDs in the Workflow table are lowercase
      });

      if (workflow) {
        console.log(` -> Resolving to Workflow Name: "${workflow.workflow_name}"`);
        
        // Update the log with the correct profile name
        await prisma.activeApprovalLog.update({
          where: { id: log.id },
          data: { workflow_profile: workflow.workflow_name }
        });
        
        updatedCount++;
      } else {
        console.log(` -> Could not find a corresponding Workflow in the database for UUID: ${log.workflow_profile}`);
      }
    }
  }

  console.log(`\nHealing process complete! Successfully updated ${updatedCount} records.`);
}

main()
  .catch(e => {
    console.error("Error during healing process:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
