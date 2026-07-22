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

  for (const userData of usersData) {
    const passwordHash = await bcrypt.hash(userData.password || 'password123', 10);
    
    // Find existing user by any of the unique constraints (email, username, or employee ID)
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: userData.email },
          { username: userData.username },
          { employee_id: userData.employee_id }
        ].filter(cond => {
          const val = Object.values(cond)[0];
          return val !== undefined && val !== null && val !== "";
        })
      }
    });

    if (existingUser) {
      // Update existing user to preserve foreign key constraints (like invoices)
      await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          username: userData.username,
          employee_id: userData.employee_id,
          email: userData.email,
          password_hash: passwordHash,
          role: userData.role,
          name: userData.name
        }
      });
      console.log(`Updated user: ${userData.username}`);
    } else {
      // Create new user
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
      console.log(`Created user: ${userData.username}`);
    }
  }

  console.log("Users Seeded successfully");
}

seed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
