import { test, expect, type Page } from '@playwright/test';

const TEST_EMAIL = process.env.TEST_ADMIN_EMAIL || 'mark.clement@outlook.com';
const TEST_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'shadyx1970!';

async function login(page: Page) {
  await page.goto('/');
  await page.fill('input[type="email"], input[placeholder*="email" i]', TEST_EMAIL);
  await page.fill('input[type="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(home)?$/, { timeout: 15000 });
}

test.describe('Crash Detection', () => {
  test('should not crash when typing', async ({ page }) => {
    await login(page);
    
    const createBtn = page.locator('button:has-text("Start"), button:has-text("Create")').first();
    await expect(createBtn).toBeVisible({ timeout: 10000 });
    await createBtn.click();
    
    await page.waitForURL(/\/session\//, { timeout: 10000 });
    
    const whiteCell = page.locator('.bg-white').first();
    await expect(whiteCell).toBeVisible({ timeout: 10000 });
    
    // Type a letter
    await whiteCell.click();
    await page.keyboard.type('X');
    
    // Wait a bit to see if it crashes
    await page.waitForTimeout(1000);
    
    // Check if grid is still visible
    await expect(page.locator('.bg-white').first()).toBeVisible();
    
    // Check if letter is there
    await expect(whiteCell).toHaveText('X');
  });
});
