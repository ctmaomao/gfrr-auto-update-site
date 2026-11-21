import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  parseObservationDate, latestDatedObservation, fallbackObservation, sameObservationDay, creditPeriodChange, reserveBalanceChange, cachedReserveBalanceChange, creLoanBalanceDate, creLoanBalanceSnapshot,
} from '../../scripts/daily/source-observation.mjs';

import { matchingH41Receipt } from '../../scripts/daily/h41-provenance.mjs';
import { requireStructuralObservation, structuralValueUsable, structuralObservationUsable,
  requireStructuralContinuity } from '../../scripts/daily/structural-freshness.mjs';

const PIPELINE = fileURLToPath(new URL('../../scripts/run-daily-pipeline.mjs', import.meta.url));
const FIXED_NOW = '2026-10-22T12:00:00Z';
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [FIXED_NOW])); }
  static now() { return Date.parse(FIXED_NOW); }
}

function extract(name) {
  const src = fs.readFileSync(PIPELINE, 'utf8');
  const start = src.indexOf(`async function ${name}`) >= 0
    ? src.indexOf(`async function ${name}`)
    : src.indexOf(`function ${name}`);
  const rest = src.slice(start + 10);
  const match = /\n(?:export )?(?:async )?function [A-Za-z0-9_]+/.exec(rest);
  const end = match ? start + 10 + match.index : -1;
  assert.ok(start >= 0 && end > start, `extract ${name}`);
  return src.slice(start, end);
}

const CLASSIFY_REPO_SPREAD = vm.runInNewContext(
  `${extract('classifyRepoSpreadRegime')}\nclassifyRepoSpreadRegime`,
  {},
);

function loadFed(fetchFed, nyFed, prev, options = {}) {
  const src = extract('resolveFedLiquidity', 'async function resolvePolicyExpectations');
  const sandbox = {
    Date: FixedDate,
    fetchFredSeries: fetchFed,
    fetchNyFedSecuredRatesLatest: typeof nyFed === 'function' ? nyFed : async () => nyFed,
    requireStructuralObservation: (rows) => (rows.at(-1)?.date ?? null),
    structuralLagValue: (rows) => (rows.length > 1 ? rows[0].value : null),
    findValueAgo: (rows) => (rows.length > 1 ? rows[0].value : null),
    structuralValueUsable: () => true,
    structuralSourceUsable: () => true,
    structuralObservationUsable: () => true,
    classifyFedAssetTrend: () => '平稳',
    classifyOnRrpLevel: () => '充裕',
    classifyRepoSpreadRegime: CLASSIFY_REPO_SPREAD,
    computeFedLiquidityPressure: () => 30,
    latestValue: (rows) => (rows.at(-1)?.value ?? null),
    NY_FED_SECURED_RATES_SOURCE: 'NYFED:secured-rates-latest',
    parseObservationDate,
    latestDatedObservation,
    fallbackObservation,
    sameObservationDay,
    reserveBalanceChange,
    cachedReserveBalanceChange,
    matchingH41Receipt,
    acquireH41: async () => ({ rows: {} }),
    ...options,
  };
  const fn = vm.runInNewContext(`${src}\nresolveFedLiquidity`, sandbox);
  return fn(prev);
}

test('observation helper rejects garbage/Feb30/future/missing timezone and preserves zero with date', () => {
  const now = '2026-10-22T12:00:00Z';
  assert.equal(parseObservationDate('2026-10-15', now), '2026-10-15');
  assert.equal(parseObservationDate('2026-10-15T00:00:00Z', now), '2026-10-15');
  assert.equal(parseObservationDate('2026-10-15garbage', now), null);
  assert.equal(parseObservationDate(['2026-10-15'], now), null);
  assert.equal(parseObservationDate({ date: '2026-10-15' }, now), null);
  assert.equal(parseObservationDate('2026-02-30T00:00:00Z', now), null);
  assert.equal(parseObservationDate('2026-10-23', now), null);
  assert.equal(parseObservationDate('2026-10-22T13:00:00Z', now), null);
  assert.equal(parseObservationDate('2026-10-22T13:00:00', now), null);
  assert.equal(parseObservationDate('2026-10-22T24:00:00Z', now), null);
  assert.equal(parseObservationDate('2026-10-22T12:60:00Z', now), null);
  assert.equal(parseObservationDate('2026-10-22T12:00:60Z', now), null);
  assert.equal(parseObservationDate('2026-10-22T12:00:00+15:00', now), null);
  assert.equal(parseObservationDate('2026-10-22T12:00:00.000Z', now), '2026-10-22');
  assert.deepEqual(latestDatedObservation([{ value: 0, date: '2026-10-15' }], now), { value: 0, date: '2026-10-15' });
  assert.deepEqual(latestDatedObservation([{ value: NaN, date: '2026-10-15' }], now), { value: null, date: null });
  assert.deepEqual(fallbackObservation(Number.NaN, '2026-10-15', now), { value: null, date: null });
  assert.equal(sameObservationDay('2026-10-15garbage', '2026-10-15'), null);
  assert.deepEqual(fallbackObservation(1, '2026-10-15', now), { value: 1, date: '2026-10-15' });
});

test('fed resolver stores same-row dates and only computes a leg when same day', async () => {
  const rows = {
    WALCL: [{ value: 100, date: '2026-10-14' }, { value: 101, date: '2026-10-21' }],
    RRPONTSYD: [{ value: 2, date: '2026-10-21' }],
    DFF: [{ value: 3.88, date: '2026-10-15' }],
    SOFR: [{ value: 3.89, date: '2026-10-15' }],
    WRESBAL: [{ value: 3000000, date: '2026-10-14' }],
  };
  const ny = {
    BGCR: { percentRate: 3.87, effectiveDate: '2026-10-15' },
    TGCR: { percentRate: 3.86, effectiveDate: '2026-10-16' },
  };
  const out = await loadFed(async (id) => rows[id], ny, {});
  assert.equal(out.sourceObservedAt.effectiveFedFundsRate, '2026-10-15');
  assert.equal(out.sourceObservedAt.sofr, '2026-10-15');
  assert.equal(out.sourceObservedAt.reserveBalances, '2026-10-14');
  assert.equal(out.repoSpreadDateStatus.bgcrSofr, 'same_day');
  assert.equal(out.repoSpreadDateStatus.tgcrSofr, 'mismatch');
  assert.equal(out.bgcrSofrSpread, -0.02);
  assert.equal(out.tgcrSofrSpread, null);
  assert.equal(out.repoSpreadRegime, '正常');
  const missingLeg = await loadFed(async (id) => rows[id], {}, {});
  assert.equal(missingLeg.repoSpreadDateStatus.bgcrSofr, 'unknown');
  assert.equal(missingLeg.repoSpreadDateStatus.tgcrSofr, 'unknown');
  assert.equal(missingLeg.bgcrSofrSpread, null);
  assert.equal(missingLeg.repoSpreadRegime, '未知');
  const missingValue = await loadFed(async (id) => rows[id], { BGCR: { percentRate: NaN, effectiveDate: '2026-10-15' } }, {});
  assert.equal(missingValue.repoSpreadDateStatus.bgcrSofr, 'unknown');
  assert.equal(missingValue.repoSpreadRegime, '未知');
  const badDate = await loadFed(async (id) => (id === 'DFF' ? [{ value: 3.8, date: '2026-02-30' }] : rows[id]), {}, {});
  assert.equal(badDate.sourceObservedAt.effectiveFedFundsRate, null);
  assert.equal(badDate.repoSpreadRegime, '未知');
  const badSofrDate = await loadFed(
    async (id) => (id === 'SOFR' ? [{ value: 3.9, date: '2026-02-30' }] : rows[id]),
    { BGCR: { percentRate: 3.87, effectiveDate: '2026-10-15' } },
    {},
  );
  assert.equal(badSofrDate.sourceObservedAt.sofr, null);
  assert.equal(badSofrDate.repoSpreadDateStatus.bgcrSofr, 'unknown');
  assert.equal(badSofrDate.bgcrSofrSpread, null);
  assert.equal(badSofrDate.repoSpreadRegime, '未知');
  const zero = await loadFed(async (id) => (id === 'DFF' ? [{ value: 0, date: '2026-10-15' }] : rows[id]), {}, {});
  assert.equal(zero.effectiveFedFundsRate, 0);
  assert.equal(zero.sourceObservedAt.effectiveFedFundsRate, '2026-10-15');
});

