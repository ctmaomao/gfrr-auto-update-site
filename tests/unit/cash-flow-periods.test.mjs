import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as policy from '../../scripts/bubble-watch/cash-flow-periods.mjs';
const { collectQualifiedCashFlowConcept, qualifyEdgarCashFlow, qualifyMirrorCashFlows, alignCashFlowPeriods, CASH_CAPEX_TAGS, OPERATING_CASH_FLOW_TAGS } = policy;
const fixture = JSON.parse(fs.readFileSync('tests/fixtures/bubble-watch/sec-cash-flow-20261102.json'));
const clock = fixture.filingCutoff;
const CIK = { AMZN: '0001018724', MSFT: '0000789019', GOOGL: '0001652044', META: '0001326801', ORCL: '0001341439' };
const payload = (ticker, tag) => structuredClone(fixture.concepts.find(c => c.ticker === ticker && c.payload.tag === tag)?.payload);
const units = (ticker, tag) => payload(ticker, tag).units.USD;
const fetchFixture = async url => {
  const match = fixture.concepts.find(c => c.sourceUrl === url);
  if (!match) throw new Error('HTTP 404');
  return structuredClone(match.payload);
};
const collect = (ticker, kind, overrides = {}) => collectQualifiedCashFlowConcept({ cik: CIK[ticker], kind, asOfDate: clock,
  tags: kind === 'capex' ? CASH_CAPEX_TAGS : OPERATING_CASH_FLOW_TAGS, fetchConcept: fetchFixture, ...overrides });
const total = (series, start = 4) => series.quarters.slice(start, start + 4).reduce((s, q) => s + q.value, 0) / 1e9;

test('SEC originals reproduce all five independent complete concepts and Amazon tag migration', async () => {
  const expected = { AMZN: [168.300, 215.192], MSFT: [195.878, 135.921], GOOGL: [179.551, 159.804], META: [133.087, 104.438], ORCL: [46.940, 75.660] };
  let ocfTotal = 0, capexTotal = 0;
  for (const ticker of Object.keys(CIK)) {
    const ocf = await collect(ticker, 'ocf'), capex = await collect(ticker, 'capex');
    assert.deepEqual([total(ocf), total(capex)], expected[ticker]);
    assert.equal(alignCashFlowPeriods(ocf, capex).length, 8);
    assert.equal(ocf.periodEnd, ticker === 'ORCL' ? '2026-08-31' : '2026-09-30');
    assert.equal(capex.source.tag, CASH_CAPEX_TAGS[ticker === 'AMZN' ? 1 : 0]);
    ocfTotal += total(ocf); capexTotal += total(capex);
  }
  assert.ok(Math.abs(ocfTotal - 723.756) < 1e-9);
  assert.equal(capexTotal, 691.015);
  assert.ok(Math.abs(capexTotal / ocfTotal * 100 - 95.47623784811454) < 1e-9);
});

test('the discontinued Amazon concept cannot qualify even if its filing timestamp is new', () => {
  const old = units('AMZN', CASH_CAPEX_TAGS[0]);
  assert.equal(old.map(r => r.end).sort().at(-1), '2017-03-31');
  assert.throws(() => qualifyEdgarCashFlow(old.map(r => ({ ...r, filed: clock })), clock, 'capex'), /period_stale/);
});

test('period-age gate is inclusive at 120 days and rejects day 121', () => {
  const raw = units('AMZN', CASH_CAPEX_TAGS[1]);
  assert.equal(qualifyEdgarCashFlow(raw, '2027-01-28', 'capex').freshness.ageDays, 120);
  assert.throws(() => qualifyEdgarCashFlow(raw, '2027-01-29', 'capex'), /period_stale/);
});

test('missing quarter, invalid value and incomplete newest quarter cannot become an older TTM', () => {
  const raw = units('AMZN', CASH_CAPEX_TAGS[1]);
  assert.throws(() => qualifyEdgarCashFlow(raw.filter(r => r.end !== '2025-06-30'), clock, 'capex'), /contiguous|missing/);
  assert.throws(() => qualifyEdgarCashFlow(raw.map(r => r.end === '2026-09-30' ? { ...r, val: null } : r), clock, 'capex'), /invalid/);
  assert.throws(() => qualifyEdgarCashFlow(raw.filter(r => r.end !== '2026-06-30' && !(r.end === '2026-09-30' && r.start === '2026-07-01')), clock, 'capex'), /latest_period_incomplete/);
});

