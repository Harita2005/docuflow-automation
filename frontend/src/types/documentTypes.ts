export enum DocumentType {
  AP_INVOICE = 'AP INVOICE',
  CUSTOMER_FEEDBACK = 'CUSTOMER FEEDBACK',
  CUSTOMER_COMPLAINT = 'CUSTOMER COMPLAINT',
  CREDIT_NOTE = 'CREDIT NOTE',
}

const DOCUMENT_TYPE_ALIASES: Record<string, DocumentType> = {
  'ap invoice': DocumentType.AP_INVOICE,
  'invoice': DocumentType.AP_INVOICE,
  'invoices': DocumentType.AP_INVOICE,
  'ap_invoice': DocumentType.AP_INVOICE,
  'customer feedback': DocumentType.CUSTOMER_FEEDBACK,
  'feedback': DocumentType.CUSTOMER_FEEDBACK,
  'feedbacks': DocumentType.CUSTOMER_FEEDBACK,
  'customer_feedback': DocumentType.CUSTOMER_FEEDBACK,
  'customer complaint': DocumentType.CUSTOMER_COMPLAINT,
  'complaint': DocumentType.CUSTOMER_COMPLAINT,
  'complaints': DocumentType.CUSTOMER_COMPLAINT,
  'customer_complaint': DocumentType.CUSTOMER_COMPLAINT,
  'credit note': DocumentType.CREDIT_NOTE,
  'credit_note': DocumentType.CREDIT_NOTE,
  'creditnote': DocumentType.CREDIT_NOTE,
};

export function normalizeDocumentType(rawType?: string | null): string {
  if (!rawType) return '';
  const cleaned = rawType.trim().toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
  return DOCUMENT_TYPE_ALIASES[cleaned] || rawType.trim().toUpperCase();
}

export function isFeedbackOrComplaint(rawType?: string | null): boolean {
  const norm = normalizeDocumentType(rawType);
  return norm === DocumentType.CUSTOMER_FEEDBACK || norm === DocumentType.CUSTOMER_COMPLAINT;
}
