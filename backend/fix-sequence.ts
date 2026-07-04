import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const invs = await prisma.invoice.findMany({
    where: { tracking_id: { startsWith: 'INV-202606-' } },
    orderBy: { created_at: 'asc' }
  });
  
  let seq = 1;
  for (const inv of invs) {
    const newTrackingId = `INV-202606-${seq.toString().padStart(4, '0')}`;
    await prisma.invoice.update({
      where: { id: inv.id },
      data: { tracking_id: newTrackingId }
    });
    console.log(`Updated ${inv.tracking_id} -> ${newTrackingId}`);
    seq++;
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
