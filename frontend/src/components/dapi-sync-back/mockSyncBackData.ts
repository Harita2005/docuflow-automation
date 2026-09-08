import {
  ThirdPartyApplication,
  SyncRule,
  SyncLog,
  SystemFieldOption,
  FieldMapping
} from '../../types/dapiSyncBack';

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

export const INITIAL_APPLICATIONS: ThirdPartyApplication[] = [
  {
    id: 'app-erp-001',
    name: 'ERP System',
    code: 'ERP_001',
    description: 'Enterprise ERP core database for PO and Invoice syncing',
    documentTypes: ['Purchase Order', 'Invoice'],
    status: 'Active',
    syncStatus: 'Enabled',
    approvalEndpoint: 'https://erp.example.com/api/v2/documents/approval',
    rejectionEndpoint: 'https://erp.example.com/api/v2/documents/rejection',
    lastSync: '2026-09-01 08:42 AM',
    rulesCount: 3,
    environment: 'Production'
  },
  {
    id: 'app-proc-002',
    name: 'Procurement Portal',
    code: 'PROC_002',
    description: 'Vendor procurement and bidding management platform',
    documentTypes: ['Purchase Order', 'Contract', 'Goods Receipt'],
    status: 'Active',
    syncStatus: 'Enabled',
    approvalEndpoint: 'https://procurement-portal.internal/api/v1/sync/approved',
    rejectionEndpoint: 'https://procurement-portal.internal/api/v1/sync/rejected',
    lastSync: '2026-09-01 08:15 AM',
    rulesCount: 2,
    environment: 'Production'
  },
  {
    id: 'app-fin-003',
    name: 'Finance System',
    code: 'FIN_003',
    description: 'Corporate ledger & accounts payable processing center',
    documentTypes: ['Contract', 'Invoice'],
    status: 'Inactive',
    syncStatus: 'Disabled',
    approvalEndpoint: 'https://finance.corp.net/gateway/v3/approvals',
    rejectionEndpoint: 'https://finance.corp.net/gateway/v3/rejections',
    lastSync: '2026-08-28 04:30 PM',
    rulesCount: 1,
    environment: 'Staging'
  }
];

export const DEFAULT_FIELD_MAPPINGS: FieldMapping[] = [
  { id: 'fm-1', ourField: 'Primary Key', thirdPartyField: 'documentId', description: 'Maps system internal key' },
  { id: 'fm-2', ourField: 'Document Number', thirdPartyField: 'docNumber', description: 'Maps document tracking ID' },
  { id: 'fm-3', ourField: 'Approval Status', thirdPartyField: 'status', description: 'Maps final decision string' },
  { id: 'fm-4', ourField: 'Rejection Reason', thirdPartyField: 'rejectionReason', description: 'Maps rejection notes' },
  { id: 'fm-5', ourField: 'Approved By', thirdPartyField: 'approvedBy', description: 'Maps approver identity' },
  { id: 'fm-6', ourField: 'Company', thirdPartyField: 'companyCode', description: 'Maps company identifier' }
];

