import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("Starting database cleanup...");
  
  // 1. Delete approvals
  const delApprovals = await prisma.approval.deleteMany();
  console.log(`Deleted ${delApprovals.count} Approval records.`);

  // 2. Delete active approval logs
  const delActiveLogs = await prisma.activeApprovalLog.deleteMany();
  console.log(`Deleted ${delActiveLogs.count} ActiveApprovalLog records.`);

  // 3. Delete goods receipts
  const delGoodsReceipts = await prisma.goodsReceipt.deleteMany();
  console.log(`Deleted ${delGoodsReceipts.count} GoodsReceipt records.`);

  // 4. Delete system logs
  const delSystemLogs = await prisma.systemLog.deleteMany();
  console.log(`Deleted ${delSystemLogs.count} SystemLog records.`);

  // 5. Delete processing queue
  const delQueue = await prisma.processingQueue.deleteMany();
  console.log(`Deleted ${delQueue.count} ProcessingQueue records.`);

  // 6. Delete WorkflowInstance
  const delWfInstances = await prisma.workflowInstance.deleteMany();
  console.log(`Deleted ${delWfInstances.count} WorkflowInstance records.`);

  // 7. Delete CorrectionLog
  const delCorrections = await prisma.correctionLog.deleteMany();
  console.log(`Deleted ${delCorrections.count} CorrectionLog records.`);

  // 8. Delete invoices
  const delInvoices = await prisma.invoice.deleteMany();
  console.log(`Deleted ${delInvoices.count} Invoice records.`);

  console.log("Database cleanup completed successfully!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
