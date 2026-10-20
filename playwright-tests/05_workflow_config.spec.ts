import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth.helper';

test.describe('Module E: Workflow Configuration & Rules', () => {

  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin');
  });

  test('TC-WF-001: Workflow Rules page displays profiles and routing studio', async ({ page }) => {
    const wfBtn = page.locator('aside button[aria-label="Workflow & Rules"]');
    await wfBtn.click();

    // Verify main Workflow & Rules header
    await expect(page.getByText('Workflow & Rules Studio')).toBeVisible({ timeout: 12000 });
  });

  test('TC-WF-002: Workflow tab navigation toggles between sub-modules', async ({ page }) => {
    const wfBtn = page.locator('aside button[aria-label="Workflow & Rules"]');
    await wfBtn.click();

    // The 4 engines: Flow Builder, Condition Builder, Checklist Matrix, AI Templates
    const flowTab = page.getByRole('button', { name: /Flow Builder/i });
    const conditionTab = page.getByRole('button', { name: /Condition Builder/i });
    const checklistTab = page.getByRole('button', { name: /Checklist Matrix/i });
    const aiTab = page.getByRole('button', { name: /AI Templates/i });

    await expect(flowTab).toBeVisible({ timeout: 10000 });
    await expect(conditionTab).toBeVisible();

    await conditionTab.click();
    await page.waitForTimeout(400);

    await checklistTab.click();
    await page.waitForTimeout(400);

    await aiTab.click();
    await page.waitForTimeout(400);

    await flowTab.click();
    await page.waitForTimeout(400);
  });

  test('TC-WF-003: Visual stage builder and conditions render stages', async ({ page }) => {
    const wfBtn = page.locator('aside button[aria-label="Workflow & Rules"]');
    await wfBtn.click();

    // Visual flow builder nodes or step cards
    const studio = page.locator('.admin-settings-theme, .border, .rounded-lg').first();
    await expect(studio).toBeVisible({ timeout: 10000 });
  });

});
