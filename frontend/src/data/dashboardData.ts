export interface ReferenceDocument {
  id: string;
  vendor_name: string;
  document_type: string;
  invoice_number: string;
  invoice_date: string;
  status: string;
  status_badge_type: 'initiated_first' | 'initiated_attachment' | 'unrouted';
  amount: number;
}

export const REFERENCE_DOCUMENTS: ReferenceDocument[] = [
  {
    id: "INV-755179_73769F",
    vendor_name: "Sample Vendor Enterprise",
    document_type: "E-VOUCHER",
    invoice_number: "INV-5179",
    invoice_date: "2026-09-07",
    status: "INITIATED (FIRST APPROVAL)",
    status_badge_type: "initiated_first",
    amount: 45000
  },
  {
    id: "UTL-DOC-2026-ACC-004",
    vendor_name: "Express Postal & Courier Services",
    document_type: "UTILITY & RENT",
    invoice_number: "INV-PST-2026-4004",
    invoice_date: "2026-09-07",
    status: "UNROUTED (NO RULE MATCHED)",
    status_badge_type: "unrouted",
    amount: 12800
  },
  {
    id: "CAPEX-DOC-2026-ACC-002",
    vendor_name: "Dell Enterprise Systems Ltd",
    document_type: "CASH VOUCHER",
    invoice_number: "INV-AST-2026-2002",
    invoice_date: "2026-09-07",
    status: "INITIATED (ATTACHMENT STATUS)",
    status_badge_type: "initiated_attachment",
    amount: 285000
  },
  {
    id: "SRV-DOC-2026-ACC-001",
    vendor_name: "Tech Care IT Systems & Maintenance",
    document_type: "AP INVOICE",
    invoice_number: "INV-IT-2026-1001",
    invoice_date: "2026-09-07",
    status: "UNROUTED (NO RULE MATCHED)",
    status_badge_type: "unrouted",
    amount: 45000
  },
  {
    id: "EXP-DOC-2026-SD-004",
    vendor_name: "Royal Catering & Hospitality Services",
    document_type: "STAFF & HR EXPENSE",
    invoice_number: "INV-WEL-2026-1104",
    invoice_date: "2026-09-07",
    status: "UNROUTED (NO RULE MATCHED)",
    status_badge_type: "unrouted",
    amount: 18500
  },
  {
    id: "CAPEX-DOC-2026-VCC-003",
    vendor_name: "Head Office Canteen & Welfare Services",
    document_type: "E-VOUCHER",
    invoice_number: "INV-WEL-2026-3003",
    invoice_date: "2026-09-07",
    status: "INITIATED (FIRST APPROVAL)",
    status_badge_type: "initiated_first",
    amount: 34500
  },
  {
    id: "INV-DOC-2026-SD-002",
    vendor_name: "Apex Digital Media & Ads Pvt Ltd",
    document_type: "AP INVOICE",
    invoice_number: "INV-MKT-2026-4402",
    invoice_date: "2026-09-07",
    status: "UNROUTED (NO RULE MATCHED)",
    status_badge_type: "unrouted",
    amount: 125000
  },
  {
    id: "SRV-DOC-2026-VCC-001",
    vendor_name: "Eco Drive EV Fleet Services",
    document_type: "E-VOUCHER",
    invoice_number: "INV-EV-2026-8801",
    invoice_date: "2026-09-07",
    status: "INITIATED (FIRST APPROVAL)",
    status_badge_type: "initiated_first",
    amount: 45000
  }
];

export const REFERENCE_DOC_TYPE_FILTERS = [
  { label: "ALL DOCUMENTS", count: 55 },
  { label: "E-VOUCHER", count: 36 },
  { label: "UTILITY & RENT", count: 2 },
  { label: "CASH VOUCHER", count: 1 },
  { label: "AP INVOICE", count: 12 },
  { label: "STAFF & HR EXPENSE", count: 1 },
  { label: "GENERAL RECORDS", count: 1 },
  { label: "PURCHASE INVOICE", count: 1 },
  { label: "CAPEX / FIXED ASSET", count: 1 }
];

export const REFERENCE_STATS = {
  pending: 0,
  hold: 1,
  approved: 5,
  progress: 38,
  rejected: 11,
  totalDoc: 55
};
