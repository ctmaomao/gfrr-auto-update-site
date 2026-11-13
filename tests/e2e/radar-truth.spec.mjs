import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const radar = JSON.parse(readFileSync('data/radar-data.json', 'utf8'));
const wo = JSON.parse(readFileSync('data/world-order-stress.json', 'utf8'));
for (const width of [1440, 390]) {
  test(`radar producer dates and C8 snapshot semantics ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('/index.html?view=radar');
    await expect(page.locator('body')).toHaveClass(/gfrr-data-ready/);
    await page.evaluate(() => globalThis.document.fonts.ready);
    const retail = radar.macroDrivers.consumerRetail;
    for (const key of ['cartsNominalUpdatedAt', 'cartsRealUpdatedAt']) {
      if (retail[key]) await expect(page.locator('#c4-consumer-note')).toContainText(retail[key].slice(0, 10));
    }
    await expect(page.locator('#c8-econ-number')).toHaveText(String(Math.round(wo.dimensions.economicWeaponization.score)));
    await expect(page.locator('#c8-econ-aux')).toContainText('当前评分快照');
    await expect(page.locator('#c8-econ-note')).not.toContainText('处于高位');
    expect(await page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth)).toBe(true);
    for (const id of ['card-c4-consumer', 'card-c8-econ', 'card-c8-arms', 'card-c4-employment']) {
      const card = page.locator(`#${id}`);
      await card.scrollIntoViewIfNeeded();
      await card.screenshot({ path: testInfo.outputPath(`${id}-${width}.png`) });
    }
    await page.locator('#world-order-stress-section > summary').click();
    await expect(page.locator('#wo-dim-weaponization-trend')).toContainText('当前快照');
    await page.locator('#world-order-stress-section').screenshot({ path: testInfo.outputPath(`world-order-${width}.png`) });
    const style = await page.locator('#card-c8-econ').evaluate(el => { const s = el.ownerDocument.defaultView.getComputedStyle(el); return { background: s.backgroundColor, color: s.color, font: s.fontFamily }; });
    await testInfo.attach(`computed-style-${width}`, { body: JSON.stringify(style), contentType: 'application/json' });
    expect(errors).toEqual([]);
  });
}
