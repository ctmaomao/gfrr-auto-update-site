import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
/* global document, innerWidth */
import { buildOfrReadout } from '../../scripts/daily/ofr-pressure-readout.mjs';
import { buildPublishedOfrComponent, retireLegacyAdvice } from '../../scripts/daily/ofr-publication-contract.mjs';
import { buildApprovedBubbleWeeklyEditorial } from '../helpers/bubble-editorial-fixture.mjs';
import { buildNvdaGap } from '../../scripts/bubble-watch/nvda-ratio-evidence.mjs';
import { replayEvidenceScores, validateEvidenceScoreFields } from '../../scripts/bubble-watch/evidence-score-contract.mjs';

test('Bubble age timer remains quiet after malformed data enters the error state', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-23T12:00:00Z') });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/data/bubble-watch.json*', route => route.fulfill({ json: { summary: {}, indicators: null } }));
  await page.goto('/bubble-watch.html');
  await expect(page.locator('#root .error')).toBeVisible();
  await page.clock.runFor(60001);
  await expect(page.locator('#root .error')).toBeVisible();
  expect(errors).toEqual([]);
});

for (const width of [1440, 390]) {
  test(`NVDA legacy ratio is visibly unqualified and a new gap uses published uncertainty at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.clock.install({ time: new Date('2026-11-04T12:00:00Z') });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('/bubble-watch.html');
    const card = page.locator('section.category article.indicator').filter({ hasText: 'NVDA 客户投资/收入比' });
    await expect(card.locator('.number')).toHaveText('待核验 · 期间或口径不可比');
    await expect(card).toContainText('灯色保留发布记录');
    await expect(page.locator('#bubble-data-freshness')).toContainText('已发布分数不可视为全部输入已获当前验证');
    let fixture;
    await page.route('**/data/bubble-watch.json*', async route => {
      const response = await route.fetch(); fixture = await response.json();
      const date = fixture.as_of_date;
      fixture.indicators = fixture.indicators.map(item => item.id === 'nvda_invest_revenue'
        ? buildNvdaGap(item, date, { reason: 'numerator_basis_unverified' }, `${date}T12:00:00Z`) : item);
      const r = replayEvidenceScores(fixture.indicators, 5);
      Object.assign(fixture.summary, {
        primary_score_pct: r.primary, red_pct: r.primary, weighted_risk_score: r.pressure,
        stage_score: r.stage, trigger_score: r.trigger, scoring_unknown_count: r.unknownIds.length,
        scoring_red_count: r.counts.red, scoring_yellow_count: r.counts.yellow, scoring_green_count: r.counts.green,
        primary_score_range_pct: r.primaryRange, weighted_risk_score_range: r.pressureRange,
        stage_score_range: r.stageRange, trigger_score_range: r.triggerRange,
        category_scores: Object.fromEntries(Object.entries(r.categories).map(([key,v])=>[key,v.point])),
        category_score_ranges: Object.fromEntries(Object.entries(r.categories).map(([key,v])=>[key,{lower:v.lower,upper:v.upper}])),
        verdict_label: r.verdictLabel
      });
      Object.assign(fixture.scoring, { effective_tier:r.effectiveTier, base_tier:r.baseTier,
        override_active:r.overrideActive, two_axis_upgrade:r.twoAxisUpgrade, tier_range:r.tierRange, unknown_core_ids:r.unknownIds });
      expect(validateEvidenceScoreFields(fixture)).toEqual([]);
      await route.fulfill({ response, json: fixture });
    });
    await page.reload();
    await expect(card.locator('.status-bar')).toHaveClass('status-bar unknown');
    await expect(card.locator('.number')).toContainText('待核验');
    await expect(page.locator('.big-number .value')).toContainText(fixture.summary.primary_score_range_pct.lower.toFixed(1));
    await expect(page.locator('.big-number .value')).toContainText(fixture.summary.primary_score_range_pct.upper.toFixed(1));
    await expect(page.locator('.score-role.core')).toHaveCount(23);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
  });

  test(`independent primary warnings retain dates and invalid records at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.clock.install({ time: new Date('2026-11-02T20:00:00Z') });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    let snapshotDate = '2026-11-02T12:00:00Z', tailReasons = [{ key: 'unknown_alert', floor: 82 }];
    let world = { score: 59, updatedAt: '2026-11-01T01:00:00Z', freshness: 'partial', externalSources: {
      gdeltEvents: { status: 'stale', summary: { windowStartDay: '20261022', windowEndDay: '20261028' } }
    } };
    await page.route('**/data/radar-data.json*', async route => {
      const response = await route.fetch(), data = await response.json();
      const now = '2026-11-02T12:00:00Z';
      const rows = [{ date: '2026-10-21', value: -0.5 }, { date: '2026-10-28', value: -1.829 }];
      const readout = buildOfrReadout(rows, { asOf: now, retrievedAt: now, snapshotSha256: 'a'.repeat(64) });
      const qualified = retireLegacyAdvice({ ...data, updatedAt: snapshotDate }, buildPublishedOfrComponent({ readout, rows, now }));
      qualified.tailRiskOverlay.reasons = tailReasons;
      await route.fulfill({ response, json: qualified });
    });
    await page.route('**/data/world-order-stress.json*', route => route.fulfill({ json: world }));
    await page.goto('/index.html?view=radar');
    await expect(page.locator('body')).toHaveClass(/gfrr-data-ready/);
    await expect(page.locator('#hero-score-value')).toHaveText('-1.829');
    await expect(page.locator('#hero-overlay-score')).toContainText('历史快照');
    await expect(page.locator('#hero-overlay-score')).toContainText('2026-10-22 → 2026-10-28');
    const tail = page.locator('#hero-four-lanes .hero-lane-row').filter({ hasText: '尾部与运输' });
    await expect(tail).toContainText('部分或全部无效');
    await expect(tail).not.toContainText('未记录尾部触发');
    await expect(page.locator('#hero-four-lanes .hero-lane-row')).toHaveCount(4);
    await expect(page.locator('.dashboard-jump-nav a')).toHaveCount(13);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    world.updatedAt = null; snapshotDate = '2026-11-01T01:00:00Z'; tailReasons = [];
    await page.reload();
    await expect(page.locator('#hero-overlay-score')).toContainText('日期无效');
    await expect(tail).toContainText('历史快照记录');
    world = null; snapshotDate = 'invalid'; tailReasons = undefined;
    await page.reload();
    await expect(page.locator('#hero-overlay-score')).toContainText('记录缺失');
    await expect(tail).toContainText('日期无效');
    await expect(tail).toContainText('尾部记录缺失');
    await expect(page.locator('#hero-score-value')).toHaveText('-1.829');
    expect(errors).toEqual([]);
  });

  test(`Bubble long-open tab rechecks card and issue age without changing lights at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.clock.install({ time: new Date('2026-11-22T12:00:00Z') });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    let input;
    await page.route('**/data/bubble-watch.json*', async route => {
      // Freeze the age-only fixture: a newer production issue must not move this test's expiry.
      input = structuredClone(JSON.parse(readFileSync(new URL('../../docs/fixtures/bubble-watch/legacy-contract-bundle.json', import.meta.url))).files['data/bubble-watch.json']);
      input.as_of_date = '2026-11-01';
      input.generated_at = '2026-11-01T12:00:00Z';
      const card = input.indicators.find(i => i.id === 'neocloud_credit');
      card.as_of = '2026-11-01'; card.provenance.maxAgeDays = 21; card.stale = false;
      input.summary.weekly_editorial = buildApprovedBubbleWeeklyEditorial(input, '2026-11-22T12:00:00Z');
      input.summary.weekly_editorial.freshness.maxAgeHours = 24;
      await route.fulfill({ json: input });
    });
    await page.goto('/bubble-watch.html'); await expect(page.locator('section.category article.indicator')).toHaveCount(27);
    await expect(page.locator('#weekly-editorial')).toBeVisible();
    // Find by recorded policy/date, rather than relying on a translated title.
    const index = input.indicators.findIndex(i => i.id === 'neocloud_credit');
    const age = page.locator(`#card-age-${index}`);
    await expect(age).toContainText('上限21天'); await expect(age).not.toContainText('已超龄');
    const before = await page.evaluate(() => ({ score: document.querySelector('.big-number .value').textContent,
      lights: [...document.querySelectorAll('.status-bar')].map(e => e.className),
      counts: document.querySelector('.breakdown').textContent }));
    await page.clock.setSystemTime(new Date('2026-11-23T12:00:00Z'));
    await page.clock.runFor(60001);
    await expect(page.locator('#weekly-editorial')).toHaveCount(0);
    await expect(page.locator('.verdict h2')).toHaveText(input.summary.verdict_label);
    await expect(age).toContainText('已超龄 22天');
    await expect(page.locator('#bubble-data-freshness')).toContainText('本期期次');
    await page.clock.setSystemTime(new Date('2026-12-06T12:00:00Z'));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.locator('#bubble-data-freshness')).toContainText('已过35天 / 上限35天');
    await expect(page.locator('#bubble-data-freshness')).not.toContainText('整期已超龄');
    await page.clock.setSystemTime(new Date('2026-12-07T12:00:00Z'));
    // Foregrounding a tab rechecks immediately, even if its timer was throttled.
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.locator('#bubble-data-freshness')).toContainText('整期已超龄');
    await expect(page.locator('#bubble-data-freshness')).toContainText('已过36天 / 上限35天');
    await expect(page.locator('#bubble-verdict-label')).toContainText('历史或待核验');
    const after = await page.evaluate(() => ({ score: document.querySelector('.big-number .value').textContent,
      lights: [...document.querySelectorAll('.status-bar')].map(e => e.className),
      counts: document.querySelector('.breakdown').textContent }));
    expect(after).toEqual(before);
    await expect(page.locator('.score-role.core')).toHaveCount(23);
    await expect(page.locator('.score-role.shadow')).toHaveCount(4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
  });
}
