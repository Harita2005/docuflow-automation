import { test, expect } from '@playwright/test';

test('Critical Path: Login as Manager and route to Approval Queue', async ({ page }) => {
  // 1. Navigate to the local application
  await page.goto('/');

  // 2. Ensure we are on the login page by looking for the distinct UI text
  await expect(page.getByText('Streamline yourAccounts Payable.')).toBeVisible();

  // 3. Fill in the Username or Employee ID field
  await page.getByPlaceholder('e.g. sconnor or EMP-1001').fill('sconnor');

  // 4. Fill in the Password
  await page.getByPlaceholder('••••••••').fill('password123');

  // 5. Submit the login form
  await page.getByRole('button', { name: /Sign in to account/i }).click();

  // 6. Verify Smart Routing: We should be instantly routed to the Approval Queue
  // We can verify this by checking if the specific "Approval Queue" header or KPI cards are visible
  await expect(page.getByText('Compliance & Audit Desk')).toBeVisible();
  await expect(page.getByText('Pending Approval')).toBeVisible();
});
