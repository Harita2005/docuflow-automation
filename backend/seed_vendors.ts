import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seed() {
  console.log("Seeding Vendor Master...");
  await prisma.vendorMaster.upsert({
    where: { vendor_code: "VEND-001" },
    update: {},
    create: { vendor_code: "VEND-001", vendor_name: "Microsoft Corporation" }
  });
  await prisma.vendorMaster.upsert({
    where: { vendor_code: "VEND-002" },
    update: {},
    create: { vendor_code: "VEND-002", vendor_name: "Amazon Web Services" }
  });
  await prisma.vendorMaster.upsert({
    where: { vendor_code: "VEND-003" },
    update: {},
    create: { vendor_code: "VEND-003", vendor_name: "Dell Technologies" }
  });

  console.log("Updating ERP Master with Mock INR Amounts...");
  const erps = await prisma.eRPMaster.findMany();
  for (const erp of erps) {
    if (erp.po_amount === 0) {
      // Assign a mock PO amount for testing price variances
      await prisma.eRPMaster.update({
        where: { po_number: erp.po_number },
        data: {
          po_amount: 150000.00, // ₹1,50,000
          po_currency: "INR",
          tolerance_amount: 5000.00 // ₹5,000
        }
      });
    }
  }
  console.log("Seeding complete!");
}

seed().catch(e => console.error(e)).finally(() => prisma.$disconnect());