export const INITIAL_RULES: SyncRule[] = [
  {
    id: 'rule-po-erp-approval',
    applicationId: 'app-erp-001',
    applicationName: 'ERP System',
    ruleName: 'PO Approval & Compliance Sync Rule',
    documentType: 'Purchase Order',
    priority: 1,
    status: 'Active',
    currentVersion: 3,
    versions: [
      {
        version: 3,
        status: 'Active',
        createdAt: '2026-08-20 10:00 AM',
        createdBy: 'admin@docuflow.com',
        changeLog: 'Added Attachment Status = Complete requirement and updated payload mapping.',
        conditionsCount: 3
      },
      {
        version: 2,
        status: 'Archived',
        createdAt: '2026-07-15 02:30 PM',
        createdBy: 'admin@docuflow.com',
        changeLog: 'Updated endpoint URL from v1 to v2.',
        conditionsCount: 2
      },
      {
        version: 1,
        status: 'Archived',
        createdAt: '2026-06-01 09:12 AM',
        createdBy: 'setup_bot',
        changeLog: 'Initial rule draft creation.',
        conditionsCount: 1
      }
    ],
    conditions: [
      { id: 'c-1', field: 'Approval Status', operator: 'Equals', value: 'Approved', logicalOperator: 'AND' },
      { id: 'c-2', field: 'Attachment Status', operator: 'Equals', value: 'Complete', logicalOperator: 'AND' },
      { id: 'c-3', field: 'IA Approval', operator: 'Equals', value: 'Approved' }
    ],
    approvedAction: {
      method: 'POST',
      url: 'https://erp.example.com/api/v2/documents/approval',
      timeoutMs: 5000,
      retryCount: 3,
      auth: {
        type: 'API Key',
        apiKeyHeader: 'X-API-KEY',
        apiKeyValue: 'erp_secret_prod_998127394812'
      },
      headers: [
        { id: 'h-1', key: 'Content-Type', value: 'application/json' },
        { id: 'h-2', key: 'X-Client-Source', value: 'DocuFlow-DAPI-Sync' }
      ],
      requestBodyTemplate: JSON.stringify({
        primaryKey: '{{document.primaryKey}}',
        documentNumber: '{{document.documentNumber}}',
        status: '{{decision.status}}',
        approvedBy: '{{decision.approvedBy}}',
        company: '{{document.company}}'
      }, null, 2)
    },
    rejectedAction: {
      method: 'POST',
      url: 'https://erp.example.com/api/v2/documents/rejection',
      timeoutMs: 5000,
      retryCount: 3,
      auth: {
        type: 'API Key',
        apiKeyHeader: 'X-API-KEY',
        apiKeyValue: 'erp_secret_prod_998127394812'
      },
      headers: [
        { id: 'hr-1', key: 'Content-Type', value: 'application/json' }
      ],
      requestBodyTemplate: JSON.stringify({
        primaryKey: '{{document.primaryKey}}',
        documentNumber: '{{document.documentNumber}}',
        status: '{{decision.status}}',
        reason: '{{decision.rejectionReason}}',
        rejectedBy: '{{decision.rejectedBy}}'
      }, null, 2)
    },
    payloadMappings: [...DEFAULT_FIELD_MAPPINGS],
    lastModified: '2026-08-20 10:00 AM'
  },
  {
    id: 'rule-inv-proc-sync',
    applicationId: 'app-proc-002',
    applicationName: 'Procurement Portal',
    ruleName: 'Invoice Direct Procurement Sync',
    documentType: 'Invoice',
    priority: 2,
    status: 'Active',
    currentVersion: 1,
    versions: [
      {
        version: 1,
        status: 'Active',
        createdAt: '2026-08-10 11:45 AM',
        createdBy: 'settings_editor',
        changeLog: 'Initial release of procurement invoice sync rule.',
        conditionsCount: 2
      }
    ],
    conditions: [
      { id: 'c-10', field: 'Approval Status', operator: 'Equals', value: 'Approved', logicalOperator: 'AND' },
      { id: 'c-11', field: 'Checklist Status', operator: 'Equals', value: 'Complete' }
    ],
    approvedAction: {
      method: 'PUT',
      url: 'https://procurement-portal.internal/api/v1/sync/approved',
      timeoutMs: 10000,
      retryCount: 2,
      auth: {
        type: 'Bearer Token',
        bearerToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.procurement_token_991'
      },
      headers: [
        { id: 'h-10', key: 'Content-Type', value: 'application/json' }
      ],
      requestBodyTemplate: JSON.stringify({
        documentId: '{{document.primaryKey}}',
        docNumber: '{{document.documentNumber}}',
        status: '{{decision.status}}',
        approvedBy: '{{decision.approvedBy}}'
      }, null, 2)
    },
    rejectedAction: {
      method: 'POST',
      url: 'https://procurement-portal.internal/api/v1/sync/rejected',
      timeoutMs: 10000,
      retryCount: 2,
      auth: {
        type: 'Bearer Token',
        bearerToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.procurement_token_991'
      },
      headers: [
        { id: 'h-11', key: 'Content-Type', value: 'application/json' }
      ],
      requestBodyTemplate: JSON.stringify({
        documentId: '{{document.primaryKey}}',
        docNumber: '{{document.documentNumber}}',
        status: '{{decision.status}}',
        reason: '{{decision.rejectionReason}}'
      }, null, 2)
    },
    payloadMappings: DEFAULT_FIELD_MAPPINGS.slice(0, 4),
    lastModified: '2026-08-10 11:45 AM'
  },
  {
    id: 'rule-contract-fin-sync',
    applicationId: 'app-fin-003',
    applicationName: 'Finance System',
    ruleName: 'Contract Financial Approval Sync',
    documentType: 'Contract',
    priority: 3,
    status: 'Disabled',
    currentVersion: 2,
    versions: [
      {
        version: 2,
        status: 'Active',
        createdAt: '2026-08-01 09:00 AM',
        createdBy: 'admin@docuflow.com',
        changeLog: 'Disabled pending endpoint security patch.',
        conditionsCount: 1
      }
    ],
    conditions: [
      { id: 'c-20', field: 'Approval Status', operator: 'Equals', value: 'Approved' }
    ],
    approvedAction: {
      method: 'POST',
      url: 'https://finance.corp.net/gateway/v3/approvals',
      timeoutMs: 8000,
      retryCount: 3,
      auth: {
        type: 'Basic Authentication',
        basicUsername: 'fin_admin',
        basicPassword: 'Password123!'
      },
      headers: [
        { id: 'h-20', key: 'Content-Type', value: 'application/json' }
      ],
      requestBodyTemplate: JSON.stringify({
        primaryKey: '{{document.primaryKey}}',
        status: '{{decision.status}}'
      }, null, 2)
    },
    rejectedAction: {
      method: 'POST',
      url: 'https://finance.corp.net/gateway/v3/rejections',
      timeoutMs: 8000,
      retryCount: 3,
      auth: {
        type: 'Basic Authentication',
        basicUsername: 'fin_admin',
        basicPassword: 'Password123!'
      },
      headers: [
        { id: 'h-21', key: 'Content-Type', value: 'application/json' }
      ],
      requestBodyTemplate: JSON.stringify({
        primaryKey: '{{document.primaryKey}}',
        status: '{{decision.status}}',
        reason: '{{decision.rejectionReason}}'
      }, null, 2)
    },
    payloadMappings: DEFAULT_FIELD_MAPPINGS.slice(0, 3),
    lastModified: '2026-08-01 09:00 AM'
  }
];

