const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const steps = await prisma.workflowStepDefinition.findMany();
  const profiles = [...new Set(steps.map(s => s.profile_name))];

  for (const profile of profiles) {
    await prisma.workflowProfile.upsert({
      where: { profile_name: profile },
      update: {},
      create: { profile_name: profile }
    });
    console.log("Upserted profile:", profile);
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
