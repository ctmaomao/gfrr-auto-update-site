import { test, expect } from '@playwright/test';
import fs from 'node:fs';
const baseline = JSON.parse(fs.readFileSync('data/bubble-watch.json', 'utf8'));
function creditFixture() {
  const today = new Date();
  const points = Array.from({ length: 260 }, (_, i) => ({ date: new Date(today.getTime() - (365 - Math.floor(i * 362 / 259)) * 86400000).toISOString().slice(0, 10), bps: 260 + i % 20 }));
  return { contractVersion: 'bubble-credit-spreads-v1', boundary: 'display_only_no_score_impact', series: { hy: points, ccc: points.map(p => ({ ...p, bps: p.bps * 4 })), ig: points.map(p => ({ ...p, bps: Math.round(p.bps / 3) })) }, sources: { hy: { status: 'fresh' }, ccc: { status: 'fresh' }, ig: { status: 'fresh' } } };
}
async function open(page, credit) {
  await page.route('**/data/bubble-watch.json*', route => route.fulfill({ json: { ...baseline, credit_spreads: credit } }));
  await page.goto('/bubble-watch.html');
  await expect(page.locator('.big-number .value')).toContainText(baseline.summary.red_pct.toFixed(1));
}
for (const width of [1440, 390]) test(`Credit module order, series, hover and keyboard at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const data = creditFixture(); await open(page, data);
  await expect(page.locator('#credit-spreads svg')).toHaveCount(3);
  await expect(page.locator('#credit-spreads .credit-threshold')).toHaveCount(2);
  await expect(page.locator('section.category article.indicator')).toHaveCount(27);
  expect(await page.locator('#credit-spreads').evaluate(e => e.previousElementSibling.querySelector('#trend-chart-wrap') !== null && e.nextElementSibling.classList.contains('category'))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const svg = page.locator('#credit-hy svg'); await svg.scrollIntoViewIfNeeded(); await svg.hover();
  await expect(page.locator('#credit-hy .credit-tooltip')).toBeVisible();
  await svg.focus(); await expect(page.locator('#credit-hy .credit-tooltip')).toContainText(data.series.hy.at(-1).date);
  await page.keyboard.press('ArrowLeft'); await expect(page.locator('#credit-hy .credit-tooltip')).toContainText(data.series.hy.at(-2).date);
  const columns = await page.locator('.credit-grid').evaluate(e => getComputedStyle(e).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(width === 390 ? 1 : 3); expect(errors).toEqual([]);
});
test('Partial invalid data keeps healthy charts and missing/stale notices', async ({ page }) => {
  const data = creditFixture(); data.sources.hy.status = 'fallback'; data.series.ccc[5].bps = null;
  data.series.ig.forEach(p => { p.date = new Date(Date.parse(p.date) - 30 * 86400000).toISOString().slice(0, 10); });
  await open(page, data);
  await expect(page.locator('#credit-spreads svg')).toHaveCount(2);
  await expect(page.locator('#credit-spreads')).toContainText('沿用');
  await expect(page.locator('#credit-spreads')).toContainText('数据暂缺');
  await expect(page.locator('#credit-spreads')).toContainText('观测已超过 10 天');
  await expect(page.locator('section.category article.indicator')).toHaveCount(27);
});
test('Older payload without credit history retains existing page', async ({ page }) => {
  await open(page, undefined); await expect(page.locator('#credit-spreads')).toHaveCount(0);
  await expect(page.locator('section.category article.indicator')).toHaveCount(27);
});
