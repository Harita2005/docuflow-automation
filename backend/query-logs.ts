import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const invs = await prisma.invoice.findMany({
    where: { tracking_id: { startsWith: 'INV-202606-' } },
    orderBy: { created_at: 'asc' }
  });
  console.log("Existing INVs:", invs.map(i => ({ id: i.id, tracking_id: i.tracking_id, created: i.created_at })));
}

main().catch(console.error).finally(() => prisma.$disconnect());
