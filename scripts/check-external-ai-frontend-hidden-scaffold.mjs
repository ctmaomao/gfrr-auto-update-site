import { readJson } from './lib/check-script-helpers.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { ALLOWED_EXTERNAL_AI_PRODUCTION_SCHEMA_VERSIONS } from './external-ai/production-contract.mjs';
import { isPreservableExternalAiLayer } from './run-daily-pipeline.mjs';

const DATA_PATH = 'data/radar-data.json';
const WORKFLOW_DIR = '.github/workflows';
const APPROVED_PRODUCTION_REFRESH_WORKFLOW = '.github/workflows/external-ai-production-refresh.yml';
const RENDER_EXTERNAL_AI_PATH = 'scripts/modules/renderExternalAi.js';

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
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

function extractFunctionSource(text, functionName) {
  const marker = `function ${functionName}`;
  const start = text.indexOf(marker);
  if (start < 0) throw new Error(`Unable to find ${functionName} in ${RENDER_EXTERNAL_AI_PATH}`);

  const parenStart = text.indexOf('(', start);
  if (parenStart < 0) throw new Error(`Unable to find signature for ${functionName} in ${RENDER_EXTERNAL_AI_PATH}`);

  let parenDepth = 0;
  let signatureEnd = -1;
  for (let index = parenStart; index < text.length; index += 1) {
    const char = text[index];
    if (char === '(') parenDepth += 1;
    if (char === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        signatureEnd = index;
        break;
      }
    }
  }

  if (signatureEnd < 0) throw new Error(`Unable to parse signature for ${functionName} in ${RENDER_EXTERNAL_AI_PATH}`);

  const braceStart = text.indexOf('{', signatureEnd);
  if (braceStart < 0) throw new Error(`Unable to find body for ${functionName} in ${RENDER_EXTERNAL_AI_PATH}`);

  let depth = 0;
  for (let index = braceStart; index < text.length; index += 1) {
    const char = text[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }

  throw new Error(`Unable to parse ${functionName} in ${RENDER_EXTERNAL_AI_PATH}`);
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

function validateProductionLayer(errors, layer = readJson(DATA_PATH).externalAiInterpretationLayer) {
  if (!isPlainObject(layer)) {
    addError(errors, 'data/radar-data.json must contain externalAiInterpretationLayer');
    return;
  }

  const boundaries = isPlainObject(layer.boundaries) ? layer.boundaries : {};
  const qualityReview = isPlainObject(layer.qualityReview) ? layer.qualityReview : {};
  const freshness = isPlainObject(layer.freshness) ? layer.freshness : {};
  const requiredFalse = [
    ['boundaries.affectsScoring', boundaries.affectsScoring],
    ['boundaries.affectsDecisionModel', boundaries.affectsDecisionModel],
    ['boundaries.affectsExecutionLock', boundaries.affectsExecutionLock],
    ['boundaries.affectsPositionGuidance', boundaries.affectsPositionGuidance],
  ];

  for (const [field, value] of requiredFalse) {
    if (value !== false) addError(errors, `${field} must be false for display scaffold`);
  }
  if (qualityReview.promotionEligible === true) {
    addError(errors, 'qualityReview.promotionEligible must not be true for display scaffold');
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
      ['schemaVersion', ALLOWED_EXTERNAL_AI_PRODUCTION_SCHEMA_VERSIONS.has(layer.schemaVersion)],
      ['status', layer.status === 'valid'],
      ['boundaries.displayOnly', boundaries.displayOnly === true],
      ['boundaries.notInvestmentAdvice', boundaries.notInvestmentAdvice === true],
      ['qualityReview.status', ['pass', 'warn'].includes(qualityReview.status)],
      ['qualityReview.recommendation', qualityReview.recommendation === 'pass_for_manual_review'],
      ['qualityReview.promotionEligible', qualityReview.promotionEligible === false],
      ['freshness.isStale', freshness.isStale === false],
    ];
    for (const [field, passed] of visibleRequirements) {
      if (!passed) addError(errors, `approved visible display requires ${field} to remain safe`);
    }
  }
}

