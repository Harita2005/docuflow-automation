import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const updated = await prisma.workflowProfile.updateMany({
      data: {
        workflow_type: 'Vendor Payment',
      },
    });
    console.log(`Successfully updated ${updated.count} workflows to Vendor Payment category.`);
  } catch (err) {
    console.error('Error updating workflows:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
