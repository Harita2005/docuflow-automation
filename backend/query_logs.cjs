const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const logs = await prisma.systemLog.findMany({ orderBy: { timestamp: 'desc' }, take: 10 });
  console.log(logs);
}
main().catch(e => console.error(e)).finally(() => process.exit(0));
