import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

for (const width of [1440, 390]) {
  test(`freight distinguishes old quotes and missing BDI at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/data/radar-data.json*', async route => {
      const radar = JSON.parse(readFileSync('data/radar-data.json', 'utf8'));
      radar.macroDrivers.shippingFreight = {
        balticDirtyTankerIndex: 2644, balticDirtyTankerDailyChangePct: 0.0049,
        balticDirtyTankerUpdatedAt: '2026-08-10T00:00:00Z',
        balticCleanTankerIndex: 1387, balticCleanTankerDailyChangePct: -0.0212,
        balticCleanTankerUpdatedAt: '2026-08-10T00:00:00Z',
        balticDryIndex: null, balticDryDailyChangePct: null, balticDryUpdatedAt: null,
        freightStressRegime: '高压', sourceStatus: { dirtyTanker: 'fallback', cleanTanker: 'fallback', dryBulk: 'missing' },
      };
      await route.fulfill({ json: radar });
    });
    await page.goto('/index.html');
    await expect(page.locator('body')).toHaveClass(/gfrr-data-ready/);
    await expect(page.locator('#c1-freight-number')).toHaveText('—');
    await expect(page.locator('#c1-freight-aux')).toContainText('2026-08-10 沿用旧值');
    await expect(page.locator('#c1-freight-aux')).toContainText('BDI — · 缺少可用报价');
    await expect(page.locator('#c1-freight-badge')).toHaveText('背景');
    await expect(page.locator('#c1-freight-source-state')).toHaveText('沿用旧值');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
  });
}
