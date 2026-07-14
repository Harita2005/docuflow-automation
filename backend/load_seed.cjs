const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

async function main() {
  if (!fs.existsSync('seed_data.json')) {
    console.log("No seed_data.json found. Skipping seed.");
    return;
  }
  
  console.log("Loading seed_data.json...");
  const data = JSON.parse(fs.readFileSync('seed_data.json', 'utf-8'));
  
  if (data.templates) {
    for (const t of data.templates) {
      await prisma.documentTemplate.upsert({
        where: { name: t.name },
        update: {},
        create: t
      });
    }
  }

  if (data.rules) {
    for (const r of data.rules) {
      await prisma.businessRule.upsert({
        where: { id: r.id },
        update: {},
        create: r
      });
    }
  }

  if (data.workflows) {
    for (const w of data.workflows) {
      await prisma.workflow.upsert({
        where: { id: w.id },
        update: {},
        create: w
      });
    }
  }

  console.log("Seed complete.");
}

main()
  .catch(e => {
    console.error("Seed failed:", e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
