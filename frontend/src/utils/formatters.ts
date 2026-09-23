/**
 * DocuFlow Shared Formatting Utilities
 */

/**
 * Formats a numeric value as Indian Rupee (INR) currency.
 * @param amount Number or string amount
 * @param maximumFractionDigits Number of fraction digits (default: 0)
 * @returns Formatted currency string, e.g. "₹1,25,000"
 */
export function formatCurrencyINR(amount: number | string | null | undefined, maximumFractionDigits: number = 0): string {
  if (amount === null || amount === undefined || isNaN(Number(amount))) {
    return "₹0";
  }
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits
  }).format(Number(amount));
}

/**
 * Safely parses any date string from the backend. If it is naive (e.g. "2026-08-25T04:47:00"),
 * appends "Z" so it is correctly recognized as UTC and converted to the user's local timezone (IST).
 */
export function parseUTCDate(dateStr: string | Date | null | undefined): Date | null {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return isNaN(dateStr.getTime()) ? null : dateStr;
  let s = String(dateStr).trim();
  if (!s) return null;
  // If string has date + time (T or space) without timezone offset (no Z, no +, no - in time portion), append Z
  if (/^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) {
    s = s.replace(' ', 'T') + 'Z';
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Formats an ISO date string or Date object into a readable date string.
 * @param dateStr ISO date string or Date object
 * @returns Formatted date, e.g. "25 Aug 2026"
 */
export function formatDate(dateStr: string | Date | null | undefined): string {
  const date = parseUTCDate(dateStr);
  if (!date) return "-";
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

/**
 * Formats an ISO date string into date + time (e.g. "25/08/26, 10:17 am").
 * @param dateStr ISO date string or Date object
 * @returns Formatted date-time
 */
export function formatDateTime(dateStr: string | Date | null | undefined): string {
  const date = parseUTCDate(dateStr);
  if (!date) return "-";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
}

/**
 * Formats an ISO date string into time only (e.g. "10:17 am").
 */
export function formatTimeOnly(dateStr: string | Date | null | undefined): string {
  const date = parseUTCDate(dateStr);
  if (!date) return "-";
  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
}

/**
 * Standardizes and extracts the canonical document type from a document payload object or document_type string.
 * Resolves fields like document_type, Document_type, trans_type, doc_type, custom_data, etc.
 * Normalizes case and spacing so "AP INVOICE", "AP Invoice", and "ap invoice" resolve to the same canonical type ("AP INVOICE").
 */
export function getCanonicalDocumentType(docOrType?: any): string {
  if (!docOrType) return "GENERAL RECORDS";

  let candidates: (string | undefined | null)[] = [];

  if (typeof docOrType === "string") {
    candidates = [docOrType];
  } else if (typeof docOrType === "object") {
    candidates = [
      docOrType.document_type,
      docOrType.Document_type,
      docOrType.trans_type,
      docOrType.doc_type,
      docOrType.custom_data?.document_type,
      docOrType.custom_data?.Document_type,
      docOrType.custom_data?.trans_type,
      docOrType.custom_data?.doc_type,
      docOrType.category,
    ];
  }

  const normalizeString = (raw: string): string => {
    const cleaned = raw.trim().replace(/\s+/g, " ");
    const upper = cleaned.toUpperCase().replace(/_/g, " ");
    if (upper === "CUSTOMER FEEDBACK" || upper === "FEEDBACK" || upper === "CUSTOMER COMPLAINT" || upper.includes("COMPLAINT")) {
      return "CUSTOMER FEEDBACK";
    }
    if (upper === "INVOICE" || upper === "TAX INVOICE" || upper === "AP INVOICE" || upper === "AP_INVOICE" || upper === "STANDARD INVOICE") {
      return "AP INVOICE";
    }
    if (upper === "PURCHASE ORDER" || upper === "PO") {
      return "PURCHASE ORDER";
    }
    if (upper === "CASH VOUCHER" || upper === "PETTY CASH") {
      return "CASH VOUCHER";
    }
    if (upper === "E VOUCHER" || upper === "EVOUCHER" || upper === "E-VOUCHER") {
      return "E-VOUCHER";
    }
    if (upper === "JOURNAL VOUCHER" || upper === "JV") {
      return "JOURNAL VOUCHER";
    }
    if (upper === "CREDIT NOTE" || upper === "CREDIT") {
      return "CREDIT NOTE";
    }
    if (upper === "DEBIT NOTE" || upper === "DEBIT") {
      return "DEBIT NOTE";
    }
    if (upper.includes("STAFF") || upper.includes("HR EXPENSE") || upper === "EXPENSE") {
      return "STAFF & HR EXPENSE";
    }
    if (upper.includes("UTILITY") || upper.includes("RENT")) {
      return "UTILITY & RENT";
    }
    if (upper.includes("GOODS RECEIPT") || upper === "GRN") {
      return "GOODS RECEIPT";
    }
    if (upper.includes("CAPEX") || upper.includes("FIXED ASSET")) {
      return "CAPEX";
    }
    if (upper === "GENERAL RECORDS" || upper === "GENERAL RECORD" || upper === "RECORD") {
      return "GENERAL RECORDS";
    }
    return upper;
  };

  // 1. Look for specific valid document types first (ignoring "GENERAL RECORDS", nulls, etc.)
  for (const cand of candidates) {
    if (cand && typeof cand === "string") {
      const trimmed = cand.trim();
      if (trimmed && trimmed.toLowerCase() !== "null" && trimmed.toLowerCase() !== "undefined") {
        const norm = normalizeString(trimmed);
        if (norm !== "GENERAL RECORDS") {
          return norm;
        }
      }
    }
  }

  // 2. If no specific type found, check if any candidate resolves to GENERAL RECORDS
  for (const cand of candidates) {
    if (cand && typeof cand === "string") {
      const trimmed = cand.trim();
      if (trimmed && trimmed.toLowerCase() !== "null" && trimmed.toLowerCase() !== "undefined") {
        return normalizeString(trimmed);
      }
    }
  }

  return "GENERAL RECORDS";
}

/**
 * Formats a canonical document type into a user-friendly Title Case string for UI display.
 * e.g. "AP INVOICE" -> "AP Invoice", "PURCHASE ORDER" -> "Purchase Order"
 */
export function formatDocumentTypeDisplay(docOrType?: any): string {
  const canonical = getCanonicalDocumentType(docOrType);

  const knownMap: Record<string, string> = {
    "AP INVOICE": "AP Invoice",
    "PURCHASE ORDER": "Purchase Order",
    "CASH VOUCHER": "Cash Voucher",
    "E-VOUCHER": "E-Voucher",
    "JOURNAL VOUCHER": "Journal Voucher",
    "CREDIT NOTE": "Credit Note",
    "DEBIT NOTE": "Debit Note",
    "STAFF & HR EXPENSE": "Staff & HR Expense",
    "UTILITY & RENT": "Utility & Rent",
    "GOODS RECEIPT": "Goods Receipt",
    "CAPEX": "Capex",
    "CUSTOMER COMPLAINT": "Customer Complaint",
    "CUSTOMER FEEDBACK": "Customer Feedback",
    "GENERAL RECORDS": "General Records",
  };

  if (knownMap[canonical]) {
    return knownMap[canonical];
  }

  // Title case fallback for custom/unmapped document types
  return canonical
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Returns a standardized document prefix based on document type and category.
 * e.g. "AP INVOICE" -> "INV", "CASH VOUCHER" -> "CV", "E-VOUCHER" -> "EV", etc.
 */
export function getDocTypePrefix(docType?: string | any, category?: string): string {
  const canonical = getCanonicalDocumentType(docType);
  const combined = `${canonical} ${category || ""}`.trim().toUpperCase();

  if (combined.includes("CASH VOUCHER") || combined.includes("CASH") || combined.includes("PETTY")) {
    return "CV";
  }
  if (combined.includes("E-VOUCHER") || combined.includes("EVOUCHER")) {
    return "EV";
  }
  if (combined.includes("JOURNAL") || combined.includes("JRNL")) {
    return "JV";
  }
  if (combined.includes("ADVANCE")) {
    return "ADV";
  }
  if (combined.includes("CAPEX") || combined.includes("FIXED ASSET") || combined.includes("ASSET") || combined.includes("MACHINERY")) {
    return "CAPEX";
  }
  if (combined.includes("GRN") || combined.includes("GOODS")) {
    return "GRN";
  }
  if (combined.includes("SERVICE") || combined.includes("MAINTENANCE") || combined.includes("REPAIR")) {
    return "SRV";
  }
  if (combined.includes("FREIGHT") || combined.includes("LOGISTICS") || combined.includes("TRANSPORT") || combined.includes("COURIER")) {
    return "FRT";
  }
  if (combined.includes("UTILITY") || combined.includes("RENT") || combined.includes("ELECTRICITY") || combined.includes("POWER")) {
    return "UTL";
  }
  if (combined.includes("STAFF") || combined.includes("HR") || combined.includes("EXPENSE") || combined.includes("TRAVEL") || combined.includes("WELFARE") || combined.includes("SALARY")) {
    return "EXP";
  }
  if (combined.includes("DEBIT")) {
    return "DN";
  }
  if (combined.includes("CREDIT")) {
    return "CN";
  }
  if (combined.includes("PROJECT") || combined.includes("BUDGET")) {
    return "PRJ";
  }
  if (combined.includes("NON - RETURNABLE") || combined.includes("NON-RETURNABLE")) {
    return "NR";
  }
  if (combined.includes("CUSTOMER COMPLAINT") || combined.includes("COMPLAINT") || combined.includes("FEEDBACK")) {
    return "CMP";
  }
  if (combined.includes("PURCHASE ORDER") || combined === "PO" || combined.startsWith("PO ") || combined.endsWith(" PO") || combined.includes(" PO ")) {
    return "PO";
  }
  if (combined.includes("GENERAL") || combined.includes("RECORD")) {
    return "DOC";
  }
  if (combined.includes("INVOICE") || combined.includes("AP") || combined.includes("TAX")) {
    return "INV";
  }
  if (combined.includes("VOUCHER")) {
    return "VOUCH";
  }
  // Default prefix for standard records
  return "DOC";
}

/**
 * Formats a document ID with its appropriate prefix based on doc type.
 * e.g. ("DOC-28999", "CASH VOUCHER") -> "CV-28999"
 *      ("DOC-32490", "AP INVOICE") -> "INV-32490"
 */
export function formatDocNumber(id?: string | number, docType?: string, category?: string): string {
  if (!id && id !== 0) return "";
  const raw = String(id).replace(/^#+/, "").replace(/^•+/, "").trim();

  // Strip existing known prefixes or leading symbols
  const cleanNum = raw.replace(/^(DOC|INV|PO|CV|EV|JV|ADV|CAPEX|GRN|SRV|FRT|UTL|EXP|DN|CN|PRJ|NR|VOUCH|CMP)[-_#]?/i, "").trim();
  const prefix = getDocTypePrefix(docType, category);

  return cleanNum ? `${prefix}-${cleanNum}` : `${prefix}-${raw}`;
}

/**
 * Resolves and formats the assigned approver / user for UI display.
 * Checks existing field mappings: assigned_approver, assigned_user, assigned_to, approver_name, etc.
 * Formats usernames, email handles, and role codes into user display names.
 * Displays "Unassigned" if no person/role is assigned.
 */
export function formatAssignedToDisplay(docOrAssigned?: any): string {
  if (!docOrAssigned) return "Unassigned";

  let raw: string | undefined | null = null;

  if (typeof docOrAssigned === "string") {
    raw = docOrAssigned;
  } else if (typeof docOrAssigned === "object") {
    raw =
      docOrAssigned.assigned_approver ||
      docOrAssigned.assigned_user ||
      docOrAssigned.assigned_to ||
      docOrAssigned.approver_name ||
      docOrAssigned.assigned_approver_name ||
      docOrAssigned.assigned_user_name ||
      docOrAssigned.approver ||
      docOrAssigned.assigned_person ||
      docOrAssigned.activeApprovalLog?.assigned_approver ||
      docOrAssigned.activeApprovalLog?.approver_target ||
      docOrAssigned.custom_data?.assigned_approver ||
      docOrAssigned.custom_data?.assigned_user ||
      docOrAssigned.custom_data?.assigned_to;
  }

  if (!raw || typeof raw !== "string") {
    return "Unassigned";
  }

  const cleaned = raw.trim();
  if (
    !cleaned ||
    cleaned.toLowerCase() === "null" ||
    cleaned.toLowerCase() === "undefined" ||
    cleaned.toLowerCase() === "none" ||
    cleaned.toLowerCase() === "unassigned"
  ) {
    return "Unassigned";
  }

  // Handle comma-separated list of assigned users/roles
  const items = cleaned.split(",").map((item) => item.trim()).filter(Boolean);
  if (items.length === 0) return "Unassigned";

  const formatSingleHandle = (handle: string): string => {
    // 1. If it's an email (e.g. john.doe@company.com), format name part
    if (handle.includes("@")) {
      const emailUser = handle.split("@")[0].trim();
      const formattedEmailName = emailUser
        .split(/[._-]+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
      return formattedEmailName || handle;
    }

    // 2. Known role code mappings to clean display names
    const roleDisplayMap: Record<string, string> = {
      admin: "System Admin",
      administrator: "System Admin",
      system_admin: "System Admin",
      superadmin: "System Admin",
      manager: "Operations Manager",
      operations_manager: "Operations Manager",
      gm: "General Manager",
      general_manager: "General Manager",
      jmd: "Joint Managing Director",
      joint_managing_director: "Joint Managing Director",
      md: "Managing Director",
      managing_director: "Managing Director",
      finance_auditor: "Finance Auditor",
      auditor: "Finance Auditor",
      accounting: "Accounts Desk",
      cfo: "CFO Desk",
      employee: "Standard Employee"
    };

    const handleLower = handle.toLowerCase();
    if (roleDisplayMap[handleLower]) {
      return roleDisplayMap[handleLower];
    }

    // 3. Handle snake_case or dot.case e.g. "john_doe" or "john.doe" -> "John Doe"
    if (handle.includes("_") || handle.includes(".")) {
      return handle
        .split(/[._-]+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
    }

    // 4. If all lowercase or all uppercase (>3 chars), make proper Title Case
    if (handle === handle.toLowerCase() || (handle === handle.toUpperCase() && handle.length > 3)) {
      return handle
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
    }

    return handle;
  };

  const formattedItems = items.map(formatSingleHandle);
  return formattedItems.join(", ");
}