test('same-date conflicting facts, wrong issuer and wrong unit fail closed', async () => {
  const raw = units('AMZN', CASH_CAPEX_TAGS[1]);
  const latest = raw.find(r => r.end === '2026-09-30');
  assert.throws(() => qualifyEdgarCashFlow([...raw, { ...latest, val: latest.val + 1 }], clock, 'capex'), /same_filing_conflict/);
  for (const change of [j => { j.cik = 789019; }, j => { j.units = { EUR: j.units.USD }; }, j => { j.tag = 'Other'; }]) {
    await assert.rejects(collect('AMZN', 'capex', { fetchConcept: async url => { const j = await fetchFixture(url); change(j); return j; } }), /no_qualified_concept/);
  }
});

test('candidate order cannot pick an older recent concept or splice two partial tags', async () => {
  const good = payload('AMZN', CASH_CAPEX_TAGS[1]);
  const fetched = async url => {
    const tag = url.split('/').at(-1).replace('.json', '');
    return { ...good, tag, units: { USD: good.units.USD.filter(r => tag === CASH_CAPEX_TAGS[0] ? r.end <= '2026-06-30' : true).map(r => ({ ...r, filed: r.filed > '2026-10-01' ? '2026-10-01' : r.filed })) } };
  };
  const selected = await collect('AMZN', 'capex', { asOfDate: '2026-10-01', fetchConcept: fetched });
  assert.equal(selected.periodEnd, '2026-09-30');
  assert.equal(selected.source.tag, CASH_CAPEX_TAGS[1]);
  await assert.rejects(collect('AMZN', 'capex', { asOfDate: '2026-10-01', fetchConcept: async url => {
    const j = await fetched(url);
    if (j.tag === CASH_CAPEX_TAGS[1]) j.units.USD = j.units.USD.filter(r => r.end !== '2026-06-30');
    return j;
  } }), /newer_concept_incomplete/);
  await assert.rejects(collect('AMZN', 'capex', { fetchConcept: async url => {
    const j = await fetched(url); j.units.USD = j.units.USD.filter(r => j.tag === CASH_CAPEX_TAGS[0] ? r.end < '2025-01-01' : r.end >= '2025-01-01'); return j;
  } }), /no_qualified_concept/);
});

test('two complete same-period concepts with different scope cannot be silently arbitrated', async () => {
  const good = payload('AMZN', CASH_CAPEX_TAGS[1]);
  await assert.rejects(collect('AMZN', 'capex', { fetchConcept: async url => {
    const tag = url.split('/').at(-1).replace('.json', '');
    return { ...good, tag, units: { USD: good.units.USD.map(r => ({ ...r, val: r.val * (tag === CASH_CAPEX_TAGS[0] ? 2 : 1) })) } };
  } }), /same_period_concepts_disagree/);
});

test('OCF and capex require identical latest eight periods, not just an old intersection', async () => {
  const ocf = await collect('AMZN', 'ocf'), capex = await collect('AMZN', 'capex');
  const wrong = structuredClone(capex); wrong.quarters[3].start = '2025-01-02';
  assert.throws(() => alignCashFlowPeriods(ocf, wrong), /period_mismatch/);
  const older = qualifyEdgarCashFlow(units('AMZN', CASH_CAPEX_TAGS[1]).filter(r => r.end <= '2026-06-30'), '2026-10-01', 'capex');
  assert.throws(() => alignCashFlowPeriods(ocf, older), /period_mismatch/);
});

