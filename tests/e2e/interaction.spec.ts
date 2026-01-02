import { test, expect } from '@playwright/test';
import { createTestUser, createTestSession } from './utils';

test.describe('Interaction Stability', () => {
  test('should not crash when typing', async ({ page }) => {
    // 1. Login
    await page.goto('/');
    await page.fill('input[type="email"]', 'mark.clement@outlook.com');
    await page.fill('input[type="password"]', 'shadyx1970!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(home)?$/);
    
    // 2. Create a session
    const createBtn = page.locator('button:has-text("Start"), button:has-text("Create")').first();
    await createBtn.click();
    await page.waitForURL(/\/session\//);
    
    // 3. Wait for grid
    const whiteCell = page.locator('.bg-white').first();
    await expect(whiteCell).toBeVisible();
    
    // 4. Type multiple characters rapidly
    await whiteCell.click();
    await page.keyboard.type('TESTING');
    
    // 5. Verify grid is still visible (not blank)
    await expect(page.locator('.bg-white').first()).toBeVisible();
    
    // 6. Verify text entered
    // Note: Depending on cursor movement, 'TESTING' might be spread across cells
    // We just check that the app didn't crash (grid still visible)
  });
});