test('BGCR mismatch + TGCR same day keeps regime unknown while the TGCR leg computes', async () => {
  const rows = {
    WALCL: [{ value: 100, date: '2026-10-14' }],
    RRPONTSYD: [{ value: 2, date: '2026-10-21' }],
    DFF: [{ value: 3.88, date: '2026-10-15' }],
    SOFR: [{ value: 3.89, date: '2026-10-15' }],
    WRESBAL: [{ value: 3000000, date: '2026-10-14' }],
  };
  const ny = {
    BGCR: { percentRate: 3.87, effectiveDate: '2026-10-14' },
    TGCR: { percentRate: 3.86, effectiveDate: '2026-10-15' },
  };
  const out = await loadFed(async (id) => rows[id], ny, {});
  assert.equal(out.repoSpreadDateStatus.bgcrSofr, 'mismatch');
  assert.equal(out.repoSpreadDateStatus.tgcrSofr, 'same_day');
  assert.equal(out.bgcrSofrSpread, null);
  assert.equal(out.tgcrSofrSpread, -0.03);
  assert.equal(out.repoSpreadRegime, '未知');
});

test('repo classifier maps null/NaN to 未知 and a real 0 spread to 正常', async () => {
  assert.equal(CLASSIFY_REPO_SPREAD(null), '未知');
  assert.equal(CLASSIFY_REPO_SPREAD(Number.NaN), '未知');
  assert.equal(CLASSIFY_REPO_SPREAD(0), '正常');
  const rows = {
    WALCL: [{ value: 100, date: '2026-10-14' }],
    RRPONTSYD: [{ value: 2, date: '2026-10-21' }],
    DFF: [{ value: 3.88, date: '2026-10-15' }],
    SOFR: [{ value: 3.89, date: '2026-10-15' }],
    WRESBAL: [{ value: 3000000, date: '2026-10-14' }],
  };
  const ny = {
    BGCR: { percentRate: 3.89, effectiveDate: '2026-10-15' },
    TGCR: { percentRate: 3.89, effectiveDate: '2026-10-15' },
  };
  const out = await loadFed(async (id) => rows[id], ny, {});
  assert.equal(out.bgcrSofrSpread, 0);
  assert.equal(out.repoSpreadRegime, '正常');
});

test('fed fallback keeps DFF same-field date; newer NYFed SOFR replaces older or undated cache', async () => {
  const prev = {
    effectiveFedFundsRate: 3.8,
    sourceObservedAt: { effectiveFedFundsRate: '2026-10-14', sofr: '2026-10-14' },
    sofr: 3.8,
    sofrSource: 'FRED:SOFR',
  };
  const out = await loadFed(async (id) => {
    if (id === 'DFF' || id === 'SOFR') throw new Error('down');
    return [{ value: 1, date: '2026-10-15' }];
  }, { SOFR: { percentRate: 3.9, effectiveDate: '2026-10-16' } }, prev);
  assert.equal(out.sourceObservedAt.effectiveFedFundsRate, '2026-10-14');
  assert.equal(out.effectiveFedFundsRate, 3.8);
  assert.equal(out.sourceStatus.effectiveFedFundsRate, 'fallback');
  assert.equal(out.sofr, 3.9);
  assert.equal(out.sourceObservedAt.sofr, '2026-10-16');
  assert.equal(out.sofrSource, 'NYFED:secured-rates-latest');
  assert.equal(out.sourceStatus.sofr, 'live');
  const nyOnly = await loadFed(async (id) => {
    if (id === 'DFF' || id === 'SOFR') throw new Error('down');
    return [{ value: 1, date: '2026-10-15' }];
  }, { SOFR: { percentRate: 3.9, effectiveDate: '2026-10-16' } }, {});
  assert.equal(nyOnly.sofr, 3.9);
  assert.equal(nyOnly.sourceStatus.sofr, 'live');
  assert.equal(nyOnly.sourceStatus.effectiveFedFundsRate, 'missing');
  assert.equal(nyOnly.sourceObservedAt.sofr, '2026-10-16');
  assert.equal(nyOnly.sofrSource, 'NYFED:secured-rates-latest');
  const legacySofr = await loadFed(async (id) => {
    if (id === 'SOFR') throw new Error('down');
    return [{ value: 1, date: '2026-10-15' }];
  }, { SOFR: { percentRate: 3.9, effectiveDate: '2026-10-16' } }, { sofr: 3.7, sourceObservedAt: {} });
  assert.equal(legacySofr.sofr, 3.9);
  assert.equal(legacySofr.sourceObservedAt.sofr, '2026-10-16');
  assert.equal(legacySofr.sofrSource, 'NYFED:secured-rates-latest');
  assert.equal(legacySofr.sourceStatus.sofr, 'live');
  assert.equal(legacySofr.bgcrSofrSpread, null);
});

