import { describe, it, expect } from 'vitest';
import { getCanonicalDocumentType, formatDocumentTypeDisplay, getDocTypePrefix, formatDocNumber } from './formatters';

describe('Document Type Resolution & Formatting', () => {
  it('resolves AP INVOICE canonical document type from various payload fields', () => {
    // Exact document AP-TEST-001 scenario: document_type = "AP INVOICE", Document_type = "AP INVOICE", trans_type = "AP INVOICE"
    const doc1 = { document_type: "AP INVOICE", Document_type: "AP INVOICE", trans_type: "AP INVOICE" };
    expect(getCanonicalDocumentType(doc1)).toBe("AP INVOICE");
    expect(formatDocumentTypeDisplay(doc1)).toBe("AP Invoice");

    // Case and spacing variations
    expect(getCanonicalDocumentType("ap invoice")).toBe("AP INVOICE");
    expect(formatDocumentTypeDisplay("ap invoice")).toBe("AP Invoice");
    expect(getCanonicalDocumentType("AP Invoice")).toBe("AP INVOICE");
    expect(formatDocumentTypeDisplay("AP Invoice")).toBe("AP Invoice");
    expect(getCanonicalDocumentType("  AP_INVOICE  ")).toBe("AP INVOICE");
    expect(formatDocumentTypeDisplay("  AP_INVOICE  ")).toBe("AP Invoice");
  });

  it('extracts canonical type when document_type is missing but trans_type / Document_type / custom_data has it', () => {
    const doc2 = { Document_type: "AP INVOICE", trans_type: "AP INVOICE" };
    expect(getCanonicalDocumentType(doc2)).toBe("AP INVOICE");
    expect(formatDocumentTypeDisplay(doc2)).toBe("AP Invoice");

    const doc3 = { trans_type: "AP INVOICE" };
    expect(getCanonicalDocumentType(doc3)).toBe("AP INVOICE");

    const doc4 = { custom_data: { trans_type: "AP INVOICE" } };
    expect(getCanonicalDocumentType(doc4)).toBe("AP INVOICE");
  });

  it('falls back to GENERAL RECORDS only when no valid document type exists', () => {
    expect(getCanonicalDocumentType(null)).toBe("GENERAL RECORDS");
    expect(formatDocumentTypeDisplay(null)).toBe("General Records");

    const docEmpty = { document_type: "GENERAL RECORDS", category: "GENERAL RECORDS" };
    expect(getCanonicalDocumentType(docEmpty)).toBe("GENERAL RECORDS");
    expect(formatDocumentTypeDisplay(docEmpty)).toBe("General Records");
  });

  it('correctly handles other document types', () => {
    expect(getCanonicalDocumentType("PURCHASE ORDER")).toBe("PURCHASE ORDER");
    expect(formatDocumentTypeDisplay("PURCHASE ORDER")).toBe("Purchase Order");

    expect(getCanonicalDocumentType("CASH VOUCHER")).toBe("CASH VOUCHER");
    expect(formatDocumentTypeDisplay("CASH VOUCHER")).toBe("Cash Voucher");

    expect(getCanonicalDocumentType("CREDIT NOTE")).toBe("CREDIT NOTE");
    expect(formatDocumentTypeDisplay("CREDIT NOTE")).toBe("Credit Note");
  });

  it('formats document numbers with proper prefixes', () => {
    const doc = { id: "001", document_type: "AP INVOICE" };
    expect(formatDocNumber(doc.id, getCanonicalDocumentType(doc))).toBe("INV-001");
    expect(getDocTypePrefix(doc)).toBe("INV");
  });
});
