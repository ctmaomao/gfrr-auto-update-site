import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ARTIFACT_DIR = 'manual-artifacts/external-ai';
const STRICT_MODE = process.argv.includes('--workflow-provider-test');
const INPUT_ONLY_ARG_INDEX = process.argv.indexOf('--input-only');
const INPUT_ONLY_PATH = INPUT_ONLY_ARG_INDEX === -1 ? null : process.argv[INPUT_ONLY_ARG_INDEX + 1];
const MAX_ARTIFACT_BYTES = 500 * 1024;
const LOCAL_RADAR_DATA_SOURCE_PATH = 'data/radar-data.json';
const COMPACT_INPUT_ARTIFACT = 'manual-input-compact-latest.json';
const ANALYST_INPUT_ARTIFACT = 'manual-input-analyst-latest.json';

const providerWorkflowAllowlist = new Set([
  'workflow-dry-run-report.json',
  'manual-input-compact-latest.json',
  'manual-input-analyst-latest.json',
  'provider-test-gate-status.json',
  'provider-test-missing-secret.json',
  'provider-test-secret-present-blocked.json',
  'deepseek-output-latest.json',
  'external-ai-quality-review-latest.json',
  'external-ai-production-projection-latest.json',
]);

const defaultLocalAllowlist = new Set([
  ...providerWorkflowAllowlist,
  'manual-input-latest.json',
  'manual-input-live.json',
  'manual-input-live-compact.json',
  'manual-input-analyst-latest.json',
  'sample-quality-review-latest.json',
]);

const forbiddenContentSnippets = [
  'DEEPSEEK_API_KEY',
  'Authorization',
  'authorization',
  'Bearer',
  'api_key',
  'secrets.',
  'GITHUB_TOKEN',
  '.env',
  'rawHeaders',
  'raw_headers',
  'headers:',
  '"headers"',
  'requestHeaders',
  'responseHeaders',
  'rawProviderResponse',
  'rawResponse',
  'data/radar-data.json',
  'realtime/',
  'realtime\\',
  'config/',
  'config\\',
];

const defaultForbiddenContentSnippets = [
  'DEEPSEEK_API_KEY',
  'Authorization',
  'authorization',
  'Bearer',
  'api_key',
  'secrets.',
  'GITHUB_TOKEN',
  '.env',
  'rawHeaders',
  'raw_headers',
  'headers:',
  '"headers"',
  'requestHeaders',
  'responseHeaders',
  'rawProviderResponse',
  'rawResponse',
];

const errors = [];

function addError(message) {
  errors.push(message);
}

function walkFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function relativeArtifactName(filePath) {
  return path.relative(ARTIFACT_DIR, filePath).replace(/\\/gu, '/');
}

function isJsonFile(fileName) {
  return fileName.endsWith('.json');
}

function readJson(filePath, fileName) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    addError(`artifact "${fileName}" is not valid JSON: ${error.message}`);
    return null;
  }
}

function scanFileContent(filePath, fileName, snippets = forbiddenContentSnippets) {
  const text = fs.readFileSync(filePath, 'utf8');
  for (const forbiddenSnippet of snippets) {
    if (text.includes(forbiddenSnippet)) {
      addError(`artifact "${fileName}" contains forbidden content marker "${forbiddenSnippet}"`);
    }
  }
  return text;
}

function collectStringLocations(value, needle, pointer = '') {
  if (value === needle) return [pointer || '/'];
  if (!value || typeof value !== 'object') return [];

  const locations = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      locations.push(...collectStringLocations(item, needle, `${pointer}/${index}`));
    });
    return locations;
  }

  for (const [key, childValue] of Object.entries(value)) {
    locations.push(...collectStringLocations(childValue, needle, `${pointer}/${key}`));
  }
  return locations;
}

