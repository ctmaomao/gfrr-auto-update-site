import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { createYahooHistoryRefreshCli } from '../../scripts/market-pricing/yahoo-history-refresh-cli.mjs';
import { buildCoverage, canonicalizeWeeklyRecords } from '../../scripts/market-pricing/yahoo-weekly-records.mjs';

const options = { today: '2026-01-15', range: '10y', interval: '1wk' };
const assets = [
  { assetKey: 'qqq', yahooSymbol: 'QQQ', yahooEncodedSymbol: 'QQQ', expectedInstrumentType: 'ETF', plausibleClose: { min: 50, max: 2000 } },
  ...['NDX', 'IXIC'].map(symbol => ({ assetKey: symbol.toLowerCase(), yahooSymbol: `^${symbol}`, yahooEncodedSymbol: `%5E${symbol}`, expectedInstrumentType: 'INDEX', plausibleClose: { min: 1000, max: 50000 } }))
];
const timestamp = date => Date.parse(`${date}T00:00:00Z`) / 1000;
function chart(config, dates, closes) {
  return { chart: { result: [{ meta: { symbol: config.yahooSymbol, instrumentType: config.expectedInstrumentType }, timestamp: dates.map(timestamp), indicators: { quote: [{ close: closes }] } }] } };
}
for (const config of assets) {
  test(`${config.assetKey}: canonical dates, rounding, deduplication and filtering`, () => {
    const price = config.plausibleClose.min + 1;
    const input = chart(config,
      ['2026-01-06', '2025-12-29', '2026-01-02', '2026-01-02', '2026-01-12', '2026-01-16', '2026-01-13', '2026-01-14', '2026-01-15'],
      [price, price, price + .123456, price + 2, null, price, config.plausibleClose.max + 1, 'not-a-price', Infinity]);
    assert.deepEqual(canonicalizeWeeklyRecords(config, input, options), [
      { date: '2026-01-02', isoWeek: '2026-W01', close: price + .1235, sourceFile: `yahoo-chart-${config.yahooEncodedSymbol}-10y-1wk.json`, sourceVendor: 'yahoo_chart' },
      { date: '2026-01-06', isoWeek: '2026-W02', close: price, sourceFile: `yahoo-chart-${config.yahooEncodedSymbol}-10y-1wk.json`, sourceVendor: 'yahoo_chart' }
    ]);
  });
  test(`${config.assetKey}: inclusive bounds and current day; missing and invalid timestamps`, () => {
    const input = chart(config, ['2026-01-05', '2026-01-15'], [config.plausibleClose.min, String(config.plausibleClose.max)]);
    input.chart.result[0].timestamp.push('2026-01-01', NaN, Infinity);
    input.chart.result[0].indicators.quote[0].close.push(1000, 1000, 1000);
    const records = canonicalizeWeeklyRecords(config, input, options);
    assert.deepEqual(records.map(r => r.close), [config.plausibleClose.min, config.plausibleClose.max]);
    delete input.chart.result[0].indicators;
    assert.deepEqual(canonicalizeWeeklyRecords(config, input, options), []);
  });
  test(`${config.assetKey}: strict symbol and instrument guards`, () => {
    assert.throws(() => canonicalizeWeeklyRecords(config, { chart: { error: { code: 'bad' } } }, options), { message: 'yahoo_chart_error: bad' });
    assert.throws(() => canonicalizeWeeklyRecords(config, {}, options), { message: `symbol_mismatch: expected ${config.yahooSymbol}, got missing` });
    const input = chart(config, [], []);
    input.chart.result[0].meta.instrumentType = 'OTHER';
    assert.throws(() => canonicalizeWeeklyRecords(config, input, options), { message: `instrument_type_invalid: expected ${config.expectedInstrumentType}, got OTHER` });
  });
}
test('coverage retains empty, 59-week and 60-week contracts', () => {
  assert.deepEqual(buildCoverage([]), { weeklyRows: 0, hasAtLeast60Weeks: false, oldestDate: null, latestDate: null });
  const records = Array.from({ length: 60 }, (_, index) => ({ date: String(index) }));
  assert.equal(buildCoverage(records.slice(0, 59)).hasAtLeast60Weeks, false);
  assert.deepEqual(buildCoverage(records), { weeklyRows: 60, hasAtLeast60Weeks: true, oldestDate: '0', latestDate: '59' });
});

test('shared refresh CLI keeps path defaults, argument order and error labels', () => {
  const root = path.resolve('fixture-repo');
  const historyFile = 'data/market-pricing-history.json';
  const artifactRoot = 'manual-artifacts/market-pricing';
  for (const [label, directory] of [['QQQ', 'qqq-yahoo'], ['NDX/IXIC', 'ndx-ixic-yahoo']]) {
    const artifactPath = `${artifactRoot}/${directory}/${directory}-latest.json`;
    const cli = createYahooHistoryRefreshCli({ root, artifactDefault: artifactPath, label });
    const defaults = { historyFile, artifactPath, dryRun: true, commitHistory: false, quiet: false };
    assert.deepEqual(cli.parseCliArgs([]), defaults);
    assert.deepEqual(cli.parseCliArgs(['--commit-history', '--dry-run', '--quiet']), { ...defaults, quiet: true });
    assert.deepEqual(cli.parseCliArgs(['--dry-run', '--commit-history', '--history-file', '-value',
      '--history-file=', '--artifact-path=old', '--artifact-path', 'path=with=equals']),
    { ...defaults, historyFile: '', artifactPath: 'path=with=equals', dryRun: false, commitHistory: true });
    const invalid = (action, message) => assert.throws(action, { message, exitCode: 2 });
    for (const flag of ['--history-file', '--artifact-path']) {
      for (const args of [[flag], [flag, '--quiet']]) invalid(() => cli.parseCliArgs(args), `Missing value for ${flag}`);
    }
    invalid(() => cli.parseCliArgs(['--quiet=true']), `Unknown ${label} refresh argument: --quiet=true`);
    assert.equal(cli.resolveHistoryFile(''), path.resolve(root, historyFile));
    assert.equal(cli.resolveHistoryFile(`./${historyFile}`), path.resolve(root, historyFile));
    invalid(() => cli.resolveHistoryFile('data/alternate.json'), `History file target must be ${historyFile}`);
    assert.equal(cli.toProjectRelative(cli.resolveArtifactPath('')), artifactPath);
    assert.equal(cli.toProjectRelative(cli.resolveArtifactPath(artifactRoot)), artifactRoot);
    assert.equal(cli.toProjectRelative(cli.resolveArtifactPath(`${artifactRoot}/nested/file.json`)), `${artifactRoot}/nested/file.json`);
    for (const outside of [`${artifactRoot}-other/file.json`, `${artifactRoot}/../escape.json`]) {
      invalid(() => cli.resolveArtifactPath(outside), `${label} Yahoo artifact path must stay under ${artifactRoot}/.`);
    }
  }
});
