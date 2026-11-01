import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { editorialHistoryFixture } from '../fixtures/macro-editorial-history.mjs';

for (const width of [1440, 390]) {
  test(`legacy current and previous editorials cannot explain OFR at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const now = new Date().toISOString();
    const originalDate = new Date(Date.now() - 8 * 86400000).toISOString();
    const history = editorialHistoryFixture(originalDate);
    let fresh = false;
    await page.route('**/data/radar-data.json', async route => {
      const response = await route.fetch();
      const data = await response.json();
      // Exercise a legacy publication during cutover, not the current OFR input.
      delete data.mainPressureReadout; delete data.advicePolicy;
      data.updatedAt = now;
      data.macroRiskEditorialPreviousIssue = history;
      delete data.macroRiskEditorialLayer;
      if (fresh) {
        data.macroRiskEditorialLayer = editorialHistoryFixture(now);
        data.macroRiskEditorialLayer.output.headlineZh = '新一期已生成：本期宏观判读';
        data.macroRiskEditorialLayer.provenance.artifactDigest = data.macroRiskEditorialLayer.validation.artifactDigest
          = createHash('sha256').update(JSON.stringify(data.macroRiskEditorialLayer.output)).digest('hex');
      }
      await route.fulfill({ response, json: data });
    });
    await page.goto('/index.html');
    await expect(page.locator('body')).toHaveClass(/gfrr-data-ready/u);
    await expect(page.locator('#macro-risk-editorial')).toBeHidden();
    await expect(page.locator('.macro-editorial-previous-notice')).toHaveCount(0);
    await expect(page.locator('#macro-professional-evidence')).toHaveAttribute('open', '');
    await expect(page.locator('#homepage-pressure-sources')).toBeVisible();
    await expect(page.locator('#hero-score-value')).toHaveText('—');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    expect(overflow).toBe(false);
    fresh = true;
    await page.reload();
    await expect(page.locator('#macro-risk-editorial')).toBeHidden();
    await expect(page.locator('#macro-editorial-title')).toHaveCount(0);
    await expect(page.locator('.macro-editorial-previous-notice')).toHaveCount(0);
    await expect(page.locator('#macro-professional-evidence')).toHaveAttribute('open', '');
    expect(errors).toEqual([]);
  });
}

test('unqualified history remains hidden with deterministic evidence available', async ({ page }) => {
  await page.route('**/data/radar-data.json', async route => {
    const response = await route.fetch();
    const data = await response.json();
    delete data.macroRiskEditorialLayer;
    data.macroRiskEditorialPreviousIssue = editorialHistoryFixture();
    data.macroRiskEditorialPreviousIssue.qualityReview.status = 'fail';
    await route.fulfill({ response, json: data });
  });
  await page.goto('/index.html');
  await expect(page.locator('body')).toHaveClass(/gfrr-data-ready/u);
  await expect(page.locator('#macro-risk-editorial')).toBeHidden();
  await expect(page.locator('#macro-professional-evidence')).toHaveAttribute('open', '');
});
