import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const parseJson = (path) => JSON.parse(read(path));

const files = {
  monitor: read('scripts/monitor-transport-shock-confirmation-factor-score-impact-history.mjs'),
  packageJson: read('package.json'),
  checkSuite: read('scripts/check-suite.mjs'),
  agents: read('docs/AGENT_DOMAIN_BOUNDARIES.md'),
  dataSources: read('docs/DATA_SOURCES.md'),
  dataContract: read('docs/DATA_CONTRACT.md'),
  signalIntake: read('docs/SIGNAL_INTAKE.md'),
  energyHistory: read('docs/ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md'),
  radarData: read('data/radar-data.json'),
  decision: read('scripts/modules/decision.js'),
  crossValidation: read('scripts/modules/buildCrossValidationMatrix.js'),
  oilDirectional: read('data/oil-directional-pressure.json')
};

const radar = parseJson('data/radar-data.json');
const failures = [];

function requireIncludes(fileKey, marker) {
  if (!files[fileKey].includes(marker)) failures.push(`${fileKey} missing marker: ${marker}`);
}

function forbidIncludes(fileKey, marker) {
  if (files[fileKey].includes(marker)) failures.push(`${fileKey} must not include marker: ${marker}`);
}

for (const marker of [
  "const MONITOR_VERSION = 'transport-shock-score-impact-history-monitor-p54'",
  'score-impact-history-latest.json',
  'gitJsonAtCommit',
  'function validateImpact',
  'function summarizeImpact',
  'function buildTrend',
  'function createMonitorResult',
  'calculatesNewScore: false',
  'connectsRouteFreightConfirmation: false',
  'connectsMarketConfirmation: false',
  'affectsBubbleWatch: false',
  'routeFreightConfirmationConnected":true',
  'marketConfirmationConnected":true',
  'artifact-only Transport Shock score-impact history monitor'
]) {
  requireIncludes('monitor', marker);
}

for (const marker of [
  'fetch(',
  'data/radar-data.json", "w',
  'writeFileSync(RADAR_DATA_PATH'
]) {
  forbidIncludes('monitor', marker);
}

for (const [fileKey, marker] of [
  ['packageJson', 'monitor:transport-shock-confirmation-factor-score-impact-history'],
  ['packageJson', 'check:transport-shock-confirmation-factor-score-impact-history-monitor'],
  ['checkSuite', 'check:transport-shock-confirmation-factor-score-impact-history-monitor'],
  ['agents', 'Transport Shock Confirmation Factor score-impact history monitor 是 P-score-54'],
  ['dataSources', 'P-score-54 起,新增 Transport Shock score-impact history monitor'],
  ['dataContract', 'transport-shock-confirmation-factor-score-impact-history-monitor-v1'],
  ['signalIntake', 'Transport Shock Confirmation Factor score-impact history monitor'],
  ['energyHistory', 'Transport Shock Confirmation Factor score-impact history monitor']
]) {
  requireIncludes(fileKey, marker);
}

for (const fileKey of ['decision', 'crossValidation', 'oilDirectional']) {
  forbidIncludes(fileKey, 'transport-shock-score-impact-history-monitor-p54');
  forbidIncludes(fileKey, 'score-impact-history-latest');
}

const impact = radar.transportShockScoringImpact;
if (impact?.contractVersion !== 'transport-shock-scoring-impact-v1') {
  failures.push('production radar-data missing transport-shock-scoring-impact-v1');
}
if (impact?.maxContributionPct !== 3) failures.push('transportShockScoringImpact.maxContributionPct must be 3');
if (impact?.guards?.routeFreightConfirmationConnected !== false) {
  failures.push('transportShockScoringImpact routeFreightConfirmationConnected must stay false');
}
if (impact?.guards?.marketConfirmationConnected !== false) {
  failures.push('transportShockScoringImpact marketConfirmationConnected must stay false');
}
if (impact?.applied === true && !(impact.contributionPct > 0)) {
  failures.push('applied transportShockScoringImpact requires positive contribution');
}
if (impact?.applied === false && impact.contributionPct !== 0) {
  failures.push('non-applied transportShockScoringImpact must have zero contribution');
}

if (failures.length) {
  console.error('Transport Shock score-impact history monitor contract: FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Transport Shock score-impact history monitor contract: PASS');
