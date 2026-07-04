import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function test() {
  const invoice = await prisma.invoice.create({
    data: {
      invoice_number: "INV-SLA-TEST-100",
      vendor_name: "SLA Vendor",
      invoice_date: "2026-06-30",
      po_number: "PO-SLA-100",
      amount: 15000,
      currency: "USD",
      status: "Pending Approval",
      file_name: "test.pdf",
      file_size: 1024,
      mime_type: "application/pdf",
      file_path: "/uploads/test.pdf",
      ocr_confidence: 0.99,
      ocr_text: "test",
      tax_details: "{}"
    }
  });

  const pastDate = new Date();
  pastDate.setHours(pastDate.getHours() - 100);

  const log = await prisma.activeApprovalLog.create({
    data: {
      invoice_id: invoice.id,
      workflow_profile: "Standard PO Invoice Workflow",
      status: "Pending",
      last_updated: pastDate
    }
  });
  
  console.log(`Created SLA-breached Approval Log for Invoice ${invoice.invoice_number}`);
}
test().finally(() => prisma.$disconnect());
