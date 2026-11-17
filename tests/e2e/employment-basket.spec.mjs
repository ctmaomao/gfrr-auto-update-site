import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const base = JSON.parse(readFileSync('data/radar-data.json', 'utf8'));
// Synthetic renderer qualification fixtures, not reconstructed historical data.
const basket = {
  industryPayrollMethod: 'custom-overlapping-11-series-mom-v1',
  industryPayrollDiffusionPct: 63.6, industryPayrollPositiveCount: 7,
  industryPayrollSeriesCount: 11, industryPayrollUpdatedAt: '2026-10-01T00:00:00Z',
  industryDiffusionRegime: '温和扩张',
};
for (const width of [1440, 390]) {
  for (const state of ['live', 'fallback', 'legacy', 'missing']) {
    test(`employment custom basket ${state} at ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 950 });
      const radar = structuredClone(base);
      const employment = radar.macroDrivers.employment;
      Object.assign(employment, basket);
      employment.sourceStatus = { ...employment.sourceStatus, industryPayroll: state === 'legacy' ? 'live' : state };
      if (state === 'legacy') delete employment.industryPayrollMethod;
      if (state === 'missing') {
        employment.industryPayrollDiffusionPct = null;
        employment.industryPayrollUpdatedAt = null;
      }
      await page.route('**/data/radar-data.json*', route => route.fulfill({ json: radar }));
      await page.goto('/index.html?view=radar');
      const card = page.locator('#card-c4-employment');
      const period = card.locator('#c4-employment-regime');
      const expected = { live: '2026-10 观察 · 本次获取', fallback: '2026-10 观察 · 沿用旧值', legacy: '旧快照，周期未核验', missing: '—' }[state];
      await expect(period).toHaveText(expected);
      await expect(card.locator('#c4-employment-diffusion')).toHaveText(['live', 'fallback'].includes(state) ? '63.6%（7/11 序列）' : '—');
      await expect(card).toContainText('零售嵌套于贸易、运输与公用事业');
      await expect(card).not.toContainText('11 行业扩张占比');
      if (state !== 'live') await expect(card.locator('#c4-employment-badge')).toHaveText('待核验');
      await card.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
      await card.screenshot({ path: testInfo.outputPath(`employment-${state}-${width}.png`) });
      const styles = await card.evaluate(el => {
        const css = getComputedStyle(el);
        return { background: css.backgroundColor, color: css.color, fontFamily: css.fontFamily };
      });
      await testInfo.attach('employment-card-computed-style', { body: JSON.stringify(styles), contentType: 'application/json' });
    });
  }
}
