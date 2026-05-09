import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ARTIFACT_DIR = 'manual-artifacts/external-ai';
const STRICT_MODE = process.argv.includes('--workflow-provider-test');
const MAX_ARTIFACT_BYTES = 500 * 1024;

const providerWorkflowAllowlist = new Set([
  'workflow-dry-run-report.json',
  'manual-input-compact-latest.json',
  'provider-test-gate-status.json',
  'provider-test-missing-secret.json',
  'provider-test-secret-present-blocked.json',
  'deepseek-output-latest.json',
  'external-ai-quality-review-latest.json',
]);

const defaultLocalAllowlist = new Set([
  ...providerWorkflowAllowlist,
  'manual-input-latest.json',
  'manual-input-live.json',
  'manual-input-live-compact.json',
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
  scanFileContent(filePath, fileName, forbiddenContentSnippets);
  readJson(filePath, fileName);

  if (fileName === 'deepseek-output-latest.json') {
    checkProviderOutput(filePath, fileName);
  }

  if (fileName === 'external-ai-quality-review-latest.json') {
    checkQualityReviewArtifact(filePath, fileName);
  }
}

function checkDefaultFile(filePath, fileName) {
  if (!defaultLocalAllowlist.has(fileName)) return;
  if (!isJsonFile(fileName)) return;

  checkFileSize(filePath, fileName);
  scanFileContent(filePath, fileName, defaultForbiddenContentSnippets);
}

function checkArtifacts() {
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

checkArtifacts();

if (errors.length > 0) {
  console.error('External AI workflow artifact safety: FAIL');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('External AI workflow artifact safety: PASS');
}
