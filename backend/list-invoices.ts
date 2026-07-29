import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const invoices = await prisma.invoice.findMany({
    select: { id: true, invoice_number: true, po_number: true, vendor_name: true, status: true }
  });
  console.log(JSON.stringify(invoices, null, 2));
}
main();
