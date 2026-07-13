import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();
const ARCHIVE_ROOT = process.env.ARCHIVE_STORAGE_PATH || 'C:\\\\docuflow-archives';

async function fixArchives() {
  const invoices = await prisma.invoice.findMany({
    where: {
      file_path: {
        contains: 'docuflow-archives'
      }
    }
  });

  console.log(`Found ${invoices.length} archived invoices.`);

  for (const invoice of invoices) {
    if (!invoice.file_path || !fs.existsSync(invoice.file_path)) {
      console.log(`File not found: ${invoice.file_path}`);
      continue;
    }

    const currentYear = new Date(invoice.updatedAt || new Date()).getFullYear().toString();
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const currentMonth = monthNames[new Date(invoice.updatedAt || new Date()).getMonth()];
    const documentType = invoice.document_type || 'Invoice';
    const safeDocType = documentType.replace(/[^a-z0-9]/gi, '_');

    const targetDir = path.join(ARCHIVE_ROOT, safeDocType, currentYear, currentMonth);
    
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const ext = path.extname(invoice.file_name) || path.extname(invoice.file_path) || '';
    let targetFilename = '';
    
    if (invoice.invoice_number) {
        const safeInvoiceNum = invoice.invoice_number.replace(/[^a-z0-9-]/gi, '_');
        targetFilename = `${safeInvoiceNum}${ext}`;
        
        if (fs.existsSync(path.join(targetDir, targetFilename)) && path.join(targetDir, targetFilename) !== invoice.file_path) {
            targetFilename = `${safeInvoiceNum}_${Date.now()}${ext}`;
        }
    } else {
        const baseName = path.basename(invoice.file_name, ext);
        targetFilename = `${baseName}_${Date.now()}${ext}`;
    }
    
    const targetPath = path.join(targetDir, targetFilename);

    if (invoice.file_path !== targetPath) {
        console.log(`Moving ${invoice.file_path} -> ${targetPath}`);
        fs.renameSync(invoice.file_path, targetPath);

        await prisma.invoice.update({
          where: { id: invoice.id },
          data: { file_path: targetPath, file_name: targetFilename }
        });
        console.log(`Updated DB for invoice ${invoice.id}`);
    }
  }
}

fixArchives().catch(console.error).finally(() => prisma.$disconnect());
