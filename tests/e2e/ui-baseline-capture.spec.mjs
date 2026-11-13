import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';

// Immutable pre-change main. Baseline resources are read from Git, never fetched
// from production or published. This is screenshot evidence, not a test bypass.
const BASE = 'e1798ac346376f5fce34c2aeeed0338be63ac4f7';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
for (const width of [1440, 390]) {
  test(`immutable pre-change UI visual baseline ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.clock.setFixedTime(new Date('2026-11-13T23:00:00Z'));
    for (const variant of ['before', 'after']) {
    await page.unrouteAll();
    await page.route('http://127.0.0.1:4173/**', async route => {
      const path = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//, '');
      if (!/^(?:index\.html|bubble-watch\.html|scripts\/|assets\/|data\/|realtime\/)/.test(path) || path.includes('..')) return route.continue();
      // Same immutable data in both passes; only the before pass replaces UI.
      if (variant === 'after' && !/^(?:data|realtime)\//.test(path)) return route.continue();
      const ext = /\.[^.]+$/.exec(path)?.[0];
      if (!types[ext]) return route.continue();
      try {
        const body = execFileSync('git', ['show', `${BASE}:${path}`], { stdio: ['ignore', 'pipe', 'pipe'] });
        await route.fulfill({ status: 200, contentType: types[ext], body });
      } catch {
        await route.fulfill({ status: 404, body: 'Not present in pinned baseline' });
      }
    });
    await page.goto('/index.html?view=radar');
    await expect(page.locator('body')).toHaveClass(/gfrr-data-ready/);
    await page.evaluate(() => globalThis.document.fonts.ready);
    for (const id of ['card-c4-consumer', 'card-c8-econ', 'card-c8-arms', 'card-c4-employment']) {
      await page.locator(`#${id}`).screenshot({ path: testInfo.outputPath(`${variant}-${id}-${width}.png`) });
    }
    await page.locator('#world-order-stress-section > summary').click();
    await page.locator('#world-order-stress-section').screenshot({ path: testInfo.outputPath(`${variant}-world-order-${width}.png`) });
    await page.locator('#oil-directional-pressure details').first().evaluate(el => { el.open = true; });
    await page.locator('#oil-directional-pressure').screenshot({ path: testInfo.outputPath(`${variant}-oil-${width}.png`) });
    await page.goto('/bubble-watch.html');
    await expect(page.locator('section.category article.indicator')).toHaveCount(27);
    await page.evaluate(() => globalThis.document.fonts.ready);
    await page.screenshot({ path: testInfo.outputPath(`${variant}-bubble-${width}.png`), fullPage: true });
    }
    await testInfo.attach('baseline-commit', { body: BASE, contentType: 'text/plain' });
  });
}
