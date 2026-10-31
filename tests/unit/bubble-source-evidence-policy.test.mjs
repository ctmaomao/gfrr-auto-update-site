import test from 'node:test';
import assert from 'node:assert/strict';
import { hasNamedCeoFinancialCaution, classifyCeoCautionCounts, selectVcObservation, extractVcAiFundingShare, articlePublishedDate, requireNeocloudCoverage, alignedBreadth, breadthSourceLabel, pairRpoPeriods, parseRpoTable, describeRpoCoverage, assertRpoCoverage, MIN_RPO_COMPANIES, RPO_COMPANIES } from '../../scripts/bubble-watch/source-evidence-policy.mjs';

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

const today = '2026-09-14';
const sector = 'AI was the leading sector, with $210 billion going to companies in the sector, representing 70% of total global venture funding.';
const post = { title: 'H1 2026 funding', date: '2026-07-01T12:00:00', text: sector };

test('VC accepts a lower genuine sector share and preserves its observation period', () => {
  const value = selectVcObservation([post], extractVcAiFundingShare, today);
  assert.equal(value.parsed.sharePct, 70);
  assert.equal(value.observationDate, '2026-06-30');
  assert.equal(value.articleDate, '2026-07-01');
});
test('VC rejects stale, future, mixed-period and megadeal-only evidence', () => {
  for (const invalid of [
    { ...post, title: 'Q1 2026 funding', date: '2026-04-01' },
    { ...post, title: 'Q1 2026 funding', date: today },
    { ...post, title: 'Q3 2026 funding' },
    { ...post, title: 'H1 2026 compared with H1 2025' },
    { ...post, text: 'Four AI megadeals raised $188 billion, 65% of quarterly funding.' },
    { ...post, text: 'Four AI megadeals raised $188 billion, 65% of total global venture funding.' }
  ]) assert.throws(() => selectVcObservation([invalid], extractVcAiFundingShare, today), /unconfirmed/);
  assert.equal(extractVcAiFundingShare('Four AI megadeals raised $188 billion, 65% of quarterly funding.'), null);
  assert.equal(extractVcAiFundingShare('Four AI megadeals raised $188 billion, 65% of total global venture funding.'), null);
});
test('VC chooses the latest verified period instead of the first search hit', () => {
  const result = selectVcObservation([{ ...post, title: 'Q1 2026 funding', date: '2026-04-01' }, post], extractVcAiFundingShare, today);
  assert.equal(result.observationDate, '2026-06-30');
});
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
