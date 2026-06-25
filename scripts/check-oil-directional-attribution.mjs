// check:oil-directional-attribution — P42 qualitative attribution replay guard.
//
// This protects the P41 attribution layer from drifting into a second scorecard:
// no score/weight/probability/directive keys, no unknown evidence references, and
// no empty explanation lanes across representative bias states.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const errors = [];
const fail = (message) => errors.push(message);

const ODP_PATH = resolve('data/oil-directional-pressure.json');
const FIXTURE_PATH = resolve('docs/fixtures/oil-directional/odp-attribution-fixtures.json');
const INDEX_PATH = resolve('index.html');
const RENDERER_PATH = resolve('scripts/modules/renderOilDirectional.js');

const ATTRIBUTION_SCHEMA_VERSION = 'odp-attribution-1';
const FIXTURE_SCHEMA_VERSION = 'odp-attribution-fixtures-p42';
const ATTRIBUTION_ARRAYS = ['supportEvidence', 'counterEvidence', 'confidenceCaps', 'viewChangeTriggers'];
const ATTRIBUTION_TOP_LEVEL_KEYS = new Set([
  'schemaVersion',
  'boundary',
  'primaryThesis',
  ...ATTRIBUTION_ARRAYS,
]);
const ATTRIBUTION_ITEM_KEYS = new Set(['role', 'label', 'stance', 'evidenceKeys', 'text']);
const DIRECTIONAL_ROLES = new Set([
  'core_physical_anchor',
  'market_confirmation',
  'global_slow_variable',
  'high_frequency_watch',
  'data_quality',
]);
const VIRTUAL_EVIDENCE_REFS = new Set([
  'evidence',
  'interpretation.globalOverlay',
  'oilNewsEventWatch',
  'oilThermalWatch',
]);
const FORBIDDEN_KEY_RE = /(score|weight|probability|decision|execution|position|guidance|triggerMonitor|actionQueue|heatmap|crossValidation)/i;

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function validateNoForbiddenKeys(obj, path) {
  if (!obj || typeof obj !== 'object') return;
  for (const [key, value] of Object.entries(obj)) {
    if (FORBIDDEN_KEY_RE.test(key)) {
      fail(`${path}.${key} is forbidden in qualitative ODP attribution`);
    }
    validateNoForbiddenKeys(value, `${path}.${key}`);
  }
}

function validateAttributionItem(item, path, allowedEvidenceRefs) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    fail(`${path} must be an object`);
    return;
  }
  for (const key of Object.keys(item)) {
    if (!ATTRIBUTION_ITEM_KEYS.has(key)) fail(`${path}.${key} is not an allowed attribution item field`);
  }
  if (!DIRECTIONAL_ROLES.has(item.role)) fail(`${path}.role unsupported: ${item.role}`);
  for (const field of ['label', 'stance', 'text']) {
    if (typeof item[field] !== 'string' || !item[field]) fail(`${path}.${field} must be a non-empty string`);
  }
  if (!Array.isArray(item.evidenceKeys) || item.evidenceKeys.length === 0) {
    fail(`${path}.evidenceKeys must be a non-empty array`);
    return;
  }
  for (const evidenceKey of item.evidenceKeys) {
    if (typeof evidenceKey !== 'string' || !evidenceKey) {
      fail(`${path}.evidenceKeys must contain only non-empty strings`);
    } else if (!allowedEvidenceRefs.has(evidenceKey)) {
      fail(`${path}.evidenceKeys references unknown evidence key: ${evidenceKey}`);
    }
  }
}

function validateAttribution(attribution, path, allowedEvidenceRefs) {
  if (!attribution || typeof attribution !== 'object' || Array.isArray(attribution)) {
    fail(`${path} must be a non-null object`);
    return;
  }
  validateNoForbiddenKeys(attribution, path);
  for (const key of Object.keys(attribution)) {
    if (!ATTRIBUTION_TOP_LEVEL_KEYS.has(key)) fail(`${path}.${key} is not an allowed attribution top-level field`);
  }
  if (attribution.schemaVersion !== ATTRIBUTION_SCHEMA_VERSION) {
    fail(`${path}.schemaVersion must be '${ATTRIBUTION_SCHEMA_VERSION}', got: ${attribution.schemaVersion}`);
  }
  if (typeof attribution.boundary !== 'string' || !/display-only/i.test(attribution.boundary) || !/NOT in/i.test(attribution.boundary)) {
    fail(`${path}.boundary must reaffirm display-only and NOT in decision/scoring paths`);
  }
  if (typeof attribution.primaryThesis !== 'string' || !attribution.primaryThesis) {
    fail(`${path}.primaryThesis must be a non-empty string`);
  }
  for (const field of ATTRIBUTION_ARRAYS) {
    const rows = attribution[field];
    if (!Array.isArray(rows) || rows.length === 0) {
      fail(`${path}.${field} must be a non-empty array`);
      continue;
    }
    rows.forEach((item, idx) => validateAttributionItem(item, `${path}.${field}[${idx}]`, allowedEvidenceRefs));
  }
}

function hasRole(rows, role) {
  return Array.isArray(rows) && rows.some((row) => row && row.role === role);
}

