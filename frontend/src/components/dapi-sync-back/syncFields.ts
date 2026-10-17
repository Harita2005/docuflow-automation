import { SystemFieldOption, FieldMapping } from '../../types/dapiSyncBack';

/**
 * Standard DocuFlow Data Schema Fields available for Third-Party API Payload Mapping
 */
export const SYSTEM_FIELDS: SystemFieldOption[] = [
  { key: 'Primary Key', label: 'Primary Key', example: '984734', description: 'Internal document record ID' },
  { key: 'Document Number', label: 'Document Number', example: 'PO-100245', description: 'Invoice or Purchase Order number' },
  { key: 'Document Type', label: 'Document Type', example: 'Purchase Order', description: 'Type of incoming document' },
  { key: 'Approval Status', label: 'Approval Status', example: 'Approved', description: 'Final decision status' },
  { key: 'Rejection Reason', label: 'Rejection Reason', example: 'Budget threshold exceeded', description: 'Reason if decision is Rejected' },
  { key: 'Approval Date', label: 'Approval Date', example: '2026-09-01T08:30:00Z', description: 'ISO Timestamp of approval' },
  { key: 'Rejected Date', label: 'Rejected Date', example: '2026-09-01T08:30:00Z', description: 'ISO Timestamp of rejection' },
  { key: 'Approved By', label: 'Approved By', example: 'admin@docuflow.com', description: 'User email or username' },
  { key: 'Rejected By', label: 'Rejected By', example: 'manager@docuflow.com', description: 'User who rejected document' },
  { key: 'Company', label: 'Company', example: 'DocuFlow Global Tech', description: 'Company entity name' },
  { key: 'Branch', label: 'Branch', example: 'Bangalore HQ', description: 'Operating branch office' },
  { key: 'Cost Center', label: 'Cost Center', example: 'CC-FIN-901', description: 'Internal cost center code' },
  { key: 'Pay Mode', label: 'Pay Mode', example: 'NEFT / RTGS', description: 'Disbursement mode' },
  { key: 'IA Approval', label: 'IA Approval', example: 'Approved', description: 'Internal Audit approval stage' },
  { key: 'Checklist Status', label: 'Checklist Status', example: 'Complete', description: 'Verification checklist completion' },
  { key: 'Attachment Status', label: 'Attachment Status', example: 'Complete', description: 'Required tax documents status' },
];

export const DEFAULT_FIELD_MAPPINGS: FieldMapping[] = [
  { id: 'fm-1', ourField: 'Primary Key', thirdPartyField: 'documentId', description: 'Maps system internal key' },
  { id: 'fm-2', ourField: 'Document Number', thirdPartyField: 'docNumber', description: 'Maps document tracking ID' },
  { id: 'fm-3', ourField: 'Approval Status', thirdPartyField: 'status', description: 'Maps final decision string' },
  { id: 'fm-4', ourField: 'Rejection Reason', thirdPartyField: 'rejectionReason', description: 'Maps rejection notes' },
  { id: 'fm-5', ourField: 'Approved By', thirdPartyField: 'approvedBy', description: 'Maps approver identity' },
  { id: 'fm-6', ourField: 'Company', thirdPartyField: 'companyCode', description: 'Maps company identifier' }
];