test('SOFR prefers newer valid dates, not dates that would enable repo spreads', async () => {
  const baseRows = {
    WALCL: [{ value: 100, date: '2026-10-14' }],
    RRPONTSYD: [{ value: 2, date: '2026-10-21' }],
    DFF: [{ value: 3.88, date: '2026-10-15' }],
    WRESBAL: [{ value: 3000000, date: '2026-10-14' }],
  };
  const ny = {
    BGCR: { percentRate: 3.87, effectiveDate: '2026-10-15' },
    TGCR: { percentRate: 3.86, effectiveDate: '2026-10-15' },
    SOFR: { percentRate: 3.9, effectiveDate: '2026-10-15' },
  };
  // FRED value finite but off-date: the leg stays conservatively null and NYFed
  // same-day SOFR does not replace the FRED value or its date.
  const offDate = await loadFed(
    async (id) => (id === 'SOFR' ? [{ value: 3.95, date: '2026-10-16' }] : baseRows[id]),
    ny,
    {},
  );
  assert.equal(offDate.sofr, 3.95);
  assert.equal(offDate.sofrSource, 'FRED:SOFR');
  assert.equal(offDate.sourceStatus.sofr, 'live');
  assert.equal(offDate.repoSpreadDateStatus.bgcrSofr, 'mismatch');
  assert.equal(offDate.repoSpreadDateStatus.tgcrSofr, 'mismatch');
  assert.equal(offDate.sourceObservedAt.sofr, '2026-10-16');
  assert.equal(offDate.bgcrSofrSpread, null);
  assert.equal(offDate.tgcrSofrSpread, null);
  assert.equal(offDate.repoSpreadRegime, '未知');

  // A newer dated cache also wins over the older direct reading.
  const fallback = await loadFed(
    async (id) => {
      if (id === 'SOFR') throw new Error('down');
      return baseRows[id];
    },
    ny,
    { sofr: 3.7, sofrSource: 'FRED:SOFR', sourceObservedAt: { sofr: '2026-10-16' } },
  );
  assert.equal(fallback.sofr, 3.7);
  assert.equal(fallback.sourceObservedAt.sofr, '2026-10-16');
  assert.equal(fallback.sofrSource, 'FRED:SOFR');
  assert.equal(fallback.sourceStatus.sofr, 'fallback');
  assert.equal(fallback.bgcrSofrSpread, null);
  assert.equal(fallback.tgcrSofrSpread, null);
  assert.equal(fallback.repoSpreadRegime, '未知');

  // Newer direct SOFR still wins when the older FRED row matches both repo rates.
  const mixedDays = await loadFed(
    async (id) => (id === 'SOFR' ? [{ value: 3.95, date: '2026-10-15' }] : baseRows[id]),
    { ...ny, SOFR: { percentRate: 3.91, effectiveDate: '2026-10-16' } },
    {},
  );
  assert.equal(mixedDays.sofr, 3.91);
  assert.equal(mixedDays.sourceObservedAt.sofr, '2026-10-16');
  assert.equal(mixedDays.sofrSource, 'NYFED:secured-rates-latest');
  assert.equal(mixedDays.sourceStatus.sofr, 'live');
  assert.equal(mixedDays.repoSpreadDateStatus.bgcrSofr, 'mismatch');
  assert.equal(mixedDays.repoSpreadDateStatus.tgcrSofr, 'mismatch');
  assert.equal(mixedDays.bgcrSofrSpread, null);
  assert.equal(mixedDays.tgcrSofrSpread, null);
  assert.equal(mixedDays.repoSpreadRegime, '未知');

  const newerSameDay = await loadFed(
    async (id) => (id === 'SOFR' ? [{ value: 3.95, date: '2026-10-14' }] : baseRows[id]),
    ny,
    {},
  );
  assert.equal(newerSameDay.sofr, 3.9);
  assert.equal(newerSameDay.sourceObservedAt.sofr, '2026-10-15');
  assert.equal(newerSameDay.sofrSource, 'NYFED:secured-rates-latest');
  assert.equal(newerSameDay.sourceStatus.sofr, 'live');
  assert.equal(newerSameDay.repoSpreadDateStatus.bgcrSofr, 'same_day');
  assert.equal(newerSameDay.repoSpreadDateStatus.tgcrSofr, 'same_day');
  assert.equal(newerSameDay.bgcrSofrSpread, -0.03);
  assert.equal(newerSameDay.tgcrSofrSpread, -0.04);
  assert.equal(newerSameDay.repoSpreadRegime, '正常');
});

test('same-day SOFR ties keep incumbent value, source, date and status even with conflicting rates', async () => {
  const date = '2026-10-15';
  for (const direct of [3.8, 3.9]) {
    const ny = { SOFR: { percentRate: direct, effectiveDate: date } };
    const live = await loadFed(async () => [{ value: 3.8, date }], ny, {});
    const prev = { sofr: 3.8, sofrSource: 'NYFED:secured-rates-latest', sourceObservedAt: { sofr: date } };
    const cached = await loadFed(async () => { throw new Error('down'); }, ny, prev);
    for (const [result, source, status] of [
      [live, 'FRED:SOFR', 'live'], [cached, prev.sofrSource, 'fallback'],
    ]) {
      assert.equal(result.sofr, 3.8);
      assert.equal(result.sourceObservedAt.sofr, date);
      assert.equal(result.sofrSource, source);
      assert.equal(result.sourceStatus.sofr, status);
    }
  }
});

test('direct SOFR must be a real in-range number with a canonical non-future day', async () => {
  const offline = async (id) => {
    if (id === 'SOFR') throw new Error('down');
    return [{ value: 1, date: '2026-10-15' }];
  };
  const date = '2026-10-15';
  const valid = { percentRate: 3.9, effectiveDate: date };
  const prev = { sofr: 3.8, sofrSource: 'FRED:SOFR', sourceObservedAt: { sofr: '2026-10-14' } };
  const invalid = [
    undefined, null, {}, { ...valid, effectiveDate: undefined }, { ...valid, effectiveDate: null },
    ...['garbage', '2026-02-30', '2026-10-23', date + 'T00:00:00Z', ' ' + date, '2026-10-5']
      .map(effectiveDate => ({ ...valid, effectiveDate })),
    ...[undefined, null, '', '0', '3.9', false, [3.9], NaN, Infinity, -0.01, 20.01]
      .map(percentRate => ({ ...valid, percentRate })),
  ];
  for (const SOFR of invalid) {
    const missing = await loadFed(offline, { SOFR }, {});
    assert.equal(missing.sofr, null);
    assert.equal(missing.sourceObservedAt.sofr, undefined);
    assert.equal(missing.sofrSource, null);
    assert.equal(missing.sourceStatus.sofr, 'missing');
    const retained = await loadFed(offline, { SOFR }, prev);
    assert.equal(retained.sofr, prev.sofr);
    assert.equal(retained.sourceObservedAt.sofr, prev.sourceObservedAt.sofr);
    assert.equal(retained.sofrSource, prev.sofrSource);
    assert.equal(retained.sourceStatus.sofr, 'fallback');
  }
  for (const percentRate of [0, 20]) {
    const out = await loadFed(offline, { SOFR: { ...valid, percentRate } }, prev);
    assert.equal(out.sofr, percentRate);
    assert.equal(out.sourceObservedAt.sofr, date);
    assert.equal(out.sofrSource, 'NYFED:secured-rates-latest');
    assert.equal(out.sourceStatus.sofr, 'live');
  }
});

