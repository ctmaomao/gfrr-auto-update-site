import fs from 'node:fs';
import path from 'node:path';
import { ALLOWED_EXTERNAL_AI_PRODUCTION_SCHEMA_VERSIONS } from './external-ai/production-contract.mjs';

const DATA_PATH = 'data/radar-data.json';
const WORKFLOW_DIR = '.github/workflows';
const APPROVED_PRODUCTION_REFRESH_WORKFLOW = '.github/workflows/external-ai-production-refresh.yml';

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
      ['schemaVersion', ALLOWED_EXTERNAL_AI_PRODUCTION_SCHEMA_VERSIONS.has(layer.schemaVersion)],
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
