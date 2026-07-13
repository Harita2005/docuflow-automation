import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// The root path for the archive. Configurable via environment variables.
const ARCHIVE_ROOT = process.env.ARCHIVE_STORAGE_PATH || 'C:\\docuflow-archives';

export async function archiveApprovedDocument(invoiceId: string, userEmail: string = 'System') {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId }
    });

    if (!invoice) {
      console.error(`[Archive Service] Invoice ${invoiceId} not found.`);
      return;
    }

    // Skip if it doesn't have a valid local file path or is already in the archive folder
    if (!invoice.file_path || invoice.file_path.includes(ARCHIVE_ROOT)) {
      console.log(`[Archive Service] Document for invoice ${invoiceId} is already archived or has no file path.`);
      return;
    }

    // Resolve the absolute original path
    // If it starts with / or \, strip it before joining with process.cwd() if we want it relative to project root
    let originalPath = invoice.file_path;
    if (!path.isAbsolute(originalPath) || originalPath.startsWith('/uploads') || originalPath.startsWith('\\uploads')) {
        originalPath = path.join(process.cwd(), originalPath.replace(/^[\/\\]/, ''));
    } else {
        originalPath = path.resolve(invoice.file_path);
    }

    if (!fs.existsSync(originalPath)) {
       console.error(`[Archive Service] Original file not found at ${originalPath}. Cannot archive.`);
       return;
    }

    const date = new Date();
    const currentYear = date.getFullYear().toString();
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const currentMonth = monthNames[date.getMonth()];
    const documentType = invoice.document_type || 'Invoice';
    const safeDocType = documentType.replace(/[^a-z0-9]/gi, '_'); // sanitize folder name

    // Build target directory: C:\\docuflow-archives\\<document_type>\\<year>\\<month>
    const targetDir = path.join(ARCHIVE_ROOT, safeDocType, currentYear, currentMonth);
    
    // Ensure directory exists
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Determine target file path
    const ext = path.extname(invoice.file_name) || path.extname(originalPath) || '';
    let targetFilename = '';
    
    if (invoice.invoice_number) {
        // Sanitize the invoice number just in case it has invalid path characters
        const safeInvoiceNum = invoice.invoice_number.replace(/[^a-z0-9-]/gi, '_');
        targetFilename = `${safeInvoiceNum}${ext}`;
        
        // Prevent overwriting by appending timestamp if it already exists
        if (fs.existsSync(path.join(targetDir, targetFilename))) {
            targetFilename = `${safeInvoiceNum}_${Date.now()}${ext}`;
        }
    } else {
        const baseName = path.basename(invoice.file_name, ext);
        targetFilename = `${baseName}_${Date.now()}${ext}`;
    }
    
    const targetPath = path.join(targetDir, targetFilename);

    // Move the file (copy + unlink to be safe across different drives/partitions)
    fs.copyFileSync(originalPath, targetPath);
    try {
        fs.unlinkSync(originalPath);
    } catch (unlinkErr) {
        console.error(`[Archive Service] Failed to delete original file after copying:`, unlinkErr);
    }

    // Update database to point to the new archived location
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { file_path: targetPath, file_name: targetFilename }
    });

    // Log the action
    await prisma.systemLog.create({
      data: {
        invoice_id: invoice.id,
        action: "Document Archived",
        user: userEmail,
        details: `Document safely moved to permanent archive at ${targetPath}.`
      }
    });

    console.log(`[Archive Service] Successfully archived document ${invoiceId} to ${targetPath}`);
    return targetPath;
  } catch (error) {
    console.error(`[Archive Service] Failed to archive document ${invoiceId}:`, error);
  } finally {
    await prisma.$disconnect();
  }
}
