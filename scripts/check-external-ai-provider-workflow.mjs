import fs from 'node:fs';

const WORKFLOW_PATH = '.github/workflows/external-ai-manual-provider-test.yml';
const errors = [];

function addError(message) {
  errors.push(message);
}

function assert(condition, message) {
  if (!condition) addError(message);
}

function readWorkflow() {
  if (!fs.existsSync(WORKFLOW_PATH)) {
    addError(`${WORKFLOW_PATH} is missing`);
    return '';
  }
  return fs.readFileSync(WORKFLOW_PATH, 'utf8');
}

function countOccurrences(text, needle) {
  return text.split(needle).length - 1;
}

function checkRequiredText(text) {
  const requiredSnippets = [
    'workflow_dispatch',
    'permissions:',
    'contents: read',
    'actions: read',
    'external-ai-manual-provider-test',
    'cancel-in-progress: false',
    'dry_run',
    'allow_network',
    'acknowledge_cost',
    'acknowledge_non_production',
    'max_attempts',
    'provider',
    'deepseek',
    'npm run check:external-ai-manual-workflow',
    'npm run check:external-ai-production-provider-path',
    'scripts/run-external-ai-manual-test.mjs --dry-run',
    'npm run check:external-ai-workflow-artifacts',
    'actions/upload-artifact@v4',
    'retention-days: 3',
    'provider command executed: false',
    'apiCalled=false',
    'networkUsed=false',
    'productionDataWritten=false',
    'frontendDisplayChanged=false',
    'Missing-secret safe provider gate',
    'DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}',
  ];

  for (const snippet of requiredSnippets) {
    assert(text.includes(snippet), `workflow must contain "${snippet}"`);
  }
}

function checkForbiddenText(text) {
  const forbiddenSnippets = [
    'pull_request:',
    'push:',
    'schedule:',
    'workflow_run:',
    'npm run build:data',
    'npm run build:realtime',
    'npm run build:world-order',
    'wrangler',
    'contents: write',
    'actions: write',
    'deployments: write',
    'pages: write',
    'id-token: write',
    'run-external-ai-manual-test.mjs --provider deepseek',
    '--allow-network',
    '--output manual-artifacts/external-ai/deepseek-output-latest.json',
    'echo $DEEPSEEK_API_KEY',
    'echo "$DEEPSEEK_API_KEY"',
    'data/radar-data.json',
    'realtime/**',
    'config/**',
    '.env',
  ];

  for (const snippet of forbiddenSnippets) {
    assert(!text.includes(snippet), `workflow must not contain "${snippet}"`);
  }

  const directForbiddenArtifactNames = [
    'deepseek-output-latest.json',
    'external-ai-quality-review-latest.json',
  ];

  for (const artifactName of directForbiddenArtifactNames) {
    assert(!text.includes(artifactName), `workflow must not directly contain "${artifactName}"`);
  }
}

function checkTriggerShape(text) {
  assert(/^on:\s*\n\s+workflow_dispatch:/mu.test(text), 'workflow trigger must be workflow_dispatch only');
  assert(!/^on:\s*\[[^\]]/mu.test(text), 'workflow must not use compact trigger array');
}

function checkSecretPolicy(text) {
  const secretReferenceCount = countOccurrences(text, 'secrets.DEEPSEEK_API_KEY');
  assert(secretReferenceCount <= 1, 'workflow may reference secrets.DEEPSEEK_API_KEY at most once');
  assert(secretReferenceCount === 1, 'workflow must include exactly one future secret reference in the provider gate step');

  const envReferenceCount = countOccurrences(text, 'DEEPSEEK_API_KEY');
  assert(envReferenceCount >= 2, 'workflow must define and test DEEPSEEK_API_KEY only in provider gate');

  const providerGateIndex = text.indexOf('name: Missing-secret safe provider gate');
  const secretEnvIndex = text.indexOf('DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}');
  assert(providerGateIndex !== -1, 'missing provider gate step');
  assert(secretEnvIndex > providerGateIndex, 'secret env reference must appear inside provider gate step');

  const lines = text.split(/\r?\n/u);
  for (const line of lines) {
    if (!line.includes('DEEPSEEK_API_KEY')) continue;
    const trimmed = line.trim();
    const allowed =
      trimmed === 'DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}' ||
      trimmed === 'if [ -z "${DEEPSEEK_API_KEY:-}" ]; then';
    assert(allowed, `unexpected DEEPSEEK_API_KEY usage: ${trimmed}`);
  }
}

function checkProviderGate(text) {
  assert(text.includes('provider_path_requested="true"'), 'workflow must compute provider path request gate');
  assert(text.includes('provider_gates_not_satisfied'), 'workflow must write skipped gate diagnostic');
  assert(text.includes('missing_required_provider_secret'), 'workflow must write missing-secret diagnostic');
  assert(
    text.includes('l3f_blocks_real_provider_call_even_when_secret_present'),
    'workflow must block real provider call even when a secret is present',
  );
  assert(text.includes('exit 1'), 'provider gate must fail closed for unsafe provider path');
}

function checkUploadPolicy(text) {
  const uploadStepIndex = text.indexOf('name: Upload sanitized provider-test artifacts');
  assert(uploadStepIndex !== -1, 'workflow must contain sanitized artifact upload step');
  if (uploadStepIndex === -1) return;

  const uploadBlock = text.slice(uploadStepIndex);
  const requiredUploadPaths = [
    'manual-artifacts/external-ai/workflow-dry-run-report.json',
    'manual-artifacts/external-ai/manual-input-compact-latest.json',
    'manual-artifacts/external-ai/provider-test-gate-status.json',
    'manual-artifacts/external-ai/provider-test-missing-secret.json',
    'manual-artifacts/external-ai/provider-test-secret-present-blocked.json',
  ];

  for (const uploadPath of requiredUploadPaths) {
    assert(uploadBlock.includes(uploadPath), `upload step must include ${uploadPath}`);
  }
}

function checkWorkflow() {
  const text = readWorkflow();
  if (!text) return;
  checkTriggerShape(text);
  checkRequiredText(text);
  checkForbiddenText(text);
  checkSecretPolicy(text);
  checkProviderGate(text);
  checkUploadPolicy(text);
}

checkWorkflow();

if (errors.length > 0) {
  console.error('External AI provider workflow skeleton: FAIL');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('External AI provider workflow skeleton: PASS');
}