const dates = ['2026-09-30', '2026-06-30', '2026-03-31', '2025-12-31', '2025-09-30', '2025-06-30', '2025-03-31', '2024-12-31', '2024-09-30'];
function mirror({ periods = dates, capex = '-12', ocf = '20', currency = 'millions USD' } = {}) {
  const row = (label, value) => `<tr><td>${label}</td>${periods.map((_, i) => `<td>${Array.isArray(value) ? value[i] : value}</td>`).join('')}</tr>`;
  return `<p>Financials in ${currency}</p><table><tr><th>Period Ending</th>${periods.map(d => `<th id="${d}">${d}</th>`).join('')}</tr>${row('Operating Cash Flow', ocf)}${row('Capital Expenditures', capex)}</table>`;
}
test('quarterly mirror must prove USD, dates and exact aligned cells without skipping nulls', () => {
  const result = qualifyMirrorCashFlows(mirror(), clock);
  assert.equal(total(result.capex), .048); assert.equal(total(result.ocf), .08);
  assert.equal(result.ocf.periodEnd, '2026-09-30');
  assert.equal(total(qualifyMirrorCashFlows(mirror({ capex: '0' }), clock).capex), 0);
  for (const html of [mirror({ currency: 'millions EUR' }), mirror().replaceAll('2026-09-30', 'unknown'), mirror({ capex: ['-', ...Array(8).fill('-12')] }), mirror({ periods: dates.filter(d => d !== '2025-06-30') }), mirror({ periods: dates.map(d => d.replace('2026', '2016').replace('2025', '2015').replace('2024', '2014')) })]) {
    assert.throws(() => qualifyMirrorCashFlows(html, clock), /cash_flow_/);
  }
});

function actualBuilders(fetcher = fetchFixture, mirrorFetcher = async () => { throw new Error('offline mirror unavailable'); }, asOfDate = clock) {
  const source = fs.readFileSync('scripts/build-bubble-watch.mjs', 'utf8');
  const between = (a, b) => source.slice(source.indexOf(a), source.indexOf(b, source.indexOf(a)));
  const code = between('const EDGAR_CASH_FLOW_CACHE', '// 现金流类')
    + between('function trailing4qYoy(', 'async function fetchMultplCape(')
    + between('function trailing4qCapexOcfCoverage(', 'function monthsBetweenIso(')
    + 'const builders = {' + between('  async hyperscaler_capex_yoy()', '  async nvda_invest_revenue(') + '}; builders';
  const calls = [];
  const builders = vm.runInNewContext(code, { ...policy, EDGAR_CIK: CIK, EDGAR_UA: 'offline-test', WIND_API_KEY: '', isoDate: () => asOfDate,
    fetchWithTimeout: async url => { calls.push(url); return fetcher(url); }, fetchSaFinancialPage: mirrorFetcher,
    retry: fn => fn(), fmtPct: n => String(n), console: { warn() {} } });
  return { builders, calls };
}

test('actual two builder entries use qualified original facts, disclose periods, reuse bounded requests and keep score lights', async () => {
  const { builders, calls } = actualBuilders();
  const capex = await builders.hyperscaler_capex_yoy(), coverage = await builders.mag4_fcf_yoy();
  assert.equal(capex.status, 'yellow'); assert.equal(capex.as_of, '2026-09-30');
  assert.ok(Math.abs(capex.detail.yoyPct - (615.355 / 329.758 - 1) * 100) < 1e-9);
  assert.equal(coverage.status, 'red'); assert.equal(coverage.as_of, '2026-08-31');
  assert.equal(coverage.detail.over100Count, 2);
  assert.ok(Math.abs(coverage.detail.ratioPct - 95.47623784811454) < 1e-9);
  assert.equal(coverage.detail.perCompany[0].sourceEvidence.capex.source.tag, CASH_CAPEX_TAGS[1]);
  assert.equal(coverage.detail.perCompany[0].latestEnd, '2026-09-30');
  assert.equal(calls.length, 20); assert.equal(new Set(calls).size, 20);
  assert.ok(calls.every(url => url.startsWith('https://data.sec.gov/api/xbrl/companyconcept/')));
});

test('actual builder fails closed on unavailable modern Amazon data and undated mirror', async () => {
  const { builders } = actualBuilders(async url => {
    if (url.includes('1018724') && url.includes('ProductiveAssets')) throw new Error('HTTP 503');
    return fetchFixture(url);
  }, async () => '<table>Operating Cash Flow 1 2 3 4 5 6 7 8</table>');
  await assert.rejects(builders.mag4_fcf_yoy(), /mirror_units_unconfirmed/);
});

