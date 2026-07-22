import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";

const prisma = new PrismaClient();

async function main() {
  const config = await prisma.emailProviderConfig.findFirst();
  if (!config) {
    console.log("No SMTP provider config found in database.");
    return;
  }
  console.log("SMTP Config details found. Initiating verification test...");
  console.log(`Server: ${config.smtp_server}:${config.port}`);
  console.log(`User: ${config.username}`);

  const transporter = nodemailer.createTransport({
    host: config.smtp_server,
    port: config.port,
    secure: config.port === 465,
    auth: {
      user: config.username,
      pass: config.encrypted_password,
    },
    tls: {
      rejectUnauthorized: false
    }
  });

  try {
    await transporter.verify();
    console.log("SUCCESS: SMTP Transporter is online and authenticated!");
  } catch (err: any) {
    console.error("FAILURE: SMTP verification failed!");
    console.error("Error Code:", err.code);
    console.error("Error Message:", err.message);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
