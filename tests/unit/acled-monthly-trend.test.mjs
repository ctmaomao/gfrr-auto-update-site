import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { buildMonthlyTrend, completeMonthlyWindows, parseMonthlyEventCount } from '../../scripts/world-order/acled-monthly-trend.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rowsFor = (asOfDate, value = 10) => completeMonthlyWindows(asOfDate).months.map((index) => ({
  country: 'Test', year: Math.floor(index / 12), month: index % 12 + 1, value
}));

test('as-of month excluded even on month-end; cross-year and leap-day boundaries', () => {
  for (const [asOf, end] of [['2026-08-21', '2026-07'], ['2026-07-31', '2026-06'], ['2026-01-01', '2025-12'], ['2024-02-29', '2024-01'], ['2024-03-01', '2024-02']]) {
    const windows = completeMonthlyWindows(asOf);
    assert.equal(windows.latest12mWindow[1], end);
    assert.equal(windows.months.length, 24);
    assert.equal(windows.months[23] - windows.months[0], 23);
  }
  assert.deepEqual(buildMonthlyTrend(rowsFor('2026-08-21'), '2026-08-21'), {
    latest12mWindow: ['2025-08', '2026-07'], prior12mWindow: ['2024-08', '2025-07'],
    latest12mEvents: 120, prior12mEvents: 120, latest12mVsPrior12mDelta: 0
  });
  for (const bad of [null, '', '2026-02-30', '2025-02-29', '2026-13-01', '2026-08-21T00:00:00Z']) assert.throws(() => completeMonthlyWindows(bad));
});

test('partial current month and older records do not change complete windows; country rows sum', () => {
  const rows = rowsFor('2026-08-21');
  const doubled = rows.flatMap((row) => [row, { ...row, country: 'Other' }]).toReversed();
  const result = buildMonthlyTrend([...doubled, { year: 2026, month: 8, value: 999999 }, { year: 2020, month: 1, value: 90000 }], '2026-08-21');
  assert.equal(result.latest12mEvents, 240);
  assert.equal(result.prior12mEvents, 240);
  assert.equal(result.latest12mVsPrior12mDelta, 0);
});

test('every missing month returns whole-trend null; older data cannot backfill', () => {
  const rows = rowsFor('2026-08-21');
  for (let missing = 0; missing < 24; missing += 1) {
    const warnings = [];
    const input = rows.filter((_, index) => index !== missing);
    input.push({ year: 2024, month: 7, value: 100 });
    assert.equal(buildMonthlyTrend(input, '2026-08-21', (message) => warnings.push(message)), null);
    assert.match(warnings[0], /missing complete calendar months/u);
  }
  assert.equal(buildMonthlyTrend([], '2026-08-21'), null);
});

test('zero is not missing and denominator-zero remains null', () => {
  const zero = rowsFor('2026-08-21', 0);
  assert.deepEqual(buildMonthlyTrend(zero, '2026-08-21').latest12mEvents, 0);
  assert.equal(buildMonthlyTrend(zero, '2026-08-21').latest12mVsPrior12mDelta, null);
  const rows = rowsFor('2026-08-21');
  assert.equal(buildMonthlyTrend(rows.map((row, i) => ({ ...row, value: i < 12 ? 10 : 0 })), '2026-08-21').latest12mVsPrior12mDelta, -1);
  assert.equal(buildMonthlyTrend(rows.map((row, i) => ({ ...row, value: i < 12 ? 0 : 10 })), '2026-08-21').latest12mVsPrior12mDelta, null);
  for (const value of [null, -1, NaN, Infinity, 0.5]) assert.throws(() => buildMonthlyTrend([{ year: 2026, month: 7, value }], '2026-08-21'));
});

