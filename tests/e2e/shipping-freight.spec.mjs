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


for (const width of [1440, 390]) {
  test(`freight shows official dated quotes and attribution at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const day = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    await page.route('**/data/radar-data.json*', async route => {
      const radar = JSON.parse(readFileSync('data/radar-data.json', 'utf8'));
      const sf = { source: 'BalticExchangePublicTicker:BDTI; BalticExchangePublicTicker:BCTI; BalticExchangePublicTicker:BDI',
        freightStressRegime: '高压', sourceStatus: { dirtyTanker: 'live', cleanTanker: 'live', dryBulk: 'live' } };
      ['balticDirtyTanker', 'balticCleanTanker', 'balticDry'].forEach((prefix, i) => {
        sf[`${prefix}Index`] = [7964, 2403, 2917][i];
        sf[`${prefix}DailyChangePct`] = [0.014, 0.0075, -0.0188][i];
        sf[`${prefix}UpdatedAt`] = `${day}T00:00:00Z`;
      });
      radar.macroDrivers.shippingFreight = sf;
      await route.fulfill({ json: radar });
    });
    await page.goto('/index.html');
    await expect(page.locator('body')).toHaveClass(/gfrr-data-ready/);
    await expect(page.locator('#c1-freight-number')).toHaveText('2917');
    await expect(page.locator('#c1-freight-provider')).toHaveText('波罗的海交易所公开行情');
    await expect(page.locator('#c1-freight-source-state')).toHaveText('已更新');
    await expect(page.locator('#c1-freight-aux')).toContainText(`BDTI 7964 +1.40% · ${day} 已更新`);
    await expect(page.locator('#c1-freight-aux')).toContainText('BDI 2917 -1.88%');
    await expect(page.locator('#c1-freight-aux')).not.toContainText('缺少可用报价');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
  });
}
