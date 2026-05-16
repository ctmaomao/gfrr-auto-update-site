import fs from 'node:fs';
import path from 'node:path';

const DATA_PATH = 'data/radar-data.json';
const INDEX_PATH = 'index.html';
const APP_PATH = 'scripts/app.js';
const RENDER_EXTERNAL_AI_PATH = 'scripts/modules/renderExternalAi.js';
const WORKFLOW_DIR = '.github/workflows';
const APPROVED_PRODUCTION_REFRESH_WORKFLOW = '.github/workflows/external-ai-production-refresh.yml';
const FORBIDDEN_VISIBLE_COPY = [
  '买入',
  '卖出',
  '加仓',
  '减仓',
  '做多',
  '做空',
  '建仓',
  '平仓',
  '止损',
  '止盈',
  '仓位',
  '现金',
  '敞口',
  '执行灯',
  '交易信号',
  '操作建议',
  '配置建议',
  '立即行动',
  '投资建议',
];
const SAFE_NEGATED_COPY = [
  '不构成投资建议',
];

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function addError(errors, message) {
  errors.push(message);
}

function listFiles(root, predicate = () => true) {
  if (!fs.existsSync(root)) return [];
  const stats = fs.statSync(root);
  if (stats.isFile()) return predicate(root) ? [root] : [];

  const results = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFiles(fullPath, predicate));
    } else if (entry.isFile() && predicate(fullPath)) {
      results.push(fullPath);
    }
  }
  return results;
}

function normalizeRepoPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function isApprovedProductionRefreshWorkflow(filePath, text) {
  if (normalizeRepoPath(filePath) !== APPROVED_PRODUCTION_REFRESH_WORKFLOW) return false;
  return text.includes('name: External AI Production Refresh')
    && text.includes('cron: "50 23 * * *"')
    && text.includes('environment: external-ai-production-refresh')
    && text.includes('npm run check:external-ai-production-refresh-workflow')
    && text.includes('git add data/radar-data.json')
    && text.includes('git push origin HEAD:main');
}

function validateProductionLayer(errors) {
  const data = readJson(DATA_PATH);
  const layer = data.externalAiInterpretationLayer;
  if (!isPlainObject(layer)) {
    addError(errors, 'data/radar-data.json must contain externalAiInterpretationLayer');
    return;
  }

  const boundaries = isPlainObject(layer.boundaries) ? layer.boundaries : {};
  const qualityReview = isPlainObject(layer.qualityReview) ? layer.qualityReview : {};
  const freshness = isPlainObject(layer.freshness) ? layer.freshness : {};
  const requiredFalse = [
    ['qualityReview.promotionEligible', qualityReview.promotionEligible],
    ['boundaries.affectsScoring', boundaries.affectsScoring],
    ['boundaries.affectsDecisionModel', boundaries.affectsDecisionModel],
    ['boundaries.affectsExecutionLock', boundaries.affectsExecutionLock],
    ['boundaries.affectsPositionGuidance', boundaries.affectsPositionGuidance],
  ];

  for (const [field, value] of requiredFalse) {
    if (value !== false) addError(errors, `${field} must be false for display scaffold`);
  }

  if (typeof layer.displayEnabled !== 'boolean') {
    addError(errors, 'displayEnabled must be boolean');
  }
  if (typeof boundaries.frontendDisplayApproved !== 'boolean') {
    addError(errors, 'boundaries.frontendDisplayApproved must be boolean');
  }
  if (layer.displayEnabled !== boundaries.frontendDisplayApproved) {
    addError(errors, 'displayEnabled and boundaries.frontendDisplayApproved must be both false or both true');
  }

  if (layer.displayEnabled === true && boundaries.frontendDisplayApproved === true) {
    const visibleRequirements = [
      ['schemaVersion', layer.schemaVersion === 'v28.0L-external-ai-production-1'],
      ['status', layer.status === 'valid'],
      ['boundaries.displayOnly', boundaries.displayOnly === true],
      ['boundaries.notInvestmentAdvice', boundaries.notInvestmentAdvice === true],
      ['qualityReview.status', ['pass', 'warn'].includes(qualityReview.status)],
      ['qualityReview.recommendation', qualityReview.recommendation === 'pass_for_manual_review'],
      ['freshness.isStale', freshness.isStale === false],
    ];
    for (const [field, passed] of visibleRequirements) {
      if (!passed) addError(errors, `approved visible display requires ${field} to remain safe`);
    }
  }
}