test('monthly source count parser rejects blanks before they can become observed zeros', () => {
  for (const bad of [null, undefined, '', '  ', '\t', ',', ' , ', -1, Infinity, 'NaN', 1.2]) assert.throws(() => parseMonthlyEventCount(bad));
  assert.equal(parseMonthlyEventCount(0), 0);
  assert.equal(parseMonthlyEventCount(' 0 '), 0);
  assert.equal(parseMonthlyEventCount('1,234'), 1234);
  // Lock the source-to-helper boundary, not just the pure helper's behavior.
  const source = fs.readFileSync(path.join(root, 'scripts/world-order/sanitize-acled-monthly.mjs'), 'utf8');
  const monthlyParser = source.slice(source.indexOf('function parseMonthlyRows'), source.indexOf('function sumByYear'));
  assert.match(monthlyParser, /value: parseMonthlyEventCount\(row\[valueColumnIndex\]/u);
  assert.doesNotMatch(monthlyParser, /value: parseNonNegativeInteger/u);
});

test('actual checker rejects partial-window claims, accepts null; fetcher preserves null', async () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'gfrr-acled-month-trend-'));
  try {
    for (const relative of ['scripts/check-world-order-acled-monthly.mjs', 'scripts/world-order/acled-monthly-trend.mjs', 'scripts/world-order/fetch-acled.mjs', 'scripts/world-order/normalize-world-order-inputs.mjs', 'scripts/world-order/sanitize-acled-monthly.mjs', 'scripts/world-order/acled-monthly-filename.mjs', 'scripts/world-order/xlsx-input-guard.mjs']) {
      const target = path.join(fixture, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(root, relative), target);
    }
    const config = JSON.parse(fs.readFileSync(path.join(root, 'config/world-order-acled-global-monthly.json'), 'utf8'));
    config.asOfDate = new Date().toISOString().slice(0, 10);
    config.filesIngested.forEach((file) => { file.asOfDate = config.asOfDate; });
    config.monthlyTrend = buildMonthlyTrend(rowsFor(config.asOfDate), config.asOfDate);
    const target = path.join(fixture, 'config/world-order-acled-global-monthly.json');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const runCheck = (data) => {
      fs.writeFileSync(target, JSON.stringify(data));
      return spawnSync(process.execPath, [path.join(fixture, 'scripts/check-world-order-acled-monthly.mjs')], { encoding: 'utf8', timeout: 20_000 });
    };
    let result = runCheck(config);
    assert.equal(result.status, 0, result.stderr);
    for (const mutate of [
      (trend) => { trend.latest12mWindow[1] = config.asOfDate.slice(0, 7); },
      (trend) => { trend.prior12mWindow[0] = '2020-01'; },
      (trend) => { trend.latest12mWindow = null; },
      (trend) => { trend.latest12mVsPrior12mDelta = 0.123; }
    ]) {
      const bad = structuredClone(config); mutate(bad.monthlyTrend);
      result = runCheck(bad);
      assert.equal(result.status, 1, result.stderr);
    }
    config.monthlyTrend = null;
    result = runCheck(config);
    assert.equal(result.status, 0, result.stderr);
    const { fetchAcledSummary } = await import(pathToFileURL(path.join(fixture, 'scripts/world-order/fetch-acled.mjs')));
    const source = await fetchAcledSummary();
    assert.equal(source.summary.monthlyLatest12mVsPrior12mDelta, null);
    const evidence = source.evidence.find((entry) => entry.labelZh === 'ACLED 完整月份暴力事件趋势');
    assert.equal(evidence.value, null);
    assert.match(evidence.summary, /数据不足/u);
    assert.equal(source.summary.politicalViolenceEventsLatestFullYear, config.global.politicalViolenceEventsLatestFullYear);

    // The real sanitizer rejects mixed source dates before parsing or replacing config.
    // Test-only parser stub makes this pre-parse check work in no-install Pages too.
    const stub = path.join(fixture, 'node_modules/xlsx');
    fs.mkdirSync(stub, { recursive: true });
    fs.writeFileSync(path.join(stub, 'package.json'), JSON.stringify({ type: 'module', exports: './index.mjs' }));
    fs.writeFileSync(path.join(stub, 'index.mjs'), "export function set_fs() {}\nexport function readFile() { throw new Error('UNEXPECTED_WORKBOOK_PARSE'); }\n");
    const input = path.join(fixture, 'manual-artifacts/world-order/acled-input/monthly');
    fs.mkdirSync(input, { recursive: true });
    config.filesIngested.forEach((file, index) => {
      const filename = file.filename.replace(/as-of-[^.]+\.xlsx$/u, `as-of-${index === 0 ? '01Sep2026' : '21Aug2026'}.xlsx`);
      fs.writeFileSync(path.join(input, filename), 'not a workbook');
    });
    const before = fs.readFileSync(target, 'utf8');
    result = spawnSync(process.execPath, [path.join(fixture, 'scripts/world-order/sanitize-acled-monthly.mjs')], { encoding: 'utf8', timeout: 20_000 });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /all 6 monthly files must share one as-of date/u);
    assert.doesNotMatch(result.stderr, /UNEXPECTED_WORKBOOK_PARSE/u);
    assert.equal(fs.readFileSync(target, 'utf8'), before);
  } finally {
    // Exact disposable test directory only, never repository/user artifacts.
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
