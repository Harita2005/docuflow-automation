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
