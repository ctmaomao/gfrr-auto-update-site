// check:oil-directional-degradation — the "数据不足 -> 暂不判断" guard.
// Missing data must not be fabricated, missing EIA entries must null their derived
// metrics, and NO directional conclusion may be emitted without the PR3 model.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const errors = [];
const fail = (m) => errors.push(m);

const data = JSON.parse(readFileSync(resolve('data/oil-directional-pressure.json'), 'utf8'));
const ev = data.evidence || {};

for (const [k, e] of Object.entries(ev)) {
  if (!e || typeof e !== 'object') continue;
  if (e.sourceStatus !== 'missing') continue;

  const present = ('value' in e) ? (e.value != null) : (e.frontMinusBack != null);
  if (present) fail(`evidence.${k}: sourceStatus 'missing' but a value is present (fabrication risk)`);

  // A missing EIA series must also null out its derived metrics (no stale carry-over).
  if (typeof e.source === 'string' && e.source.startsWith('EIA:')) {
    for (const f of ['change1w', 'change4w', 'change13w', 'vs5yAvgPct', 'fiveYrRangePosition']) {
      if (f in e && e[f] !== null) fail(`evidence.${k}: missing entry must null derived '${f}', got ${e[f]}`);
    }
  }
}

// PR3 — the "数据不足 -> 暂不判断" guard now applies to the model output:
// insufficient_data must carry NO directional signals; a real verdict needs evidence.
if (data.finalBias === 'insufficient_data') {
  if (data.signals !== null) fail("finalBias 'insufficient_data' but signals is populated (must be null — 暂不判断)");
  const it = data.interpretation;
  if (it && it.dataSufficiency && it.dataSufficiency !== 'insufficient') {
    fail(`finalBias 'insufficient_data' but interpretation.dataSufficiency='${it.dataSufficiency}' (must be 'insufficient')`);
  }
} else if (data.finalBias !== null) {
  if (data.signals === null) fail(`finalBias '${data.finalBias}' but signals is null (a directional verdict needs evidence)`);
}

if (errors.length > 0) {
  console.error('Oil Directional Pressure degradation check FAILED:');
  errors.forEach((e) => console.error('  -', e));
  process.exit(1);
}

console.log('Oil Directional Pressure degradation check: PASS (missing data not fabricated; no premature conclusion)');
