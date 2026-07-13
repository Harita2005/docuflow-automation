import { archiveApprovedDocument } from './archive-service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
    console.log("Looking for all approved invoices to archive...");
    const invoices = await prisma.invoice.findMany({
        where: {
            OR: [
                { status: 'Approved' },
                { status: 'Ready for Payment' },
                { status: 'Paid' }
            ]
        }
    });

    if (invoices.length === 0) {
        console.log("No approved invoices found in the database.");
        return;
    }

    console.log(`Found ${invoices.length} approved invoices. Archiving them now...`);
    for (const invoice of invoices) {
        console.log(`Archiving invoice ${invoice.vendor_name} (ID: ${invoice.id})...`);
        await archiveApprovedDocument(invoice.id, 'system_backfill@docuflow.com');
    }
    
    console.log("All approved documents have been archived.");
}

run().catch(console.error).finally(() => prisma.$disconnect());
