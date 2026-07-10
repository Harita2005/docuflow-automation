const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function addMultipleConditionRule() {
  const conditions = [
    {
      field: 'amount',
      operator: '>',
      value: '10000',
      logicalOperator: 'AND'
    },
    {
      field: 'vendor_name',
      operator: 'contains',
      value: 'BATS', // Specifically for the invoice in the screenshot which says "BATS TECHNOLOGIES"
      logicalOperator: 'AND'
    },
    {
      field: 'document_type',
      operator: 'equals',
      value: 'Invoice',
      logicalOperator: 'AND'
    }
  ];

  try {
    // Create or update a rule
    const rule = await prisma.businessRule.create({
      data: {
        rule_name: 'High Value BATS Technologies Invoice',
        priority: 5, // higher priority to evaluate first
        conditions_json: JSON.stringify({ conditions }),
        target_workflow_id: 'WORKFLOW 6', // Or 'AP INVOICE - WORKFLOW 6' etc. We'll just use a generic ID for demonstration.
        document_type: 'Invoice'
      }
    });
    console.log("Created complex multiple-condition rule:", rule.rule_name);
  } catch(e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

addMultipleConditionRule();
