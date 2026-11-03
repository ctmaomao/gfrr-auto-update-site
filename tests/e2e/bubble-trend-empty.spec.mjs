import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const baseline = JSON.parse(fs.readFileSync('data/bubble-watch.json', 'utf8'));
function fixture() {
  const data = structuredClone(baseline);
  data.history_seed = [];
  for (const card of data.indicators.filter(item => item.score_role === 'core')) {
    card.status = ['dc_abs_spread', 'capex_reaction'].includes(card.id) ? 'unknown' : 'green';
  }
  // Deliberately use the published ranges, independently of this display-only fixture's lights.
  // The renderer must never derive a new risk score from coverage or statuses.
  Object.assign(data.summary, { red_pct: null, weighted_risk_score: null,
    primary_score_range_pct: { lower: 30.4, upper: 39.1 },
    weighted_risk_score_range: { lower: 43.5, upper: 52.2 } });
  return data;
}
async function open(page, data) {
  await page.route('**/data/bubble-watch.json*', route => route.fulfill({ json: data }));
  await page.goto('/bubble-watch.html');
  await expect(page.locator('#trend-chart-wrap')).toContainText('本期核心证据覆盖');
}

for (const width of [1440, 390]) test(`Empty core trend is compact, preserves gaps and published ranges at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const data = fixture(); await open(page, data);
  const wrap = page.locator('#trend-chart-wrap');
  await expect(wrap).toContainText('21/23 项');
  for (const id of ['dc_abs_spread', 'capex_reaction']) await expect(wrap).toContainText(data.indicators.find(item => item.id === id).name_zh);
  await expect(wrap).toContainText('30.4–39.1%');
  await expect(wrap).toContainText('43.5–52.2 / 100');
  await expect(wrap).toContainText('并非概率或统计置信区间');
  await expect(wrap.locator('svg')).toHaveCount(0);
  await expect(page.locator('.trend.is-empty .trend-legend')).toBeHidden();
  expect(await wrap.evaluate(el => getComputedStyle(el).height)).not.toBe('220px');
  if (width === 1440) expect((await wrap.boundingBox()).height).toBeLessThan(150);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await expect(page.locator('section.category article.indicator')).toHaveCount(27);
  await page.setViewportSize({ width: width - 1, height: 1000 });
  await expect(wrap).toContainText('21/23 项');
  expect(errors).toEqual([]);
});

test('Coverage follows core slots, escapes names and treats an absent card as a gap', async ({ page }) => {
  const data = fixture(); await open(page, data);
  const result = await page.evaluate(data => {
    data.indicators = data.indicators.filter(card => card.id !== 'cape');
    data.indicators.find(card => card.id === 'dc_abs_spread').name_zh = '<img src=x onerror=alert(1)>';
    data.indicators.find(card => card.score_role === 'shadow').status = 'unknown';
    drawTrend(data);
    return document.getElementById('trend-chart-wrap').textContent;
  }, data);
  expect(result).toContain('20/23 项');
  expect(result).toContain('<img src=x onerror=alert(1)>');
  expect(result).toContain('名称待确认的核心项');
  await expect(page.locator('#trend-chart-wrap img')).toHaveCount(0);
});

test('Missing or invalid risk fields stay pending, while genuine zero remains zero', async ({ page }) => {
  const data = fixture(); await open(page, data);
  const text = await page.evaluate(data => {
    data.summary = { red_pct: null, weighted_risk_score: null,
      primary_score_range_pct: { lower: null, upper: 10 },
      weighted_risk_score_range: { lower: 60, upper: 20 } };
    drawTrend(data); return document.getElementById('trend-chart-wrap').textContent;
  }, data);
  expect(text).toContain('本期核心红灯比例：待确认；黄灯调整压力：待确认');
  expect(text).not.toContain('0.0');
  await page.evaluate(data => {
    data.summary = { red_pct: 0, weighted_risk_score: 0 };
    data.scoring = {}; drawTrend(data);
  }, data);
  await expect(page.locator('#trend-chart-wrap')).toContainText('本期核心证据覆盖待确认');
  await expect(page.locator('#trend-chart-wrap')).toContainText('0.0%');
  await expect(page.locator('#trend-chart-wrap')).toContainText('0.0 / 100');
});

test('Empty to chart to empty restores height, legend and hover after resize', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const data = fixture(); await open(page, data);
  const chart = { ...data, history_seed: [
    { week: '10-26', red_pct: 30.4, risk_score: 43.5 },
    { week: '11-02', red_pct: 34.8, risk_score: 47.8 }
  ] };
  await page.evaluate(data => { lastData = data; drawTrend(data); }, chart);
  const wrap = page.locator('#trend-chart-wrap');
  await expect(wrap.locator('svg')).toHaveCount(1);
  await expect(page.locator('.trend:has(#trend-chart-wrap) .trend-legend')).toBeVisible();
  expect((await wrap.boundingBox()).height).toBe(220);
  await wrap.locator('svg').hover();
  await expect(page.locator('#trend-tooltip')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 1000 });
  await expect(wrap.locator('svg')).toHaveAttribute('width', '350');
  await expect(wrap.locator('svg circle')).toHaveCount(4);
  await page.evaluate(data => { lastData = data; drawTrend(data); }, data);
  await expect(wrap).toContainText('21/23 项');
  await expect(wrap.locator('svg')).toHaveCount(0);
  expect(errors).toEqual([]);
});
