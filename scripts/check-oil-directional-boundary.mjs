// check:oil-directional-boundary — audit-only / display-only guard (CLAUDE.md rule 3
// analog, mirroring the brentPricingLayer / world-order boundary checks).
// ODP must NOT leak into radar-data.json scoring/decision paths, must self-declare
// its boundary, must not carry scoring output, and must keep Global Risk Heatmap separate.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const errors = [];
const fail = (m) => errors.push(m);

const odp = JSON.parse(readFileSync(resolve('data/oil-directional-pressure.json'), 'utf8'));
const radar = JSON.parse(readFileSync(resolve('data/radar-data.json'), 'utf8'));

// 1) ODP self-declares the audit-only / display-only boundary.
if (typeof odp.boundary !== 'string' || !/audit-only/.test(odp.boundary) || !/NOT in/.test(odp.boundary)) {
  fail('oil-directional-pressure.json boundary must declare audit-only/display-only and "NOT in" the scoring paths');
}

// 2) ODP must NOT have leaked into radar-data.json (it stays a separate file).
if ('oilDirectionalPressure' in radar) {
  fail('radar-data.json must NOT contain an oilDirectionalPressure key (ODP stays a separate data file)');
}
const guardedHosts = ['values', 'scoring', 'decisionModel', 'executionLock', 'positionGuidance', 'displayInputsBaseline', 'effectiveDisplayInputs'];
const ODP_KEY_RE = /oil[_-]?directional|^odp$|odpscore/i;
// Identifier-bearing fields where an ODP leak would surface as a VALUE (e.g. a
// decisionModel driver object { key: 'odp', source: 'oil-directional-pressure' }).
const ID_FIELDS = new Set(['key', 'id', 'source', 'module', 'signalGroup', 'name', 'driver', 'label', 'metric', 'code']);
function scanForOdp(obj, host, path, depth) {
  if (!obj || typeof obj !== 'object' || depth > 8) return;
  for (const key of Object.keys(obj)) {
    if (ODP_KEY_RE.test(key)) fail(`radar-data.json ${host}.${path}${key} (key) appears ODP-derived — ODP must not enter ${host}`);
    const v = obj[key];
    if (typeof v === 'string' && ID_FIELDS.has(key) && ODP_KEY_RE.test(v)) {
      fail(`radar-data.json ${host}.${path}${key}="${v}" (identifier value) appears ODP-derived — ODP must not enter ${host}`);
    }
    scanForOdp(v, host, `${path}${key}.`, depth + 1);
  }
}
for (const h of guardedHosts) {
  if (radar[h] && typeof radar[h] === 'object') scanForOdp(radar[h], h, '', 0);
}

// 3) PR3 — signals/finalBias/interpretation are a DISPLAY-ONLY verdict; that does not
// make ODP a scoring module. The boundary it must keep: no scoring/decision/execution
// DIRECTIVE keys on the ODP file, and the interpretation must keep reaffirming audit-only.
const FORBIDDEN_OUTPUT_KEYS = ['scoring', 'score', 'decisionModel', 'executionLock', 'positionGuidance', 'actionQueue', 'triggerMonitor'];
for (const k of FORBIDDEN_OUTPUT_KEYS) {
  if (k in odp) fail(`oil-directional-pressure.json must not carry a '${k}' directive key (display-only, not a scoring/decision module)`);
}
if (odp.interpretation && typeof odp.interpretation === 'object') {
  if (typeof odp.interpretation.note !== 'string' || !/audit-only|display-only/i.test(odp.interpretation.note)) {
    fail('interpretation.note must reaffirm audit-only/display-only (display-only verdict)');
  }
}

// 4) Global Risk Heatmap independence: ODP evidence must not merge heatmap state.
for (const k of Object.keys(odp.evidence || {})) {
  if (/heatmap/i.test(k)) fail(`evidence.${k}: ODP must not merge Global Risk Heatmap state`);
}

if (errors.length > 0) {
  console.error('Oil Directional Pressure boundary check FAILED:');
  errors.forEach((e) => console.error('  -', e));
  process.exit(1);
}

console.log('Oil Directional Pressure boundary check: PASS (audit-only; absent from radar-data scoring paths; Heatmap independent)');