test('CRE normalizer preserves each prior date and nulls invalid/missing', () => {
  const src = extract('normalizePreviousCommercialRealEstate', 'function normalizePreviousPolicyExpectations');
  const fn = vm.runInNewContext(`${src}\nnormalizePreviousCommercialRealEstate`, {
    parseObservationDate, creLoanBalanceDate,
    buildMissingCommercialRealEstate: () => ({}),
    classifyCrePublicMarketProxyRegime: () => '未知',
    CRE_PUBLIC_MARKET_PROXY_SOURCE: 'TEST',
    classifyCreStressRegime: () => '未知',
  });
  const out = fn({
    creDelinquencyRate: 1,
    creDelinquencyUpdatedAt: '2026-07-01',
    creChargeOffRate: 0.1,
    creChargeOffUpdatedAt: '2026-02-30',
    sloosCreNonfarmNonresidentialTightening: -1,
    sloosCreNonfarmNonresidentialUpdatedAt: '2026-07-01',
    sloosCreConstructionTightening: -2,
    sloosCreConstructionUpdatedAt: '2026-07-01',
    sloosCreMultifamilyTightening: -3,
    sloosCreMultifamilyUpdatedAt: '2099-01-01',
  }, FIXED_NOW);
  assert.equal(out.creDelinquencyUpdatedAt, '2026-07-01T00:00:00Z');
  assert.equal(out.creChargeOffUpdatedAt, null);
  assert.equal(out.sloosCreNonfarmNonresidentialUpdatedAt, '2026-07-01T00:00:00Z');
  assert.equal(out.sloosCreConstructionUpdatedAt, '2026-07-01T00:00:00Z');
  assert.equal(out.sloosCreMultifamilyUpdatedAt, null);
});

test('CRE resolver keeps five dates and fallback reuses per-field dates', async () => {
  const src = extract('normalizePreviousCommercialRealEstate') + extract('resolveCommercialRealEstate');
  let failDelinquency = false;
  let allFail = false;
  const rowsFor = (id) => {
    if (allFail) throw new Error('all down');
    if (id === 'DRCRELEXFACBS' && failDelinquency) throw new Error('down');
    return [{ value: id === 'CREACBW027SBOG' ? 3000 : 1, date: id === 'CREACBW027SBOG' ? '2026-10-07' : '2026-07-01' }];
  };
  const sandbox = {
    Date: FixedDate, Promise,
    fetchFredSeries: async (id) => rowsFor(id),
    fetchYahooChartQuote: async () => { throw new Error('quote down'); },
    latestValue: (rows) => rows.at(-1)?.value ?? null,
    latestDateIso: (rows) => rows.at(-1)?.date ?? null,
    latestIsoDate: (...dates) => dates.filter((d) => typeof d === 'string').sort().at(-1) ?? null,
    calculateLatestDelta: () => null,
    parseObservationDate, creLoanBalanceDate, creLoanBalanceSnapshot,
    latestDatedObservation,
    normalizePreviousCommercialRealEstate: null,
    buildMissingCommercialRealEstate: () => ({}),
    classifyCrePublicMarketProxyRegime: () => '未知',
    classifyCreStressRegime: () => '未知',
    CRE_PUBLIC_MARKET_PROXY_SOURCE: 'TEST',
  };
  const fn = vm.runInNewContext(`${src}\nresolveCommercialRealEstate`, sandbox);
  const first = await fn({});
  assert.equal(first.creDelinquencyUpdatedAt, '2026-07-01T00:00:00Z');
  assert.equal(first.creChargeOffUpdatedAt, '2026-07-01T00:00:00Z');
  assert.equal(first.sloosCreNonfarmNonresidentialUpdatedAt, '2026-07-01T00:00:00Z');
  assert.equal(first.sloosCreConstructionUpdatedAt, '2026-07-01T00:00:00Z');
  assert.equal(first.sloosCreMultifamilyUpdatedAt, '2026-07-01T00:00:00Z');
  assert.equal(first.creLoanBalanceUpdatedAt, '2026-10-07T00:00:00Z');
  failDelinquency = true;
  const second = await fn(first);
  assert.equal(second.creDelinquencyUpdatedAt, '2026-07-01T00:00:00Z');
  assert.equal(second.sourceStatus.delinquency, 'fallback');
  allFail = true;
  const third = await fn(second);
  assert.equal(third.creDelinquencyUpdatedAt, '2026-07-01T00:00:00Z');
  assert.equal(third.creChargeOffUpdatedAt, '2026-07-01T00:00:00Z');
  assert.equal(third.sloosCreNonfarmNonresidentialUpdatedAt, '2026-07-01T00:00:00Z');
  const legacy = await fn({
    updatedAt: '2026-09-30T00:00:00Z',
    creDelinquencyRate: 0,
    creChargeOffRate: 0.2,
    sloosCreNonfarmNonresidentialTightening: -4,
    sloosCreConstructionTightening: -5,
    sloosCreMultifamilyTightening: -6,
  });
  assert.equal(legacy.creDelinquencyRate, 0);
  assert.equal(legacy.creChargeOffRate, 0.2);
  assert.equal(legacy.sloosCreNonfarmNonresidentialTightening, -4);
  assert.equal(legacy.creDelinquencyUpdatedAt, null);
  assert.equal(legacy.creChargeOffUpdatedAt, null);
  assert.equal(legacy.sloosCreNonfarmNonresidentialUpdatedAt, null);
  assert.equal(legacy.sloosCreConstructionUpdatedAt, null);
  assert.equal(legacy.sloosCreMultifamilyUpdatedAt, null);
});

