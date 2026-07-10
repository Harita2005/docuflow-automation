const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const prisma = new PrismaClient();

const fs = require('fs');
const path = require('path');

async function seed() {
  console.log("Seeding Users from config...");
  
  const configPath = path.join(__dirname, 'config', 'default_seeds.json');
  let usersData = [];
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    usersData = config.users || [];
  } else {
    console.warn("No default_seeds.json found!");
    return; 
  }

  const emailsToSeed = usersData.map(u => u.email);

  await prisma.user.deleteMany({
    where: {
      email: { in: emailsToSeed }
    }
  });

  for (const userData of usersData) {
    const passwordHash = await bcrypt.hash(userData.password || 'password123', 10);
    await prisma.user.create({
      data: {
        username: userData.username,
        employee_id: userData.employee_id,
        email: userData.email,
        password_hash: passwordHash,
        role: userData.role,
        name: userData.name
      }
    });
  }

  console.log("Users Seeded successfully");
}

seed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
