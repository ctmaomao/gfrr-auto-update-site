import fs from 'node:fs';

const WORKFLOW_PATH = '.github/workflows/external-ai-manual-dry-run.yml';
const errors = [];

function addError(message) {
  errors.push(message);
}

function assert(condition, message) {
  if (!condition) addError(message);
}

function includes(text, needle) {
  return text.includes(needle);
}

function readWorkflow() {
  if (!fs.existsSync(WORKFLOW_PATH)) {
    addError(`${WORKFLOW_PATH} is missing`);
    return '';
  }
  return fs.readFileSync(WORKFLOW_PATH, 'utf8');
}

function checkRequiredText(text) {
  const requiredSnippets = [
    'workflow_dispatch',
    'npm run check:external-ai-production-provider-path',
    'npm run check:external-ai-manual-scaffold',
    'scripts/run-external-ai-manual-test.mjs --dry-run',
    'provider=none',
    'networkAllowed=false',
    'apiCalled=false',
    'secretsRead=false',
    'productionDataWritten=false',
    'frontendDisplayChanged=false',
    'actions/upload-artifact',
    'retention-days: 3',
    'contents: read',
    'actions: read',
    'external-ai-manual-dry-run'
  ];

  for (const snippet of requiredSnippets) {
    assert(includes(text, snippet), `workflow must contain "${snippet}"`);
  }
}

function checkForbiddenText(text) {
  const forbiddenSnippets = [
    'pull_request:',
    'push:',
    'schedule:',
    'workflow_run:',
    'DEEPSEEK_API_KEY',
    'secrets.',
    '--provider deepseek',
    '--allow-network',
    '--validate-output',
    'deepseek-output-latest.json',
    'external-ai-quality-review-latest.json',
    'data/radar-data.json',
    'npm run build:data',
    'npm run build:realtime',
    'npm run build:world-order',
    'wrangler',
    'scripts/app.js',
    'index.html'
  ];

  for (const snippet of forbiddenSnippets) {
    assert(!includes(text, snippet), `workflow must not contain "${snippet}"`);
  }
}

function checkNoWritePermissions(text) {
  const writePermissionPatterns = [
    /contents:\s*write/u,
    /actions:\s*write/u,
    /deployments:\s*write/u,
    /pages:\s*write/u,
    /id-token:\s*write/u
  ];

  for (const pattern of writePermissionPatterns) {
    assert(!pattern.test(text), `workflow must not contain write permission matching ${pattern}`);
  }
}

function checkDryRunInputs(text) {
  assert(!/allow_network\s*:/u.test(text), 'workflow must not define allow_network input');
  assert(!/provider\s*:/u.test(text), 'workflow must not define provider input');
  assert(!/dry_run\s*:/u.test(text), 'workflow must not define a dry_run input');
  assert(!/dry_run\s*=\s*false/u.test(text), 'workflow must not allow dry_run=false');

  const summaryStart = text.indexOf('name: Write dry-run summary');
  const summaryEnd = text.indexOf('\n      - name:', summaryStart + 1);
  const summaryStep = text.slice(summaryStart, summaryEnd === -1 ? text.length : summaryEnd);
  const runBlock = summaryStep.slice(summaryStep.indexOf('run:'));
  assert(summaryStep.includes('TIMEOUT_MS: ${{ github.event.inputs.timeout_ms }}'), 'timeout_ms must pass through step env');
  assert(runBlock && !runBlock.includes('${{ github.event.inputs.'), 'dry-run summary shell must not interpolate dispatch inputs');
  assert(runBlock.includes('timeout_ms must be numeric'), 'dry-run summary must validate numeric timeout_ms before use');
  assert(runBlock.includes('timeout_ms must be <= 180000'), 'dry-run summary must cap timeout_ms before use');
}

function checkTriggerShape(text) {
  assert(/^on:\s*\n\s+workflow_dispatch:/mu.test(text), 'workflow trigger must be workflow_dispatch only');
  assert(!/^on:\s*\[[^\]]/mu.test(text), 'workflow must not use compact trigger array');
}

function checkWorkflow() {
  const text = readWorkflow();
  if (!text) return;
  checkTriggerShape(text);
  checkRequiredText(text);
  checkForbiddenText(text);
  checkNoWritePermissions(text);
  checkDryRunInputs(text);
}

checkWorkflow();

if (errors.length > 0) {
  console.error('External AI manual dry-run workflow: FAIL');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('External AI manual dry-run workflow: PASS');
}
