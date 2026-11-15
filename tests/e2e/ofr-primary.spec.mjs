import { test, expect } from '@playwright/test';
import { buildOfrReadout } from '../../scripts/daily/ofr-pressure-readout.mjs';
import { buildPublishedOfrComponent, retireLegacyAdvice } from '../../scripts/daily/ofr-publication-contract.mjs';

// Synthetic dated observations for integration tests. No network/source evidence
// or accuracy claims are derived from these values or their percentile.
function fixture(base, state, now) {
  const today = Date.parse(now.slice(0,10) + 'T00:00:00Z');
  const day = n => new Date(today + n * 86400000).toISOString().slice(0,10);
  const lastAge = state === 'stale' ? 12 : 4;
  const rows = Array.from({ length: 4001 }, (_, i) => ({ date: day(i - 4000 - lastAge), value: -2 + (i % 17) / 100 }));
  rows.at(-1).value = state === 'zero' ? 0 : state === 'missing' ? null : -1.829;
  const readout = buildOfrReadout(rows, { asOf: now, retrievedAt: now, snapshotSha256: 'a'.repeat(64) });
  let component = buildPublishedOfrComponent({ readout, rows, now });
  if (state === 'cached') component = buildPublishedOfrComponent({ previous: component, now });
  const output = retireLegacyAdvice(base, component);
  if (state === 'invalid') output.mainPressureReadout.source.provider = 'other';
  if (state === 'legacy') { delete output.mainPressureReadout; delete output.advicePolicy; output.score = 99; }
  return output;
}

for (const width of [1440,390]) for (const state of ['negative','zero','cached','stale','missing','invalid','legacy']) {
  test(`OFR primary ${state} at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 }); const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    let input;
    await page.route('**/data/radar-data.json', async route => {
      const response = await route.fetch(); input = fixture(await response.json(), state, new Date().toISOString());
      await route.fulfill({ response, json: input });
    });
    // A broken old score history must neither seed nor invalidate the OFR curve.
    await page.route('**/data/radar-history.json*', route => route.fulfill({ json: [{ date: null, score: 99 }] }));
    await page.goto('/index.html?view=radar'); await expect(page.locator('body')).toHaveClass(/gfrr-data-ready/);
    const expected = state === 'negative' ? '-1.829' : state === 'zero' ? '0.000' : '—';
    await expect(page.locator('#hero-score-value')).toHaveText(expected);
    await expect(page.locator('#hero-score-value sup')).toHaveCount(0);
    if (state === 'stale') {
      await expect(page.locator('#hero-verdict-headline')).toHaveText('观察已超龄');
      await expect(page.locator('#hero-score-attribution')).toContainText(input.mainPressureReadout.index.observedDate);
      await expect(page.locator('#hero-score-attribution')).toContainText('-1.829');
    }
    if (state === 'cached') await expect(page.locator('#hero-verdict-headline')).toHaveText('抓取失败 · 保留旧观察');
    if (state === 'missing') await expect(page.locator('#hero-verdict-headline')).toHaveText('最新观察缺值');
    await expect(page.locator('#macro-risk-editorial')).toBeHidden();
    await expect(page.locator('.threshold-bar-wrap')).toBeHidden();
    await expect(page.locator('#trend-line-score')).toBeHidden();
    await expect(page.locator('#c2-gold-badge')).toHaveText('背景');
    if (state === 'negative' || state === 'zero') {
      await expect(page.locator('#ofr-trend-svg polyline')).toHaveCount(1);
      await expect(page.locator('#threshold-now-line')).toContainText('严格过去十年历史百分位');
      await expect(page.locator('#hero-dominant-chain')).toHaveText(input.mainPressureReadout.index.observedDate);
      await expect(page.locator('#hero-weekly-change')).toContainText('→');
    }
    await page.locator('#execution-risk-detail > summary').click();
    await expect(page.locator('#advice-retirement-notice')).toBeVisible();
    await expect(page.locator('#legacy-advice-body')).toBeHidden();
    const execution = await page.locator('#execution-risk-detail').innerText();
    expect(execution).not.toMatch(/30%|35%|42%|只允许减仓|禁止新增/);
    const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth, nav: document.querySelectorAll('.dashboard-jump-nav a').length }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client + 1); expect(dimensions.nav).toBe(13);
    expect(errors).toEqual([]);
  });
}
