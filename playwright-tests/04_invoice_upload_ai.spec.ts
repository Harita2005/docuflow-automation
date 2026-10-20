import { test, expect } from '@playwright/test';
import path from 'path';
import { loginAs } from './helpers/auth.helper';

test.describe('Module D: Invoice Upload and AI Ingestion', () => {

  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  test('TC-UPL-001: Upload document page renders drag zone and selectors', async ({ page }) => {
    const uploadBtn = page.locator('aside button[aria-label="Upload Document"]');
    await uploadBtn.click();

    await expect(page.locator('header')).toContainText(/UPLOAD DOCUMENT/i, { timeout: 10000 });

    // Verify Drop Zone exists
    const dropzone = page.locator('input[type="file"]');
    await expect(dropzone).toBeAttached();

    // Verify Document Type selector exists
    const selectType = page.locator('select').first();
    await expect(selectType).toBeVisible();
  });

  test('TC-UPL-002: File validation rejects non-PDF file upload', async ({ page }) => {
    const uploadBtn = page.locator('aside button[aria-label="Upload Document"]');
    await uploadBtn.click();

    const fileInput = page.locator('input[type="file"]');
    const invalidFilePath = path.resolve('playwright-tests/fixtures/invalid_script.exe');

    // Attach invalid file
    await fileInput.setInputFiles(invalidFilePath);

    // Verify rejection error banner
    const errorNotice = page.locator('.text-red-700, .bg-red-50, .text-rose-600, div:has-text("PDF files only")').first();
    await expect(errorNotice).toBeVisible({ timeout: 8000 });
    await expect(errorNotice).toContainText(/pdf files only/i);
  });

  test('TC-UPL-003: Valid PDF file upload stages document preview', async ({ page }) => {
    const uploadBtn = page.locator('aside button[aria-label="Upload Document"]');
    await uploadBtn.click();

    const fileInput = page.locator('input[type="file"]');
    const samplePdfPath = path.resolve('playwright-tests/fixtures/sample_invoice.pdf');

    // Attach valid sample PDF
    await fileInput.setInputFiles(samplePdfPath);

    // Verify that the file name and action buttons are displayed
    await expect(page.getByText('sample_invoice.pdf')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /Analyze & Verify Document|Analyze & Start Workflow/i }).first()).toBeVisible({ timeout: 10000 });
  });

});
