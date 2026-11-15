/* global document, innerWidth */
import { test, expect } from '@playwright/test';

for (const width of [1440, 390]) {
  test(`source health and observation provenance remain separate at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.clock.install({ time: new Date('2026-11-09T12:00:00Z') });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    let missing = false;
    await page.route('**/data/radar-data.json*', async route => {
      const response = await route.fetch(), data = await response.json();
      data.updatedAt = '2026-11-01T01:00:00Z';
      data.dailyRealtimeInput = { healthScore: 100, sourceMode: 'live', updatedAt: '2026-11-01T00:30:00Z', capturedAt: data.updatedAt };
      data.brentPricingLayer = {
        selectedBrent: { source: 'fred:DCOILBRENTEU', value: 107.03, observedAt: '2026-11-08T01:41:30Z' },
        publicSpotProxy: { source: 'fred-anchor', value: 107.03, observedAt: '2026-11-03' },
        eiaBrentSpotProxy: { price: 107.03, updatedAt: '2026-11-03T00:00:00Z' },
        futuresProxy: { value: 98.32, observedAt: '2026-11-06T21:59:44Z' },
        iceFuturesPriceCurve: { frontPrice: 97.97, contracts: [{ price: 97.97, contract: 'Jan27', updatedAt: '2026-11-06T22:59:00Z' }] },
        proxySpread: { spotMinusFutures: 8.71, maxProxyDivergencePct: 8.365 },
      };
      data.displayInputsBaseline.brent = 107.03;
      if (missing) {
        data.brentPricingLayer = {};
        data.displayInputsBaseline.brent = null;
        delete data.dailyRealtimeInput.capturedAt;
        delete data.dailyRealtimeInput.updatedAt;
      }
      await route.fulfill({ response, json: data });
    });
    await page.goto('/index.html?view=radar');
    await expect(page.locator('body')).toHaveClass(/gfrr-data-ready/);
    await expect(page.locator('#hero-data-health')).toContainText('历史快照');
    await expect(page.locator('#hero-data-health')).toContainText('100/100');
    await expect(page.locator('#ofr-time-provenance')).toContainText('获取');
    await expect(page.locator('#ofr-time-provenance')).toContainText('派生计算');
    await expect(page.locator('#hero-four-lanes')).toContainText('OFR偏低不代表结构安全');
    await expect(page.locator('#c1-brent-aux')).toContainText('2026-11-03');
    await expect(page.locator('#c1-brent-futures')).toContainText('合约月未核实');
    await expect(page.locator('#c1-brent-ice')).toContainText('Jan27');
    await expect(page.locator('#c1-brent-spread')).toHaveText('— · 日期或合约未对齐');
    await expect(page.locator('#card-c2-dxy .name-en')).toHaveText('BROAD USD INDEX');
    await page.locator('#detail-data > summary').click();
    await expect(page.locator('#detail-health-input-at')).toHaveText('2026-11-01 00:30 UTC');
    await expect(page.locator('#detail-health-captured')).toHaveText('2026-11-01 01:00 UTC');
    await expect(page.locator('#detail-health-freshness')).toContainText('历史快照');
    await expect(page.locator('#detail-health-live-note-active')).toContainText('来源正常与数据足够新是两回事');
    await page.locator('#detail-data > summary').click();
    await page.locator('#detail-data > summary').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    missing = true; await page.reload();
    await expect(page.locator('body')).toHaveClass(/gfrr-data-ready/);
    await expect(page.locator('#c1-brent-number')).toHaveText('—');
    await expect(page.locator('#c1-brent-eia')).toContainText('观察日未核实');
    await page.locator('#detail-data > summary').click();
    await expect(page.locator('#detail-health-input-at')).toHaveText('未记录或待核验');
    await expect(page.locator('#detail-health-captured')).toHaveText('未记录或待核验');
    expect(errors).toEqual([]);
  });
}
