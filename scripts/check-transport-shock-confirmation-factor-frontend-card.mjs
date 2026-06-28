import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

const files = {
  html: read('index.html'),
  render: read('scripts/modules/renderMacroOverview.js'),
  packageJson: read('package.json'),
  checkSuite: read('scripts/check-suite.mjs'),
  design: read('DESIGN.md'),
  dataSources: read('docs/DATA_SOURCES.md'),
  dataContract: read('docs/DATA_CONTRACT.md'),
  signalIntake: read('docs/SIGNAL_INTAKE.md'),
  projectBacklog: read('docs/PROJECT_BACKLOG.md'),
  agents: read('AGENTS.md'),
  dailyPipeline: read('scripts/run-daily-pipeline.mjs'),
  crossValidation: read('scripts/modules/buildCrossValidationMatrix.js'),
  radarData: read('data/radar-data.json'),
  oilDirectional: read('data/oil-directional-pressure.json')
};

const failures = [];

function requireIncludes(fileKey, marker) {
  if (!files[fileKey].includes(marker)) failures.push(`${fileKey} missing marker: ${marker}`);
}

function forbidIncludes(fileKey, marker) {
  if (files[fileKey].includes(marker)) failures.push(`${fileKey} must not include marker: ${marker}`);
}

for (const marker of [
  'card-c1-transport-shock',
  'c1-transport-shock-status',
  'c1-transport-shock-badge',
  'c1-transport-shock-number',
  'c1-transport-shock-aux',
  'c1-transport-shock-route',
  'c1-transport-shock-market',
  'c1-transport-shock-hormuz',
  'c1-transport-shock-note',
  '运输冲击确认因子'
]) {
  requireIncludes('html', marker);
}

for (const marker of [
  'function signalFromTransportShockCandidate',
  'function renderTransportShockConfirmation',
  'renderTransportShockConfirmation({ radarData });',
  'radarData?.macroDrivers?.energyTransport',
  'transportShockCandidate',
  'setObservationReaction('
]) {
  requireIncludes('render', marker);
}

for (const marker of [
  'manual-artifacts',
  'transport-shock-confirmation-factor-display-projection-v1',
  'shadow-score-latest',
  'display-projection-latest'
]) {
  forbidIncludes('render', marker);
}

for (const fileKey of ['dailyPipeline', 'crossValidation', 'radarData', 'oilDirectional']) {
  forbidIncludes(fileKey, 'card-c1-transport-shock');
  forbidIncludes(fileKey, 'c1-transport-shock');
  forbidIncludes(fileKey, 'transport-shock-confirmation-factor-frontend-card-v1');
}

for (const [fileKey, marker] of [
  ['packageJson', 'check:transport-shock-confirmation-factor-frontend-card'],
  ['checkSuite', 'check:transport-shock-confirmation-factor-frontend-card'],
  ['design', 'C1 通胀与能源包含新增 `Transport Shock / 运输冲击确认因子` 展示观察卡'],
  ['dataSources', 'Transport Shock Confirmation Factor frontend card(P-score-7)'],
  ['dataContract', 'transport-shock-confirmation-factor-frontend-card-v1'],
  ['signalIntake', 'Transport Shock Confirmation Factor frontend card'],
  ['projectBacklog', 'Transport Shock Confirmation Factor frontend card(2026-06-28,P-score-7 frontend display-only)'],
  ['agents', 'Transport Shock Confirmation Factor frontend card 只是 P-score-7 前端展示层']
]) {
  requireIncludes(fileKey, marker);
}

if (failures.length) {
  console.error('Transport Shock Confirmation Factor frontend card contract FAIL:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Transport Shock Confirmation Factor frontend card contract: PASS (display-only, production payload only)');
