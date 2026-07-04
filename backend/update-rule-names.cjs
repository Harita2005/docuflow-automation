const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updateRuleNames() {
  try {
    const rules = await prisma.businessRule.findMany();
    for (const rule of rules) {
      if (rule.target_workflow_id && rule.target_workflow_id.includes('-')) { // looks like a UUID
        const wf = await prisma.workflow.findUnique({ where: { id: rule.target_workflow_id } }).catch(()=>null);
        if (wf) {
          await prisma.businessRule.update({
            where: { id: rule.id },
            data: { target_workflow_id: wf.workflow_name }
          });
          console.log(`Updated rule ${rule.rule_name} target to ${wf.workflow_name}`);
        }
      }
    }
  } catch (error) {
    console.error("Error updating:", error);
  } finally {
    await prisma.$disconnect();
  }
}

updateRuleNames();
