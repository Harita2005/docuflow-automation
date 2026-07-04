const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const fs = require('fs');
const path = require('path');

async function seed() {
  console.log("Seeding Business Rules from config...");
  
  const configPath = path.join(__dirname, 'config', 'default_seeds.json');
  let rulesData = [];
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    rulesData = config.businessRules || [];
  } else {
    console.warn("No default_seeds.json found!");
    return;
  }

  const mappedRules = rulesData.map(r => ({
    rule_name: r.rule_name,
    priority: r.priority,
    conditions_json: JSON.stringify(r.conditions),
    target_workflow_id: r.target_workflow_name
  }));

  if (mappedRules.length > 0) {
    await prisma.businessRule.createMany({
      data: mappedRules
    });
  }
  
  console.log("Business Rules Seeded successfully");
}

seed().catch(console.error).finally(() => prisma.$disconnect());
