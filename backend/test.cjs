const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const rules = await prisma.businessRule.findMany();
  console.log('Rules:', rules);
  const workflows = await prisma.workflowProfile.findMany();
  console.log('Workflows:', workflows);
}
run().finally(() => prisma.$disconnect());