test('H.8 CRE loan balances require exact Wednesday references and cannot redate cache', async () => {
  const src = ['normalizePreviousCommercialRealEstate', 'resolveCommercialRealEstate'].map(name => extract(name)).join('\n');
  const row = (date, value) => ({ date, value });
  // Federal Reserve H.8 via FRED CREACBW027SBOG, 2026-11-13 vintage checked against
  // https://fred.stlouisfed.org/data/CREACBW027SBOG (billions; week ending Wednesday).
  const year = row('2025-11-05', 3041.7196);
  const fourWeeks = row('2026-10-07', 3153.1508);
  const current = row('2026-11-04', 3157.6162);
  let balances = [year, fourWeeks, current];
  const clock = '2026-11-18T16:00:00Z';
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])); }
  }
  const resolve = vm.runInNewContext(`${src}\nresolveCommercialRealEstate`, {
    Date: Clock, parseObservationDate, latestDatedObservation, creLoanBalanceDate, creLoanBalanceSnapshot,
    fetchFredSeries: async id => {
      if (id === 'CREACBW027SBOG' && balances) return balances;
      throw new Error('offline');
    },
    fetchYahooChartQuote: async () => { throw new Error('offline'); },
    latestIsoDate: (...dates) => dates.filter(Boolean).sort().at(-1) ?? null,
    calculateLatestDelta: () => null, buildMissingCommercialRealEstate: () => ({}),
    classifyCrePublicMarketProxyRegime: () => '未知', classifyCreStressRegime: () => '未知',
    CRE_PUBLIC_MARKET_PROXY_SOURCE: 'test'
  });
  const live = await resolve(null);
  assert.equal(live.creLoanBalance, 3157.6162);
  assert.equal(live.creLoanBalanceUpdatedAt, '2026-11-04T00:00:00Z');
  assert.equal(live.creLoanBalance4wChange, 0.0014);
  assert.equal(live.creLoanBalanceYoY, 0.0381);
  assert.equal(live.sourceStatus.creLoanBalance, 'live');

  balances = [row('2025-10-29', 1000), row('2026-10-14', 2000), current];
  const missing = await resolve(null);
  assert.equal(missing.creLoanBalance, current.value);
  assert.equal(missing.creLoanBalance4wChange, null);
  assert.equal(missing.creLoanBalanceYoY, null);

  // Missing weeks inside the span do not replace the two exact endpoints.
  balances = [year, fourWeeks, fourWeeks, current];
  const duplicate = await resolve(null);
  assert.equal(duplicate.creLoanBalance4wChange, null);
  assert.equal(duplicate.creLoanBalanceYoY, 0.0381);

  for (const invalid of [null, [year, row('2026-11-04', null)], [year, row('2026-11-05', 4000)],
    [year, row('2026-11-25', 4000)], [year, current, current]]) {
    balances = invalid;
    const held = await resolve({ ...live, updatedAt: clock });
    assert.equal(held.creLoanBalance, live.creLoanBalance);
    assert.equal(held.creLoanBalanceUpdatedAt, live.creLoanBalanceUpdatedAt);
    assert.equal(held.creLoanBalance4wChange, null);
    assert.equal(held.creLoanBalanceYoY, null);
    assert.equal(held.sourceStatus.creLoanBalance, 'fallback');
  }
  balances = [current, year];
  const untrusted = await resolve(null);
  assert.equal(untrusted.creLoanBalance, null);
  assert.equal(untrusted.sourceStatus.creLoanBalance, 'missing');
  for (const date of ['2026-11-03', '2026-11-25', '2026-11-18T23:00:00Z', null]) {
    const undated = await resolve({ ...live, creLoanBalanceUpdatedAt: date, updatedAt: clock });
    assert.equal(undated.creLoanBalance, live.creLoanBalance);
    assert.equal(undated.creLoanBalanceUpdatedAt, null);
  }
  balances = [row(year.date, 0), fourWeeks, row(current.date, 0)];
  const zero = await resolve(null);
  assert.equal(zero.creLoanBalance, 0);
  assert.equal(zero.creLoanBalance4wChange, -1);
  assert.equal(zero.creLoanBalanceYoY, null);
});

test('credit resolver stores NFCI/SLOOS dates and independent large/small status', async () => {
  const src = extract('resolveCredit', 'async function resolveUlsd');
  const sandbox = {
    creditPeriodChange,
    Date: FixedDate,
    fetchFredSeries: async (id) => {
      if (id === 'DRTSCIS') throw new Error('small down');
      if (id === 'NFCI') return [{ value: -0.4, date: '2026-10-17' }];
      if (id === 'DRTSCILM') return [{ value: 0, date: '2026-07-01' }];
      return [{ value: 0.8, date: '2026-10-15' }];
    },
    requireStructuralObservation: (rows) => (rows.at(-1)?.date ?? null),
    findValueAgo: () => null,
    structuralValueUsable: () => true,
    structuralSourceUsable: () => true,
    structuralObservationUsable: () => true,
    classifyCreditRegime: () => '正常',
    classifySloosRegime: () => '中性',
    classifyNfciRegime: () => '温和宽松',
    latestValue: (rows) => rows.at(-1)?.value ?? null,
    parseObservationDate,
    latestDatedObservation,
    fallbackObservation,
  };
  const fn = vm.runInNewContext(`${src}\nresolveCredit`, sandbox);
  const out = await fn({ sourceObservedAt: { sloosSmall: '2026-04-01' }, sloosTighteningSmallFirms: 2 }, 3.2);
  assert.equal(out.igOas, 0.8);
  assert.equal(out.sourceStatus.igOas, 'live');
  assert.equal(out.sourceObservedAt.igOas, '2026-10-15');
  assert.equal(out.sourceObservedAt.nfci, '2026-10-17');
  assert.equal(out.sourceObservedAt.sloosLarge, '2026-07-01');
  assert.equal(out.sourceObservedAt.sloosSmall, '2026-04-01');
  assert.equal(out.sourceStatus.sloosLarge, 'live');
  assert.equal(out.sourceStatus.sloosSmall, 'fallback');
  assert.equal(out.sourceStatus.sloos, 'live');
  const reverseSandbox = {
    ...sandbox,
    fetchFredSeries: async (id) => {
      if (id === 'DRTSCILM') throw new Error('large down');
      if (id === 'NFCI') throw new Error('nfci down');
      return [{ value: 1, date: '2026-07-01' }];
    },
  };
  const reverseFn = vm.runInNewContext(`${src}\nresolveCredit`, reverseSandbox);
  const reverse = await reverseFn({ nfci: -0.3, sourceObservedAt: { nfci: '2026-10-10' }, sloosTighteningSmallFirms: 2 }, 3.2);
  assert.equal(reverse.sourceStatus.sloosLarge, 'missing');
  assert.equal(reverse.sourceStatus.sloosSmall, 'live');
  assert.equal(reverse.sourceStatus.sloos, 'missing');
  assert.equal(reverse.sourceObservedAt.nfci, '2026-10-10');
  assert.equal(reverse.sourceStatus.nfci, 'fallback');
  const noDate = await reverseFn({ nfci: -0.3, sourceObservedAt: {} }, 3.2);
  assert.equal(noDate.sourceObservedAt.nfci, null);
  assert.equal(noDate.nfci, -0.3);
  assert.equal(noDate.sourceStatus.nfci, 'fallback');
  const allDown = vm.runInNewContext(`${src}\nresolveCredit`, { ...sandbox, fetchFredSeries: async () => { throw new Error('down'); } });
  const cached = await allDown({ nfci: -0.3, nfci4wChange: 0.7, sloosTighteningLargeFirms: 2, sloosTighteningSmallFirms: 3, sloosTighteningLargeQoQ: 8, sloosTighteningSmallQoQ: 9, sourceObservedAt: { nfci: '2026-10-16', sloosLarge: '2026-10-01', sloosSmall: '2026-10-01' } }, 3.2);
  assert.equal(cached.nfci, -0.3);
  assert.equal(cached.sloosTighteningLargeFirms, 2);
  assert.equal(cached.sloosTighteningSmallFirms, 3);
  for (const field of ['nfci4wChange', 'sloosTighteningLargeQoQ', 'sloosTighteningSmallQoQ']) assert.equal(cached[field], null);
  const live = vm.runInNewContext(`${src}\nresolveCredit`, { ...sandbox, fetchFredSeries: async id => id === 'NFCI'
    ? [{ date: '2026-09-18', value: -0.5 }, { date: '2026-10-16', value: -0.3 }]
    : [{ date: '2026-07-01', value: 1 }, { date: '2026-10-01', value: 3 }] });
  const exact = await live({}, 3.2);
  assert.equal(exact.nfci4wChange, 0.2);
  assert.equal(exact.sloosTighteningLargeQoQ, 2);
  assert.equal(exact.sloosTighteningSmallQoQ, 2);
  const sparse = vm.runInNewContext(`${src}\nresolveCredit`, { ...sandbox,
    findValueAgo: vm.runInNewContext(`${extract('findValueAgo')}\nfindValueAgo`),
    fetchFredSeries: async id => id === 'NFCI'
      ? [{ date: '2026-10-09', value: -0.5 }, { date: '2026-10-16', value: -0.3 }]
      : [{ date: '2026-04-01', value: 1 }, { date: '2026-10-01', value: 3 }],
  });
  const incomplete = await sparse({}, 3.2);
  assert.equal(incomplete.nfci, -0.3);
  // Late October before the new SLOOS release: April is >180 days old, but
  // remains the legitimate prior quarter for the latest July observation.
  const releaseDelayed = vm.runInNewContext(`${src}\nresolveCredit`, { ...sandbox, structuralValueUsable: () => false,
    fetchFredSeries: async (id, daysBack) => {
      if (!['DRTSCILM', 'DRTSCIS'].includes(id)) throw new Error('outside fixture');
      assert.equal(daysBack, 270);
      const start = Date.parse(FIXED_NOW) - daysBack * 86400000;
      const rows = [{ date: '2026-04-01', value: 1 }, { date: '2026-07-01', value: 3 }].filter(row => Date.parse(row.date) >= start);
      if (rows.length < 2) throw new Error('insufficient rows');
      return rows;
    },
  });
  const delayed = await releaseDelayed({}, 3.2);
  assert.equal(delayed.sloosTighteningLargeQoQ, 2);
  assert.equal(delayed.sloosTighteningSmallQoQ, 2);
  for (const field of ['nfci4wChange', 'sloosTighteningLargeQoQ', 'sloosTighteningSmallQoQ']) assert.equal(incomplete[field], null);
});