export const INITIAL_SYNC_LOGS: SyncLog[] = [
  {
    id: 'log-1001',
    timestamp: '2026-09-01 08:42:10 AM',
    applicationId: 'app-erp-001',
    applicationName: 'ERP System',
    documentNumber: 'PO-100245',
    primaryKey: '984734',
    documentType: 'Purchase Order',
    decision: 'APPROVED',
    endpoint: 'https://erp.example.com/api/v2/documents/approval',
    httpMethod: 'POST',
    httpStatus: 200,
    syncStatus: 'Success',
    retryCount: 0,
    maxRetries: 3,
    idempotencyKey: 'PO-100245-APPROVED-v1',
    ruleId: 'rule-po-erp-approval',
    ruleName: 'PO Approval & Compliance Sync Rule',
    conditionSummary: 'Approval Status = Approved AND Attachment Status = Complete AND IA Approval = Approved',
    requestHeaders: {
      'Content-Type': 'application/json',
      'X-API-KEY': '••••••••••••',
      'X-Client-Source': 'DocuFlow-DAPI-Sync'
    },
    requestBody: {
      primaryKey: '984734',
      documentNumber: 'PO-100245',
      status: 'APPROVED',
      approvedBy: 'senior_approver@docuflow.com',
      company: 'DocuFlow Global Tech'
    },
    responseBody: {
      success: true,
      transactionId: 'ERP-TXN-994821',
      syncedAt: '2026-09-01T08:42:10Z'
    },
    responseTimeMs: 245,
    retryHistory: [
      { attempt: 1, timestamp: '2026-09-01 08:42:10 AM', status: 'Success', httpStatus: 200, responseTimeMs: 245 }
    ]
  },
  {
    id: 'log-1002',
    timestamp: '2026-09-01 08:35:44 AM',
    applicationId: 'app-proc-002',
    applicationName: 'Procurement Portal',
    documentNumber: 'INV-88912',
    primaryKey: '984735',
    documentType: 'Invoice',
    decision: 'REJECTED',
    endpoint: 'https://procurement-portal.internal/api/v1/sync/rejected',
    httpMethod: 'POST',
    httpStatus: 200,
    syncStatus: 'Success',
    retryCount: 1,
    maxRetries: 2,
    idempotencyKey: 'INV-88912-REJECTED-v1',
    ruleId: 'rule-inv-proc-sync',
    ruleName: 'Invoice Direct Procurement Sync',
    conditionSummary: 'Approval Status != Approved',
    requestHeaders: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ••••••••••••'
    },
    requestBody: {
      documentId: '984735',
      docNumber: 'INV-88912',
      status: 'REJECTED',
      rejectionReason: 'Unit price mismatch with PO line item #2'
    },
    responseBody: {
      acknowledged: true,
      procurementRecordState: 'DISPUTED'
    },
    responseTimeMs: 312,
    retryHistory: [
      { attempt: 1, timestamp: '2026-09-01 08:35:30 AM', status: 'Failed', httpStatus: 504, errorReason: 'Gateway Timeout (504)', responseTimeMs: 5000 },
      { attempt: 2, timestamp: '2026-09-01 08:35:44 AM', status: 'Success', httpStatus: 200, responseTimeMs: 312 }
    ]
  },
  {
    id: 'log-1003',
    timestamp: '2026-09-01 08:12:01 AM',
    applicationId: 'app-erp-001',
    applicationName: 'ERP System',
    documentNumber: 'PO-100248',
    primaryKey: '984740',
    documentType: 'Purchase Order',
    decision: 'APPROVED',
    endpoint: 'https://erp.example.com/api/v2/documents/approval',
    httpMethod: 'POST',
    httpStatus: 500,
    syncStatus: 'Failed',
    retryCount: 3,
    maxRetries: 3,
    idempotencyKey: 'PO-100248-APPROVED-v1',
    ruleId: 'rule-po-erp-approval',
    ruleName: 'PO Approval & Compliance Sync Rule',
    conditionSummary: 'Approval Status = Approved AND Attachment Status = Complete',
    requestHeaders: {
      'Content-Type': 'application/json',
      'X-API-KEY': '••••••••••••'
    },
    requestBody: {
      primaryKey: '984740',
      documentNumber: 'PO-100248',
      status: 'APPROVED',
      approvedBy: 'manager@docuflow.com',
      company: 'DocuFlow Global Tech'
    },
    responseBody: {
      error: 'Internal Server Error',
      message: 'Target ERP database connection pool exhausted.'
    },
    responseTimeMs: 1420,
    retryHistory: [
      { attempt: 1, timestamp: '2026-09-01 08:10:00 AM', status: 'Failed', httpStatus: 500, errorReason: 'HTTP 500 Server Error', responseTimeMs: 1200 },
      { attempt: 2, timestamp: '2026-09-01 08:11:00 AM', status: 'Failed', httpStatus: 500, errorReason: 'HTTP 500 Server Error', responseTimeMs: 1350 },
      { attempt: 3, timestamp: '2026-09-01 08:12:01 AM', status: 'Failed', httpStatus: 500, errorReason: 'HTTP 500 Server Error', responseTimeMs: 1420 }
    ]
  },
  {
    id: 'log-1004',
    timestamp: '2026-09-01 08:48:30 AM',
    applicationId: 'app-proc-002',
    applicationName: 'Procurement Portal',
    documentNumber: 'PO-100255',
    primaryKey: '984752',
    documentType: 'Purchase Order',
    decision: 'APPROVED',
    endpoint: 'https://procurement-portal.internal/api/v1/sync/approved',
    httpMethod: 'PUT',
    httpStatus: 102,
    syncStatus: 'Pending',
    retryCount: 0,
    maxRetries: 2,
    idempotencyKey: 'PO-100255-APPROVED-v1',
    ruleId: 'rule-inv-proc-sync',
    ruleName: 'Invoice Direct Procurement Sync',
    conditionSummary: 'Approval Status = Approved',
    requestHeaders: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ••••••••••••'
    },
    requestBody: {
      documentId: '984752',
      docNumber: 'PO-100255',
      status: 'APPROVED'
    },
    responseBody: {
      status: 'Processing in back-off queue'
    },
    responseTimeMs: 85,
    retryHistory: []
  },
  {
    id: 'log-1005',
    timestamp: '2026-09-01 08:49:15 AM',
    applicationId: 'app-erp-001',
    applicationName: 'ERP System',
    documentNumber: 'PO-100260',
    primaryKey: '984760',
    documentType: 'Purchase Order',
    decision: 'REJECTED',
    endpoint: 'https://erp.example.com/api/v2/documents/rejection',
    httpMethod: 'POST',
    httpStatus: 0,
    syncStatus: 'Retrying',
    retryCount: 1,
    maxRetries: 3,
    idempotencyKey: 'PO-100260-REJECTED-v1',
    ruleId: 'rule-po-erp-approval',
    ruleName: 'PO Approval & Compliance Sync Rule',
    conditionSummary: 'Approval Status = Rejected',
    requestHeaders: {
      'Content-Type': 'application/json',
      'X-API-KEY': '••••••••••••'
    },
    requestBody: {
      primaryKey: '984760',
      documentNumber: 'PO-100260',
      status: 'REJECTED',
      reason: 'Expired GRN verification window'
    },
    responseBody: {
      error: 'Network Timeout'
    },
    responseTimeMs: 5000,
    retryHistory: [
      { attempt: 1, timestamp: '2026-09-01 08:49:15 AM', status: 'Failed', httpStatus: 0, errorReason: 'Network Timeout after 5000ms', responseTimeMs: 5000 }
    ]
  }
];