function validateCompactInputSourceMetadata(data, fileName, text) {
  const locations = collectStringLocations(data, LOCAL_RADAR_DATA_SOURCE_PATH);
  const allowedLocations = new Set([
    '/input',
    '/source',
    '/source/input',
    '/source/path',
    '/source/sourcePath',
  ]);

  if (!text.includes(LOCAL_RADAR_DATA_SOURCE_PATH)) return true;

  if (locations.length === 0) {
    addError(`artifact "${fileName}" contains ${LOCAL_RADAR_DATA_SOURCE_PATH} outside JSON string metadata`);
    return false;
  }

  for (const location of locations) {
    if (!allowedLocations.has(location)) {
      addError(`artifact "${fileName}" contains ${LOCAL_RADAR_DATA_SOURCE_PATH} outside allowed source metadata at ${location}`);
      return false;
    }
  }

  const sourceType = data.sourceType ?? data.source?.type;
  const compactEnabled = data.compact === true || data.compaction?.enabled === true;
  const boundaries = data.boundaries && typeof data.boundaries === 'object' ? data.boundaries : {};
  const source = data.source && typeof data.source === 'object' ? data.source : {};

  const safetyChecks = [
    [sourceType === 'local_file', 'sourceType/local source type must be local_file'],
    [source.isLocalSiteData === true, 'source.isLocalSiteData must be true'],
    [compactEnabled === true, 'compact input marker must be true'],
    [data.productionDataWritten === false || boundaries.notProductionData === true, 'productionDataWritten must be false or notProductionData boundary must be true'],
    [data.frontendDisplayChanged === false || boundaries.manualArtifactOnly === true, 'frontendDisplayChanged must be false or manualArtifactOnly boundary must be true'],
    [data.secretsRead === false || boundaries.noSecrets === true, 'secretsRead must be false or noSecrets boundary must be true'],
    [data.apiCalled === false || boundaries.noExternalMarketData === true, 'apiCalled must be false or noExternalMarketData boundary must be true'],
    [boundaries.readOnlyContext === true, 'readOnlyContext boundary must be true'],
  ];

  let valid = true;
  for (const [passed, message] of safetyChecks) {
    if (!passed) {
      valid = false;
      addError(`artifact "${fileName}" may reference ${LOCAL_RADAR_DATA_SOURCE_PATH} only as safe local_compact source metadata: ${message}`);
    }
  }

  return valid;
}

function strictForbiddenSnippetsForFile(fileName) {
  if (fileName !== COMPACT_INPUT_ARTIFACT && fileName !== ANALYST_INPUT_ARTIFACT) return forbiddenContentSnippets;
  return forbiddenContentSnippets.filter((snippet) => snippet !== LOCAL_RADAR_DATA_SOURCE_PATH);
}

function checkFileSize(filePath, fileName) {
  const stats = fs.statSync(filePath);
  if (stats.size > MAX_ARTIFACT_BYTES) {
    addError(`artifact "${fileName}" exceeds ${MAX_ARTIFACT_BYTES} bytes`);
  }
}

function checkProviderOutput(filePath, fileName) {
  const result = spawnSync(process.execPath, ['scripts/check-external-ai-output.mjs', filePath], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    addError(`provider output artifact "${fileName}" must pass check:external-ai-output before upload`);
  }
}

function checkQualityReviewArtifact(filePath, fileName) {
  const data = readJson(filePath, fileName);
  if (!data) return;

  if (typeof data.reviewVersion !== 'string') {
    addError(`quality review artifact "${fileName}" is missing reviewVersion`);
  }
  if (data.promotionEligible !== false) {
    addError(`quality review artifact "${fileName}" must keep promotionEligible=false`);
  }
  if (data.productionImpact && typeof data.productionImpact === 'object') {
    for (const [field, value] of Object.entries(data.productionImpact)) {
      if (value === true) {
        addError(`quality review artifact "${fileName}" has productionImpact.${field}=true`);
      }
    }
  }
}

