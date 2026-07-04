const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seed() {
  await prisma.eRPMaster.deleteMany();
  await prisma.eRPMaster.createMany({
    data: [
      {
        po_number: "PO12345",
        division: "Manufacturing",
        department: "Purchase",
        category: "Raw Material",
        cost_center: "CC001",
        plant: "Plant A",
        vendor: "Acme Corp",
        requestor_email: "req1@example.com"
      },
      {
        po_number: "PO99999",
        division: "IT",
        department: "Software",
        category: "Software License",
        cost_center: "CC002",
        plant: "HQ",
        vendor: "AWS",
        requestor_email: "it@example.com"
      },
      {
        po_number: "PO-0026/ERDUTM2526",
        division: "IT Infrastructure",
        department: "Hardware Operations",
        category: "Server Equipment",
        cost_center: "CC-IT-004",
        plant: "Bangalore Main Plant",
        vendor: "BATSTECHNOLOGIES",
        requestor_email: "hardware-ops@batstechnologies.com"
      },
      {
        po_number: "PO-O026/ERDUTM2526",
        division: "IT Infrastructure",
        department: "Hardware Operations",
        category: "Server Equipment",
        cost_center: "CC-IT-004",
        plant: "Bangalore Main Plant",
        vendor: "BATSTECHNOLOGIES",
        requestor_email: "hardware-ops@batstechnologies.com"
      },
      {
        po_number: "PO-0O26/ERDUTM2526",
        division: "IT Infrastructure",
        department: "Hardware Operations",
        category: "Server Equipment",
        cost_center: "CC-IT-004",
        plant: "Bangalore Main Plant",
        vendor: "BATSTECHNOLOGIES",
        requestor_email: "hardware-ops@batstechnologies.com"
      },
      {
        po_number: "PO-OO26/ERDUTM2526",
        division: "IT Infrastructure",
        department: "Hardware Operations",
        category: "Server Equipment",
        cost_center: "CC-IT-004",
        plant: "Bangalore Main Plant",
        vendor: "BATSTECHNOLOGIES",
        requestor_email: "hardware-ops@batstechnologies.com"
      },
      {
        po_number: "PO-0051/CHNCEN2526",
        division: "IT Infrastructure",
        department: "Network Operations",
        category: "Network Equipment",
        cost_center: "CC-IT-005",
        plant: "Chennai Central Plant",
        vendor: "DIGIBYTZ DIGITAL INDIA PRIVATE LIMITED",
        requestor_email: "network-ops@digibytz.com"
      },
      {
        po_number: "PO-O051/CHNCEN2526",
        division: "IT Infrastructure",
        department: "Network Operations",
        category: "Network Equipment",
        cost_center: "CC-IT-005",
        plant: "Chennai Central Plant",
        vendor: "DIGIBYTZ DIGITAL INDIA PRIVATE LIMITED",
        requestor_email: "network-ops@digibytz.com"
      },
      {
        po_number: "PO-0O51/CHNCEN2526",
        division: "IT Infrastructure",
        department: "Network Operations",
        category: "Network Equipment",
        cost_center: "CC-IT-005",
        plant: "Chennai Central Plant",
        vendor: "DIGIBYTZ DIGITAL INDIA PRIVATE LIMITED",
        requestor_email: "network-ops@digibytz.com"
      },
      {
        po_number: "PO-OO51/CHNCEN2526",
        division: "IT Infrastructure",
        department: "Network Operations",
        category: "Network Equipment",
        cost_center: "CC-IT-005",
        plant: "Chennai Central Plant",
        vendor: "DIGIBYTZ DIGITAL INDIA PRIVATE LIMITED",
        requestor_email: "network-ops@digibytz.com"
      }
    ]
  });
  console.log("ERP Seeded");
}

seed().catch(console.error).finally(() => prisma.$disconnect());
