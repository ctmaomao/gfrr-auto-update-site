import test from 'node:test';
import assert from 'node:assert/strict';
import { selectVcObservation, extractVcAiFundingShare, articlePublishedDate, requireNeocloudCoverage, alignedBreadth, pairRpoPeriods, parseRpoTable } from '../../scripts/bubble-watch/source-evidence-policy.mjs';

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
