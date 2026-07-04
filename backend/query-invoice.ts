import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkInvoice() {
  const invoice = await prisma.invoice.findFirst({
    where: { po_number: "PO-0051/CHNCEN2526" },
    include: { activeApprovalLog: true, workflowInst: true }
  });
  console.log(JSON.stringify(invoice, null, 2));
}
checkInvoice().finally(() => prisma.$disconnect());
