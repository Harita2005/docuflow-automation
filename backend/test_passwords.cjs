const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

async function testPasswords() {
  const users = await prisma.user.findMany();
  for (const u of users) {
    const valid = await bcrypt.compare('default123', u.password_hash);
    console.log(`User ${u.username} (${u.employee_id}): default123 -> ${valid}`);
  }
  await prisma.$disconnect();
}
testPasswords();
