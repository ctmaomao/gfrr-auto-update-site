/* global document, getComputedStyle, innerWidth */
import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

for (const width of [1440, 390]) {
  test(`World Order source dates and captured health remain distinct at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.clock.install({ time: new Date('2026-11-13T12:00:00Z') });
    const wo = JSON.parse(readFileSync('data/world-order-stress.json', 'utf8'));
    wo.updatedAt = '2026-11-13T07:00:00Z';
    wo.externalSources.gdelt.lastFetchedAt = '2026-09-23T01:14:09Z';
    await page.route('**/data/world-order-stress.json*', route => route.fulfill({ json: wo }));
    await page.goto('/index.html?view=radar');
    await expect(page.locator('body')).toHaveClass(/gfrr-data-ready/);
    await page.locator('#world-order-stress-section > summary').click();
    const clock = page.locator('#wo-detail-source-clock');
    await expect(clock).toContainText('已过5小时');
    await expect(page.locator('.wo-freshness')).toContainText('以下源时效为采集时评级');
    await expect(clock).toContainText('2026-09-23 01:14 UTC');
    await expect(page.locator('#world-order-stress-section')).not.toContainText('需手动下载并导入');
    const capture = async name => {
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.locator('#world-order-stress-section').screenshot({ path: info.outputPath(`${name}-${width}.png`) });
      const style = await page.locator('.wo-freshness').evaluate(el => {
        const s = getComputedStyle(el);
        return { background: s.backgroundColor, color: s.color, fontFamily: s.fontFamily, width: el.getBoundingClientRect().width };
      });
      writeFileSync(info.outputPath(`${name}-${width}-style.json`), JSON.stringify(style, null, 2));
    };
    await capture('world-order-captured-clocks');
    const score = await page.locator('#wo-detail-score').textContent();
    await page.clock.fastForward(86400000);
    await expect(clock).toContainText('已过29小时');
    await expect(page.locator('#wo-detail-score')).toHaveText(score);
    wo.updatedAt = '2026-11-15T00:00:00Z';
    wo.externalSources.gdelt.lastFetchedAt = '2026-02-30';
    await page.reload();
    await expect(page.locator('body')).toHaveClass(/gfrr-data-ready/);
    await page.locator('#world-order-stress-section > summary').click();
    await expect(clock).toContainText('生成时间待核验');
    await expect(clock).toContainText('获取时间待核验');
    await capture('world-order-invalid-clocks');
  });
}