test('actual builder uses the same dated contract for the whole five-company mirror fallback', async () => {
  const { builders } = actualBuilders(async () => { throw new Error('HTTP 403'); }, async () => mirror());
  const result = await builders.mag4_fcf_yoy();
  assert.equal(result.as_of, '2026-09-30'); assert.equal(result.detail.perCompany.length, 5);
  assert.ok(result.detail.perCompany.every(c => c.sourceEvidence.ocf.source.provider === 'StockAnalysis'));
});


test('incomplete alternative concept cannot hide conflicting current original facts', async () => {
  const good = payload('AMZN', CASH_CAPEX_TAGS[1]);
  await assert.rejects(collect('AMZN', 'capex', { fetchConcept: async url => {
    const tag = url.split('/').at(-1).replace('.json', '');
    const usd = tag === CASH_CAPEX_TAGS[0] ? good.units.USD.filter(r => r.end === '2026-09-30').map(r => ({ ...r, val: r.val * 2 })) : good.units.USD;
    return { ...good, tag, units: { USD: usd } };
  } }), /same_period_concepts_disagree/);
});

test('direct-quarter presence cannot conceal contradictory cumulative disclosures', () => {
  const raw = units('AMZN', CASH_CAPEX_TAGS[1]);
  const changed = raw.map(r => r.start === '2026-01-01' && r.end === '2026-09-30' ? { ...r, val: r.val + 1000000000, filed: clock } : r);
  assert.throws(() => qualifyEdgarCashFlow(changed, clock, 'capex'), /quarter_conflict/);
});

test('actual fallback cannot backdate to a fresh older mirror after SEC disclosed a newer incomplete period', async () => {
  const earlyFiled = async url => {
    const j = await fetchFixture(url);
    j.units.USD = j.units.USD.map(r => ({ ...r, filed: r.filed > '2026-10-01' ? '2026-10-01' : r.filed }));
    if (url.includes('1018724') && url.includes('ProductiveAssets')) j.units.USD = j.units.USD.filter(r => r.end !== '2026-06-30');
    return j;
  };
  const olderDates = [...dates.slice(1), '2024-06-30'];
  assert.equal(qualifyMirrorCashFlows(mirror({ periods: olderDates }), '2026-10-01').capex.freshness.status, 'fresh');
  const { builders } = actualBuilders(earlyFiled, async () => mirror({ periods: olderDates }), '2026-10-01');
  await assert.rejects(builders.mag4_fcf_yoy(), /mirror_older_than_sec_disclosure/);
});


test('original historical intersection reproduces the production Amazon defect without changing production files', () => {
  const source = fs.readFileSync('scripts/build-bubble-watch.mjs', 'utf8');
  const legacy = vm.runInNewContext(source.slice(source.indexOf('function deriveQuarterlySeries('), source.indexOf('// 时点类')) + ';deriveQuarterlySeries');
  const capex = legacy(units('AMZN', CASH_CAPEX_TAGS[0]));
  const capexByEnd = new Map(capex.map(q => [q.end, q.val]));
  const common = legacy(units('AMZN', OPERATING_CASH_FLOW_TAGS[0])).filter(q => capexByEnd.has(q.end));
  assert.equal(common.at(-1).end, '2017-03-31');
  assert.equal(common.slice(-4).reduce((s, q) => s + q.val, 0) / 1e9, 17.537);
  assert.equal(common.slice(-4).reduce((s, q) => s + capexByEnd.get(q.end), 0) / 1e9, 7.419);
});

test('actual mirror original split tables reproduce Amazon facts and must share exact dates', () => {
  const html = fs.readFileSync('tests/fixtures/bubble-watch/amzn-quarterly-cash-flow-mirror-20261109.html', 'utf8');
  const result = qualifyMirrorCashFlows(html, '2026-11-09');
  assert.equal(total(result.ocf), 168.300); assert.equal(total(result.capex), 215.192);
  assert.equal(result.capex.periodEnd, '2026-09-30');
  assert.throws(() => qualifyMirrorCashFlows(html.replace('id="2026-09-30"', 'id="2026-09-29"'), '2026-11-09'), /period_mismatch/);
  assert.throws(() => qualifyMirrorCashFlows(html + html, '2026-11-09'), /duplicate_series/);
});

