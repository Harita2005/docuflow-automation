const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const inv = await prisma.invoice.findFirst({
    where: { invoice_number: "BT/25-26/03204" }
  });
  if (inv) {
    console.log("Invoice PO_NUMBER:", JSON.stringify(inv.po_number));
    for (let i = 0; i < inv.po_number.length; i++) {
      console.log(`inv char ${i}: ${inv.po_number.charAt(i)} - code: ${inv.po_number.charCodeAt(i)}`);
    }
  }

  const erp = await prisma.eRPMaster.findMany();
  console.log("ERP POs:");
  for (const entry of erp) {
    console.log("ERP PO:", JSON.stringify(entry.po_number));
    for (let i = 0; i < entry.po_number.length; i++) {
      console.log(`  erp char ${i}: ${entry.po_number.charAt(i)} - code: ${entry.po_number.charCodeAt(i)}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
