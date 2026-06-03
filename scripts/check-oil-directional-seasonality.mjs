// check:oil-directional-seasonality — week-of-year 5yr-same-week baselines for the
// 8 weekly EIA series. Aligned by week-of-year (NOT a rolling mean); seasonBucket
// distinguishes winter heating / summer driving / shoulder. Daily reuse fields are
// intentionally excluded from seasonality.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const errors = [];
const fail = (m) => errors.push(m);
const numOrNull = (v) => v === null || Number.isFinite(v);

const data = JSON.parse(readFileSync(resolve('data/oil-directional-pressure.json'), 'utf8'));

const EIA_KEYS = [
  'crudeStocksExSpr', 'sprStocks', 'distillateStocks', 'gasolineStocks',
  'refineryUtilization', 'refinerCrudeInputs', 'demandGasolineSupplied', 'demandDistillateSupplied',
];
const BUCKET = new Set(['winter_heating', 'summer_driving', 'shoulder']);
const FALLBACK = new Set(['exact', '±1week']);

const s = data.seasonality || {};
if (!s || typeof s !== 'object') fail('seasonality is missing or not an object');
const ev = data.evidence || {};

for (const k of EIA_KEYS) {
  // A degraded (missing) EIA series has no usable series data: it must carry NO
  // seasonality (no stale carry-over), and seasonality is required for every present series.
  const status = ev[k] && ev[k].sourceStatus;
  const present = status && status !== 'missing';
  if (!present) {
    if (k in s) fail(`seasonality.${k} present but evidence sourceStatus is '${status || 'absent'}' — a missing series must not carry stale seasonality`);
    continue;
  }
  if (!(k in s)) { fail(`seasonality.${k} missing (required for non-missing weekly EIA series)`); continue; }
  const e = s[k];
  if (!e || typeof e !== 'object') { fail(`seasonality.${k} is not an object`); continue; }
  if (!Number.isInteger(e.weekOfYear) || e.weekOfYear < 1 || e.weekOfYear > 53) fail(`seasonality.${k}.weekOfYear must be an integer 1..53`);
  if (!BUCKET.has(e.seasonBucket)) fail(`seasonality.${k}.seasonBucket unsupported: ${e.seasonBucket}`);
  for (const f of ['fiveYrSameWeekMean', 'fiveYrSameWeekMin', 'fiveYrSameWeekMax']) {
    if (!numOrNull(e[f])) fail(`seasonality.${k}.${f} must be number|null`);
  }
  if (!(Number.isInteger(e.sampleYears) && e.sampleYears >= 0 && e.sampleYears <= 5)) fail(`seasonality.${k}.sampleYears must be an integer 0..5`);
  if (!FALLBACK.has(e.windowFallback)) fail(`seasonality.${k}.windowFallback unsupported: ${e.windowFallback}`);
  const { fiveYrSameWeekMin: mn, fiveYrSameWeekMean: me, fiveYrSameWeekMax: mx } = e;
  if ([mn, me, mx].every(Number.isFinite) && !(mn <= me && me <= mx)) {
    fail(`seasonality.${k}: expected min<=mean<=max, got ${mn}/${me}/${mx}`);
  }
}

// Only weekly EIA series carry seasonality (no daily reuse price fields).
for (const k of Object.keys(s)) {
  if (!EIA_KEYS.includes(k)) fail(`seasonality.${k} is unexpected (only the 8 weekly EIA series get seasonality)`);
}

if (errors.length > 0) {
  console.error('Oil Directional Pressure seasonality check FAILED:');
  errors.forEach((e) => console.error('  -', e));
  process.exit(1);
}

console.log(`Oil Directional Pressure seasonality check: PASS (${EIA_KEYS.length} weekly series; week-of-year 5yr-same-week aligned)`);
