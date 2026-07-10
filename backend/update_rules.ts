import { PrismaClient } from '@prisma/client'; 
const prisma = new PrismaClient(); 

async function main() { 
  try {
    const rules = await prisma.businessRule.findMany({ where: { rule_name: { startsWith: 'Default Rule for ' } } });
    console.log('Found ' + rules.length + ' rules to update globally');
    
    for (const rule of rules) {
      let updateData = {};
      if (rule.rule_name.includes('Workflow 1')) {
        updateData = {
          rule_name: 'High Value Routing (>1M)',
          priority: 10,
          conditions_json: JSON.stringify({ condition_type: 'Single Condition', evaluate_on: 'Amount', conditions: [{field: 'Amount', operator: 'Greater Than', value: '1000000', logicalOperator: 'AND'}], settings: {case_sensitive: false}})
        };
      } else if (rule.rule_name.includes('Workflow 2')) {
        updateData = {
          rule_name: 'Medium Value Routing (100k-1M)',
          priority: 20,
          conditions_json: JSON.stringify({ condition_type: 'Multi Condition', evaluate_on: 'Amount', conditions: [{field: 'Amount', operator: 'Greater Than', value: '100000', logicalOperator: 'AND'}, {field: 'Amount', operator: 'Less Than', value: '1000000', logicalOperator: 'AND'}], settings: {case_sensitive: false}})
        };
      } else if (rule.rule_name.includes('Workflow 3')) {
        updateData = {
          rule_name: 'Professional Services Routing',
          priority: 30,
          conditions_json: JSON.stringify({ condition_type: 'Multi Condition', evaluate_on: 'Vendor Name', conditions: [{field: 'Vendor Name', operator: 'Contains', value: 'Consulting', logicalOperator: 'OR'}, {field: 'Vendor Name', operator: 'Contains', value: 'Services', logicalOperator: 'AND'}], settings: {case_sensitive: false}})
        };
      } else if (rule.rule_name.includes('Workflow 4')) {
        updateData = {
          rule_name: 'Low Value / Fast Track (<10k)',
          priority: 40,
          conditions_json: JSON.stringify({ condition_type: 'Single Condition', evaluate_on: 'Amount', conditions: [{field: 'Amount', operator: 'Less Than', value: '10000', logicalOperator: 'AND'}], settings: {case_sensitive: false}})
        };
      } else if (rule.rule_name.includes('Workflow 5')) {
        updateData = {
          rule_name: 'Digital & Media Routing',
          priority: 50,
          conditions_json: JSON.stringify({ condition_type: 'Single Condition', evaluate_on: 'Vendor Name', conditions: [{field: 'Vendor Name', operator: 'Contains', value: 'Digital', logicalOperator: 'AND'}], settings: {case_sensitive: false}})
        };
      } else if (rule.rule_name.includes('Workflow 6')) {
        updateData = {
          rule_name: 'Standard Fallback Routing',
          priority: 99,
          conditions_json: '[]'
        };
      }
      
      if (Object.keys(updateData).length > 0) {
        await prisma.businessRule.update({ where: { id: rule.id }, data: updateData });
        console.log('Updated rule ' + rule.id);
      }
    }
    console.log('Successfully updated all condition matrices!');
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
} 
main();
