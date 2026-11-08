import { expect, test } from '@playwright/test';

for (const width of [1440, 390]) {
  for (const contribution of [3, null]) {
    test(`retired attribution cannot drive OFR primary with ${contribution === null ? 'missing' : 'positive'} transport at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.route('**/data/radar-data.json', async route => {
        const response = await route.fetch();
        const data = await response.json();
        // Explicit legacy transition fixture, regardless of the deployed model.
        delete data.mainPressureReadout; delete data.advicePolicy;
        data.score = 71;
        data.tailRiskOverlay = { baseScore: 57, adjustedScore: 68, scoreAdd: 11, applied: true };
        data.transportShockScoringImpact = { scoreBeforeTransport: 68, scoreAfterTransport: 71, contributionPct: contribution };
        await route.fulfill({ response, json: data });
      });
      await page.goto('/index.html?view=radar');
      await expect(page.locator('body')).toHaveClass(/gfrr-data-ready/u);
      await expect(page.locator('#hero-score-value')).toHaveText('—');
      await expect(page.locator('#hero-verdict-headline')).toHaveText('官方读数待更新');
      await expect(page.locator('#hero-score-attribution')).toHaveText('官方读数待更新');
      await expect(page.locator('#hero-verdict-body')).not.toContainText('71');
      await expect(page.locator('#hero-four-lanes')).not.toContainText('运输贡献 3');
      const layout = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
      expect(layout.scroll).toBeLessThanOrEqual(layout.width + 1);
    });
  }
  test(`score decomposition and missing comparison are honest at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/data/radar-data.json', async route => {
      const response = await route.fetch();
      const data = await response.json();
        // Explicit legacy transition fixture, regardless of the deployed model.
        delete data.mainPressureReadout; delete data.advicePolicy;
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
    await page.goto('/index.html?view=radar');
    await expect(page.locator('body')).toHaveClass(/gfrr-data-ready/u);
    await expect(page.locator('#hero-score-value')).toHaveText('—');
    await expect(page.locator('#hero-verdict-headline')).toHaveText('官方读数待更新');
    await expect(page.locator('.threshold-header h4')).toContainText('读数解释');
    await expect(page.locator('.threshold-bar-wrap')).toBeHidden();
    await expect(page.locator('#hero-verdict-body')).not.toContainText('系统性顶部');
    await expect(page.locator('#hero-score-attribution')).toHaveText('官方读数待更新');
    await expect(page.locator('#homepage-today-judgment .big-left')).toContainText('原六模块单列为旧模型诊断');
    await expect(page.locator('#hero-verdict-body')).not.toContainText('尾部风险规则升档');
    await expect(page.locator('#hero-weekly-change')).toHaveText('趋势待累计');
    await expect(page.locator('#detail-time-change')).toBeHidden();
    await expect(page.locator('#threshold-now-line')).toHaveText('十年历史位置待累计');
    await expect(page.locator('#legacy-model-diagnostics-note')).toContainText('不是OFR分解');
    const layout = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    expect(layout.scroll).toBeLessThanOrEqual(layout.width + 1);
    expect(errors).toEqual([]);
    await page.locator('#homepage-today-judgment').screenshot({ path: `test-results/score-explanation-${width}.png` });
  });
}
