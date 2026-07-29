import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const count = await prisma.invoice.count();
  console.log(`Total Invoices: ${count}`);
  
  const sample = await prisma.invoice.findMany({
    take: 20,
    orderBy: { created_at: 'desc' }
  });
  
  console.log("Invoices sample:");
  sample.forEach(inv => {
    console.log(`ID: ${inv.id} | No: ${inv.invoice_number} | Vendor: ${inv.vendor_name} | CreatedAt: ${inv.created_at} | FilePath: ${inv.file_path} | UploadedById: ${inv.uploaded_by_id}`);
  });
}

main()
  .catch(e => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
