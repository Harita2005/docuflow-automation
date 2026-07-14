const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

async function main() {
  console.log("Dumping local database...");
  const templates = await prisma.documentTemplate.findMany();
  const rules = await prisma.businessRule.findMany();
  const workflows = await prisma.workflow.findMany();

  const data = {
    templates,
    rules,
    workflows
  };

  fs.writeFileSync('seed_data.json', JSON.stringify(data, null, 2));
  console.log("Dumped " + templates.length + " templates, " + rules.length + " rules, " + workflows.length + " workflows to seed_data.json");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
