import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function cleanup() {
  await prisma.activeApprovalLog.deleteMany({
    where: { invoice: { invoice_number: "INV-SLA-TEST-100" } }
  });
  await prisma.invoice.deleteMany({
    where: { invoice_number: "INV-SLA-TEST-100" }
  });
  console.log("Deleted dummy SLA test invoice.");
}
cleanup().finally(() => prisma.$disconnect());
