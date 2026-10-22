import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  parseObservationDate, latestDatedObservation, fallbackObservation, sameObservationDay,
} from '../../scripts/daily/source-observation.mjs';

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

function loadFed(fetchFed, nyFed, prev) {
  const src = extract('resolveFedLiquidity', 'async function resolvePolicyExpectations');
  const sandbox = {
    Date: FixedDate,
    fetchFredSeries: fetchFed,
    fetchNyFedSecuredRatesLatest: async () => nyFed,
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

test('fed fallback keeps same-field date; NYFed SOFR fallback keeps its own date', async () => {
  const prev = {
    effectiveFedFundsRate: 3.8,
    sourceObservedAt: { effectiveFedFundsRate: '2026-10-14' },
    sofr: 3.8,
    sofrSource: 'garbage',
    sourceObservedAtSofr: '2026-10-14',
  };
  prev.sourceObservedAt.sofr = '2026-10-14';
  const out = await loadFed(async (id) => {
    if (id === 'DFF' || id === 'SOFR') throw new Error('down');
    return [{ value: 1, date: '2026-10-15' }];
  }, { SOFR: { percentRate: 3.9, effectiveDate: '2026-10-16' } }, prev);
  assert.equal(out.sourceObservedAt.effectiveFedFundsRate, '2026-10-14');
  assert.equal(out.sourceObservedAt.sofr, '2026-10-14'); // FRED fallback takes precedence; no NYFed date theft
  assert.equal(out.sofrSource, null);
  const nyOnly = await loadFed(async (id) => {
    if (id === 'DFF' || id === 'SOFR') throw new Error('down');
    return [{ value: 1, date: '2026-10-15' }];
  }, { SOFR: { percentRate: 3.9, effectiveDate: '2026-10-16' } }, {});
  assert.equal(nyOnly.sourceObservedAt.sofr, '2026-10-16');
  assert.equal(nyOnly.sofrSource, 'NYFED:secured-rates-latest');
  const legacySofr = await loadFed(async (id) => {
    if (id === 'SOFR') throw new Error('down');
    return [{ value: 1, date: '2026-10-15' }];
  }, { SOFR: { percentRate: 3.9, effectiveDate: '2026-10-16' } }, { sofr: 3.7, sourceObservedAt: {} });
  assert.equal(legacySofr.sofr, 3.7);
  assert.equal(legacySofr.sourceObservedAt.sofr, null);
  assert.equal(legacySofr.sofrSource, null);
  assert.equal(legacySofr.bgcrSofrSpread, null);
});

test('FRED SOFR keeps priority and its own date; NYFed same-day SOFR is never borrowed', async () => {
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
  assert.equal(offDate.sourceObservedAt.sofr, '2026-10-16');
  assert.equal(offDate.bgcrSofrSpread, null);
  assert.equal(offDate.tgcrSofrSpread, null);
  assert.equal(offDate.repoSpreadRegime, '未知');

  // Finite FRED fallback keeps its own prior date; NYFed is not consulted.
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
  assert.equal(fallback.bgcrSofrSpread, null);
  assert.equal(fallback.repoSpreadRegime, '未知');

  // NYFed same-day SOFR is used only when the FRED path has no finite value.
  const nySameDay = await loadFed(
    async (id) => {
      if (id === 'SOFR') throw new Error('down');
      return baseRows[id];
    },
    ny,
    {},
  );
  assert.equal(nySameDay.sofr, 3.9);
  assert.equal(nySameDay.sourceObservedAt.sofr, '2026-10-15');
  assert.equal(nySameDay.sofrSource, 'NYFED:secured-rates-latest');
  assert.equal(nySameDay.repoSpreadDateStatus.bgcrSofr, 'same_day');
  assert.equal(nySameDay.bgcrSofrSpread, -0.03);
  assert.equal(nySameDay.repoSpreadRegime, '正常');
});

test('CRE normalizer preserves each prior date and nulls invalid/missing', () => {
  const src = extract('normalizePreviousCommercialRealEstate', 'function normalizePreviousPolicyExpectations');
  const fn = vm.runInNewContext(`${src}\nnormalizePreviousCommercialRealEstate`, {
    parseObservationDate,
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
    findValueAgo: () => null,
    parseObservationDate,
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
  assert.equal(first.creLoanBalanceUpdatedAt, '2026-10-07');
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

test('credit resolver stores NFCI/SLOOS dates and independent large/small status', async () => {
  const src = extract('resolveCredit', 'async function resolveUlsd');
  const sandbox = {
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
});
