# DOCUFLOW AUTOMATION SYSTEM — ROLE & PERMISSION ACCESS MATRIX
**Document Version:** 2.4.0  
**Target Audience:** Security Administrators, IT Compliance, System Architects  
**Classification:** Security Architecture Reference  

---

## 1. OVERVIEW & ACCESS ARCHITECTURE

DocuFlow enforces dual-layer RBAC:
1. **Frontend Navigation Guard:** Sidebar menu items and page routes are filtered against user permissions.
2. **Backend API Guard:** Every REST endpoint verifies JWT bearer token scopes and role clearances via `check_permission()` dependencies.

---

## 2. ROLE & PERMISSION MATRIX

| Page / Feature | Permission Key | Admin | AP Executive | Finance Manager | Exec Approver | Employee | Feedback Agent |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Dashboard** | `dashboard` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Work Tracker** | `work-tracker` | ✓ (All) | ✓ (Assigned) | ✓ (Assigned) | ✓ (Assigned) | ✓ (Own) | ✗ |
| **Approved Docs** | `approved-documents` | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| **Upload Document** | `upload` | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| **Customer Feedback**| `customer-feedback` | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ |
| **Workflow Rules** | `workflow-rules` | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Control Settings** | `admin` | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **User Management** | `admin:users` | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **RBAC Clearance** | `admin:rbac` | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Signed Audit Log** | `audit:read` | ✓ | ✓ (View) | ✓ (View) | ✓ (View) | ✗ | ✗ |

---

## 3. PERMISSION CATALOGUE REFERENCE

```
DOC MODULE:
  • doc:dashboard          - Read dashboard KPI counters
  • doc:work_tracker       - View and process assigned work queue
  • doc:approved_docs      - View settled invoice archives
  • doc:upload             - Ingest single and batch invoice PDFs
  • doc:detail             - Inspect invoice fields and checklists

WORKFLOW MODULE:
  • workflow:routing       - Configure Routing Condition Builder rules
  • workflow:matrix        - Design Flow Builder approval profiles
  • workflow:checklists    - Build Universal Checklist rules

ADMIN MODULE:
  • admin:users            - Create, edit, and deactivate user logins
  • admin:rbac             - Configure Role Clearance Matrix and permissions
  • admin:audit            - Inspect tamper-evident audit logs
  • admin:backups          - Export system snapshots and data backups

FEEDBACK MODULE:
  • feedback:view          - Access Customer Feedback Hub
  • feedback:action        - Sign off complaint stages and handover assignment
```