function validateProductionLayerFixtures(errors) {
  const approved = createApprovedVisibleLayer();
  const disabled = cloneLayer(approved);
  disabled.status = 'disabled';
  disabled.displayEnabled = false;
  disabled.boundaries.frontendDisplayApproved = false;
  delete disabled.qualityReview;
  delete disabled.freshness;

  const stale = cloneLayer(approved);
  stale.freshness.isStale = true;

  const malformed = cloneLayer(approved);
  malformed.qualityReview.promotionEligible = true;

  for (const [name, layer, shouldPass] of [
    ['approved visible', approved, true],
    ['disabled fallback without qualityReview', disabled, true],
    ['stale visible', stale, false],
    ['promotion-eligible visible', malformed, false],
  ]) {
    const fixtureErrors = [];
    validateProductionLayer(fixtureErrors, layer);
    if ((fixtureErrors.length === 0) !== shouldPass) {
      addError(errors, `${name} production-layer fixture must ${shouldPass ? 'pass' : 'fail closed'}`);
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

function validateFrontendFailClosedGuard(errors) {
  const text = readText(RENDER_EXTERNAL_AI_PATH);
  const requiredSnippets = [
    'function isExternalAiVisibleForFrontend',
    'function isExternalAiFreshForFrontend',
    "layer.schemaVersion === 'v28.0L-external-ai-production-1'",
    "layer.schemaVersion === 'v28.0L-external-ai-production-analyst-1'",
    "layer.provider !== 'deepseek'",
    "layer.model !== 'deepseek-v4-flash'",
    'provenance.humanApproved !== false',
    "layer.displayEnabled !== true",
    "layer.status !== 'valid'",
    'boundaries.frontendDisplayApproved !== true',
    'boundaries.displayOnly !== true',
    'boundaries.affectsScoring !== false',
    "qualityReview.recommendation !== 'pass_for_manual_review'",
    'qualityReview.promotionEligible !== false',
    '!isExternalAiFreshForFrontend(layer.freshness, nowMs)',
    "setHidden('external-ai-auxiliary', true)",
    "setHidden('external-ai-auxiliary', false)",
  ];

  for (const snippet of requiredSnippets) {
    if (!text.includes(snippet)) addError(errors, `frontend renderer must fail closed for External AI visible display; missing ${snippet}`);
  }
}

function createApprovedVisibleLayer() {
  const generatedAt = new Date(Date.now() - (60 * 60 * 1000)).toISOString();
  return {
    schemaVersion: 'v28.0L-external-ai-production-analyst-1',
    displayEnabled: true,
    status: 'valid',
    sourceMode: 'manual_analyst_compact_v1',
    inputSource: 'analyst_compact_v1',
    sourceSemantics: 'site_structured_analyst_evidence_pack_v1',
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    boundaries: {
      frontendDisplayApproved: true,
      displayOnly: true,
      externalAiGenerated: true,
      usesExternalAiApi: true,
      affectsScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false,
      notInvestmentAdvice: true,
      productionWriteApproved: false,
    },
    qualityReview: {
      status: 'pass',
      recommendation: 'pass_for_manual_review',
      promotionEligible: false,
    },
    provenance: {
      humanApproved: false,
    },
    freshness: {
      artifactGeneratedAt: generatedAt,
      sourceDataUpdatedAt: generatedAt,
      maxAgeHours: 24,
      isStale: false,
    },
  };
}

function cloneLayer(layer) {
  return JSON.parse(JSON.stringify(layer));
}

function buildFrontendRendererHarness() {
  const text = readText(RENDER_EXTERNAL_AI_PATH);
  const calls = [];
  const setHidden = (id, hidden) => calls.push({ id, hidden });
  const harnessFactory = new Function(
    'setHidden',
    `${extractFunctionSource(text, 'isExternalAiFreshForFrontend')}\n${extractFunctionSource(text, 'isExternalAiVisibleForFrontend')}\n${extractFunctionSource(text, 'renderExternalAiAuxiliary')}\nreturn { isExternalAiVisibleForFrontend, renderExternalAiAuxiliary };`
  );
  const harness = harnessFactory(setHidden);
  return {
    ...harness,
    calls,
    resetCalls: () => {
      calls.length = 0;
    },
  };
}

function validateFrontendFailClosedFixtures(errors) {
  const harness = buildFrontendRendererHarness();
  const approvedLayer = createApprovedVisibleLayer();

  if (harness.isExternalAiVisibleForFrontend(approvedLayer) !== true) {
    addError(errors, 'approved visible External AI fixture must pass frontend visibility gate');
  }
  if (isPreservableExternalAiLayer(approvedLayer) !== true) {
    addError(errors, 'approved fresh External AI fixture must remain preservable by Daily');
  }

  const hiddenFixtures = [
    ['missing layer', () => null],
    ['displayEnabled false', (layer) => ({ ...layer, displayEnabled: false })],
    ['status invalid', (layer) => ({ ...layer, status: 'invalid' })],
    ['schemaVersion invalid', (layer) => ({ ...layer, schemaVersion: 'unknown' })],
    ['source contract mismatch', (layer) => ({ ...layer, inputSource: 'local_compact' })],
    ['provider mismatch', (layer) => ({ ...layer, provider: 'other' })],
    ['model mismatch', (layer) => ({ ...layer, model: 'other' })],
    ['humanApproved true', (layer) => ({
      ...layer,
      provenance: { ...layer.provenance, humanApproved: true },
    })],
    ['frontendDisplayApproved false', (layer) => ({
      ...layer,
      boundaries: { ...layer.boundaries, frontendDisplayApproved: false },
    })],
    ['qualityReview.status fail', (layer) => ({
      ...layer,
      qualityReview: { ...layer.qualityReview, status: 'fail' },
    })],
    ['qualityReview.recommendation rejected', (layer) => ({
      ...layer,
      qualityReview: { ...layer.qualityReview, recommendation: 'reject' },
    })],
    ['qualityReview.promotionEligible true', (layer) => ({
      ...layer,
      qualityReview: { ...layer.qualityReview, promotionEligible: true },
    })],
    ['freshness stale', (layer) => ({
      ...layer,
      freshness: { ...layer.freshness, isStale: true },
    })],
    ['freshness expired despite stale flag', (layer) => ({
      ...layer,
      freshness: {
        ...layer.freshness,
        artifactGeneratedAt: '2020-01-01T00:00:00.000Z',
        sourceDataUpdatedAt: '2020-01-01T00:00:00.000Z',
      },
    })],
    ['affectsScoring true', (layer) => ({
      ...layer,
      boundaries: { ...layer.boundaries, affectsScoring: true },
    })],
  ];

  for (const [name, mutate] of hiddenFixtures) {
    const layer = mutate(cloneLayer(approvedLayer));
    if (harness.isExternalAiVisibleForFrontend(layer) !== false) {
      addError(errors, `External AI fixture must fail closed for ${name}`);
      continue;
    }

    harness.resetCalls();
    harness.renderExternalAiAuxiliary({ radarData: { externalAiInterpretationLayer: layer } });
    const hiddenAuxiliary = harness.calls.some((call) => call.id === 'external-ai-auxiliary' && call.hidden === true);
    const hiddenStructuredOutput = harness.calls.some((call) => call.id === 'ext-ai-structured-output' && call.hidden === true);
    if (!hiddenAuxiliary || !hiddenStructuredOutput) {
      addError(errors, `External AI renderer must hide auxiliary output for ${name}`);
    }
  }

  const expiredLayer = hiddenFixtures.find(([name]) => name === 'freshness expired despite stale flag')[1](
    cloneLayer(approvedLayer),
  );
  if (isPreservableExternalAiLayer(expiredLayer) !== false) {
    addError(errors, 'Daily must not preserve an expired External AI layer whose stale flag was never updated');
  }
}

function validateModelJudgmentRendering(errors) {
  const text = readText(RENDER_EXTERNAL_AI_PATH);
  const displayText = (value) => {
    if (value === null || value === undefined || typeof value === 'object') return null;
    const normalized = String(value).trim();
    return normalized || null;
  };
  const joinNonEmpty = (parts, separator = ' · ') => parts.map(displayText).filter(Boolean).join(separator);
  const factory = new Function(
    'externalAiDisplayText',
    'joinNonEmpty',
    `${extractFunctionSource(text, 'modelJudgmentText')}\n${extractFunctionSource(text, 'orderedModelJudgments')}\nreturn orderedModelJudgments;`,
  );
  const orderedModelJudgments = factory(displayText, joinNonEmpty);
  const rendered = orderedModelJudgments([
    { key: 'certainty', labelZh: '证据充分性', detailZh: '当前仅支持低置信观察。' },
    '字符串判断',
    { key: 'machine_only' },
  ]);
  if (rendered !== '(1) 证据充分性：当前仅支持低置信观察。 (2) 字符串判断') {
    addError(errors, `object-shaped modelJudgments must render display fields only, got: ${rendered}`);
  }
  if (rendered?.includes('[object Object]')) {
    addError(errors, 'object-shaped modelJudgments must not render as [object Object]');
  }
}

function main() {
  const errors = [];

  try {
    validateProductionLayer(errors);
    validateProductionLayerFixtures(errors);
    validateNoAutomation(errors);
    validateFrontendFailClosedGuard(errors);
    validateFrontendFailClosedFixtures(errors);
    validateModelJudgmentRendering(errors);
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