test('NY Fed parser rejects missing/coercible rates and preserves real zero/precision', () => {
  const parse = vm.runInNewContext(`${extract('parseNyFedRateRecord')}\nparseNyFedRateRecord`, {});
  const base = { type: ' bgcr ', effectiveDate: '2026-10-15' };
  for (const value of [null, undefined, '', ' ', false, true, [], [3.9], {}, 'bad', Infinity, -1, 21]) {
    assert.equal(parse({ ...base, percentRate: value }), null);
  }
  for (const value of [0, '0', 3.87654, ' 3.87654 ']) {
    const result = parse({ ...base, percentRate: value, volumeInBillions: ' 125 ' });
    assert.equal(result.percentRate, Number(value) === 0 ? 0 : 3.8765);
    assert.equal(result.type, 'BGCR');
    assert.equal(result.effectiveDate, base.effectiveDate);
    assert.equal(result.volumeInBillions, 125);
  }
  for (const value of [null, undefined, '', ' ', false, true, [], [125], {}, 'bad', Infinity]) {
    assert.equal(parse({ ...base, percentRate: 3.9, volumeInBillions: value }).volumeInBillions, null);
  }
  assert.equal(parse({ ...base, percentRate: 3.9, volumeInBillions: 0 }).volumeInBillions, 0);
});

test('raw NY Fed JSON replays through parser and Fed resolver without false-zero or coerced direct rates', async () => {
  const fixture = { refRates: [
    { type: 'BGCR', effectiveDate: '2026-10-15', percentRate: null },
    { type: 'TGCR', effectiveDate: '2026-10-15', percentRate: '' },
    { type: 'SOFR', effectiveDate: '2026-10-15', percentRate: 0 }
  ] };
  const fetchRates = vm.runInNewContext(`${extract('parseNyFedRateRecord')}\n${extract('fetchNyFedSecuredRatesLatest')}\nfetchNyFedSecuredRatesLatest`, {
    retryFetch: async () => JSON.stringify(fixture), NY_FED_SECURED_RATES_LATEST_URL: 'fixture-only',
    NY_FED_SECURED_RATES_TIMEOUT_MS: 1000, stringifyFetchError: String
  });
  const rates = await fetchRates();
  assert.deepEqual(Object.keys(rates), ['SOFR']);
  const rows = {
    WALCL: [{ value: 100, date: '2026-10-14' }, { value: 101, date: '2026-10-21' }],
    RRPONTSYD: [{ value: 2, date: '2026-10-21' }],
    DFF: [{ value: 3.88, date: '2026-10-15' }], SOFR: [{ value: 3.9, date: '2026-10-14' }],
    WRESBAL: [{ value: 3000000, date: '2026-10-14' }]
  };
  const fetchFred = async id => rows[id] ?? [];
  const result = await loadFed(fetchFred, fetchRates, {});
  assert.equal(result.sofr, 0);
  assert.equal(result.sourceObservedAt.sofr, '2026-10-15');
  assert.equal(result.sofrSource, 'NYFED:secured-rates-latest');
  assert.equal(result.sourceStatus.sofr, 'live');
  assert.equal(result.bgcr, null);
  assert.equal(result.tgcr, null);
  assert.equal(result.bgcrSofrSpread, null);
  assert.equal(result.tgcrSofrSpread, null);
  const rawSofr = fixture.refRates.pop();
  await assert.rejects(fetchRates(), /missing BGCR\/TGCR\/SOFR/);

  // Keep repo-rate parsing compatible, including its numeric strings and date trimming.
  fixture.refRates[0] = { type: 'BGCR', effectiveDate: ' 2026-10-14 ', percentRate: ' 3.87 ' };
  for (const invalid of [
    { percentRate: '0' }, { percentRate: '3.9' }, { percentRate: '0x10' },
    { effectiveDate: ' 2026-10-15 ' }, { effectiveDate: '2026-10-15\n' },
    { effectiveDate: '2026-10-15T00:00:00Z' },
  ]) {
    fixture.refRates[2] = { ...rawSofr, ...invalid };
    const parsed = await fetchRates();
    assert.deepEqual(Object.keys(parsed), ['BGCR']);
    assert.equal(parsed.BGCR.percentRate, 3.87);
    assert.equal(parsed.BGCR.effectiveDate, '2026-10-14');
    const retained = await loadFed(fetchFred, fetchRates, {});
    assert.equal(retained.sofr, 3.9);
    assert.equal(retained.sourceObservedAt.sofr, '2026-10-14');
    assert.equal(retained.sofrSource, 'FRED:SOFR');
    assert.equal(retained.sourceStatus.sofr, 'live');
  }
});