function validateHiddenContainer(errors) {
  const html = readText(INDEX_PATH);
  const panelMatch = html.match(/<section\b[^>]*id=["']external-ai-display-panel["'][^>]*>/u);
  if (!panelMatch) {
    addError(errors, 'index.html must include external-ai-display-panel hidden scaffold container');
    return;
  }

  if (!/\bhidden\b/u.test(panelMatch[0]) || !/aria-hidden=["']true["']/u.test(panelMatch[0])) {
    addError(errors, 'external-ai-display-panel must be hidden by default with aria-hidden=true');
  }

  const panelIndex = html.indexOf(panelMatch[0]);
  const heatmapSectionIndex = html.indexOf('<section id="global-risk-heatmap"');
  const nextSectionAfterHeatmap = heatmapSectionIndex >= 0
    ? html.indexOf('<section id="detail-data"', heatmapSectionIndex)
    : -1;
  const heatmapCardIndex = html.indexOf('heatmap-card');
  if (heatmapSectionIndex >= 0
    && panelIndex > heatmapSectionIndex
    && (nextSectionAfterHeatmap < 0 || panelIndex < nextSectionAfterHeatmap)) {
    addError(errors, 'external AI panel must not be placed inside Global Risk Heatmap');
  }
  if (heatmapCardIndex >= 0 && Math.abs(panelIndex - heatmapCardIndex) < 3000) {
    addError(errors, 'external AI panel must not be integrated with heatmap-card');
  }

  const panelSnippet = html.slice(Math.max(0, panelIndex - 250), panelIndex + panelMatch[0].length + 250);
  for (const forbidden of FORBIDDEN_VISIBLE_COPY) {
    const safeSnippet = SAFE_NEGATED_COPY.reduce((text, safeCopy) => text.replaceAll(safeCopy, ''), panelSnippet);
    if (safeSnippet.includes(forbidden)) {
      addError(errors, `external AI hidden panel snippet contains forbidden visible copy: ${forbidden}`);
    }
  }
}

function validateFrontendGates(errors) {
  const app = readText(APP_PATH);
  const helper = readText(RENDER_EXTERNAL_AI_PATH);
  if (!app.includes('renderExternalAiPanel(data)')) {
    addError(errors, 'scripts/app.js must call renderExternalAiPanel(data)');
  }

  const requiredGateMarkers = [
    'layer.schemaVersion === SCHEMA_VERSION',
    "layer.status === 'valid'",
    'layer.displayEnabled === true',
    'boundaries.frontendDisplayApproved === true',
    'boundaries.displayOnly === true',
    'boundaries.notInvestmentAdvice === true',
    'boundaries.affectsScoring === false',
    'boundaries.affectsDecisionModel === false',
    'boundaries.affectsExecutionLock === false',
    'boundaries.affectsPositionGuidance === false',
    'qualityReview.promotionEligible === false',
    "reviewStatus === 'pass'",
    "reviewStatus === 'warn'",
    'freshness.isStale === false',
  ];
  for (const marker of requiredGateMarkers) {
    if (!helper.includes(marker)) addError(errors, `renderExternalAi helper missing gate: ${marker}`);
  }

  const requiredUxMarkers = [
    'external-ai-card',
    'external-ai-header',
    'external-ai-badges',
    'external-ai-summary',
    'external-ai-grid',
    'external-ai-section',
    'external-ai-scenario',
    'external-ai-scenario-title',
    'external-ai-source-list',
    'external-ai-review-status',
    'external-ai-muted',
    'external-ai-meta',
    'FACT_LIMIT = 4',
    'INFERENCE_LIMIT = 3',
    'MODEL_JUDGMENT_LIMIT = 4',
    'SCENARIO_LIMIT = 2',
    'SCENARIO_CONDITION_LIMIT = 3',
    'SOURCE_ATTRIBUTION_LIMIT = 4',
    '模型判断',
    '情景假设',
    '触发条件',
    '反证条件',
    '证据来源摘要',
    '审查状态',
    '输出校验通过',
    '仅供人工阅读',
    '不进入自动决策',
  ];
  for (const marker of requiredUxMarkers) {
    if (!helper.includes(marker)) addError(errors, `renderExternalAi helper missing UX marker: ${marker}`);
  }

  if (helper.includes('innerHTML')) {
    addError(errors, 'renderExternalAi helper must not use innerHTML for external AI content');
  }
  if (!helper.includes('.textContent')) {
    addError(errors, 'renderExternalAi helper must use textContent for rendered external AI content');
  }
  for (const rawMarker of [
    'provenance',
    'artifactId',
    'artifactName',
    'artifactPath',
    'runId',
    'rawProviderOutput',
    'providerOutput',
    'rawResponse',
    'headers',
    'decisionContext',
  ]) {
    if (helper.includes(rawMarker)) {
      addError(errors, `renderExternalAi helper must not expose raw provider/provenance field: ${rawMarker}`);
    }
  }

  for (const forbidden of FORBIDDEN_VISIBLE_COPY) {
    const helperWithoutTermList = SAFE_NEGATED_COPY.reduce(
      (text, safeCopy) => text.replaceAll(safeCopy, ''),
      helper.replaceAll(`'${forbidden}',`, ''),
    );
    if (helperWithoutTermList.includes(forbidden)) {
      addError(errors, `renderExternalAi helper contains forbidden visible copy: ${forbidden}`);
    }
  }

  for (const heatmapMarker of ['renderHeatmap', 'world-heatmap', 'heatmap-card', 'heatmap-list']) {
    if (helper.includes(heatmapMarker)) {
      addError(errors, `renderExternalAi helper must not reference Global Risk Heatmap marker: ${heatmapMarker}`);
    }
  }
}

function validateNoAutomation(errors) {
  const workflowFiles = listFiles(WORKFLOW_DIR, (filePath) => filePath.endsWith('.yml') || filePath.endsWith('.yaml'));
  for (const filePath of workflowFiles) {
    const text = readText(filePath);
    if (isApprovedProductionRefreshWorkflow(filePath, text)) continue;
    if (/externalAiInterpretationLayer|external-ai-production-write|write:external-ai-production/iu.test(text)
      && (/^\s*schedule\s*:/im.test(text) || /provider\s*[:=]\s*deepseek/iu.test(text))) {
      addError(errors, `${filePath} must not add scheduled or automatic external AI provider/write behavior`);
    }
  }
}

function main() {
  const errors = [];

  try {
    validateProductionLayer(errors);
    validateHiddenContainer(errors);
    validateFrontendGates(errors);
    validateNoAutomation(errors);
  } catch (error) {
    addError(errors, error.message);
  }

  if (errors.length > 0) {
    console.error('External AI frontend hidden scaffold: FAIL');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log('External AI frontend hidden scaffold: PASS');
}

main();
