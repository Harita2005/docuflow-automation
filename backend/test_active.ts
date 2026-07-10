import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const activeLog = await prisma.activeApprovalLog.findFirst({
    where: { workflow_profile: { contains: "96567e1a" } }
  });
  console.log("activeLog (lowercase search):", activeLog);
  const activeLogUpper = await prisma.activeApprovalLog.findFirst({
    where: { workflow_profile: { contains: "96567E1A" } }
  });
  console.log("activeLog (uppercase search):", activeLogUpper);
}
main().catch(console.error).finally(() => prisma.$disconnect());
