import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth.helper';

test.describe('Module B: Dashboard and Navigation', () => {

  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  test('TC-DASH-001: Dashboard renders KPI statistics cards and metrics', async ({ page }) => {
    // Navigate explicitly to dashboard if not already there
    const dashNav = page.locator('aside button[aria-label="Dashboard"]');
    await dashNav.click();

    // Verify 5 KPI cards
    await expect(page.getByText('PENDING', { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('HOLD', { exact: true })).toBeVisible();
    await expect(page.getByText('REJECTED', { exact: true })).toBeVisible();
    await expect(page.getByText('PROGRESS', { exact: true })).toBeVisible();
    await expect(page.getByText('APPROVED', { exact: true })).toBeVisible();

    // Verify document table / queue is displayed below cards
    await expect(page.locator('.bg-white.border.border-\\[\\#E8E4DA\\]').first()).toBeVisible();
  });

  test('TC-DASH-002: Sidebar navigation switches views smoothly', async ({ page }) => {
    // 1. Click Work Tracker
    const workTrackerBtn = page.locator('aside button[aria-label="Work Tracker"]');
    await workTrackerBtn.click();
    await expect(page.locator('header')).toContainText(/WORK TRACKER/i, { timeout: 10000 });

    // 2. Click Approved Docs
    const approvedDocsBtn = page.locator('aside button[aria-label="Approved Docs"]');
    await approvedDocsBtn.click();
    await expect(page.locator('body')).toContainText(/Search Documents|Approved Documents/i, { timeout: 10000 });

    // 3. Click Control Settings (Admin)
    const adminBtn = page.locator('aside button[aria-label="Control Settings"]');
    await adminBtn.click();
    await expect(page.locator('header')).toContainText(/CONTROL SETTINGS/i, { timeout: 10000 });

    // 4. Return to Dashboard
    const dashboardBtn = page.locator('aside button[aria-label="Dashboard"]');
    await dashboardBtn.click();
    await expect(page.locator('header')).toContainText(/DASHBOARD/i, { timeout: 10000 });
  });

  test('TC-DASH-003: Sidebar collapse and expand toggles sidebar layout', async ({ page }) => {
    const aside = page.locator('aside');
    await expect(aside).toBeVisible();

    // Check initial width (expanded: 180px)
    const initialBox = await aside.boundingBox();
    expect(initialBox?.width).toBeGreaterThanOrEqual(170);

    // Click collapse button
    const collapseBtn = page.locator('aside button[aria-label="Collapse Sidebar"]');
    if (await collapseBtn.isVisible()) {
      await collapseBtn.click();
      await page.waitForTimeout(500);

      // Verify collapsed width (around 64px)
      const collapsedBox = await aside.boundingBox();
      expect(collapsedBox?.width).toBeLessThanOrEqual(70);

      // Expand sidebar again by clicking logo box
      const logoBox = aside.locator('.cursor-pointer').first();
      await logoBox.click();
      await page.waitForTimeout(500);

      const restoredBox = await aside.boundingBox();
      expect(restoredBox?.width).toBeGreaterThanOrEqual(170);
    }
  });

});
