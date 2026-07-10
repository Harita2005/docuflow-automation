import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const steps = await prisma.workflowStepDefinition.findMany();
  console.log('Total steps:', steps.length);
  if (steps.length > 0) {
    console.log(steps[0]);
  }
}
main().finally(() => prisma.$disconnect());
