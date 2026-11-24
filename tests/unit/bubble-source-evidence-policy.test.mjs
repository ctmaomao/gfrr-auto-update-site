import test from 'node:test';
import assert from 'node:assert/strict';
import { hasNamedCeoFinancialCaution, classifyCeoCautionCounts, selectVcObservation, extractVcAiFundingShare, articlePublishedDate, requireNeocloudCoverage, alignedBreadth, breadthSourceLabel, pairRpoPeriods, parseRpoTable, describeRpoCoverage, assertRpoCoverage, MIN_RPO_COMPANIES, RPO_COMPANIES } from '../../scripts/bubble-watch/source-evidence-policy.mjs';
import { probeNeocloudSources } from '../../scripts/bubble-watch/neocloud-source-probes.mjs';

test('CEO news volume without attributed financial caution cannot change the light', () => {
  assert.deepEqual(classifyCeoCautionCounts(20, 0), { status: 'green', display: '无' });
  assert.equal(classifyCeoCautionCounts(1, 1).status, 'yellow');
  assert.equal(classifyCeoCautionCounts(12, 3).status, 'red');
  assert.equal(classifyCeoCautionCounts(11, 3).status, 'yellow');
});

test('CEO evidence rejects deployed editor, analyst, safety and spending leads', () => {
  for (const text of [
    'Why AI bubble fears are not keeping this Amazon boss up at night. Brian Sozzi Executive Editor.',
    'Michael Burry believes the AI bubble will burst after one season of revenue disappointment.',
    'Altman expects rapid AI growth; analysts warn about an AI bubble.',
    'Jamie Dimon says hyperscaler AI spending may hit $1 trillion in 2027.',
    'Altman warned about AI safety risks. Analysts discuss the AI bubble.',
    'Altman warned about AI safety risks, while analysts warned of an AI bubble.',
    'Analysts warned of an AI bubble, while Altman acknowledged strong demand.',
    'Altman warned about AI safety risks and analysts warned of an AI bubble.',
    'Altman acknowledged strong demand as analysts warned of an AI bubble.',
    'Altman warned about AI safety risks with commentators warning of an AI bubble.',
    '奥特曼警告人工智能安全风险以及分析师认为人工智能泡沫正在破裂。',
    'AI bubble analysts interviewed Altman who warned about safety risks.',
    '奥特曼警告人工智能安全风险，而分析师警告人工智能泡沫。',
    'OpenAI CEO interviewed about the AI bubble.',
    'Ray Dalio discussed AI investment returns.'
  ]) assert.equal(hasNamedCeoFinancialCaution(text), false, text);
});

test('CEO evidence accepts named attributed financial caution in English and Chinese', () => {
  for (const text of [
    'Ray Dalio warned that artificial intelligence is a classic bubble nearing a bursting point.',
    'Altman admitted that AI investment is in a bubble.',
    'Altman has recently warned that AI investment is in a bubble.',
    'Altman warned analysts about an AI bubble.',
    '黄仁勋警告人工智能过度投资风险。'
  ]) assert.equal(hasNamedCeoFinancialCaution(text), true, text);
});

test('CEO evidence rejects denial and explicitly recycled quotation context', () => {
  for (const text of [
    'Altman warned investors but said AI is not a bubble.',
    'Dimon warned of an AI bubble in an old letter quoted again today.',
    'Pichai acknowledged irrational AI investment last year.',
    '奥特曼承认市场担忧，但否认人工智能是泡沫。'
  ]) assert.equal(hasNamedCeoFinancialCaution(text), false, text);
});

const vcToday = '2026-11-24';
const title = 'Crunchbase Data: Q3 2026 Posted A Record Count Of Billion-Dollar Rounds As The Global AI Race Heats Up';
const link = 'https://news.crunchbase.com/venture/q3-2026-global-startup-funding-ai-billion-dollar-rounds-exits-data/';
const total = 'Global venture funding totaled $159 billion in Q3 2026 with close to 6,000 startups funded, Crunchbase data shows.';
const sector = 'AI-driven startups across the stack raised $102 billion, or 64% of global venture capital, down from the two previous quarters, but still 14 percentage points above Q3 2025 global funding.';
const post = { title, link, date: '2026-10-05T12:00:00', text: `${total} ${sector}` };

