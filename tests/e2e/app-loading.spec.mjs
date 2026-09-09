import { expect, test } from '@playwright/test';

for (const width of [1440, 390]) {
  test(`homepage renders primary data while ancillary request hangs (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let release;
    const pending = new Promise((resolve) => { release = resolve; });
    await page.route('**/data/oil-news-event-watch.json*', async (route) => {
      await pending;
      await route.abort();
    });
    try {
      await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body')).toHaveClass(/gfrr-data-ready/u, { timeout: 5000 });
      await expect(page.locator('#homepage-today-judgment')).toBeVisible();
      await expect(page.locator('#hero-score-value')).not.toHaveText('');
      const style = await page.locator('#homepage-today-judgment').evaluate((element) => ({
        color: getComputedStyle(element).color,
        font: getComputedStyle(element).fontFamily,
        overflow: document.documentElement.scrollWidth > window.innerWidth,
      }));
      expect(style.overflow).toBe(false);
      expect(style.font).toContain('Noto Serif SC');
      expect(errors).toEqual([]);
    } finally {
      release();
    }
    await expect(page.locator('body')).toHaveClass(/gfrr-data-ready/u);
  });
}