test('credit period references cannot silently substitute nearer sparse observations', () => {
  const now = '2026-11-17T12:00:00Z';
  const weekly = [{ date: '2026-10-09', value: -0.5 }, { date: '2026-10-30', value: -0.4 }, { date: '2026-11-06', value: -0.3 }];
  assert.ok(Math.abs(creditPeriodChange(weekly, 'fourWeeks', now) - 0.2) < 1e-10);
  assert.equal(creditPeriodChange(weekly.slice(1), 'fourWeeks', now), null);
  assert.equal(creditPeriodChange(weekly.slice(-1), 'fourWeeks', now), null);
  assert.equal(creditPeriodChange([{ date: '2026-10-09', value: 0 }, { date: '2026-11-06', value: 0 }], 'fourWeeks', now), 0);
  assert.equal(creditPeriodChange([...weekly.slice(0, 1), ...weekly], 'fourWeeks', now), null);
  assert.equal(creditPeriodChange([...weekly, { ...weekly.at(-1), value: 9 }], 'fourWeeks', now), null);
  assert.equal(creditPeriodChange([weekly[0], { date: '2026-11-06T00:00:00Z', value: 9 }], 'fourWeeks', now), null);
  assert.equal(creditPeriodChange([{ date: '2026-10-09', value: null }, weekly.at(-1)], 'fourWeeks', now), null);
  assert.equal(creditPeriodChange([{ date: '2026-12-04', value: 1 }], 'fourWeeks', now), null);
  for (const [previous, latest] of [['2025-10-01', '2026-01-01'], ['2026-01-01', '2026-04-01'], ['2026-04-01', '2026-07-01'], ['2026-07-01', '2026-10-01']]) {
    assert.equal(creditPeriodChange([{ date: previous, value: 2 }, { date: latest, value: 3 }], 'quarter', now), 1);
  }
  assert.equal(creditPeriodChange([{ date: '2026-04-01', value: 2 }, { date: '2026-10-01', value: 3 }], 'quarter', now), null);
  assert.equal(creditPeriodChange([{ date: '2026-07-02', value: 2 }, { date: '2026-10-01', value: 3 }], 'quarter', now), null);
  assert.equal(creditPeriodChange([{ date: '2026-07-01', value: 2 }, { date: '2026-10-02', value: 3 }], 'quarter', now), null);
});


test('published FRED credit samples retain actual four-week and quarter changes', () => {
  // Read-only official table audit 2026-11-17: fred.stlouisfed.org/data/{NFCI,DRTSCILM,DRTSCIS}.
  // Minimal point pairs, not a downloaded series fixture or a historical-vintage claim.
  const now = '2026-11-17T12:00:00Z';
  assert.equal(+creditPeriodChange([{ date: '2026-10-09', value: -0.488 }, { date: '2026-11-06', value: -0.462 }], 'fourWeeks', now).toFixed(3), 0.026);
  assert.equal(+creditPeriodChange([{ date: '2026-07-01', value: 0 }, { date: '2026-10-01', value: 1.7 }], 'quarter', now).toFixed(1), 1.7);
  assert.equal(+creditPeriodChange([{ date: '2026-07-01', value: 1.8 }, { date: '2026-10-01', value: 5.1 }], 'quarter', now).toFixed(1), 3.3);
});

test('WRESBAL exact four-week endpoints preserve current official sample and holiday Wednesdays', () => {
  // Minimal official FRED WRESBAL week-average observations, read 2026-11-17.
  // https://fred.stlouisfed.org/data/WRESBAL ; not Wednesday point levels.
  const now = '2026-11-17T12:00:00Z';
  assert.deepEqual(reserveBalanceChange([{ date: '2026-10-14', value: 3022140 },
    { date: '2026-11-11', value: 2960603 }], now),
  { change: -2.036, reference: { date: '2026-10-14', value: 3022140 } });
  assert.equal(reserveBalanceChange([{ date: '2024-12-04', value: 3225075 },
    { date: '2025-01-01', value: 3095997 }], now).change, -4.002);
  assert.equal(reserveBalanceChange([{ date: '2026-09-23', value: 100 },
    { date: '2026-10-21', value: 0 }], now).change, -100);
});

test('WRESBAL incomplete, duplicate, wrong-date and invalid endpoints cannot fabricate four-week change', () => {
  const a = { date: '2026-09-23', value: 100 };
  const b = { date: '2026-10-21', value: 110 };
  const missing = { change: null, reference: null };
  for (const rows of [[], [b], [{ date: '2026-10-14', value: 100 }, b], [a, a, b], [a, b, b], [b, a],
    [{ ...a, value: 0 }, b], [{ ...a, value: null }, b], [{ ...a, value: -1 }, b],
    [a, { ...b, value: Infinity }], [a, { ...b, date: '2026-10-22' }],
    [a, { ...b, date: '2026-10-28' }], [a, { ...b, date: '2026-02-30' }]]) {
    assert.deepEqual(reserveBalanceChange(rows, FIXED_NOW), missing);
  }
  assert.equal(reserveBalanceChange([a, { ...b, value: 100 }], FIXED_NOW).change, 0);
});

test('WRESBAL actual resolver keeps current level/date but refuses absent four-week proof and mixed-period cache', async () => {
  const fetchRows = rows => async id => {
    if (id !== 'WRESBAL') return [{ date: '2026-10-21', value: 1 }];
    if (rows === null) throw Error('offline');
    return rows;
  };
  const a = { date: '2026-09-23', value: 100 };
  const b = { date: '2026-10-21', value: 110 };
  const live = await loadFed(fetchRows([a, b]), {}, {});
  assert.equal(live.reserveBalances4wChange, 10);
  assert.equal(live.reserveBalances4wReference.date, a.date);
  const failedFetch = fetchRows(null);
  const fallback = await loadFed(failedFetch, {}, live);
  assert.equal(fallback.reserveBalances4wChange, 10);
  assert.equal(fallback.sourceObservedAt.reserveBalances, b.date);
  assert.equal(fallback.sourceStatus.reserveBalances, 'fallback');
  for (const changed of [{ reserveBalances4wReference: null }, { reserveBalances: 111 },
    { reserveBalances4wChange: 9 }, { sourceObservedAt: { reserveBalances: '2026-10-14' } },
    { reserveBalances4wReference: { date: '2026-09-30', value: 100 } },
    { sourceStatus: { reserveBalances: 'missing' } }]) {
    const out = await loadFed(failedFetch, {}, { ...live, ...changed });
    assert.equal(out.reserveBalances4wChange, null);
    assert.equal(out.reserveBalances4wReference, null);
  }
  const partial = await loadFed(fetchRows([b]), {}, live);
  assert.equal(partial.reserveBalances, 110);
  assert.equal(partial.sourceObservedAt.reserveBalances, b.date);
  assert.equal(partial.sourceStatus.reserveBalances, 'live');
  assert.equal(partial.reserveBalances4wChange, null);
  assert.equal(partial.reserveBalances4wReference, null);
});

const h41Endpoint = (date, releaseDate, value) => ({
  value, observationDate: date, releaseDate,
  url: `https://www.federalreserve.gov/releases/h41/${releaseDate.replaceAll('-', '')}/`,
  scheduledReleaseAt: `${releaseDate}T20:30:00.000Z`,
  retrievedAt: `${releaseDate}T21:01:00.000Z`,
  bodySha256: 'a'.repeat(64),
});
const h41Row = (current, prior) => ({
  observationDate: current.observationDate, value: current.value, receipt: current,
  ...(prior && { baseline: { observationDate: prior.observationDate, value: prior.value, receipt: prior } }),
});
const currentReserves = h41Endpoint('2026-10-14', '2026-10-15', 110);
const priorReserves = h41Endpoint('2026-09-16', '2026-09-17', 100);
const currentAssets = { ...currentReserves, value: 7000 };
const priorAssets = { ...priorReserves, value: 5000 };
const fedRows = (id) => [{ date: '2026-10-21', value: id === 'WALCL' ? 6000 : 20 }];
const availableAssertions = {
  requireStructuralObservation: (rows, name, now = Date.parse(FIXED_NOW)) => requireStructuralObservation(rows, name, now),
  structuralValueUsable,
  structuralObservationUsable: (date, name, now = Date.parse(FIXED_NOW)) => structuralObservationUsable(date, name, now),
};

