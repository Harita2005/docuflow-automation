const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    const profile = await prisma.workflowProfile.upsert({
      where: { profile_name: 'Test Workflow' },
      update: { workflow_category: 'Expense tracker', status: 'Active', approval_threshold: 100, rejection_handling: 'Return to Previous Step', reminder_interval_hours: 24, escalation_after_hours: 72, auto_escalation: true },
      create: { profile_name: 'Test Workflow', workflow_category: 'Expense tracker', status: 'Active', approval_threshold: 100, rejection_handling: 'Return to Previous Step', reminder_interval_hours: 24, escalation_after_hours: 72, auto_escalation: true }
    });
    console.log('Upsert successful:', profile);
  } catch (err) {
    console.error('Upsert failed:', err);
  }
}
run().finally(() => prisma.$disconnect());
