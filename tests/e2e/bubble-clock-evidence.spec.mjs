/* global document, getComputedStyle */
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';

// Read-only visual evidence: no source/provider calls and no production JSON writes.
for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`Bubble observation clocks and proxy disclosure at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.clock.install({ time: new Date('2026-11-13T12:00:00Z') });
    const data = JSON.parse(readFileSync('data/bubble-watch.json', 'utf8'));
    data.market_technical_heat.as_of_date = '2026-11-09';
    data.market_technical_heat.basket.latestDate = '2026-11-09';
    data.market_technical_heat.status = 'green';
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let unavailable = false;
    await page.route('**/data/bubble-watch.json?*', route => unavailable
      ? route.fulfill({ status: 503, body: 'unavailable' }) : route.fulfill({ json: data }));
    await page.route('**/data/bubble-watch-editorial-status.json?*', route => route.fulfill({ status: 404, body: '' }));
    const capture = async name => {
      await page.evaluate(() => document.fonts.ready);
      const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
      const styles = await page.locator('#technical-observation-date, #credit-spreads .credit-notice').evaluateAll(elements => elements.map(el => {
        const style = getComputedStyle(el);
        return { text: el.textContent, background: style.backgroundColor, color: style.color, fontFamily: style.fontFamily };
      }));
      await writeFile(testInfo.outputPath(`${name}-${viewport.width}-styles.json`), JSON.stringify(styles, null, 2));
      await page.screenshot({ path: testInfo.outputPath(`${name}-${viewport.width}.png`), fullPage: true });
    };
    await page.goto('/bubble-watch.html');
    await expect(page.locator('section.category article.indicator')).toHaveCount(27);
    await expect(page.locator('#technical-observation-date')).toContainText('价格观察截至 2026-11-09 · 已过4天');
    await expect(page.locator('#credit-spreads .credit-notice').first()).toContainText('并非 AI 企业或数据中心专属利差');
    await capture('bubble-current-clock');
    await page.clock.fastForward(86400000);
    await expect(page.locator('#technical-observation-date')).toContainText('已过5天');
    for (const [state, date] of [['invalid', '2026-02-30'], ['future', '2026-11-15'], ['mismatch', '2026-11-08']]) {
      data.market_technical_heat.basket.latestDate = date;
      await page.reload();
      await expect(page.locator('#technical-observation-date')).toContainText('价格观察日期待核验');
      await capture(`bubble-clock-${state}`);
    }
    data.market_technical_heat.status = 'unavailable';
    await page.reload();
    await expect(page.locator('#technical-observation-date')).toContainText('观测暂缺');
    await expect(page.locator('#market-technical-heat .technical-headline')).toHaveText('数据暂缺');
    await expect(page.locator('#market-technical-heat .summary-text')).toContainText('不展示未经确认的分数、灯色或指标');
    await expect(page.locator('#market-technical-heat article.indicator')).toHaveCount(0);
    await expect(page.locator('#market-technical-heat .counts')).toHaveText('辅助观察 · 数据暂缺');
    await capture('bubble-technical-unavailable');
    unavailable = true;
    await page.reload();
    await expect(page.locator('.error')).toContainText('数据加载失败');
    await expect(page.locator('section.category article.indicator')).toHaveCount(0);
    await capture('bubble-data-unavailable');
    expect(errors).toEqual([]);
  });
}
