import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

for (const width of [1440, 390]) {
  test(`World Order Events interval and historical window at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/data/world-order-stress.json*', async route => {
      const wo = JSON.parse(readFileSync('data/world-order-stress.json', 'utf8'));
      wo.externalSources.gdeltEvents = { status: 'stale', summary: {
        violenceLower: 51817, violenceUpper: 51819, windowStartDay: '20261001', windowEndDay: '20261007', quarantinedRows: 2
      } };
      wo.warnings = ['免费 Events 已纳入两个冲突维度；新旧分数不可直接比较。'];
      await route.fulfill({ json: wo });
    });
    await page.goto('/index.html');
    await expect(page.locator('body')).toHaveClass(/gfrr-data-ready/);
    await page.locator('#world-order-stress-section > summary').click();
    await expect(page.locator('#wo-detail-gdelt-conflict-events')).toHaveText('51,817～51,819（免费编码记录）');
    await expect(page.locator('#wo-detail-source-freshness')).toContainText('20261001～20261007');
    await expect(page.locator('#wo-detail-source-freshness')).toContainText('沿用历史窗口');
    await expect(page.locator('#wo-detail-source-freshness')).toContainText('未知隔离 2 行');
    await expect(page.locator('#wo-detail-source-freshness')).toContainText('其余三维仍含历史 Cloud');
    await expect(page.locator('#wo-warning-boundary')).toContainText('新旧分数不可直接比较');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
  });
}
