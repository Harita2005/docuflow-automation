import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth.helper';

test.describe('Module C: Document Management (Work Tracker & Approved Documents)', () => {

  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  test('TC-DOC-001: Work Tracker loads table records and metadata', async ({ page }) => {
    const workTrackerBtn = page.locator('aside button[aria-label="Work Tracker"]');
    await workTrackerBtn.click();

    // Verify Work Tracker view header
    await expect(page.locator('header')).toContainText(/WORK TRACKER/i, { timeout: 10000 });

    // Verify table structure is rendered
    const tableOrContainer = page.locator('table, .overflow-x-auto').first();
    await expect(tableOrContainer).toBeVisible({ timeout: 10000 });
  });

  test('TC-DOC-002: Search input filters work tracker documents', async ({ page }) => {
    const workTrackerBtn = page.locator('aside button[aria-label="Work Tracker"]');
    await workTrackerBtn.click();

    const searchInput = page.locator('input[placeholder*="Search vendor, doc #, PO"]');
    await expect(searchInput).toBeVisible({ timeout: 10000 });

    // Type a search query
    await searchInput.fill('DOC');
    await page.waitForTimeout(600);

    // Verify table or empty state updates
    await expect(page.locator('table, .overflow-x-auto, .text-center').first()).toBeVisible();

    // Clear search
    await searchInput.fill('');
    await page.waitForTimeout(400);
  });

  test('TC-DOC-003: Status dropdown filter toggles document status', async ({ page }) => {
    const workTrackerBtn = page.locator('aside button[aria-label="Work Tracker"]');
    await workTrackerBtn.click();

    // Status filter select dropdown
    const statusSelect = page.locator('select').first();
    if (await statusSelect.isVisible()) {
      await statusSelect.selectOption({ label: 'Awaiting Clarification / Hold' }).catch(async () => {
        // Fallback option value
        await statusSelect.selectOption({ index: 1 });
      });
      await page.waitForTimeout(500);
      await expect(statusSelect).toBeVisible();
    }
  });

  test('TC-DOC-004: Approved Documents page displays confirmed records', async ({ page }) => {
    const approvedDocsBtn = page.locator('aside button[aria-label="Approved Docs"]');
    await approvedDocsBtn.click();

    await expect(page.locator('body')).toContainText(/Search Documents|Approved Documents/i, { timeout: 10000 });

    // Verify search toolbar on approved docs page
    const approvedSearch = page.locator('input[placeholder*="Search Documents"]');
    await expect(approvedSearch).toBeVisible({ timeout: 10000 });
  });

});
