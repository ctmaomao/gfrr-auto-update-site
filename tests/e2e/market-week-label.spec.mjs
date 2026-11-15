import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const BASE = '4b32f25ecdbb06043e17ba1abd82b8f6b89ef243';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
for (const width of [1440, 390]) {
  test(`market weekly label before and after at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.clock.setFixedTime(new Date('2026-11-14T18:00:00Z'));
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    let originalNumbers;
    for (const variant of ['before', 'after']) {
      await page.unrouteAll();
      await page.route('http://127.0.0.1:4173/**', async route => {
        const path = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//, '');
        if (!/^(?:index\.html|scripts\/|assets\/|data\/|realtime\/)/.test(path) || path.includes('..')) return route.continue();
        if (variant === 'after' && !/^(?:data|realtime)\//.test(path)) return route.continue();
        const type = types[/\.[^.]+$/.exec(path)?.[0]];
        if (!type) return route.continue();
        try {
          const body = execFileSync('git', ['show', `${BASE}:${path}`], { stdio: ['ignore', 'pipe', 'pipe'] });
          await route.fulfill({ status: 200, contentType: type, body });
        } catch { await route.fulfill({ status: 404, body: 'Not present in baseline' }); }
      });
      await page.goto('/index.html?view=radar');
      await expect(page.locator('body')).toHaveClass(/gfrr-data-ready/);
      await page.evaluate(() => globalThis.document.fonts.ready);
      const numbers = await page.locator('#mt-zscore-value, #mt-close, #mt-ma60, #mt-stddev, #mt-zscore-range').allTextContents();
      if (variant === 'before') originalNumbers = numbers;
      else {
        expect(numbers).toEqual(originalNumbers);
        await expect(page.locator('#mt-narrative')).toContainText('来源周线标签为 2026-11-13');
        await expect(page.locator('#mt-narrative')).toContainText('不据此确认行情新鲜度');
        await expect(page.locator('#mt-narrative')).not.toContainText('在 2026-11-13 的收盘价');
        await expect(page.locator('#c7-ndx-note')).toContainText('实际收盘日和完整周尚未核验');
      }
      expect(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth)).toBe(true);
      for (const id of ['homepage-market-temperature', 'card-c7-ndx']) {
        const card = page.locator(`#${id}`);
        await card.screenshot({ path: testInfo.outputPath(`${variant}-${id}-${width}.png`) });
        const style = await card.evaluate(el => { const s = el.ownerDocument.defaultView.getComputedStyle(el); return { background: s.backgroundColor, color: s.color, font: s.fontFamily }; });
        const stylePath = testInfo.outputPath(`${variant}-${id}-${width}-styles.json`);
        writeFileSync(stylePath, JSON.stringify(style, null, 2));
        await testInfo.attach(`${variant}-${id}-styles`, { path: stylePath, contentType: 'application/json' });
      }
    }
    expect(errors).toEqual([]);
  });
}
