import { prisma } from "./server-db";
import nodemailer from "nodemailer";

async function main() {
  const config = await prisma.emailProviderConfig.findFirst();
  if (!config) {
    console.error("No EmailProviderConfig found in database.");
    return;
  }
  console.log("Current SMTP Configuration in Database:");
  console.log("--------------------------------------");
  console.log(`Provider:     ${config.provider}`);
  console.log(`SMTP Server:  ${config.smtp_server}`);
  console.log(`Port:         ${config.port}`);
  console.log(`Username:     ${config.username}`);
  console.log(`Sender Email: ${config.sender_email}`);
  console.log(`Sender Name:  ${config.sender_name}`);
  console.log(`TLS Enabled:  ${config.tls_enabled}`);
  console.log(`Password set: ${config.encrypted_password ? 'Yes' : 'No'}`);
  console.log("--------------------------------------");

  if (!config.username) {
    console.error("Username is not set.");
    return;
  }

  const recipient = process.argv[2];
  if (!recipient) {
    console.log("Usage: npx tsx test-smtp.ts <recipient-email-address>");
    return;
  }

  console.log(`Sending test email to ${recipient}...`);
  const transporter = nodemailer.createTransport({
    host: config.smtp_server,
    port: config.port,
    secure: config.port === 465,
    auth: {
      user: config.username,
      pass: config.encrypted_password || "",
    },
    tls: {
      rejectUnauthorized: false
    }
  });

  try {
    const info = await transporter.sendMail({
      from: `"${config.sender_name || 'Workflow Automation'}" <${config.sender_email || config.username}>`,
      to: recipient,
      subject: "DocuFlow Automation - SMTP Connection Test",
      html: `
        <h3>SMTP Connection Test</h3>
        <p>This is a test email from DocuFlow Automation to verify your SMTP settings.</p>
        <p><strong>Configured SMTP Server:</strong> ${config.smtp_server}:${config.port}</p>
        <p><strong>Sender Name:</strong> ${config.sender_name}</p>
        <p><strong>Sender Email:</strong> ${config.sender_email || config.username}</p>
        <p>If you received this message, your SMTP settings are correct and working!</p>
      `
    });
    console.log("Email sent successfully!");
    console.log("Message ID:", info.messageId);
    console.log("Response:", info.response);
  } catch (error: any) {
    console.error("Failed to send email.");
    console.error("Error details:", error);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
