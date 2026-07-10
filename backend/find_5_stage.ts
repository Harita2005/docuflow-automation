import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const workflows = await prisma.workflow.findMany();
  
  let targetWorkflowIds = [];
  
  for (const wf of workflows) {
    try {
      const parsed = JSON.parse(wf.workflow_json);
      // Check if it has 5 stages (nodes)
      if (parsed.nodes && parsed.nodes.length === 5) {
        console.log(`Found 5-stage workflow: ${wf.workflow_name} (ID: ${wf.id})`);
        targetWorkflowIds.push(wf.id);
      }
    } catch(e) {}
  }
  
  if (targetWorkflowIds.length > 0) {
    console.log("\nSearching for Business Rules that target these workflows...");
    const rules = await prisma.businessRule.findMany({
      where: {
        target_workflow_id: { in: targetWorkflowIds }
      }
    });
    
    if (rules.length > 0) {
      for (const rule of rules) {
        console.log(`\nRule Name: ${rule.rule_name}`);
        console.log(`Document Type: ${rule.document_type}`);
        console.log(`Conditions: ${rule.conditions_json}`);
      }
    } else {
      console.log("No business rules target these workflows directly.");
    }
  } else {
    console.log("No 5-stage workflows found.");
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
