export interface InvoiceLineItem {
  description: string;
  quantity?: number;
  unit_price?: number;
  amount: number;
  warranty_text?: string;
  serial_numbers?: string[];
}

export interface DbInvoice {
  id: string;
  tracking_id?: string;
  document_type?: string;
  invoice_number: string;
  vendor_name: string;
  invoice_date: string;
  po_number: string;
  amount: number;
  currency: string;
  status: string;
  is_exception?: boolean;
  exception_reason?: string | null;
  created_at: string;
  
  // OCR metadata
  file_name: string;
  file_size: number;
  mime_type: string;
  file_path: string;
  ocr_confidence: number;
  ocr_text: string;
  tax_details: string;
  ocr_layout?: {
    lineText: string;
    confidence: number;
    bbox: number[]; // [x, y, w, h]
  }[];
  custom_data?: any;

  // Extended structured fields (CGST, SGST, IGST, and itemized materials list)
  cgst?: number;
  sgst?: number;
  igst?: number;
  items?: InvoiceLineItem[];
  
  // Relations
  workflowInst?: {
    current_stage?: string;
    current_stage_index?: number;
    [key: string]: any;
  };
  activeApprovalLog?: {
    id: string;
    workflow_profile: string;
    current_stage_number: number;
    status: string;
    last_updated: string;
  };
  is_current_approver?: boolean;
  has_approved?: boolean;
}

export interface DbGoodsReceipt {
  id: string;
  invoice_id: string;
  status: 'Received' | 'Not Received' | 'Waiting';
  confirmed_by: string;
  confirmed_at: string | null;
  remarks: string;
}

export interface DbWorkflow {
  id: string;
  workflow_name: string;
  workflow_json: string; // Serialized React Flow nodes/edges
}

export interface DbWorkflowInstance {
  id: string;
  invoice_id: string;
  current_stage: string;
  status: 'Pending' | 'In Progress' | 'Approved' | 'Rejected';
}

export interface DbApproval {
  id: string;
  workflow_instance_id: string;
  approver: string;
  action: 'Approve' | 'Reject' | 'Request Clarification';
  comments: string;
  timestamp: string;
}

export interface SystemLog {
  id: string;
  invoice_id?: string;
  timestamp: string;
  action: string;
  user: string;
  details: string;
}

export interface RelationalDatabase {
  invoices: DbInvoice[];
  goods_receipts: DbGoodsReceipt[];
  workflows: DbWorkflow[];
  workflow_instances: DbWorkflowInstance[];
  approvals: DbApproval[];
  logs: SystemLog[];
}

export interface SystemStats {
  totalInvoices: number;
  waitingForGRN: number;
  pendingApprovals: number;
  approvedInvoices: number;
  readyForPayment: number;
  paidInvoices: number;
  totalInvoiceAmount: number;
  averageConfidence: number;
}
