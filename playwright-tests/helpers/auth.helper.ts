import { Page, expect } from '@playwright/test';

interface CachedAuth {
  token: string;
  role: string;
  email: string;
  username: string;
}

const tokenCache: Record<string, CachedAuth> = {};

export async function loginAs(page: Page, username: string = 'admin'): Promise<void> {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  // Check if already on authenticated dashboard
  const aside = page.locator('aside');
  if (await aside.isVisible()) {
    return;
  }

  // If we already have a cached token for this user, restore session fast
  if (tokenCache[username]) {
    const cached = tokenCache[username];
    await page.evaluate((auth) => {
      localStorage.setItem('authToken', auth.token);
      localStorage.setItem('isLoggedIn', 'true');
      localStorage.setItem('currentUserRole', auth.role);
      localStorage.setItem('currentUserEmail', auth.email);
      localStorage.setItem('currentUserUsername', auth.username);
      localStorage.setItem('lastActivityTime', String(Date.now()));
    }, cached);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    if (await aside.isVisible()) {
      return;
    }
  }

  // Full UI Login Flow
  // Step 1: Username / Employee ID
  const userInput = page.locator('input[placeholder*="employee ID or username"]');
  await expect(userInput).toBeVisible({ timeout: 10000 });
  await userInput.fill(username);

  const continueBtn = page.getByRole('button', { name: /continue/i });
  await continueBtn.click();

  // Step 2: Choose verification method (Email OTP)
  const emailOtpBtn = page.getByRole('button', { name: /email otp/i });
  await emailOtpBtn.waitFor({ state: 'visible', timeout: 10000 });
  await emailOtpBtn.click();

  // Step 3: Verification with Auto Fill in Dev/Demo mode
  const autoFillBtn = page.getByRole('button', { name: /auto fill/i });
  await autoFillBtn.waitFor({ state: 'visible', timeout: 10000 });
  await autoFillBtn.click();

  const verifyBtn = page.getByRole('button', { name: /verify & enter workspace/i });
  await expect(verifyBtn).toBeEnabled({ timeout: 5000 });
  await verifyBtn.click();

  // Handle active session conflict modal if present
  const signInHereBtn = page.getByRole('button', { name: /sign in here/i });
  try {
    await signInHereBtn.waitFor({ state: 'visible', timeout: 3000 });
    await signInHereBtn.click();
  } catch {
    // No conflict modal
  }

  // Confirm workspace entered: Header or Sidebar is visible
  await expect(aside).toBeVisible({ timeout: 15000 });

  // Cache token for subsequent rapid tests
  const token = await page.evaluate(() => localStorage.getItem('authToken'));
  const role = await page.evaluate(() => localStorage.getItem('currentUserRole')) || username;
  const email = await page.evaluate(() => localStorage.getItem('currentUserEmail')) || '';
  const uname = await page.evaluate(() => localStorage.getItem('currentUserUsername')) || username;

  if (token) {
    tokenCache[username] = {
      token,
      role,
      email,
      username: uname
    };
  }
}

export async function logout(page: Page): Promise<void> {
  // Click user profile dropdown in header
  const profileDropdown = page.locator('header .relative').filter({ hasText: /Admin|Vignesh|Yuvasree|Initha|System Administrator|Employee|Finance Manager/i }).last();
  await profileDropdown.click();

  // Click Sign Out
  const signOutBtn = page.getByRole('button', { name: /sign out/i });
  await signOutBtn.waitFor({ state: 'visible', timeout: 5000 });
  await signOutBtn.click();

  // Clear cached token
  for (const k of Object.keys(tokenCache)) {
    delete tokenCache[k];
  }

  // Verify return to login page
  await expect(page.locator('input[placeholder*="employee ID or username"]')).toBeVisible({ timeout: 10000 });
}
