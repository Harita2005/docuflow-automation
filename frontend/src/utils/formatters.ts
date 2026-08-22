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
 * Formats an ISO date string or Date object into a readable date string.
 * @param dateStr ISO date string or Date object
 * @returns Formatted date, e.g. "09 Aug 2026"
 */
export function formatDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

/**
 * Formats an ISO date string into date + time.
 * @param dateStr ISO date string or Date object
 * @returns Formatted date-time, e.g. "09 Aug 2026, 08:30 AM"
 */
export function formatDateTime(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

/**
 * Returns a standardized document prefix based on document type and category.
 * e.g. "AP INVOICE" -> "INV", "CASH VOUCHER" -> "CV", "E-VOUCHER" -> "EV", etc.
 */
export function getDocTypePrefix(docType?: string, category?: string): string {
  const combined = `${docType || ""} ${category || ""}`.trim().toUpperCase();

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
  if (combined.includes("INVOICE") || combined.includes("AP") || combined.includes("TAX")) {
    return "INV";
  }
  if (combined.includes("VOUCHER")) {
    return "VOUCH";
  }
  // Default prefix for all standard records/invoices
  return "INV";
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
  const cleanNum = raw.replace(/^(DOC|INV|CV|EV|JV|ADV|CAPEX|GRN|SRV|FRT|UTL|EXP|DN|CN|PRJ|NR|VOUCH)[-_#]?/i, "").trim();
  const prefix = getDocTypePrefix(docType, category);

  return cleanNum ? `${prefix}-${cleanNum}` : `${prefix}-${raw}`;
}