test('healthy FRED levels never invoke H.4.1, even when one comparison is unavailable', async () => {
  let attempts = 0;
  const out = await loadFed(async id => fedRows(id), {}, {}, { ...availableAssertions, acquireH41: async () => { attempts++; } });
  assert.equal(attempts, 0);
  assert.equal(out.sourceStatus.walcl, 'live');
  assert.equal(out.sourceStatus.reserveBalances, 'live');
  assert.equal(out.walcl4wChange, null);
  assert.equal(out.reserveBalances4wChange, null);
  assert.equal(out.h41SourceReceipts, undefined);
});

test('H.4.1 failed reserve fallback preserves healthy WALCL and never carries a comparison to a new level', async () => {
  const prior = { reserveBalances: 100, reserveBalances4wChange: 25,
    reserveBalances4wReference: {date:'2026-09-09',value:80},
    sourceObservedAt: {reserveBalances:'2026-10-07'}, sourceStatus:{reserveBalances:'live'} };
  for (const invalid of [-1, 'malformed', 'nonwednesday', 'noncanonical', 'future', 'empty']) {
    const dates = { malformed: '2026-02-30', nonwednesday: '2026-10-20', noncanonical: '2026-10-21T00:00:00Z', future: '2026-10-28' };
    const out = await loadFed(async id => id !== 'WRESBAL' ? fedRows(id)
      : invalid === 'empty' ? [] : [{date:dates[invalid] ?? '2026-10-21',value:invalid === -1 ? -1 : 200}], {}, prior, {
      ...availableAssertions,
      acquireH41: async ({now, primary}) => {
        assert.equal(now, Date.parse(FIXED_NOW));
        assert.equal(primary.WALCL.failed, false);
        assert.equal(primary.WRESBAL.failed, true);
        assert.equal(primary.WRESBAL.usableIncumbentDate, '2026-10-07');
        return { rows: { WRESBAL: h41Row({...currentReserves,value:0}) } };
      },
    });
    assert.equal(out.walcl, 6000);
    assert.equal(out.sourceStatus.walcl, 'live');
    assert.equal(out.reserveBalances, 0);
    assert.equal(out.sourceStatus.reserveBalances, 'live');
    assert.equal(out.sourceObservedAt.reserveBalances, '2026-10-14');
    assert.equal(out.reserveBalances4wChange, null);
    assert.equal(out.reserveBalances4wReference, null);
    assert.equal(out.h41SourceReceipts.walcl, undefined);
    assert.equal(out.h41SourceReceipts.reserveBalances.current.value, 0);
  }
});

test('a healthy old WRESBAL observation is not age-gated; a stale WALCL level is eligible for H.4.1', async () => {
  const out = await loadFed(async (id) => ['WALCL','WRESBAL'].includes(id) ?
    [{date:'2026-08-05',value:10}] : fedRows(id), {}, {}, {
    ...availableAssertions, acquireH41: async ({primary}) => {
      assert.equal(primary.WALCL.failed, true);
      assert.equal(primary.WRESBAL.failed, false);
      return {rows:{ WALCL:h41Row(currentAssets,priorAssets) }};
    },
  });
  assert.equal(out.walcl4wChange, 40);
  assert.equal(out.sourceStatus.walcl, 'live');
  assert.equal(out.reserveBalances, 10);
  assert.equal(out.sourceStatus.reserveBalances, 'live');
});

test('exact official pairs replay from the cache with unchanged receipts; FRED recovery clears official receipt', async () => {
  const down = async () => { throw new Error('offline'); };
  const sourced = await loadFed(down, {}, {}, {
    ...availableAssertions,
    acquireH41: async () => ({rows:{WALCL:h41Row(currentAssets,priorAssets),WRESBAL:h41Row(currentReserves,priorReserves)}}),
  });
  assert.equal(sourced.walcl4wChange,40);
  assert.equal(sourced.reserveBalances4wChange,10);
  assert.equal(sourced.reserveBalances4wReference.date,'2026-09-16');
  assert.equal(sourced.h41SourceReceipts.walcl.reference.observationDate,'2026-09-16');
  assert.equal(sourced.h41SourceReceipts.reserveBalances.reference.observationDate,'2026-09-16');
  const cached = await loadFed(down, {}, sourced, {
    ...availableAssertions, acquireH41: async ({primary}) => {
      assert.equal(primary.WALCL.usableIncumbentDate,'2026-10-14');
      assert.equal(primary.WRESBAL.usableIncumbentDate,'2026-10-14');
      return {rows:{}};
    },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(cached.h41SourceReceipts)),JSON.parse(JSON.stringify(sourced.h41SourceReceipts)));
  assert.equal(cached.sourceStatus.walcl,'fallback');
  assert.equal(cached.sourceStatus.reserveBalances,'fallback');
  const futureReceipt = JSON.parse(JSON.stringify(cached));
  futureReceipt.h41SourceReceipts.walcl.current.retrievedAt = '2026-10-23T12:00:00.000Z';
  futureReceipt.h41SourceReceipts.reserveBalances.reference.retrievedAt = '2026-10-23T12:00:00.000Z';
  const rejectedClock = await loadFed(down, {}, futureReceipt, availableAssertions);
  assert.equal(rejectedClock.h41SourceReceipts.walcl, undefined);
  assert.equal(rejectedClock.h41SourceReceipts.reserveBalances.reference, undefined);
  const tampered = await loadFed(down, {}, {...cached, walcl4wChange:1, reserveBalances4wChange:50}, availableAssertions);
  assert.equal(tampered.h41SourceReceipts.walcl,undefined);
  assert.equal(tampered.h41SourceReceipts.reserveBalances.reference,undefined);
  assert.equal(tampered.reserveBalances4wChange,null);
  assert.equal((await loadFed(async id => fedRows(id), {}, cached, availableAssertions)).h41SourceReceipts,undefined);
});

test('lost WALCL evidence with no incumbent still triggers structural continuity hold', async () => {
  const out = await loadFed(async id => {
    if (id === 'WALCL') throw new Error('offline');
    return fedRows(id);
  }, {}, {walcl:7000, walcl4wChange:12, sourceObservedAt:{walcl:'2026-09-30'}, sourceStatus:{walcl:'live'}}, availableAssertions);
  assert.equal(out.walcl,null);
  assert.equal(out.sourceStatus.walcl,'missing');
  assert.throws(() => requireStructuralContinuity({fedLiquidity:{walcl:7000,walcl4wChange:12,sourceStatus:{walcl:'live'}}},
    {fedLiquidity:out}), /structural_input_publication_hold:walcl/);
});
