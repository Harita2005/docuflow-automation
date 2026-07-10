const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('ProcessingQueue:', await prisma.processingQueue.findMany());
  console.log('Invoices:', await prisma.invoice.findMany({ select: { id: true, status: true, vendor_name: true } }));
}

main().finally(() => prisma.$disconnect());
