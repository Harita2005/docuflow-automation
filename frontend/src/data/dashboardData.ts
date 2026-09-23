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

export const REFERENCE_DOCUMENTS: ReferenceDocument[] = [];
export const REFERENCE_DOC_TYPE_FILTERS: { label: string; count: number }[] = [];
export const REFERENCE_STATS = {
  pending: 0,
  hold: 0,
  approved: 0,
  progress: 0,
  rejected: 0,
  totalDoc: 0
};