const syntheticCumulative = () => {
  const rows = [];
  for (let year = 2024; year <= 2026; year++) {
    for (let quarter = 1; quarter <= 4; quarter++) {
      if (year === 2026 && quarter === 4) continue;
      rows.push({ start: `${year}-01-01`, end: `${year}-${['03-31', '06-30', '09-30', '12-31'][quarter - 1]}`,
        filed: clock, form: '10-Q', val: quarter * 10 });
    }
  }
  return rows;
};
const syntheticDirect = () => syntheticCumulative().map(row => ({ ...row,
  start: `${row.end.slice(0, 4)}-${{ '03-31': '01-01', '06-30': '04-01', '09-30': '07-01', '12-31': '10-01' }[row.end.slice(5)]}`, val: 10 }));
const syntheticFetch = (tags, complete, alternative) => async url => {
  const tag = url.split('/').at(-1).replace('.json', '');
  return { cik: Number(CIK.AMZN), taxonomy: 'us-gaap', tag, units: { USD: tag === tags[0] ? complete : alternative } };
};

for (const kind of ['capex', 'ocf']) {
  for (const reversed of [false, true]) {
    test(`${kind} rejects incomplete cross-tag direct/cumulative conflicts in either tag order (${reversed})`, async () => {
      const tags = [...(kind === 'capex' ? CASH_CAPEX_TAGS : OPERATING_CASH_FLOW_TAGS)];
      if (reversed) tags.reverse();
      // Exercise both directions, including the oldest selected quarter whose
      // cumulative predecessor ends before the selected eight-quarter window.
      for (const end of ['2026-09-30', '2024-12-31']) {
        const cumulative = syntheticCumulative(), direct = syntheticDirect();
        const partialDirect = direct.filter(r => r.end === end).map(r => ({ ...r, val: 999 }));
        const partialCumulative = cumulative.filter(r => r.start === `${end.slice(0, 4)}-01-01`
          && [end, end.endsWith('12-31') ? `${end.slice(0, 4)}-09-30` : `${end.slice(0, 4)}-06-30`].includes(r.end))
          .map(r => r.end === end ? { ...r, val: r.val + 989 } : r);
        for (const [complete, alternative] of [[cumulative, partialDirect], [direct, partialCumulative]]) {
          assert.throws(() => qualifyEdgarCashFlow(alternative, clock, kind), /eight_quarters_missing|period_stale/);
          for (const requestTags of [tags, [...tags].reverse()]) {
            await assert.rejects(collect('AMZN', kind, { tags: requestTags, fetchConcept: syntheticFetch(tags, complete, alternative) }), /same_period_concepts_disagree/);
          }
        }
      }
    });
  }
}

test('agreeing incomplete alternatives remain rejected as candidates without blocking complete source', async () => {
  for (const [complete, alternative] of [
    [syntheticCumulative(), syntheticDirect().slice(-1)],
    [syntheticDirect(), syntheticCumulative().slice(-2)]
  ]) {
    const result = await collect('AMZN', 'capex', { fetchConcept: syntheticFetch(CASH_CAPEX_TAGS, complete, alternative) });
    assert.equal(result.source.tag, CASH_CAPEX_TAGS[0]);
    assert.equal(result.quarters.at(-1).value, 10);
    assert.equal(result.rejectedConcepts[0].reason, 'cash_flow_eight_quarters_missing');
  }
});


test('conflicting cumulative predecessors before the selected window cannot be silently chosen', async () => {
  const complete = syntheticDirect();
  const alternative = syntheticCumulative().filter(r => ['2024-09-30', '2024-12-31'].includes(r.end));
  alternative.push({ ...alternative[0], val: 999 });
  await assert.rejects(collect('AMZN', 'capex', {
    fetchConcept: syntheticFetch(CASH_CAPEX_TAGS, complete, alternative)
  }), /same_filing_conflict/);
});
