import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log("Starting deletion of all documents and related records...");
  
  // 1. Delete dependent child records first
  const gr = await prisma.goodsReceipt.deleteMany({});
  console.log(`Deleted ${gr.count} GoodsReceipt records.`);
  
  const app = await prisma.approval.deleteMany({});
  console.log(`Deleted ${app.count} Approval records.`);
  
  const wf = await prisma.workflowInstance.deleteMany({});
  console.log(`Deleted ${wf.count} WorkflowInstance records.`);
  
  const act = await prisma.activeApprovalLog.deleteMany({});
  console.log(`Deleted ${act.count} ActiveApprovalLog records.`);
  
  const sys = await prisma.systemLog.deleteMany({});
  console.log(`Deleted ${sys.count} SystemLog records.`);
  
  const comm = await prisma.documentComment.deleteMany({});
  console.log(`Deleted ${comm.count} DocumentComment records.`);
  
  const notif = await prisma.notification.deleteMany({});
  console.log(`Deleted ${notif.count} Notification records.`);
  
  const corr = await prisma.correctionLog.deleteMany({});
  console.log(`Deleted ${corr.count} CorrectionLog records.`);
  
  const pq = await prisma.processingQueue.deleteMany({});
  console.log(`Deleted ${pq.count} ProcessingQueue records.`);
  
  // 2. Delete parent Invoice records
  const deletedInvoices = await prisma.invoice.deleteMany({});
  console.log(`Deleted ${deletedInvoices.count} Invoice records.`);
  
  console.log("All documents and related records cleared successfully.");
}

main()
  .catch((err) => {
    console.error("Error clearing documents:", err);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
