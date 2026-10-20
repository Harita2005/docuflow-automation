import { test, expect } from '@playwright/test';
import { loginAs, logout } from './helpers/auth.helper';

test.describe('Module G: User Management & RBAC Permissions', () => {

  test('TC-RBAC-001: Admin can access Control Settings and User Matrix', async ({ page }) => {
    await loginAs(page, 'admin');

    const adminBtn = page.locator('aside button[aria-label="Control Settings"]');
    await adminBtn.click();

    await expect(page.locator('header')).toContainText(/CONTROL SETTINGS/i, { timeout: 10000 });

    // Verify presence of RBAC / user management elements
    await expect(page.locator('body')).toContainText(/Role|User|Permissions|RACI|Matrix|System/i, { timeout: 10000 });
  });

  test('TC-RBAC-002: Employee isolation enforces restricted access', async ({ page }) => {
    // Log in as employee YUVASREE
    await loginAs(page, 'YUVASREE');

    await expect(page.locator('aside')).toBeVisible({ timeout: 12000 });

    // Verify employee has Dashboard, Work Tracker, Approved Docs
    await expect(page.locator('aside button[aria-label="Dashboard"]')).toBeVisible();
    await expect(page.locator('aside button[aria-label="Work Tracker"]')).toBeVisible();

    // Verify employee DOES NOT have Control Settings or Workflow & Rules
    await expect(page.locator('aside button[aria-label="Control Settings"]')).toHaveCount(0);
    await expect(page.locator('aside button[aria-label="Workflow & Rules"]')).toHaveCount(0);

    // Clean logout
    await logout(page);
  });

});
