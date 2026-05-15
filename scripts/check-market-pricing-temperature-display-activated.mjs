import fs from 'node:fs';

const INDEX_PATH = 'index.html';
const STYLES_PATH = 'assets/styles.css';
const RENDER_PATH = 'scripts/modules/renderMacroOverview.js';
const APP_PATH = 'scripts/app.js';
const METRICS_PATH = 'data/market-pricing-metrics.json';
const EXTERNAL_URL_PROTOCOL = ['h', 't', 't', 'p', 's'].join('');
const PROTECTED_PATHS = [
  'data/market-pricing-history.json',
  METRICS_PATH,
  'data/radar-data.json',
];
const OLD_VERSION = '28.0M-7V';
const NEW_VERSION = '28.0M-43V';
const DISCLAIMER = '本数据为统计描述，不构成投资建议。';
const errors = [];

function snapshotFiles(paths) {
  return new Map(paths.map((filePath) => [filePath, fs.existsSync(filePath) ? fs.readFileSync(filePath) : null]));
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) errors.push(`${message}: expected ${JSON.stringify(expected)}, actual ${JSON.stringify(actual)}`);
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function assertUnchanged(before) {
  for (const [filePath, beforeBytes] of before.entries()) {
    const afterBytes = fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
    const same = beforeBytes === null
      ? afterBytes === null
      : afterBytes !== null && Buffer.compare(beforeBytes, afterBytes) === 0;
    assert(same, `${filePath} must be unchanged by temperature display check`);
  }
}

const before = snapshotFiles(PROTECTED_PATHS);
const html = readText(INDEX_PATH);
const styles = readText(STYLES_PATH);
const renderSource = readText(RENDER_PATH);
const appSource = readText(APP_PATH);
const metrics = JSON.parse(readText(METRICS_PATH));
const metricsRecords = Array.isArray(metrics.records) ? metrics.records : [];
const latestMetric = metricsRecords[metricsRecords.length - 1] || {};

assert(html.includes('id="homepage-market-temperature"'), '#homepage-market-temperature section must still exist');
assert(html.includes('id="market-temperature-card-root"'), 'market temperature card root must exist in index fallback');
assert(!html.includes(`?v=${OLD_VERSION}`), 'index.html must not retain old frontend asset version');
assert((html.match(new RegExp(`\\?v=${NEW_VERSION}`, 'gu')) || []).length >= 2, 'index.html must include new version for local stylesheet and script assets');
assert(html.includes('等待历史周线数据接入'), 'waiting-state fallback copy must remain available');

for (const className of [
  '.market-temperature-bucket-extreme-hot',
  '.market-temperature-bucket-hot',
  '.market-temperature-bucket-neutral',
  '.market-temperature-bucket-cold',
  '.market-temperature-bucket-extreme-cold',
]) {
  assert(styles.includes(className), `${className} must exist`);
}
assert(styles.includes('.market-temperature-disclaimer'), '.market-temperature-disclaimer must exist');
assert(!/@font-face/u.test(styles), 'temperature display must not add @font-face');
assert(!new RegExp(`url\\(\\s*${EXTERNAL_URL_PROTOCOL}:\\/\\/`, 'iu').test(styles), 'temperature display must not add external stylesheet URLs');

assert(renderSource.includes('classifyZScoreBucket'), 'classifyZScoreBucket function must exist');
for (const bucket of ['extreme-hot', 'hot', 'neutral', 'cold', 'extreme-cold']) {
  assert(renderSource.includes(bucket), `bucket return value ${bucket} must exist in render source`);
}
assert(renderSource.includes(DISCLAIMER), 'disclaimer string must be rendered by the market temperature card');

const { classifyZScoreBucket } = await import('./modules/renderMacroOverview.js');
const bucketCases = [
  [2.5, 'extreme-hot'],
  [2.0, 'extreme-hot'],
  [1.5, 'hot'],
  [1.0, 'hot'],
  [0, 'neutral'],
  [-1.0, 'cold'],
  [-1.5, 'cold'],
  [-2.0, 'extreme-cold'],
  [-2.5, 'extreme-cold'],
  [latestMetric.zScore, 'extreme-hot'],
];
for (const [value, expected] of bucketCases) {
  assertEqual(classifyZScoreBucket(value), expected, `classifyZScoreBucket(${value})`);
}

assertEqual(metrics.metricsRecordsCount, 464, 'metricsRecordsCount must match M-26 output');
assertEqual(metrics.latestMetricDate, '2026-05-11', 'latestMetricDate must match M-26 output');
assertEqual(latestMetric.zScore, 2.2456, 'latest QQQ zScore must match M-26 output');

assert(appSource.includes('data/market-pricing-metrics.json'), 'app.js must reference market pricing metrics data file');
assert(appSource.includes('catch((error)') && appSource.includes('console.warn') && appSource.includes('return null'), 'app.js must keep metrics graceful degradation path');
assert(appSource.includes('renderMacroRiskOverview(data, healthDashboard, worldOrderStressData, marketPricingMetricsData)'), 'app.js must pass metrics data to macro overview render');

assertUnchanged(before);

if (errors.length) {
  console.error('Market pricing temperature display activated: FAIL');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Market pricing temperature display activated: PASS');
