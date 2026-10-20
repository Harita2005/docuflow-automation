import { test, expect } from '@playwright/test';
import { loginAs, logout } from './helpers/auth.helper';

test.describe('Module I: Comprehensive End-to-End User Journey', () => {

  test('TC-E2E-001: Complete lifecycle journey: login -> dashboard -> tracker -> review -> audit -> logout', async ({ page }) => {
    // 1. Authenticate as Administrator
    await loginAs(page, 'admin');

    // 2. Inspect Dashboard
    await expect(page.locator('header')).toContainText(/DASHBOARD/i, { timeout: 10000 });
    await expect(page.getByText('PENDING', { exact: true })).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('APPROVED', { exact: true })).toBeVisible({ timeout: 8000 });

    // 3. Navigate to Work Tracker
    const workTrackerBtn = page.locator('aside button[aria-label="Work Tracker"]');
    await workTrackerBtn.click();
    await expect(page.locator('header')).toContainText(/WORK TRACKER/i, { timeout: 10000 });

    // 4. Open Document Details for the first record in tracker
    const viewBtn = page.locator('button[title="View Document Details"]').first();
    await expect(viewBtn).toBeVisible({ timeout: 12000 });
    await viewBtn.click();

    // 5. Verify Document Details, header and lifecycle controls
    await expect(page.locator('header')).toContainText(/DOCUMENT DETAILS/i, { timeout: 10000 });
    await expect(page.locator('body')).toContainText(/Vendor|Invoice|Gross Amount|Division|Workflow/i, { timeout: 10000 });

    // 6. Return back to Work Tracker or Dashboard
    const backBtn = page.locator('button:has-text("Back"), header button').first();
    if (await backBtn.isVisible()) {
      await backBtn.click();
    } else {
      await workTrackerBtn.click();
    }
    await page.waitForTimeout(500);

    // 7. Check Approved Docs
    const approvedDocsBtn = page.locator('aside button[aria-label="Approved Docs"]');
    await approvedDocsBtn.click();
    await expect(page.locator('body')).toContainText(/Search Documents|Approved Documents/i, { timeout: 10000 });

    // 8. Log out cleanly and verify session teardown
    await logout(page);
    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible({ timeout: 10000 });
  });

});
