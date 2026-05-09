import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const DATA_PATH = 'data/radar-data.json';
const FRONTEND_PATHS = ['index.html', 'scripts/app.js', 'scripts/modules'];
const WORKFLOW_DIR = '.github/workflows';
const WRITE_SCRIPT_NAME_PATTERN = /write.*external.*ai.*production|external.*ai.*production.*write/i;

const FRONTEND_DISPLAY_MARKERS = [
  'externalAiInterpretationLayer',
  'external-ai-production-projection',
  'external-ai-production-write',
  'frontendDisplayApproved',
  'displayEnabled',
];

const WORKFLOW_WRITE_MARKERS = [
  'write:external-ai-production',
  'write-external-ai-production',
  'external-ai-production-write',
  'externalAiInterpretationLayer',
];

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function addError(errors, message) {
  errors.push(message);
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
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

function getNestedBoolean(root, paths) {
  for (const fieldPath of paths) {
    let current = root;
    let found = true;
    for (const field of fieldPath.split('.')) {
      if (!isPlainObject(current) || !(field in current)) {
        found = false;
        break;
      }
      current = current[field];
    }
    if (found && typeof current === 'boolean') return current;
  }
  return undefined;
}

function valueIsTrue(root, paths) {
  return getNestedBoolean(root, paths) === true;
}

function validateLayerDisabledOrNonImpacting(layer, errors) {
  if (!isPlainObject(layer)) {
    addError(errors, 'externalAiInterpretationLayer must be an object when present');
    return;
  }

  const enabled = valueIsTrue(layer, ['enabled']);
  const displayEnabled = valueIsTrue(layer, ['displayEnabled']);
  const frontendDisplayApproved = valueIsTrue(layer, [
    'frontendDisplayApproved',
    'boundaries.frontendDisplayApproved',
  ]);
  const promotionEligible = valueIsTrue(layer, ['promotionEligible', 'qualityReview.promotionEligible']);
  const affectsScoring = valueIsTrue(layer, ['affectsScoring', 'boundaries.affectsScoring']);
  const affectsDecisionModel = valueIsTrue(layer, ['affectsDecisionModel', 'boundaries.affectsDecisionModel']);
  const affectsExecutionLock = valueIsTrue(layer, ['affectsExecutionLock', 'boundaries.affectsExecutionLock']);
  const affectsPositionGuidance = valueIsTrue(layer, [
    'affectsPositionGuidance',
    'boundaries.affectsPositionGuidance',
  ]);

  const forbiddenTrueFields = [
    ['enabled', enabled],
    ['displayEnabled', displayEnabled],
    ['frontendDisplayApproved', frontendDisplayApproved],
    ['promotionEligible', promotionEligible],
    ['affectsScoring', affectsScoring],
    ['affectsDecisionModel', affectsDecisionModel],
    ['affectsExecutionLock', affectsExecutionLock],
    ['affectsPositionGuidance', affectsPositionGuidance],
  ];

  for (const [field, isForbidden] of forbiddenTrueFields) {
    if (isForbidden) addError(errors, `externalAiInterpretationLayer ${field} must not be true`);
  }

  if (layer.schemaVersion === 'v28.0L-external-ai-production-1') {
    const result = spawnSync(process.execPath, ['scripts/check-external-ai-production-contract.mjs', DATA_PATH], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    if (result.status !== 0) {
      addError(errors, 'production contract validator failed for data/radar-data.json');
      if (result.stderr.trim()) addError(errors, result.stderr.trim());
      if (result.stdout.trim()) addError(errors, result.stdout.trim());
    }
  }
}

function validateProductionData(errors) {
  if (!fs.existsSync(DATA_PATH)) return;
  const data = readJson(DATA_PATH);
  if (!isPlainObject(data)) {
    addError(errors, `${DATA_PATH} must be a JSON object`);
    return;
  }

  if (!('externalAiInterpretationLayer' in data)) return;
  validateLayerDisabledOrNonImpacting(data.externalAiInterpretationLayer, errors);
}

function validateFrontendNoDisplayMarkers(errors) {
  const files = FRONTEND_PATHS.flatMap((target) =>
    listFiles(target, (filePath) => filePath.endsWith('.html') || filePath.endsWith('.js')),
  );

  for (const filePath of files) {
    const text = readText(filePath);
    for (const marker of FRONTEND_DISPLAY_MARKERS) {
      if (text.includes(marker)) {
        addError(errors, `${filePath} contains external AI frontend display marker: ${marker}`);
      }
    }
  }
}

function validateNoWorkflowProductionAutomation(errors) {
  const workflowFiles = listFiles(WORKFLOW_DIR, (filePath) => filePath.endsWith('.yml') || filePath.endsWith('.yaml'));

  for (const filePath of workflowFiles) {
    const text = readText(filePath);
    const lower = text.toLowerCase();
    const hasProductionWriteMarker = WORKFLOW_WRITE_MARKERS.some((marker) =>
      lower.includes(marker.toLowerCase()),
    );
    if (!hasProductionWriteMarker) continue;

    if (/^\s*schedule\s*:/im.test(text)) {
      addError(errors, `${filePath} contains scheduled external AI production write marker`);
    }
    if (/allow_network\s*[:=]\s*true/i.test(text) || /provider\s*[:=]\s*deepseek/i.test(text)) {
      addError(errors, `${filePath} contains provider automation marker near external AI production write`);
    }
  }
}

function validateNoEnabledWriteScript(errors) {
  const writeScripts = listFiles('scripts', (filePath) => WRITE_SCRIPT_NAME_PATTERN.test(path.basename(filePath)));

  for (const filePath of writeScripts) {
    if (path.basename(filePath) === 'check-external-ai-production-write-guard.mjs') continue;
    const text = readText(filePath);
    const hasConfirmGuard = text.includes('confirm-production-write');
    const exitsNoGo = /NO-GO|not approved|disabled by default|process\.exit\(1\)/i.test(text);
    if (!hasConfirmGuard || !exitsNoGo) {
      addError(errors, `${filePath} appears to be an enabled external AI production write script`);
    }
  }
}

function main() {
  const errors = [];

  try {
    validateProductionData(errors);
    validateFrontendNoDisplayMarkers(errors);
    validateNoWorkflowProductionAutomation(errors);
    validateNoEnabledWriteScript(errors);
  } catch (error) {
    addError(errors, error.message);
  }

  if (errors.length > 0) {
    console.error('External AI production write guard: FAIL');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log('External AI production write guard: PASS');
}

main();