test('VC accepts the primary Q3 2026 report with comparative periods and preserves both dates', () => {
  const value = selectVcObservation([post], vcToday);
  assert.equal(value.parsed.aiFundingB, 102);
  assert.equal(value.parsed.totalFundingB, 159);
  assert.equal(value.parsed.sharePct.toFixed(1), '64.2');
  assert.equal(value.parsed.publishedSharePct, 64);
  assert.equal(value.period, '2026-Q3');
  assert.equal(value.end, '2026-09-30');
  assert.equal(value.articleDate, '2026-10-05');
  assert.equal(value.parsed.evidenceText, `${total} ${sector}`);
  assert.deepEqual(extractVcAiFundingShare(value.parsed.evidenceText, value.period), value.parsed);
});
test('VC rejects wrong scope, inferred totals, mismatched quarters and inconsistent values', () => {
  for (const invalid of [
    { ...post, title: 'H1 2026 funding' },
    { ...post, title: 'Q3 2026 compared with Q3 2025' },
    { ...post, title: 'Q3 2026 YTD funding' },
    { ...post, link: link.replace('global', 'north-america') },
    { ...post, link: link.replace('news.crunchbase.com', 'example.com') },
    { ...post, date: '2026-09-29' },
    { ...post, date: '2026-11-25' },
    { ...post, text: sector },
    { ...post, text: `Global venture funding totaled $159 billion in Q3 2026 excluding European deals. ${sector}` },
    { ...post, text: `Global venture funding totaled $159 billion in Q3 2026 in our preliminary scenario. ${sector}` },
    { ...post, text: `${total} ${sector.replace('the two previous quarters, but still', 'the two previous quarters excluding Europe, but still')}` },
    { ...post, text: `${total.replace('Q3 2026', 'Q2 2026')} ${sector}` },
    { ...post, text: `${total} ${sector.replace('64%', '65%')}` },
    { ...post, text: `${total} ${sector.replace('global', 'US')}` },
    { ...post, text: `${total} ${sector.replace('venture capital, down', 'venture capital in Q2 2026, down')}` },
    { ...post, text: `${total} ${sector.replace('venture capital, down', 'venture capital in October 2026, down')}` },
    { ...post, text: `${total} ${sector.replace('global venture capital', 'global deal count')}` },
    { ...post, text: `${total} Four AI megadeals raised $102 billion, or 64% of global venture capital.` },
  ]) assert.throws(() => selectVcObservation([invalid], vcToday), /unconfirmed/);
  assert.throws(() => selectVcObservation([post], '2027-02-01'), /unconfirmed/);
});
test('VC chooses the latest verified period instead of the first search hit', () => {
  const q2 = { title: 'Q2 2026 funding', link: link.replace('q3-2026', 'q2-2026'), date: '2026-07-06',
    text: `${total.replace('Q3 2026','Q2 2026')} ${sector}` };
  assert.equal(selectVcObservation([q2], '2026-10-01').period, '2026-Q2');
  assert.equal(selectVcObservation([q2, post], '2026-10-06').period, '2026-Q3');
});

