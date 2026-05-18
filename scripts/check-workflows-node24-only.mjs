import fs from 'node:fs';
import path from 'node:path';

const workflowsDir = '.github/workflows';
const failures = [];
const warnings = [];

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function readFile(file) {
  return fs.readFileSync(file, 'utf8');
}

function workflowFiles() {
  if (!fs.existsSync(workflowsDir)) {
    fail(`${workflowsDir} is missing`);
    return [];
  }

  return fs
    .readdirSync(workflowsDir)
    .filter((file) => /\.ya?ml$/u.test(file))
    .sort()
    .map((file) => path.join(workflowsDir, file));
}

const node20Actions = [
  {
    pattern: /actions\/github-script@v7\b/u,
    message: 'uses actions/github-script@v7, which targets Node.js 20; use actions/github-script@v8',
  },
  {
    pattern: /actions\/checkout@v[45]\b/u,
    message: 'uses actions/checkout v4/v5, which is not the repo Node 24 baseline; use actions/checkout@v6',
  },
  {
    pattern: /actions\/setup-node@v[45]\b/u,
    message: 'uses actions/setup-node v4/v5, which is not the repo Node 24 baseline; use actions/setup-node@v6',
  },
  {
    pattern: /actions\/upload-artifact@v4\b/u,
    message: 'uses actions/upload-artifact@v4, which is not the repo Node 24 baseline; use actions/upload-artifact@v7',
  },
  {
    pattern: /actions\/download-artifact@v4\b/u,
    message: 'uses actions/download-artifact@v4, which is not the repo Node 24 baseline',
  },
];

const expectedNode24Actions = new Map([
  ['actions/checkout', 'v6'],
  ['actions/setup-node', 'v6'],
  ['actions/upload-artifact', 'v7'],
  ['actions/github-script', 'v8'],
  ['actions/upload-pages-artifact', 'v5'],
  ['actions/deploy-pages', 'v5'],
]);

function actionStatus(actionRef) {
  const match = actionRef.match(/^(actions\/[^@]+)@([^@\s#]+)/u);
  if (!match) return 'non-actions or pinned external action';
  const [, actionName, version] = match;
  const expected = expectedNode24Actions.get(actionName);
  if (!expected) return 'review unknown';
  return version === expected ? 'already Node 24' : `expected ${expected}`;
}

function checkWorkflow(file) {
  const src = readFile(file);

  for (const { pattern, message } of node20Actions) {
    if (pattern.test(src)) {
      fail(`${file} ${message}`);
    }
  }

  for (const match of src.matchAll(/uses:\s*([^\s#]+)/gu)) {
    const actionRef = match[1].replace(/['"]/gu, '');
    const status = actionStatus(actionRef);
    if (status.startsWith('expected ')) {
      fail(`${file} uses ${actionRef}; ${status}`);
    } else if (status === 'review unknown') {
      warn(`${file} uses ${actionRef}; verify the action runtime before relying on Node 24`);
    }
  }
}

const files = workflowFiles();
for (const file of files) {
  checkWorkflow(file);
}

if (warnings.length > 0) {
  console.warn('Workflow Node 24-only check warnings:');
  for (const message of warnings) console.warn(`  - ${message}`);
}

if (failures.length > 0) {
  console.error('Workflow Node 24-only check FAILED:');
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}

const packageJson = JSON.parse(readFile('package.json'));
const checkAllCount = packageJson.scripts['check:all']
  .split('&&')
  .map((part) => part.trim())
  .filter(Boolean).length;

console.log(`Workflow Node 24-only check: PASS (${files.length} workflows scanned; check:all = ${checkAllCount} items)`);
