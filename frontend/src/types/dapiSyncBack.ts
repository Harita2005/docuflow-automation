export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type AuthType = 'None' | 'API Key' | 'Bearer Token' | 'Basic Authentication' | 'OAuth 2.0';

export interface HeaderConfig {
  id: string;
  key: string;
  value: string;
  masked?: boolean;
}

export interface AuthConfig {
  type: AuthType;
  apiKeyHeader?: string;
  apiKeyValue?: string;
  bearerToken?: string;
  basicUsername?: string;
  basicPassword?: string;
  oauthClientId?: string;
  oauthClientSecret?: string;
  oauthTokenUrl?: string;
  oauthScope?: string;
  oauthGrantType?: string;
}

export interface EndpointConfig {
  method: HttpMethod;
  url: string;
  timeoutMs: number;
  retryCount: number;
  auth: AuthConfig;
  headers: HeaderConfig[];
  requestBodyTemplate: string;
}

export type ConditionField = string;

export type ConditionOperator =
  | 'Equals'
  | 'Not Equals'
  | 'Contains'
  | 'Does Not Contain'
  | 'Greater Than'
  | 'Less Than'
  | 'Greater Than or Equal'
  | 'Less Than or Equal'
  | 'Is Empty'
  | 'Is Not Empty';

export interface Condition {
  id: string;
  field: ConditionField;
  operator: ConditionOperator;
  value: string;
  logicalOperator?: 'AND' | 'OR';
}

export interface FieldMapping {
  id: string;
  ourField: string;
  thirdPartyField: string;
  description?: string;
}

export interface RuleVersion {
  version: number;
  status: 'Active' | 'Archived' | 'Draft';
  createdAt: string;
  createdBy: string;
  changeLog: string;
  conditionsCount: number;
}

export interface SyncRule {
  id: string;
  applicationId: string;
  applicationName: string;
  ruleName: string;
  documentType: string;
  priority: number;
  status: 'Active' | 'Draft' | 'Disabled';
  currentVersion: number;
  versions: RuleVersion[];
  conditions: Condition[];
  approvedAction: EndpointConfig;
  rejectedAction: EndpointConfig;
  payloadMappings: FieldMapping[];
  lastModified?: string;
}

export interface ThirdPartyApplication {
  id: string;
  name: string;
  code: string;
  description: string;
  documentTypes: string[];
  status: 'Active' | 'Inactive';
  syncStatus: 'Enabled' | 'Disabled';
  approvalEndpoint: string;
  rejectionEndpoint: string;
  lastSync?: string;
  rulesCount?: number;
  environment?: string;
}

export type SyncLogStatus = 'Success' | 'Pending' | 'Retrying' | 'Failed';

export interface RetryAttempt {
  attempt: number;
  timestamp: string;
  status: 'Success' | 'Failed';
  httpStatus?: number;
  errorReason?: string;
  responseTimeMs?: number;
}

export interface SyncLog {
  id: string;
  timestamp: string;
  applicationId: string;
  applicationName: string;
  documentNumber: string;
  primaryKey: string;
  documentType: string;
  decision: 'APPROVED' | 'REJECTED';
  endpoint: string;
  httpMethod: HttpMethod;
  httpStatus: number;
  syncStatus: SyncLogStatus;
  retryCount: number;
  maxRetries: number;
  idempotencyKey: string;
  ruleId: string;
  ruleName: string;
  conditionSummary: string;
  requestHeaders: Record<string, string>;
  requestBody: Record<string, any>;
  responseBody: Record<string, any>;
  responseTimeMs: number;
  retryHistory: RetryAttempt[];
}

export interface SystemFieldOption {
  key: string;
  label: string;
  example: string;
  description: string;
}
