import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function runSLAEngine() {
  console.log("Starting SLA Engine Check...");
  
  try {
    // Look for approvals that are pending
    const pendingLogs = await prisma.activeApprovalLog.findMany({
      where: { status: "Pending" },
      include: { invoice: true }
    });

    const now = new Date();
    // Default SLA is 48 hours
    const SLA_HOURS = 48;
    const ESCALATION_TARGET = "VP of Finance"; // Fallback escalation

    for (const log of pendingLogs) {
      const hoursPending = Math.abs(now.getTime() - new Date(log.last_updated).getTime()) / 36e5;

      if (hoursPending > SLA_HOURS) {
        console.log(`[SLA BREACH] Invoice ${log.invoice.invoice_number} has been pending for ${hoursPending.toFixed(1)} hours.`);

        // 1. Mark current status as Escalated
        await prisma.activeApprovalLog.update({
          where: { id: log.id },
          data: {
            status: "Escalated",
            last_updated: new Date() // Reset the timer for the escalation target
          }
        });

        // 2. Log the escalation to the System Log
        await prisma.systemLog.create({
          data: {
            invoice_id: log.invoice_id,
            action: "SLA Escalation Triggered",
            user: "SLA Engine",
            details: `Approval SLA of ${SLA_HOURS} hours breached. Document automatically escalated to ${ESCALATION_TARGET}.`
          }
        });

        // 3. Update the invoice status to show it is escalated
        await prisma.invoice.update({
          where: { id: log.invoice_id },
          data: {
            status: "Escalated to " + ESCALATION_TARGET
          }
        });
        
        console.log(`Successfully escalated Invoice ${log.invoice.invoice_number}`);
      }
    }
  } catch (error) {
    console.error("SLA Engine Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// Allow running standalone from command line
import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runSLAEngine();
}
