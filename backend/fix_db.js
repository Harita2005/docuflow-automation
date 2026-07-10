import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  await prisma.invoice.updateMany({ 
    where: { status: 'Exception', vendor_name: 'Processing...' }, 
    data: { vendor_name: 'Unknown Vendor', document_type: 'Unknown', invoice_number: 'N/A', po_number: 'Not Found' } 
  });
  console.log('Updated stuck invoices');
}

main().finally(() => { prisma.$disconnect(); });
