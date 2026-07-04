import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const wfs = await prisma.workflow.findMany();
  console.log("Workflows:", wfs.map(w => w.workflow_name));
}
main().finally(() => prisma.$disconnect());
