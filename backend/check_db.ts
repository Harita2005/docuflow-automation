import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const rules = await prisma.businessRule.findMany();
  console.log("BusinessRules:", JSON.stringify(rules, null, 2));
  
  const workflows = await prisma.workflow.findMany();
  console.log("Workflows:", JSON.stringify(workflows, null, 2));

  const profiles = await prisma.workflowProfile.findMany();
  console.log("WorkflowProfiles:", JSON.stringify(profiles, null, 2));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
