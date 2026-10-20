import { test, expect } from '@playwright/test';
import { loginAs, logout } from './helpers/auth.helper';

test.describe('Module A: Authentication & Session Management', () => {

  test('TC-AUTH-001: Login page renders branding and input elements', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Branding panel
    await expect(page.locator('h1').filter({ hasText: 'DAAS' })).toBeVisible();
    await expect(page.getByText(/Document Approval/i)).toBeVisible();

    // Login form header
    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
    await expect(page.getByText('Login to access your workspace')).toBeVisible();

    // Input and continue button
    const input = page.locator('input[placeholder*="employee ID or username"]');
    await expect(input).toBeVisible();
    await expect(page.getByRole('button', { name: /continue/i })).toBeVisible();

    // 2FA badge
    await expect(page.getByText(/secure passwordless login via/i)).toBeVisible();
  });

  test('TC-AUTH-002: Form validation prevents empty identifier submission', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('input[placeholder*="employee ID or username"]');
    await input.fill('');

    // HTML5 required validation or click continue directly
    const continueBtn = page.getByRole('button', { name: /continue/i });
    await continueBtn.click();

    // Input should still be present on page (not progressed to step 2)
    await expect(input).toBeVisible();
    const isInvalid = await input.evaluate((el: HTMLInputElement) => !el.checkValidity());
    expect(isInvalid).toBe(true);
  });

  test('TC-AUTH-003: Invalid user displays error notification', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('input[placeholder*="employee ID or username"]');
    await input.fill('nonexistent_user_9999');

    const continueBtn = page.getByRole('button', { name: /continue/i });
    await continueBtn.click();

    // Expect error notice
    const errorAlert = page.locator('.text-red-700, .bg-red-50');
    await expect(errorAlert).toBeVisible({ timeout: 10000 });
    await expect(errorAlert).toContainText(/invalid username or password|unable to find user account|failed/i);
  });

  test('TC-AUTH-004: Valid login via Email OTP and Auto Fill succeeds', async ({ page }) => {
    await loginAs(page, 'admin');

    // Confirm navigation into authenticated dashboard
    await expect(page.locator('aside')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Dashboard' })).toBeVisible();
    await expect(page.locator('header')).toBeVisible();
  });

  test('TC-AUTH-005: User can sign out and session terminates cleanly', async ({ page }) => {
    await loginAs(page, 'admin');
    await logout(page);

    // Verify redirected back to login screen
    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
    await expect(page.locator('input[placeholder*="employee ID or username"]')).toBeVisible();
  });

});
