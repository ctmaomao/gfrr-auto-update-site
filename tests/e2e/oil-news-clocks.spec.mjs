/* global document, innerWidth, getComputedStyle */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';

const read = name => JSON.parse(readFileSync(`data/${name}`, 'utf8'));
for (const width of [1440, 390]) for (const missing of [false, true]) {
  test(`oil news snapshot clocks ${missing ? 'unknown' : 'dated'} at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 950 });
    const news = read('oil-news-event-watch.json');
    const world = read('world-order-stress.json');
    const now = Date.now();
    news.generatedAt = new Date(now - 3600000).toISOString();
    news.freshness.latestArticleAt = new Date(now - 86400000).toISOString();
    world.marketConfirmationInput = { ...world.marketConfirmationInput, brent: 101, updatedAt: new Date(now - 7200000).toISOString() };
    // Deliberately untrustworthy producer age: the page must use the dated article.
    news.freshness.latestArticleAgeHours = -999;
    world.marketConfirmationInput.ageMinutes = -999;
    if (missing) {
      news.generatedAt = null;
      news.freshness.latestArticleAt = null;
      world.marketConfirmationInput.updatedAt = null;
    }
    await page.route('**/data/oil-news-event-watch.json*', route => route.fulfill({ json: news }));
    await page.route('**/data/world-order-stress.json*', route => route.fulfill({ json: world }));
    await page.goto('/index.html?view=radar');
    await expect(page.locator('body')).toHaveClass(/gfrr-data-ready/);
    const window = page.locator('#odp-news-event-window');
    const market = page.locator('#odp-news-event-market');
    await expect(window).toContainText('快照生成');
    await expect(window).toContainText(missing ? '最新报道 时点待核' : '距本次打开时');
    await expect(market).toContainText(missing ? '时点或数值待核' : '非报价观察时间');
    await expect(window).not.toContainText('-999');
    await expect(market).not.toContainText('-999');
    await expect(page.locator('#odp-news-event-status')).toContainText('采集时');
    await window.evaluate(el => {
      for (let parent = el.parentElement; parent; parent = parent.parentElement) {
        if (parent.tagName === 'DETAILS') parent.open = true;
      }
    });
    await page.evaluate(() => document.fonts.ready);
    await expect(window).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    const card = page.locator('.odp-energy-group').filter({ has: window });
    await expect(card).toHaveCount(1);
    await card.scrollIntoViewIfNeeded();
    await card.screenshot({ path: testInfo.outputPath('oil-news-card.png') });
    await page.screenshot({ path: testInfo.outputPath('oil-news-context.png') });
    const sample = await card.evaluate(el => {
      const style = getComputedStyle(el);
      return { background: style.backgroundColor, color: style.color, fontFamily: style.fontFamily, width: el.getBoundingClientRect().width };
    });
    await writeFile(testInfo.outputPath('oil-news-style.json'), JSON.stringify({ viewport: width, missing, fixture: true, ...sample }, null, 2));
  });
}
