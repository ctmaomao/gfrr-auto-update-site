import { buildApprovedBubbleWeeklyEditorial } from '../helpers/bubble-editorial-fixture.mjs';
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const source = JSON.parse(fs.readFileSync('data/bubble-watch.json', 'utf8'));
const base = structuredClone(source);
delete base.summary.weekly_editorial;
const makeStatus = (reason = 'no_credible_news') => ({ schemaVersion: 'bubble-watch-editorial-status-v1',
  asOfDate: base.as_of_date, checkedAt: new Date().toISOString(), reason, sourceRunId: '123', reservations: {} });
const json = value => ({ contentType: 'application/json', body: JSON.stringify(value) });

for (const width of [1440, 390]) {
  test(`Bubble refresh reason preserves paper layout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.route('**/data/bubble-watch.json?*', route => route.fulfill(json(base)));
    await page.route('**/data/bubble-watch-editorial-status.json?*', route => route.fulfill(json(makeStatus())));
    const directory = 'manual-artifacts/bubble-followup';
    fs.mkdirSync(directory, { recursive: true });
    await page.goto('/bubble-watch.html');
    await expect(page.locator('#editorial-refresh-note')).toContainText('尚无官方来源或跨来源确认');
    await expect(page.locator('.weekly-editorial')).toHaveCount(0);
    await expect(page.locator('section.category article.indicator')).toHaveCount(27);
    await page.locator('.verdict').screenshot({ path: `${directory}/after-${width}.png` });
    await page.locator('#editorial-refresh-note').screenshot({ path: `${directory}/status-${width}.png` });
    const sample = await page.locator('#editorial-refresh-note').evaluate(node => ({
      font: getComputedStyle(node).fontFamily, color: getComputedStyle(node).color,
      overflow: document.documentElement.scrollWidth > innerWidth
    }));
    expect(sample.overflow).toBe(false);
    fs.writeFileSync(`${directory}/sample-${width}.json`, JSON.stringify(sample, null, 2));
  });
}

test('Bubble reasons distinguish failure, stale/mismatched diagnostics, and reservation use', async ({ page }) => {
  await page.route('**/data/bubble-watch.json?*', route => route.fulfill(json(base)));
  let status = makeStatus();
  await page.route('**/data/bubble-watch-editorial-status.json?*', route => route.fulfill(json(status)));
  for (const [reason, text] of [
    ['provider_failed', '不会自动再次付费重试'], ['search_failed', '新闻检索服务异常'],
    ['validation_or_publish_failed', '输出审阅或发布检查未通过'], ['unverified', '运行证据不完整']
  ]) {
    status = makeStatus(reason);
    await page.goto('/bubble-watch.html');
    await expect(page.locator('#editorial-refresh-note')).toContainText(text);
  }
  for (const patch of [{ asOfDate: '2000-01-01' }, { checkedAt: '2000-01-01T00:00:00Z' }, { checkedAt: '2099-01-01T00:00:00Z' }, { checkedAt: [new Date().toISOString()] }]) {
    status = { ...makeStatus(), ...patch };
    await page.goto('/bubble-watch.html');
    await expect(page.locator('#editorial-refresh-note')).toContainText('刷新状态暂未核实');
    await expect(page.locator('#editorial-refresh-note')).not.toContainText('新闻检索成功');
    await expect(page.locator('section.category article.indicator')).toHaveCount(27);
  }
  status = makeStatus();
  status.reservations[base.as_of_date] = { asOfDate: base.as_of_date, admittedRunId: '123' };
  await page.goto('/bubble-watch.html');
  await expect(page.locator('#editorial-refresh-note')).toContainText('本周补检已完成');
});

test('Bubble status request failure cannot hide deterministic content', async ({ page }) => {
  await page.route('**/data/bubble-watch.json?*', route => route.fulfill(json(base)));
  await page.route('**/data/bubble-watch-editorial-status.json?*', route => route.abort());
  await page.goto('/bubble-watch.html');
  await expect(page.locator('section.category article.indicator')).toHaveCount(27);
  await expect(page.locator('.verdict h2')).toHaveText(base.summary.verdict_label);
  await expect(page.locator('#editorial-refresh-note')).toContainText('刷新状态暂未核实');
});

test('Bubble expiry and current AI take precedence over diagnostic status', async ({ page }) => {
  const data = structuredClone(source);
  const layer = buildApprovedBubbleWeeklyEditorial(data, new Date().toISOString());
  data.summary.weekly_editorial = layer;
  layer.generatedAt = new Date().toISOString();
  layer.freshness.artifactGeneratedAt = layer.generatedAt;
  await page.route('**/data/bubble-watch.json?*', route => route.fulfill(json(data)));
  await page.route('**/data/bubble-watch-editorial-status.json?*', route => route.fulfill(json(makeStatus())));
  await page.goto('/bubble-watch.html');
  await expect(page.locator('.weekly-editorial')).toHaveCount(1);
  await expect(page.locator('#editorial-refresh-note')).toBeEmpty();
  layer.freshness.artifactGeneratedAt = '2000-01-01T00:00:00Z';
  await page.goto('/bubble-watch.html');
  await expect(page.locator('#editorial-refresh-note')).toContainText('超过 10 天有效期');
  await expect(page.locator('.weekly-editorial')).toHaveCount(0);
  layer.asOfDate = '2000-01-01';
  await page.goto('/bubble-watch.html');
  await expect(page.locator('#editorial-refresh-note')).toContainText('对应上一期数据');
});
