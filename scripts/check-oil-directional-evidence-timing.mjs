// check:oil-directional-evidence-timing — P43 display guard for ODP evidence timing tiers.
//
// The ODP evidence matrix must separate slow official anchors from faster market
// proxies and noisy watch layers. This checker keeps that display contract
// explicit without changing ODP scoring/classification behavior.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const errors = [];
const fail = (message) => errors.push(message);

const html = readFileSync(resolve('index.html'), 'utf8');
const renderer = readFileSync(resolve('scripts/modules/renderOilDirectional.js'), 'utf8');
const css = readFileSync(resolve('assets/styles.css'), 'utf8');
const data = JSON.parse(readFileSync(resolve('data/oil-directional-pressure.json'), 'utf8'));

const requiredRendererMarkers = [
  'odp-evidence-timing-summary',
  'EVIDENCE_TIMING_SUMMARY_ID',
  'function renderEvidenceTimingSummary',
  'T2 OFFICIAL WEEKLY ANCHOR',
  'T1 MARKET PROXY',
  'EVENT / THERMAL WATCH',
  '不确认断供、设施事故或改变 ODP 方向结论',
];
const requiredCssMarkers = [
  '.odp-evidence-timing-summary',
  '.odp-evidence-timing-card',
  'var(--paper-line)',
  'var(--font-serif)',
  'var(--font-mono)',
  'var(--font-display)',
];

if (!html.includes('id="odp-evidence-timing-summary"')) {
  fail('index.html must include #odp-evidence-timing-summary before #odp-evidence-list');
}
if (html.indexOf('id="odp-evidence-timing-summary"') > html.indexOf('id="odp-evidence-list"')) {
  fail('#odp-evidence-timing-summary must appear before #odp-evidence-list');
}
for (const marker of requiredRendererMarkers) {
  if (!renderer.includes(marker)) fail(`renderOilDirectional.js missing P43 timing marker: ${marker}`);
}
for (const marker of requiredCssMarkers) {
  if (!css.includes(marker)) fail(`assets/styles.css missing P43 timing style marker: ${marker}`);
}

const evidence = data.evidence || {};
const rows = Object.values(evidence).filter((row) => row && typeof row === 'object');
const officialRows = rows.filter((row) => row.latencyTier === 'T2_weekly_official_anchor');
const marketRows = rows.filter((row) => row.latencyTier === 'T1_daily_market_proxy');
if (officialRows.length !== 8) fail(`live ODP evidence must expose 8 T2 official weekly anchors, got ${officialRows.length}`);
if (marketRows.length < 4) fail(`live ODP evidence must expose at least 4 T1 market proxies, got ${marketRows.length}`);
if (!officialRows.every((row) => row.directionalRole === 'core_physical_anchor')) {
  fail('all T2 official weekly anchors must remain core_physical_anchor');
}
if (!marketRows.every((row) => row.directionalRole === 'market_confirmation')) {
  fail('all T1 market proxies must remain market_confirmation');
}

const forbiddenSecondScoreMarkers = [
  'timingScore',
  'freshnessScore',
  'evidenceScore',
  'timingWeight',
  'freshnessWeight',
];
for (const marker of forbiddenSecondScoreMarkers) {
  if (renderer.includes(marker)) fail(`P43 timing summary must not introduce second-score marker: ${marker}`);
}

if (errors.length > 0) {
  console.error('Oil Directional Pressure evidence timing check FAILED:');
  errors.forEach((error) => console.error('  -', error));
  process.exit(1);
}

console.log(`Oil Directional Pressure evidence timing check: PASS (T2=${officialRows.length}, T1=${marketRows.length})`);
