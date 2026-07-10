const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updateRule() {
  const conditions = [
    {
      field: 'amount',
      operator: '>',
      value: '10000',
      logicalOperator: 'AND'
    },
    {
      field: 'items', // The invoice.items JSON string will be checked
      operator: 'contains',
      value: 'Laptop', // Assuming they bought a laptop, or we can use a generic term like "Service" or "Product"
      logicalOperator: 'AND'
    }
  ];

  try {
    // Delete the previous one to avoid clutter
    await prisma.businessRule.deleteMany({
      where: { rule_name: 'High Value BATS Technologies Invoice' }
    });

    // Create the new one based on Amount and Product
    const rule = await prisma.businessRule.create({
      data: {
        rule_name: 'High Value Product Purchase',
        priority: 5,
        conditions_json: JSON.stringify({ conditions }),
        target_workflow_id: 'WORKFLOW 6',
        document_type: 'Invoice'
      }
    });
    console.log("Created updated rule:", rule.rule_name);
  } catch(e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

updateRule();
