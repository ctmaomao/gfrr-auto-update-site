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
]);

const defaultLocalAllowlist = new Set([
  ...providerWorkflowAllowlist,
  'manual-input-latest.json',
  'manual-input-live.json',
  'manual-input-live-compact.json',
  'deepseek-output-latest.json',
  'external-ai-quality-review-latest.json',
  'sample-quality-review-latest.json',
]);

const strictForbiddenFiles = new Set([
  'deepseek-output-latest.json',
  'external-ai-quality-review-latest.json',
]);

const forbiddenContentSnippets = [
  'DEEPSEEK_API_KEY',
  'Authorization',
  'Bearer ',
  'api_key',
  'secrets.',
  'GITHUB_TOKEN',
  '.env',
  'rawHeaders',
  'headers:',
  'data/radar-data.json',
  'realtime/',
  'config/',
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

function checkStrictFile(filePath, fileName) {
  if (!providerWorkflowAllowlist.has(fileName)) {
    addError(`strict workflow mode forbids artifact file "${fileName}"`);
  }

  if (strictForbiddenFiles.has(fileName)) {
    addError(`strict workflow mode forbids provider output artifact "${fileName}"`);
  }

  if (!isJsonFile(fileName)) {
    addError(`strict workflow mode allows only JSON artifacts; found "${fileName}"`);
  }

  const stats = fs.statSync(filePath);
  if (stats.size > MAX_ARTIFACT_BYTES) {
    addError(`artifact "${fileName}" exceeds ${MAX_ARTIFACT_BYTES} bytes`);
  }

  const text = fs.readFileSync(filePath, 'utf8');
  for (const forbiddenSnippet of forbiddenContentSnippets) {
    if (text.includes(forbiddenSnippet)) {
      addError(`artifact "${fileName}" contains forbidden content marker "${forbiddenSnippet}"`);
    }
  }
}

function checkDefaultFile(filePath, fileName) {
  if (!defaultLocalAllowlist.has(fileName)) return;
  if (!isJsonFile(fileName)) return;

  const stats = fs.statSync(filePath);
  if (stats.size > MAX_ARTIFACT_BYTES) {
    addError(`artifact "${fileName}" exceeds ${MAX_ARTIFACT_BYTES} bytes`);
  }
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
