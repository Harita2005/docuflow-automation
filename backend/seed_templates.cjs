const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

async function seed() {
  console.log("Seeding Document Templates...");

  const configPath = path.join(__dirname, 'config', 'default_seeds.json');
  let templatesData = [];
  
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    templatesData = config.documentTemplates || [];
  } else {
    console.warn("No default_seeds.json found!");
    return;
  }

  for (const t of templatesData) {
    const existing = await prisma.documentTemplate.findUnique({ where: { name: t.name } });
    if (!existing) {
      await prisma.documentTemplate.create({
        data: {
          name: t.name,
          description: t.description,
          fields_json: JSON.stringify(t.fields) // Storing the fields definition as JSON
        }
      });
      console.log(`Seeded ${t.name} template.`);
    }
  }

  console.log("Templates seeded successfully.");
}

seed().catch(console.error).finally(() => prisma.$disconnect());
