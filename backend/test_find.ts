import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const id = "96567e1a-fd36-48ab-b9b7-eb284fd3163d";
  const wff = await prisma.workflow.findUnique({ where: { id } });
  console.log("wff:", wff);
}
main().catch(console.error).finally(() => prisma.$disconnect());
