import fs from 'node:fs';

const renderPath = 'scripts/modules/renderMacroOverview.js';
const render = fs.readFileSync(renderPath, 'utf8');

const requiredMarkers = [
  'function observationReaction(',
  'function setObservationReaction(',
  'function reactionText(',
  'function signalFromEquityChange(',
  'function signalFromFreightRegime(',
  'function signalFromChinaProperty(',
  "'c1-freight-status'",
  "setObservationReaction('c2-cuau-status'",
  'setObservationReaction(`${prefix}-status`, `${prefix}-badge`, radarData, signal)',
  "renderCfetsRmbLeaf('c2-cfets', radarData.macroDrivers?.cfetsRmb, radarData)",
  "renderCfetsRmbLeaf('c6-cfets', radarData.macroDrivers?.cfetsRmb, radarData)",
  "'c5-v2x-status'",
  "'c6-china-10y-status'",
  "'c6-china-infl-status'",
  "'c6-china-pmi-status'",
  "'c6-tsf-status'",
  "'c6-mlf-status'",
  "'c6-omo-status'",
  "'c6-house-status'",
  'signalFromEquityChange(changePct)'
];

const forbiddenMarkers = [
  "setBadge('c1-freight-badge', 'neutral'",
  "setBadge('c2-cuau-badge', 'neutral'",
  "setBadge('c5-v2x-badge', 'neutral'",
  "setBadge('c6-china-10y-badge', 'neutral'",
  "setBadge('c6-china-infl-badge', 'neutral'",
  "setBadge('c6-china-pmi-badge', 'neutral'",
  "setBadge('c6-tsf-badge', 'neutral'",
  "setBadge('c6-mlf-badge', 'neutral'",
  "setBadge('c6-omo-badge', 'neutral'",
  "setBadge('c6-house-badge', 'neutral'"
];

const missing = requiredMarkers.filter((marker) => !render.includes(marker));
const forbidden = forbiddenMarkers.filter((marker) => render.includes(marker));

if (missing.length || forbidden.length) {
  if (missing.length) {
    console.error('Observation reaction layer missing markers:');
    for (const marker of missing) console.error(`- ${marker}`);
  }
  if (forbidden.length) {
    console.error('Observation reaction layer still has direct neutral OBS badge paths:');
    for (const marker of forbidden) console.error(`- ${marker}`);
  }
  process.exit(1);
}

console.log('Observation reaction layer: PASS');
