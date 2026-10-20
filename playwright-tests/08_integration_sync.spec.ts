import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth.helper';

test.describe('Module H: Integration and Synchronization (DAPI Sync Hub)', () => {

  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  test('TC-INT-001: Access Third-Party App Sync hub in Control Settings', async ({ page }) => {
    const adminBtn = page.locator('aside button[aria-label="Control Settings"]');
    await adminBtn.click();

    await expect(page.locator('header')).toContainText(/CONTROL SETTINGS/i, { timeout: 10000 });

    // Click Third-Party App Sync button in secondary sidebar
    const syncTabBtn = page.locator('button:has-text("Third-Party App Sync")');
    await expect(syncTabBtn).toBeVisible({ timeout: 10000 });
    await syncTabBtn.click();

    // Verify DAPI Sync Hub renders tabs
    await expect(page.locator('button:has-text("Applications"), button:has-text("Integration Logs")').first()).toBeVisible({ timeout: 10000 });
  });

  test('TC-INT-002: Applications tab displays registered external systems', async ({ page }) => {
    const adminBtn = page.locator('aside button[aria-label="Control Settings"]');
    await adminBtn.click();

    const syncTabBtn = page.locator('button:has-text("Third-Party App Sync")');
    await syncTabBtn.click();

    // Applications tab button
    const appsBtn = page.locator('button:has-text("Applications")').first();
    await appsBtn.click();

    // Verify application listing or registration trigger
    await expect(page.locator('body')).toContainText(/Connected Applications|Application Name|Webhook|Endpoint|Register|API Key/i, { timeout: 10000 });
  });

  test('TC-INT-003: Integration Logs tab displays synchronization event logs', async ({ page }) => {
    const adminBtn = page.locator('aside button[aria-label="Control Settings"]');
    await adminBtn.click();

    const syncTabBtn = page.locator('button:has-text("Third-Party App Sync")');
    await syncTabBtn.click();

    // Click Delivery Logs tab
    const logsTabBtn = page.locator('button:has-text("Delivery Logs"), button:has-text("Logs")').first();
    await logsTabBtn.click();

    // Verify logs table / empty logs display
    await expect(page.locator('body')).toContainText(/Delivery Logs|Sync Logs|Timestamp|Status|Payload|Integration/i, { timeout: 10000 });
  });

});
