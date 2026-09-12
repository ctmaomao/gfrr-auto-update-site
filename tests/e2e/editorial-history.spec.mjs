import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { editorialHistoryFixture } from '../fixtures/macro-editorial-history.mjs';

for (const width of [1440, 390]) {
  test(`previous editorial bridges a multi-day update gap at ${width}px`, async ({ page }, testInfo) => {
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
    await expect(page.locator('#macro-risk-editorial')).toBeVisible();
    await expect(page.locator('#macro-risk-editorial')).toHaveAttribute('data-editorial-mode', 'previous');
    await expect(page.locator('.macro-editorial-previous-notice')).toContainText('上一期判读，当前数据已更新');
    await expect(page.locator('.macro-editorial-previous-notice')).toContainText(originalDate.slice(0, 10));
    await expect(page.locator('.macro-editorial-previous-notice')).toContainText('不代表本期最新判断');
    await expect(page.locator('.macro-editorial-meta')).toContainText('原期综合分 42');
    await expect(page.locator('.macro-editorial-live-dot')).toHaveCount(0);
    await expect(page.locator('#macro-professional-evidence')).toHaveAttribute('open', '');
    await expect(page.locator('#macro-professional-evidence-status')).toContainText('上一期 AI 判读供参考');
    await expect(page.locator('#homepage-pressure-sources')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('AI 判读不可用');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    expect(overflow).toBe(false);
    await page.locator('.macro-editorial-header').screenshot({ path: testInfo.outputPath('previous-issue.png') });
    const style = await page.locator('.macro-editorial-previous-notice').evaluate(node => {
      const css = getComputedStyle(node);
      return { color: css.color, fontFamily: css.fontFamily, borderColor: css.borderTopColor, background: getComputedStyle(node.parentElement).background };
    });
    await testInfo.attach('history-style', { body: JSON.stringify(style), contentType: 'application/json' });

    fresh = true;
    await page.reload();
    await expect(page.locator('#macro-risk-editorial')).toHaveAttribute('data-editorial-mode', 'current');
    await expect(page.locator('#macro-editorial-title')).toContainText('新一期已生成');
    await expect(page.locator('.macro-editorial-previous-notice')).toHaveCount(0);
    await expect(page.locator('#macro-professional-evidence')).not.toHaveAttribute('open', '');
    await page.locator('.macro-editorial-header').screenshot({ path: testInfo.outputPath('current-issue.png') });
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