const today = '2026-09-14';
test('Neocloud index modification and old financing pages cannot prove current zero events', () => {
  assert.equal(articlePublishedDate('<meta property="article:modified_time" content="2026-09-14">'), null);
  assert.equal(articlePublishedDate('<script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2025-05-01","dateModified":"2026-09-14"}</script>'), '2025-05-01');
  const rows = ['CoreWeave', 'Lambda', 'Crusoe', 'Nebius'].map(company => ({ company, publishedAt: '2026-09-13' }));
  assert.equal(requireNeocloudCoverage(rows, today).length, 4);
  for (const publishedAt of [null, '2025-05-01', '2026-09-15']) {
    assert.throws(() => requireNeocloudCoverage([{ ...rows[0], publishedAt }, ...rows.slice(1)], today), /CoreWeave/);
  }
  assert.throws(() => requireNeocloudCoverage(rows.slice(1), today), /CoreWeave/);
});
test('Breadth uses one actual session and enforces aligned coverage', () => {
  const rows = Array.from({ length: 7 }, (_, i) => ({ date: '2026-09-11', above: i < 3 ? 1 : 0 }));
  assert.deepEqual(alignedBreadth([...rows, { date: '2026-09-10', above: 1 }, null], 10, today), { date: '2026-09-11', counted: 7, above: 3, pct: 3 / 7 * 100 });
  assert.throws(() => alignedBreadth(rows.slice(1), 10, today), /coverage_insufficient/);
  assert.throws(() => alignedBreadth(rows.map(row => ({ ...row, date: '2026-08-01' })), 10, today), /coverage_insufficient/);
});
test('Breadth labels the source actually used, including research fallback', () => {
  const indicator = source => ({ provenance: { mode: 'auto', detail: { source } } });
  assert.equal(breadthSourceLabel(indicator('Barchart:$S5FI')), 'Barchart $S5FI 市场广度');
  assert.equal(breadthSourceLabel(indicator('Yahoo Chart × Wikipedia constituents fallback')), 'Yahoo 行情与维基百科成份股名单实算');
  assert.equal(breadthSourceLabel({ source_name: 'Barchart $S5FI', provenance: { mode: 'auto_fallback' } }), '市场广度研究快照');
  assert.equal(breadthSourceLabel(indicator('unrecognized')), '市场广度来源待核实');
});
const dates = ['2026-06-30', '2026-03-31', '2025-12-31', '2025-09-30', '2025-06-30', '2025-03-31'];
test('RPO pairs calendar periods without shifting missing cells', () => {
  const result = pairRpoPeriods(dates, [300, 240, null, 160, 150, 120], today);
  assert.equal(result.yoyPct, 100);
  assert.equal(result.prevYoyPct, 100);
  assert.throws(() => pairRpoPeriods(dates, [300, 240, 200, 160, null, 120], today), /missing/);
  assert.throws(() => pairRpoPeriods(['2026-08-31', '2026-05-31', '2025-05-31'], [664, 638, 137.8], today), /prior-year/);
  assert.throws(() => pairRpoPeriods([...dates.slice(0, 4), '2025-06-29', '2025-06-30'], [300, 240, 200, 160, 150, 120], today), /descending|ambiguous/);
});
test('RPO HTML parser preserves blanks and ignores a similar NTM row', () => {
  const row = (label, values) => `<tr><td>${label}</td>${values.map(v => `<td>${v}</td>`).join('')}</tr>`;
  const table = values => `<table><tr><th>Period Ending</th>${dates.map(d => `<th id="${d}">${d}</th>`).join('')}</tr>${row('RPO to be Recognized Over NTM', [1, 1, 1, 1, 1, 1])}${row('RPO', values)}</table>`;
  const parse = value => value === '-' ? null : Number(value);
  assert.equal(parseRpoTable(table([300, 240, '-', 160, 150, 120]), 'RPO', parse, today).yoyPct, 100);
  assert.throws(() => parseRpoTable(table([300, 240, 200, 160, '-', 120]), 'RPO', parse, today), /missing/);
});

