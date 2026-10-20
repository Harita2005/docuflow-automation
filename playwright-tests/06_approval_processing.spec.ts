import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth.helper';

test.describe('Module F: Approval Processing and Audit History', () => {

  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  test('TC-APP-001: Opening a document displays Document Details view', async ({ page }) => {
    const workTrackerBtn = page.locator('aside button[aria-label="Work Tracker"]');
    await workTrackerBtn.click();

    // Click the first document view action
    const viewBtn = page.locator('button[title="View Document Details"]').first();
    await expect(viewBtn).toBeVisible({ timeout: 12000 });
    await viewBtn.click();

    // Header updates to DOCUMENT DETAILS
    await expect(page.locator('header')).toContainText(/DOCUMENT DETAILS/i, { timeout: 10000 });
  });

  test('TC-APP-002: Document Details view renders metadata fields and tabs', async ({ page }) => {
    const workTrackerBtn = page.locator('aside button[aria-label="Work Tracker"]');
    await workTrackerBtn.click();

    const viewBtn = page.locator('button[title="View Document Details"]').first();
    await expect(viewBtn).toBeVisible({ timeout: 12000 });
    await viewBtn.click();

    // Verify presence of document data sections (vendor name, invoice num, or audit trail)
    await expect(page.locator('body')).toContainText(/Vendor|Invoice|Gross Amount|Division|Audit Trail|History|Workflow/i, { timeout: 10000 });
  });

  test('TC-APP-003: Approval action controls and buttons are accessible', async ({ page }) => {
    const workTrackerBtn = page.locator('aside button[aria-label="Work Tracker"]');
    await workTrackerBtn.click();

    const viewBtn = page.locator('button[title="View Document Details"]').first();
    await expect(viewBtn).toBeVisible({ timeout: 12000 });
    await viewBtn.click();

    // Look for action controls or status pill
    const actionElement = page.locator('button:has-text("Approve"), button:has-text("Reject"), button:has-text("Hold"), span:has-text("Approved"), span:has-text("Stage")').first();
    await expect(actionElement).toBeVisible({ timeout: 10000 });
  });

});
