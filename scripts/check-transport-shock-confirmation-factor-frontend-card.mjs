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
  energyHistory: read('docs/ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md'),
  agents: read('docs/AGENT_DOMAIN_BOUNDARIES.md'),
  dailyPipeline: read('scripts/run-daily-pipeline.mjs'),
  crossValidation: read('scripts/modules/buildCrossValidationMatrix.js'),
  radarData: read('data/radar-data.json'),
  oilDirectional: read('data/oil-directional-pressure.json'),
  appliedFixture: read('docs/fixtures/transport-shock-confirmation-factor/score-attribution-applied-v1.json')
};

const appliedFixture = JSON.parse(files.appliedFixture);

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
  'c1-transport-shock-score-gate',
  'c1-transport-shock-score-impact',
  'c1-transport-shock-blockers',
  'c1-transport-shock-hormuz',
  'c1-transport-shock-sample-quality',
  'c1-transport-shock-freshness',
  'c1-transport-shock-note',
  'transport-shock-score-attribution',
  'transport-shock-score-attribution-impact',
  'transport-shock-score-attribution-reason',
  'transport-shock-score-attribution-boundary',
  'transport-shock-score-attribution-note',
  'Transport Shock 主分归因',
  '运输冲击确认因子'
]) {
  requireIncludes('html', marker);
}

for (const marker of [
  'function signalFromTransportShockCandidate',
  'function transportShockImpactReasonLabel',
  'function transportShockImpactDisplay',
  'function renderTransportShockScoreAttribution',
  'function renderTransportShockConfirmation',
  'renderTransportShockScoreAttribution({ radarData });',
  'renderTransportShockConfirmation({ radarData });',
  'radarData?.macroDrivers?.energyTransport',
  'radarData?.transportShockScoringImpact',
  'transport-shock-scoring-impact-v1',
  'transportShockCandidate',
  'scoreBeforeTransport',
  'scoreAfterTransport',
  'owner_approved_free_proxy_transport_pressure_low_weight_applied',
  'latestAgeDays',
  '低权重闸门未触发',
  '已触发低权重入分',
  '授权免费代理触发',
  'production payload 已写入的 capped score impact',
  '不从前端自行计算分数',
  '主分0贡献',
  '路线级油轮运费未确认',
  '市场确认未接入',
  '低权重入分已触发 · 非路线确认',
  '低置信观察 · 待路线/市场确认',
  '低权重主分影响',
  'PortWatch 底层日期超过7天',
  'setObservationReaction('
]) {
  requireIncludes('render', marker);
}

for (const marker of [
  '待独立评分审阅 · 仍不入分',
  '未达入分闸门 · 路线/市场缺口',
  '主判断入分未批准'
]) {
  forbidIncludes('render', marker);
}

for (const marker of [
  'manual-artifacts',
  'history-samples-review-latest',
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
  ['design', 'Transport Shock 卡片可显示 `入分闸门` 行'],
  ['design', 'Transport Shock 卡片可显示 `主分影响` 行'],
  ['dataSources', 'Transport Shock Confirmation Factor frontend card(P-score-7)'],
  ['dataSources', 'Transport Shock Confirmation Factor frontend caveat refinement(P-score-12)'],
  ['dataContract', 'transport-shock-confirmation-factor-frontend-card-v1'],
  ['dataContract', 'transport-shock-confirmation-factor-frontend-caveat-v1'],
  ['dataContract', 'transport-shock-confirmation-factor-frontend-score-impact-v1'],
  ['dataContract', 'transport-shock-confirmation-factor-frontend-score-attribution-v1'],
  ['signalIntake', 'P-score-12 前端 caveat 只从 production payload 派生'],
  ['signalIntake', 'Transport Shock Confirmation Factor frontend card'],
  ['signalIntake', 'Transport Shock Confirmation Factor frontend score-impact row'],
  ['signalIntake', 'Transport Shock Confirmation Factor frontend score attribution'],
  ['energyHistory', 'Transport Shock Confirmation Factor frontend card(2026-06-28,P-score-7 frontend display-only)'],
  ['energyHistory', 'Transport Shock Confirmation Factor frontend caveat(2026-06-30,P-score-12 display-only)'],
  ['energyHistory', 'Transport Shock Confirmation Factor frontend scoring-gate row'],
  ['energyHistory', 'Transport Shock Confirmation Factor frontend blocker row'],
  ['energyHistory', 'Transport Shock Confirmation Factor frontend score-impact row'],
  ['energyHistory', 'Transport Shock Confirmation Factor frontend score attribution'],
  ['agents', 'Transport Shock Confirmation Factor frontend card 只是 P-score-7 前端展示层'],
  ['agents', 'Transport Shock Confirmation Factor frontend caveat 只是 P-score-12 display-only refinement'],
  ['agents', 'Transport Shock Confirmation Factor frontend scoring-gate row 只是 P-score-18 display-only refinement'],
  ['agents', 'Transport Shock Confirmation Factor frontend blocker row 只是 P-score-40 display-only refinement'],
  ['agents', 'Transport Shock Confirmation Factor frontend score-impact row 是 P-score-52'],
  ['agents', 'Transport Shock Confirmation Factor frontend score attribution 是 P-score-53']
]) {
  requireIncludes(fileKey, marker);
}

const impact = appliedFixture.transportShockScoringImpact;
if (appliedFixture.schemaVersion !== 'transport-shock-confirmation-factor-score-attribution-applied-fixture-v1') {
  failures.push('applied fixture schemaVersion mismatch');
}
if (appliedFixture.fixtureOnly !== true || appliedFixture.productionWriteApproved !== false) {
  failures.push('applied fixture must stay fixture-only and not production-approved');
}
if (impact?.contractVersion !== 'transport-shock-scoring-impact-v1') {
  failures.push('applied fixture missing transport-shock-scoring-impact-v1');
}
if (impact?.applied !== true || impact?.contributionPct !== 3 || impact?.maxContributionPct !== 3) {
  failures.push('applied fixture must cover +3 / +3 applied contribution');
}
if (impact?.scoreAfterTransport - impact?.scoreBeforeTransport !== 3) {
  failures.push('applied fixture score path must move by exactly +3');
}
if (impact?.guards?.routeFreightConfirmationConnected !== false || impact?.guards?.marketConfirmationConnected !== false) {
  failures.push('applied fixture must keep route/market confirmation disconnected');
}
if (appliedFixture.boundaries?.readsManualArtifacts !== false || appliedFixture.boundaries?.touchesBubbleWatch !== false) {
  failures.push('applied fixture boundaries must forbid manual artifacts and Bubble Watch touch');
}

if (failures.length) {
  console.error('Transport Shock Confirmation Factor frontend card contract FAIL:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Transport Shock Confirmation Factor frontend card contract: PASS (production payload only, capped score-impact display)');
