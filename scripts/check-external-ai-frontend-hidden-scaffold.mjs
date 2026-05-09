import fs from 'node:fs';
import path from 'node:path';

const DATA_PATH = 'data/radar-data.json';
const INDEX_PATH = 'index.html';
const APP_PATH = 'scripts/app.js';
const RENDER_EXTERNAL_AI_PATH = 'scripts/modules/renderExternalAi.js';
const WORKFLOW_DIR = '.github/workflows';
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

function validateProductionLayer(errors) {
  const data = readJson(DATA_PATH);
  const layer = data.externalAiInterpretationLayer;
  if (!isPlainObject(layer)) {
    addError(errors, 'data/radar-data.json must contain externalAiInterpretationLayer');
    return;
  }

  const boundaries = isPlainObject(layer.boundaries) ? layer.boundaries : {};
  const qualityReview = isPlainObject(layer.qualityReview) ? layer.qualityReview : {};
  const requiredFalse = [
    ['displayEnabled', layer.displayEnabled],
    ['boundaries.frontendDisplayApproved', boundaries.frontendDisplayApproved],
    ['qualityReview.promotionEligible', qualityReview.promotionEligible],
    ['boundaries.affectsScoring', boundaries.affectsScoring],
    ['boundaries.affectsDecisionModel', boundaries.affectsDecisionModel],
    ['boundaries.affectsExecutionLock', boundaries.affectsExecutionLock],
    ['boundaries.affectsPositionGuidance', boundaries.affectsPositionGuidance],
  ];

  for (const [field, value] of requiredFalse) {
    if (value !== false) addError(errors, `${field} must be false for hidden scaffold`);
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
  const heatmapIndex = html.indexOf('id="world-heatmap"');
  const heatmapCardIndex = html.indexOf('heatmap-card');
  if (heatmapIndex >= 0 && Math.abs(panelIndex - heatmapIndex) < 3000) {
    addError(errors, 'external AI panel must not be placed inside or adjacent to Global Risk Heatmap');
  }
  if (heatmapCardIndex >= 0 && Math.abs(panelIndex - heatmapCardIndex) < 3000) {
    addError(errors, 'external AI panel must not be integrated with heatmap-card');
  }

  const panelSnippet = html.slice(Math.max(0, panelIndex - 250), panelIndex + panelMatch[0].length + 250);
  for (const forbidden of FORBIDDEN_VISIBLE_COPY) {
    if (panelSnippet.includes(forbidden)) {
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

  for (const forbidden of FORBIDDEN_VISIBLE_COPY) {
    const helperWithoutTermList = helper.replaceAll(`'${forbidden}',`, '');
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