function checkStrictFile(filePath, fileName) {
  if (!providerWorkflowAllowlist.has(fileName)) {
    addError(`strict workflow mode forbids artifact file "${fileName}"`);
  }

  if (!isJsonFile(fileName)) {
    addError(`strict workflow mode allows only JSON artifacts; found "${fileName}"`);
    return;
  }

  checkFileSize(filePath, fileName);
  const data = readJson(filePath, fileName);
  const text = scanFileContent(filePath, fileName, strictForbiddenSnippetsForFile(fileName));

  if ((fileName === COMPACT_INPUT_ARTIFACT || fileName === ANALYST_INPUT_ARTIFACT) && data) {
    validateCompactInputSourceMetadata(data, fileName, text);
  }

  if (fileName === 'deepseek-output-latest.json') {
    checkProviderOutput(filePath, fileName);
  }

  if (fileName === 'external-ai-quality-review-latest.json') {
    checkQualityReviewArtifact(filePath, fileName);
  }

  if (fileName === 'external-ai-production-projection-latest.json') {
    const result = spawnSync(process.execPath, ['scripts/check-external-ai-production-contract.mjs', filePath], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    if (result.status !== 0) {
      addError(`production projection artifact "${fileName}" must pass check:external-ai-production-contract before upload`);
    }
  }
}

function runRegressionChecks() {
  const validCompactInput = {
    source: {
      type: 'local_file',
      path: LOCAL_RADAR_DATA_SOURCE_PATH,
      isLocalSiteData: true,
    },
    boundaries: {
      notProductionData: true,
      manualArtifactOnly: true,
      noSecrets: true,
      noExternalMarketData: true,
      readOnlyContext: true,
    },
    compaction: {
      enabled: true,
    },
  };
  const invalidCompactInput = {
    ...validCompactInput,
    siteData: {
      copiedProductionPath: LOCAL_RADAR_DATA_SOURCE_PATH,
    },
  };

  const before = errors.length;
  validateCompactInputSourceMetadata(
    validCompactInput,
    COMPACT_INPUT_ARTIFACT,
    JSON.stringify(validCompactInput),
  );
  if (errors.length !== before) {
    addError('regression: compact input source metadata exception must allow safe source.path');
  }

  const invalidBefore = errors.length;
  validateCompactInputSourceMetadata(
    invalidCompactInput,
    COMPACT_INPUT_ARTIFACT,
    JSON.stringify(invalidCompactInput),
  );
  if (errors.length <= invalidBefore) {
    addError('regression: compact input source metadata exception must reject non-source data path references');
  }
  errors.splice(invalidBefore);
}

function checkDefaultFile(filePath, fileName) {
  if (!defaultLocalAllowlist.has(fileName)) return;
  if (!isJsonFile(fileName)) return;

  checkFileSize(filePath, fileName);
  scanFileContent(filePath, fileName, defaultForbiddenContentSnippets);
}

function checkArtifacts() {
  if (INPUT_ONLY_ARG_INDEX !== -1) {
    if (!STRICT_MODE) {
      addError('--input-only requires --workflow-provider-test');
      return;
    }
    if (!INPUT_ONLY_PATH || INPUT_ONLY_PATH.startsWith('--')) {
      addError('--input-only requires an artifact path');
      return;
    }

    const artifactRoot = path.resolve(ARTIFACT_DIR);
    const inputPath = path.resolve(INPUT_ONLY_PATH);
    if (!inputPath.startsWith(`${artifactRoot}${path.sep}`)) {
      addError(`input-only artifact must stay under ${ARTIFACT_DIR}`);
      return;
    }
    if (!fs.existsSync(inputPath) || !fs.statSync(inputPath).isFile()) {
      addError(`input-only artifact is missing: "${INPUT_ONLY_PATH}"`);
      return;
    }

    const fileName = relativeArtifactName(inputPath);
    if (fileName.includes('/') || fileName.includes('\\')) {
      addError(`nested artifact path is not allowed: "${fileName}"`);
      return;
    }
    if (fileName !== COMPACT_INPUT_ARTIFACT && fileName !== ANALYST_INPUT_ARTIFACT) {
      addError(`input-only mode requires ${COMPACT_INPUT_ARTIFACT} or ${ANALYST_INPUT_ARTIFACT}`);
      return;
    }
    checkStrictFile(inputPath, fileName);
    return;
  }

  if (!fs.existsSync(ARTIFACT_DIR)) return;

  const files = walkFiles(ARTIFACT_DIR);
  for (const filePath of files) {
    const fileName = relativeArtifactName(filePath);

    if (fileName.includes('/') || fileName.includes('\\')) {
      if (STRICT_MODE) addError(`nested artifact path is not allowed: "${fileName}"`);
      continue;
    }

    if (STRICT_MODE) {
      checkStrictFile(filePath, fileName);
    } else {
      checkDefaultFile(filePath, fileName);
    }
  }
}

runRegressionChecks();
checkArtifacts();

if (errors.length > 0) {
  console.error('External AI workflow artifact safety: FAIL');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('External AI workflow artifact safety: PASS');
}
