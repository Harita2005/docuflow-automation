import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

function evaluateRuleConditions(conditions: any[], invoice: any, erpData?: any): boolean {
  if (!conditions || conditions.length === 0) return true;
  let isMatch = true;
  for (let i = 0; i < conditions.length; i++) {
    const cond = conditions[i];
    let fieldVal = invoice[cond.field];
    if (fieldVal === undefined && erpData) fieldVal = erpData[cond.field];
    if (fieldVal === undefined && invoice.custom_data) {
       try { fieldVal = (typeof invoice.custom_data === 'string' ? JSON.parse(invoice.custom_data) : invoice.custom_data)[cond.field]; } catch (e) {}
    }
    let { operator, value } = cond;
    let currentMatch = true;
    if (cond.field === 'amount' || !isNaN(Number(value))) {
       fieldVal = Number(fieldVal) || 0; value = Number(value) || 0;
    } else {
       fieldVal = String(fieldVal || '').toLowerCase(); value = String(value || '').toLowerCase();
    }
    switch (operator) {
      case '==': case '===': case 'equals': case '=': if (fieldVal != value) currentMatch = false; break;
      case '!=': case '!==': case 'not_equals': if (fieldVal != value) currentMatch = false; break;
      case '>': case 'gt': if (fieldVal <= value) currentMatch = false; break;
      case '<': case 'lt': if (fieldVal >= value) currentMatch = false; break;
      case '>=': if (fieldVal < value) currentMatch = false; break;
      case '<=': if (fieldVal > value) currentMatch = false; break;
      case 'contains': if (!String(fieldVal).includes(String(value))) currentMatch = false; break;
      case 'is_null': case 'is_empty': if (fieldVal !== null && fieldVal !== undefined && fieldVal !== '' && fieldVal !== 'Not Found') currentMatch = false; break;
      case 'is_not_null': case 'not_empty': if (fieldVal === null || fieldVal === undefined || fieldVal === '' || fieldVal === 'Not Found') currentMatch = false; break;
    }
    if (i === 0) { isMatch = currentMatch; } else {
       const prevCond = conditions[i - 1];
       if (prevCond.logicalOperator === 'OR') { isMatch = isMatch || currentMatch; } else { isMatch = isMatch && currentMatch; }
    }
  }
  return isMatch;
}

async function main() {
  const invoice = await prisma.invoice.findUnique({ where: { id: 'DOC-60825661' } });
  const rules = await prisma.businessRule.findMany({ where: { document_type: invoice.document_type }, orderBy: { priority: 'asc' } });
  
  console.log('Invoice Document Type:', invoice.document_type);
  for (const rule of rules) {
    let conditions = [];
    try { conditions = JSON.parse(rule.conditions_json); } catch(e) {}
    let matches = evaluateRuleConditions(conditions, invoice, null);
    if (matches && conditions.length > 0) {
      console.log('MATCHED RULE:', rule.rule_name, 'TARGET:', rule.target_workflow_id);
      await prisma.$disconnect();
      return;
    }
  }
  console.log('NO MATCHES, USING FALLBACK');
  await prisma.$disconnect();
}
main();