// --- Real-response regression for the cloud_rpo_growth mirror chain (fetched 2026-10-31) ---
// Dates and cell text below are copied from the public StockAnalysis responses (bounded
// read-only evidence kept in the ignored repair artifact); response sha256 prefixes:
//   MSFT  f4175b3cef6b  https://stockanalysis.com/stocks/msft/metrics/
//   AMZN  d70b522105e0  https://stockanalysis.com/stocks/amzn/metrics/
//   GOOGL 820c9bf66d79  https://stockanalysis.com/stocks/googl/metrics/
//   ORCL  2b1727a44c13  https://stockanalysis.com/stocks/orcl/financials/metrics/?p=quarterly
// These cases pin the fail-closed reasons so a future "fix" cannot quietly accept the
// same gaps; they are regression fixtures, never production inputs.
const RPO_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const rpoHeaderText = (iso) => {
  const [year, month, day] = iso.split('-').map(Number);
  return `${RPO_MONTHS[month - 1]} ${day}, ${year}`;
};
function realRpoTable(label, datesIn, cells) {
  const header = `<tr><th class="text-left">Period Ending</th>${datesIn.map(date => `<th class="whitespace-nowrap">${rpoHeaderText(date)}</th>`).join('')}</tr>`;
  const dataRow = `<tr><td class="x">${label}</td>${cells.map(value => `<td>${value}</td>`).join('')}</tr>`;
  return `<table>${header}${dataRow}</table>`;
}
// Mirrors parseSaCompactNumber from build-bubble-watch.mjs (not exported by the CLI).
const saNumber = (value) => {
  const raw = String(value || '').replace(/\s+/gu, '').replace(/,/gu, '');
  if (!raw || raw === '-' || /upgrade/iu.test(raw)) return null;
  const match = raw.match(/^(-?[0-9]+(?:\.[0-9]+)?)([KMBT])?$/iu);
  if (!match) return null;
  return Number(match[1]) * ({ K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[(match[2] || '').toUpperCase()] || 1);
};
const amznDates = ['2026-06-30', '2026-03-31', '2025-12-31', '2025-09-30', '2025-06-30', '2025-03-31', '2024-12-31', '2024-09-30'];
const amznValues = ['496.00B', '364.00B', '244.00B', '200.00B', '195.00B', '189.00B', '177.00B', '164.00B'];

test('real 2026-10-31 mirror rows reproduce the RPO fail-closed reasons without inventing values', () => {
  // MSFT: complete current + prior-year pair; still valid.
  const msft = parseRpoTable(realRpoTable('Commercial Remaining Performance Obligations',
    ['2026-09-30', '2026-06-30', '2026-03-31', '2025-12-31', '2025-09-30', '2025-06-30', '2025-03-31', '2024-12-31'],
    ['677.00B', '678.00B', '627.00B', '625.00B', '392.00B', '368.00B', '315.00B', '298.00B']),
  'Commercial Remaining Performance Obligations', saNumber, '2026-10-31');
  assert.equal(msft.observationDate, '2026-09-30');
  assert.ok(Math.abs(msft.yoyPct - 72.704) < 0.01);

  // AMZN: purely a freshness boundary (120d passes on 10-28, 121d fails on 10-29).
  const amzn = realRpoTable('AWS Remaining Performance Obligations', amznDates, amznValues);
  assert.equal(parseRpoTable(amzn, 'AWS Remaining Performance Obligations', saNumber, '2026-10-28').observationDate, '2026-06-30');
  assert.throws(() => parseRpoTable(amzn, 'AWS Remaining Performance Obligations', saNumber, '2026-10-29'),
    /RPO_observation_stale: 2026-06-30 \(121d > 120d\)/);

  // GOOGL: the newest header column is a placeholder, not an observation; it must not be skipped.
  const googl = realRpoTable('Remaining Performance Obligations',
    ['2026-09-30', '2026-06-30', '2026-03-31', '2025-12-31', '2025-09-30', '2025-06-30', '2025-03-31', '2024-12-31'],
    ['-', '519.50B', '467.60B', '242.80B', '157.70B', '108.20B', '92.40B', '93.20B']);
  assert.throws(() => parseRpoTable(googl, 'Remaining Performance Obligations', saNumber, '2026-10-31'),
    /RPO latest period value is unavailable \(2026-09-30\)/);

  // ORCL: only one reported column, so no same-period prior-year comparable exists.
  const orcl = realRpoTable('Remaining Performance Obligations (RPO)',
    ['2026-08-31', '2026-05-31', '2026-02-28', '2025-11-30', '2025-08-31', '2025-05-31', '2025-02-28', '2024-11-30'],
    ['664.00B', '', '', '', '', '', '', '']);
  assert.throws(() => parseRpoTable(orcl, 'Remaining Performance Obligations (RPO)', saNumber, '2026-10-31'),
    /RPO comparable value is missing \(2026-08-31 vs 2025-08-31\)/);
  assert.equal(saNumber(''), null);
  assert.equal(saNumber('-'), null);
});

test('RPO coverage gate keeps the >=2 company rule and records per-company source reasons', () => {
  assert.equal(MIN_RPO_COMPANIES, 2);
  assert.deepEqual([...RPO_COMPANIES], ['MSFT', 'ORCL', 'AMZN', 'GOOGL']);
  const failures = [
    { ticker: 'ORCL', source: 'edgar', reason: 'HTTP 403 for https://data.sec.gov/api/xbrl/companyconcept/CIK0001341439/us-gaap/RevenueRemainingPerformanceObligation.json' },
    { ticker: 'ORCL', source: 'stockanalysis', reason: 'RPO comparable value is missing (2026-08-31 vs 2025-08-31)' },
    { ticker: 'AMZN', source: 'stockanalysis', reason: 'RPO_observation_stale: 2026-06-30 (121d > 120d)' },
    { ticker: 'GOOGL', source: 'stockanalysis', reason: 'RPO latest period value is unavailable (2026-09-30)' }
  ];
  assert.throws(() => assertRpoCoverage([{ ticker: 'MSFT' }], failures), (error) => {
    assert.match(error.message, /RPO 可用公司不足 \(1\/4\)/u);
    assert.match(error.message, /MSFT=ok/u);
    assert.match(error.message, /ORCL=edgar:HTTP 403/u);
    assert.match(error.message, /stockanalysis:RPO comparable value is missing/u);
    assert.match(error.message, /AMZN=stockanalysis:RPO_observation_stale/u);
    assert.match(error.message, /GOOGL=stockanalysis:RPO latest period value is unavailable/u);
    assert.ok(error.message.length <= 800);
    assert.equal(/undefined/u.test(error.message), false);
    return true;
  });
  assert.doesNotThrow(() => assertRpoCoverage([{ ticker: 'MSFT' }, { ticker: 'AMZN' }], failures));
  const unbounded = describeRpoCoverage({ failures: Array.from({ length: 4 }, (_, i) => ({ ticker: 'ORCL', source: 'stockanalysis', reason: 'x'.repeat(500) + `\n${i}` })) });
  assert.ok(unbounded.length <= 600);
  assert.equal(/\n/u.test(unbounded), false);
});

for (const phrase of [
  'may default if a covenant is breached',
  'has not defaulted on any debt',
  'deploys a new optical network',
  'closes a new secured financing',
  'says a counterparty defaulted yesterday',
  'repeats a previously announced downgrade',
  'was downgraded today' // Even a seemingly definitive assertion on a non-register isn't complete cohort evidence.
]) test(`legacy probes cannot score: ${phrase}`, async () => {
  const calls = [];
  await assert.rejects(probeNeocloudSources({ today: '2026-11-24', loadText: async url => {
    calls.push(url);
    return `2026-11-24 CoreWeave, Lambda, Nebius and Crusoe: each issuer ${phrase}. `.repeat(3);
  } }), e => e.evidenceGate.reasonCode === 'neocloud_current_coverage_unconfirmed'
    && e.evidenceGate.checks.length === 5 && e.evidenceGate.checks.every(c => c.status === 'ok'));
  assert.equal(new Set(calls).size, 5);
});
test('transport and response failures stay distinguishable from an evidence gap with healthy sources', async () => {
  await assert.rejects(probeNeocloudSources({ today: '2026-11-24', loadText: async url => {
    if (new URL(url).hostname === 'lambda.com') throw Error('offline');
    return 'Access Denied';
  } }), e => e.evidenceGate.checks.filter(c => c.status === 'fetch_failed').length === 1
    && e.evidenceGate.checks.filter(c => c.status === 'invalid_content').length === 4);
});
