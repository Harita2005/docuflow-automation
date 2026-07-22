import { test, expect } from '@playwright/test';

test('Critical Path: Login as Manager and route to Approval Queue', async ({ page }) => {
  // 1. Navigate to the local application
  await page.goto('/');

  // 2. Ensure we are on the login page by looking for the distinct UI text
  await expect(page.getByText('Welcome back')).toBeVisible();

  // 3. Fill in the Username or Employee ID field
  await page.getByPlaceholder('e.g. alerts@ramrajcotton.net or EMP-1001').fill('admin@initech.com');

  // 4. Click Next to go to the password step
  await page.getByRole('button', { name: /Next/i }).click();

  // 5. Fill in the Password
  await page.getByPlaceholder('••••••••').fill('password123');

  // 6. Submit the login form
  await page.getByRole('button', { name: /Sign in to account/i }).click();

  // 7. Verify Smart Routing: We should be instantly routed to the Dashboard
  await expect(page.getByText('Executive Command Dashboard')).toBeVisible();
});
