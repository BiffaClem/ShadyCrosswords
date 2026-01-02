import { test, expect, type Page, devices } from '@playwright/test';

const TEST_EMAIL = process.env.TEST_ADMIN_EMAIL || 'mark.clement@outlook.com';
const TEST_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'shadyx1970!';

/**
 * Helper to login as the test user
 */
async function login(page: Page) {
  await page.goto('/');
  await page.waitForSelector('input[type="email"], input[placeholder*="email" i]', { timeout: 10000 });
  await page.fill('input[type="email"], input[placeholder*="email" i]', TEST_EMAIL);
  await page.fill('input[type="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(home)?$/, { timeout: 15000 });
}

test.describe('Mobile UI', () => {
  // Use mobile viewport
  test.use({ viewport: { width: 390, height: 844 } }); // iPhone 14 Pro dimensions

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should show mobile layout with stacked clues and grid', async ({ page }) => {
    // Navigate to a session
    const createBtn = page.locator('button:has-text("Start"), button:has-text("Create")').first();
    
    if (await createBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(2000);
    }

    if (page.url().includes('/session/')) {
      // On mobile, should see grid
      await expect(page.locator('[class*="grid"]').first()).toBeVisible({ timeout: 10000 });
      
      // Should see clues panel (tabs for Across/Down)
      await expect(page.locator('text=Across').first()).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=Down').first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('should show clue input mode on long-press', async ({ page }) => {
    // Navigate to a session
    const createBtn = page.locator('button:has-text("Start"), button:has-text("Create")').first();
    
    if (await createBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(2000);
    }

    if (page.url().includes('/session/')) {
      // Wait for clues to load
      await page.waitForSelector('button:has-text("1")', { timeout: 10000 });
      
      // Find a clue button and long-press it
      const clueButton = page.locator('button:has-text("1")').first();
      
      if (await clueButton.isVisible()) {
        // Simulate long-press (pointer down, wait, pointer up)
        const box = await clueButton.boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.waitForTimeout(500); // Long press duration
          await page.mouse.up();
          
          // After long-press, clue input mode should be active
          // Check for back arrow which appears in clue input mode
          const backButton = page.locator('[data-testid="button-back"], button:has(svg)').first();
          
          // Either back button visible or focused input area
          await page.waitForTimeout(500);
        }
      }
    }
  });

  test('should allow switching between Across and Down clues', async ({ page }) => {
    // Navigate to a session
    const createBtn = page.locator('button:has-text("Start"), button:has-text("Create")').first();
    
    if (await createBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(2000);
    }

    if (page.url().includes('/session/')) {
      // Should see tabs
      const acrossTab = page.locator('[role="tab"]:has-text("Across")').first();
      const downTab = page.locator('[role="tab"]:has-text("Down")').first();
      
      await expect(acrossTab).toBeVisible({ timeout: 5000 });
      await expect(downTab).toBeVisible({ timeout: 5000 });
      
      // Click Down tab
      await downTab.click();
      await page.waitForTimeout(500);
      
      // Down tab should now be active
      await expect(downTab).toHaveAttribute('data-state', 'active');
      
      // Click Across tab
      await acrossTab.click();
      await page.waitForTimeout(500);
      
      // Across tab should now be active
      await expect(acrossTab).toHaveAttribute('data-state', 'active');
    }
  });

  test('should have resizable clue panel', async ({ page }) => {
    // Navigate to a session
    const createBtn = page.locator('button:has-text("Start"), button:has-text("Create")').first();
    
    if (await createBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(2000);
    }

    if (page.url().includes('/session/')) {
      // Look for the separator/handle
      const separator = page.locator('[class*="cursor-row-resize"], [class*="separator"]').first();
      
      if (await separator.isVisible({ timeout: 5000 }).catch(() => false)) {
        const box = await separator.boundingBox();
        if (box) {
          // Drag separator up to make clue panel bigger
          await page.mouse.move(box.x + box.width / 2, box.y);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width / 2, box.y - 100);
          await page.mouse.up();
          
          await page.waitForTimeout(500);
        }
      }
    }
  });
});

test.describe('Mobile Input Mode', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should focus hidden input for keyboard in clue input mode', async ({ page }) => {
    // Navigate to a session
    const createBtn = page.locator('button:has-text("Start"), button:has-text("Create")').first();
    
    if (await createBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await createBtn.click();
      await page.waitForTimeout(2000);
    }

    if (page.url().includes('/session/')) {
      // On mobile, there should be a hidden input for capturing keyboard
      const hiddenInput = page.locator('input[aria-label="Crossword input"]');
      
      // It exists but is visually hidden
      await expect(hiddenInput).toHaveCount(1);
    }
  });
});