function hasStance(rows, pattern) {
  return Array.isArray(rows) && rows.some((row) => row && typeof row.stance === 'string' && pattern.test(row.stance));
}

function validateCaseExpectations(testCase, path) {
  const attr = testCase.attribution || {};
  switch (testCase.finalBias) {
    case 'strong_bullish':
      if (!hasRole(attr.supportEvidence, 'core_physical_anchor')) fail(`${path} strong_bullish must retain a core physical support row`);
      if (!hasRole(attr.counterEvidence, 'market_confirmation')) fail(`${path} strong_bullish must expose market-confirmation counterevidence`);
      break;
    case 'false_down_physical_stress':
      if (!hasRole(attr.supportEvidence, 'core_physical_anchor')) fail(`${path} false_down must retain physical support`);
      if (!hasRole(attr.counterEvidence, 'market_confirmation')) fail(`${path} false_down must expose price/market counterevidence`);
      if (!hasStance(attr.viewChangeTriggers, /confirm_market_easing|would_confirm/i)) {
        fail(`${path} false_down must include a market-confirmation trigger`);
      }
      break;
    case 'bearish':
      if (!hasRole(attr.supportEvidence, 'core_physical_anchor')) fail(`${path} bearish must be grounded in a physical/demand support row`);
      if (!hasRole(attr.counterEvidence, 'market_confirmation')) fail(`${path} bearish must expose market-structure counterevidence`);
      if (!hasRole(attr.confidenceCaps, 'global_slow_variable')) fail(`${path} bearish must keep global slow-variable cap visible`);
      break;
    case 'insufficient_data':
      if (!hasRole(attr.supportEvidence, 'data_quality')) fail(`${path} insufficient_data must explain why directional support is absent`);
      if (!hasRole(attr.counterEvidence, 'data_quality')) fail(`${path} insufficient_data must explain why proxies cannot override missing official anchors`);
      if (!hasStance(attr.viewChangeTriggers, /restores_model_input/)) fail(`${path} insufficient_data must include a restore-input trigger`);
      break;
    default:
      fail(`${path}.finalBias fixture is unsupported for P42 expectations: ${testCase.finalBias}`);
  }
}

function validateStaticFrontendContract() {
  const html = readFileSync(INDEX_PATH, 'utf8');
  const renderer = readFileSync(RENDERER_PATH, 'utf8');
  const requiredIds = [
    'odp-attribution-thesis',
    'odp-attribution-support',
    'odp-attribution-counter',
    'odp-attribution-caps',
    'odp-attribution-triggers',
  ];
  for (const id of requiredIds) {
    if (!html.includes(`id="${id}"`)) fail(`index.html missing attribution DOM id: ${id}`);
    if (!renderer.includes(id)) fail(`renderOilDirectional.js missing attribution DOM reference: ${id}`);
  }
  for (const marker of ['function renderAttribution', 'function clearAttribution', 'it.attribution']) {
    if (!renderer.includes(marker)) fail(`renderOilDirectional.js missing attribution renderer marker: ${marker}`);
  }
}

const odp = readJson(ODP_PATH);
const allowedEvidenceRefs = new Set([
  ...Object.keys(odp.evidence || {}),
  ...VIRTUAL_EVIDENCE_REFS,
]);

validateAttribution(
  odp.interpretation && odp.interpretation.attribution,
  'data/oil-directional-pressure.json.interpretation.attribution',
  allowedEvidenceRefs,
);

const fixtures = readJson(FIXTURE_PATH);
if (fixtures.schemaVersion !== FIXTURE_SCHEMA_VERSION) {
  fail(`fixture schemaVersion must be '${FIXTURE_SCHEMA_VERSION}', got: ${fixtures.schemaVersion}`);
}
if (typeof fixtures.boundary !== 'string' || !/display-only/i.test(fixtures.boundary) || !/NOT in/i.test(fixtures.boundary)) {
  fail('fixture boundary must reaffirm display-only / NOT in scoring paths');
}
if (!Array.isArray(fixtures.cases) || fixtures.cases.length < 4) {
  fail('fixtures.cases must include at least four representative attribution cases');
} else {
  const names = new Set();
  for (const [idx, testCase] of fixtures.cases.entries()) {
    const path = `docs/fixtures/oil-directional/odp-attribution-fixtures.json.cases[${idx}]`;
    if (!testCase || typeof testCase !== 'object' || Array.isArray(testCase)) {
      fail(`${path} must be an object`);
      continue;
    }
    if (typeof testCase.name !== 'string' || !testCase.name) fail(`${path}.name must be a non-empty string`);
    if (names.has(testCase.name)) fail(`${path}.name duplicate: ${testCase.name}`);
    names.add(testCase.name);
    validateAttribution(testCase.attribution, `${path}.attribution`, allowedEvidenceRefs);
    validateCaseExpectations(testCase, path);
  }
}

validateStaticFrontendContract();

if (errors.length > 0) {
  console.error('Oil Directional Pressure attribution check FAILED:');
  errors.forEach((error) => console.error('  -', error));
  process.exit(1);
}

console.log(`Oil Directional Pressure attribution check: PASS (live='${odp.finalBias}', fixtureCases=${fixtures.cases.length})`);
