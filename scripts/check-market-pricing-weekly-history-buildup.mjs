import fs from 'node:fs';

const HISTORY_PATH = 'data/market-pricing-history.json';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_WEEK_PATTERN = /^\d{4}-W\d{2}$/;
const errors = [];

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function assertEqual(actual, expected, message) {
  assert(
    Object.is(actual, expected),
    `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );
}

function readHistory() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8'));
  } catch (error) {
    errors.push(`Unable to read history file: ${error.message}`);
    return null;
  }
}

function validateRecord(record, index) {
  if (!isRecord(record)) {
    errors.push(`assets.qqq.records[${index}] must be an object`);
    return;
  }

  assert(DATE_PATTERN.test(record.date), `assets.qqq.records[${index}].date must be YYYY-MM-DD`);
  assert(ISO_WEEK_PATTERN.test(record.isoWeek), `assets.qqq.records[${index}].isoWeek must be YYYY-Wnn`);
  assert(typeof record.close === 'number' && Number.isFinite(record.close) && record.close > 0, `assets.qqq.records[${index}].close must be finite positive number`);
}

function validateAscending(records) {
  for (let index = 1; index < records.length; index += 1) {
    if (records[index].date <= records[index - 1].date) {
      errors.push(`assets.qqq.records must be strictly ascending by date: index ${index}`);
    }
  }
}

function main() {
  const data = readHistory();
  if (!data) {
    process.exit(1);
  }

  const qqq = data.assets?.qqq;
  const records = Array.isArray(qqq?.records) ? qqq.records : [];
  const coverage = qqq?.coverage;

  assertEqual(data.status, 'has_history', 'status');
  assertEqual(qqq?.status, 'active', 'assets.qqq.status');
  assert(records.length >= 60, `assets.qqq.records.length must be at least 60, got ${records.length}`);
  assertEqual(coverage?.hasAtLeast60Weeks, true, 'assets.qqq.coverage.hasAtLeast60Weeks');
  assertEqual(coverage?.weeklyRows, records.length, 'assets.qqq.coverage.weeklyRows');

  if (records.length > 0) {
    assertEqual(records[0]?.date, coverage?.oldestDate, 'assets.qqq.coverage.oldestDate');
    assertEqual(records.at(-1)?.date, coverage?.latestDate, 'assets.qqq.coverage.latestDate');
  }

  records.forEach(validateRecord);
  validateAscending(records);

  if (errors.length > 0) {
    console.error('Market pricing weekly history buildup: FAIL');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log('Market pricing weekly history buildup: PASS');
  console.log(`qqqRecords=${records.length}`);
  console.log(`oldestDate=${coverage.oldestDate}`);
  console.log(`latestDate=${coverage.latestDate}`);
  console.log(`hasAtLeast60Weeks=${coverage.hasAtLeast60Weeks}`);
}

main();
