import { archiveApprovedDocument } from './archive-service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
    console.log("Looking for an approved invoice to test archiving...");
    const invoice = await prisma.invoice.findFirst({
        where: {
            OR: [
                { status: 'Approved' },
                { status: 'Ready for Payment' },
                { status: 'Paid' }
            ]
        }
    });

    if (!invoice) {
        console.log("No approved invoices found in the database. Please approve an invoice first.");
        return;
    }

    console.log(`Found invoice ${invoice.id} with status ${invoice.status}. Attempting to archive...`);
    await archiveApprovedDocument(invoice.id, 'test_script@docuflow.com');
    console.log("Test finished.");
}

run().catch(console.error).finally(() => prisma.$disconnect());
