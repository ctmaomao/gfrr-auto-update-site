// check:oil-directional-freshness — per-metric freshness contract.
// Every evidence entry must carry its own frequency/ageDays/maxAgeDays/sourceStatus,
// and sourceStatus must be consistent with (value present, ageDays, maxAgeDays):
//   absent value -> 'missing'; present + ageDays>max (or undatable) -> 'stale'; else 'live'.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const errors = [];
const fail = (m) => errors.push(m);

const data = JSON.parse(readFileSync(resolve('data/oil-directional-pressure.json'), 'utf8'));
const STATUS = new Set(['live', 'fallback', 'stale', 'missing']);
const FREQ = new Set(['daily', 'weekly', 'monthly']);
const ev = data.evidence || {};

if (!ev || typeof ev !== 'object' || !Object.keys(ev).length) fail('evidence missing or empty');

for (const [k, e] of Object.entries(ev)) {
  if (!e || typeof e !== 'object') { fail(`evidence.${k} is not an object`); continue; }

  if (!FREQ.has(e.frequency)) fail(`evidence.${k}.frequency unsupported: ${e.frequency}`);
  if (!STATUS.has(e.sourceStatus)) fail(`evidence.${k}.sourceStatus unsupported: ${e.sourceStatus}`);
  if (!(Number.isFinite(e.maxAgeDays) && e.maxAgeDays > 0)) fail(`evidence.${k}.maxAgeDays must be a positive number`);
  if (!(e.ageDays === null || Number.isFinite(e.ageDays))) fail(`evidence.${k}.ageDays must be number|null`);

  // Presence driver: scalar entries use .value; the qualitative curve uses .frontMinusBack.
  const present = ('value' in e) ? (e.value != null) : (e.frontMinusBack != null);

  if (!present) {
    if (e.sourceStatus !== 'missing') fail(`evidence.${k}: absent value must be sourceStatus 'missing', got '${e.sourceStatus}'`);
  } else {
    if (e.sourceStatus === 'missing') fail(`evidence.${k}: present value must not be 'missing'`);
    if (!(typeof e.asOfDate === 'string' && e.asOfDate && !Number.isNaN(Date.parse(e.asOfDate)))) {
      fail(`evidence.${k}: present entry must have a parseable asOfDate, got '${e.asOfDate}'`);
    }
    if (e.ageDays == null) {
      // present but undatable -> must degrade to 'stale' (locks freshnessStatus contract)
      if (e.sourceStatus !== 'stale' && e.sourceStatus !== 'fallback') {
        fail(`evidence.${k}: present but undatable (ageDays null) must be 'stale', got '${e.sourceStatus}'`);
      }
    } else {
      const expected = e.ageDays > e.maxAgeDays ? 'stale' : 'live';
      if (e.sourceStatus !== expected && e.sourceStatus !== 'fallback') {
        fail(`evidence.${k}: ageDays ${e.ageDays} vs maxAgeDays ${e.maxAgeDays} implies '${expected}', got '${e.sourceStatus}'`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error('Oil Directional Pressure freshness check FAILED:');
  errors.forEach((e) => console.error('  -', e));
  process.exit(1);
}

console.log(`Oil Directional Pressure freshness check: PASS (${Object.keys(ev).length} evidence entries; per-metric asOfDate/ageDays/maxAgeDays/sourceStatus)`);
