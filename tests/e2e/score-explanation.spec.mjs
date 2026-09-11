import { expect, test } from '@playwright/test';

for (const width of [1440, 390]) {
  test(`score decomposition and missing comparison are honest at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/data/radar-data.json', async route => {
      const response = await route.fetch();
      const data = await response.json();
      data.score = 68;
      data.modules = { geopolitical: 80, energy: 88, inflation: 59, liquidity: 36, debt: 32, banking: 28 };
      data.tailRiskOverlay = { baseScore: 53, adjustedScore: 68, scoreAdd: 15, applied: true };
      data.transportShockScoringImpact = { scoreBeforeTransport: 68, scoreAfterTransport: 68, contributionPct: 0 };
      data.scoreChange7d = null;
      data.timeDimension.scoreChange30d = null;
      delete data.macroRiskEditorialLayer;
      data.displayInputsBaseline.brent = 109.51;
      data.brentPricingLayer.selectedBrent.source = 'fred:DCOILBRENTEU';
      data.brentPricingLayer.selectedBrent.value = 109.51;
      data.brentPricingLayer.publicSpotProxy = { value: 109.51, observedAt: '2026-09-09' };
      await route.fulfill({ response, json: data });
    });
    await page.goto('/index.html');
    await expect(page.locator('body')).toHaveClass(/gfrr-data-ready/u);
    await expect(page.locator('#hero-score-value')).toHaveText('68/100');
    await expect(page.locator('#hero-verdict-body')).toContainText('六模块基础分 53,尾部风险规则升档 +15 至 68');
    await expect(page.locator('#hero-verdict-body')).toContainText('现货观测日 2026-09-09');
    await expect(page.locator('#hero-verdict-body')).not.toContainText('原始风险分');
    await expect(page.locator('#hero-weekly-change')).toHaveText('趋势待累计');
    await expect(page.locator('#detail-time-change')).toHaveText('趋势待累计');
    await expect(page.locator('#threshold-now-line')).toContainText('模型综合分 68');
    await expect(page.locator('#threshold-now-line')).not.toContainText('高风险预警');
    await expect(page.locator('#threshold-now-line')).not.toContainText('原始');
    const layout = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    expect(layout.scroll).toBeLessThanOrEqual(layout.width + 1);
    expect(errors).toEqual([]);
    await page.locator('#homepage-today-judgment').screenshot({ path: `test-results/score-explanation-${width}.png` });
  });
}
