import fs from 'node:fs';

const WORKFLOW_PATH = '.github/workflows/external-ai-production-refresh.yml';
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

function getBlock(text, startNeedle, endNeedles = []) {
  const start = text.indexOf(startNeedle);
  if (start === -1) return '';
  const candidates = endNeedles
    .map((needle) => text.indexOf(needle, start + startNeedle.length))
    .filter((index) => index !== -1);
  const end = candidates.length > 0 ? Math.min(...candidates) : text.length;
  return text.slice(start, end);
}

function checkTriggers(text) {
  const triggerBlock = getBlock(text, 'on:', ['\npermissions:']);
  assert(triggerBlock.includes('schedule:'), 'workflow must include schedule trigger');
  assert(triggerBlock.includes('workflow_dispatch:'), 'workflow must include workflow_dispatch trigger');
  assert(triggerBlock.includes('cron: "50 23 * * *"'), 'workflow cron must be exactly "50 23 * * *"');
  assert(countOccurrences(triggerBlock, 'cron:') === 1, 'workflow must include exactly one scheduled cron');
  for (const forbidden of ['push:', 'pull_request:', 'workflow_run:']) {
    assert(!triggerBlock.includes(forbidden), `workflow must not include ${forbidden}`);
  }

  const requiredInputs = [
    'input_source:',
    'allow_network:',
    'acknowledge_cost:',
    'validate_output:',
    'timeout_ms:',
    'default: analyst_compact_v1',
    'default: true',
    'default: 120000',
  ];
  for (const input of requiredInputs) {
    assert(triggerBlock.includes(input), `workflow dispatch input missing ${input}`);
  }
  assert(triggerBlock.includes('- local_compact'), 'input_source must allow local_compact');
  assert(triggerBlock.includes('- analyst_compact_v1'), 'input_source must allow analyst_compact_v1 for manual dispatch');
}

function checkRuntimeBaseline(text) {
  const required = [
    'permissions:',
    'contents: write',
    'actions: read',
    'concurrency:',
    'group: external-ai-production-refresh',
    'cancel-in-progress: false',
    'FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true',
    'actions/checkout@v6',
    'actions/setup-node@v6',
    'node-version: 24',
    'actions/upload-artifact@v7',
    'retention-days: 3',
    'npm run check:external-ai-production-refresh-workflow',
  ];
  for (const marker of required) {
    assert(text.includes(marker), `workflow missing required runtime marker: ${marker}`);
  }

  const forbidden = [
    'actions/checkout@v4',
    'actions/checkout@v5',
    'actions/setup-node@v4',
    'actions/setup-node@v5',
    'actions/upload-artifact@v4',
    'node-version: 20',
    'node20',
    'FORCE_JAVASCRIPT_ACTIONS_TO_NODE20',
    'ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION',
  ];
  for (const marker of forbidden) {
    assert(!text.includes(marker), `workflow must not contain ${marker}`);
  }
}

function checkSecretPolicy(text) {
  assert(text.includes('environment: external-ai-production-refresh'), 'workflow must use external-ai-production-refresh environment');
  assert(countOccurrences(text, 'secrets.DEEPSEEK_API_KEY') === 1, 'secrets.DEEPSEEK_API_KEY must appear exactly once');
  assert(text.includes('DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}'), 'secret must be injected as a step env var');

  const providerStep = getBlock(text, 'name: Run DeepSeek production refresh provider call', ['\n      - name: Validate provider output']);
  assert(providerStep.includes('DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}'), 'provider step must contain the secret env mapping');
  assert(providerStep.includes('if [ -z "${DEEPSEEK_API_KEY:-}" ]; then'), 'provider step must fail before provider command when secret is missing');
  assert(providerStep.indexOf('if [ -z "${DEEPSEEK_API_KEY:-}" ]; then') < providerStep.indexOf('node scripts/run-external-ai-manual-test.mjs'), 'missing secret check must run before provider command');
  assert(!providerStep.includes('--api-key'), 'secret must not be passed as a CLI argument');
  assert(!providerStep.includes('--api_key'), 'secret must not be passed as a CLI argument');
  assert(!providerStep.includes('--deepseek-api-key'), 'secret must not be passed as a CLI argument');
  assert(!providerStep.includes('echo $DEEPSEEK_API_KEY'), 'secret must not be echoed');
  assert(!providerStep.includes('echo "$DEEPSEEK_API_KEY"'), 'secret must not be echoed');
  assert(!text.includes('printenv'), 'workflow must not print environment variables');
  assert(!text.includes('env |'), 'workflow must not print environment variables');
}

function checkProviderAndValidationPath(text) {
  const required = [
    'if [ "$input_source" = "local_compact" ]; then',
    'input_source must be local_compact or analyst_compact_v1',
    'input_artifact_path="manual-artifacts/external-ai/manual-input-compact-latest.json"',
    'input_artifact_path="manual-artifacts/external-ai/manual-input-analyst-latest.json"',
    'build_input_mode="compact"',
    'build_input_mode="analyst_compact_v1"',
    'echo "input_artifact_path=$input_artifact_path"',
    'echo "build_input_mode=$build_input_mode"',
    'name: Build selected production input',
    'node scripts/build-external-ai-manual-input.mjs \\',
    '--compact',
    '--analyst-compact-v1',
    '--output "${{ steps.refresh_inputs.outputs.input_artifact_path }}"',
    'allow_network="true"',
    'acknowledge_cost="true"',
    'acknowledge_non_production="true"',
    'max_attempts="1"',
    'node scripts/run-external-ai-manual-test.mjs \\',
    '--provider deepseek',
    '--input "${{ steps.refresh_inputs.outputs.input_artifact_path }}"',
    '--output manual-artifacts/external-ai/deepseek-output-latest.json',
    '--allow-network',
    '--validate-output',
    '--timeout-ms "${{ steps.refresh_inputs.outputs.timeout_ms }}"',
    'npm run check:external-ai-output -- manual-artifacts/external-ai/deepseek-output-latest.json',
    'npm run review:external-ai-artifact -- --input manual-artifacts/external-ai/deepseek-output-latest.json --output manual-artifacts/external-ai/external-ai-quality-review-latest.json',
    'node scripts/project-external-ai-production-dry-run.mjs \\',
    '--preserve-display-state-from data/radar-data.json',
    'npm run check:external-ai-production-contract -- manual-artifacts/external-ai/external-ai-production-projection-latest.json',
    'npm run check:external-ai-workflow-artifacts -- --workflow-provider-test',
    'npm run write:external-ai-production -- \\',
    '--confirm-production-write',
    '--data-only',
    '--no-frontend-display',
    '--preserve-visible-display',
    'npm run check:external-ai-production-contract -- data/radar-data.json',
    'npm run check:external-ai-production-write-guard',
    'npm run check:external-ai-frontend-hidden-scaffold',
    'npm run check:data',
    'npm run check:all',
  ];
  for (const marker of required) {
    assert(text.includes(marker), `workflow missing provider/validation marker: ${marker}`);
  }

  assert(countOccurrences(text, 'node scripts/run-external-ai-manual-test.mjs') === 1, 'workflow must call provider command exactly once');
  assert(
    getBlock(text, 'if [ "${{ github.event_name }}" = "workflow_dispatch" ]; then', ['\n          fi']).includes('else') &&
      text.includes('input_source="analyst_compact_v1"'),
    'scheduled path must default to analyst_compact_v1',
  );
  assert(!text.includes('max_attempts="2"'), 'workflow must not configure retries beyond one attempt');
}

function checkArtifactPolicy(text) {
  const uploadStep = getBlock(text, 'name: Upload sanitized refresh artifacts', ['\n      - name: Write production data layer']);
  assert(uploadStep.includes("if: ${{ always() && steps.sanitize_refresh_artifacts.outcome == 'success' }}"), 'artifact upload must be sanitizer-gated');
  for (const artifact of [
    '${{ steps.refresh_inputs.outputs.input_artifact_path }}',
    'manual-artifacts/external-ai/deepseek-output-latest.json',
    'manual-artifacts/external-ai/external-ai-quality-review-latest.json',
    'manual-artifacts/external-ai/external-ai-production-projection-latest.json',
  ]) {
    assert(uploadStep.includes(artifact), `upload step missing sanitized artifact ${artifact}`);
  }

  for (const forbidden of [
    'data/radar-data.json\n',
    'config/',
    'realtime/',
    'workers/',
    'index.html',
    'scripts/app.js',
    'scripts/modules/',
    '.env',
    'rawHeaders',
    'rawResponse',
    'requestHeaders',
    'responseHeaders',
  ]) {
    assert(!uploadStep.includes(forbidden), `upload step must not include ${forbidden.trim()}`);
  }
}

function checkCommitPolicy(text) {
  const protectedStep = getBlock(text, 'name: Protected path assertion', ['\n      - name: Commit refreshed production layer if changed']);
  const commitStep = getBlock(text, 'name: Commit refreshed production layer if changed');
  const required = [
    'changed_paths="$(git diff --name-only)"',
    'if [ "$changed_paths" != "data/radar-data.json" ]; then',
    'git status --short -- manual-artifacts',
    'No external AI production data changes.',
    'git config user.name "github-actions[bot]"',
    'git config user.email "41898282+github-actions[bot]@users.noreply.github.com"',
    'git add data/radar-data.json',
    'staged_paths="$(git diff --cached --name-only)"',
    'if [ "$staged_paths" != "data/radar-data.json" ]; then',
    'git commit -m "chore: refresh external AI interpretation layer"',
    'git push origin HEAD:main',
  ];
  for (const marker of required) {
    assert(protectedStep.includes(marker) || commitStep.includes(marker), `workflow missing commit guard marker: ${marker}`);
  }

  for (const forbidden of [
    'git add .',
    'git add -A',
    'git add index.html',
    'git add scripts',
    'git add .github',
    'git add manual-artifacts',
  ]) {
    assert(!commitStep.includes(forbidden), `commit step must not contain ${forbidden}`);
  }
}

function checkForbiddenBuilds(text) {
  for (const forbidden of [
    'npm run build:data',
    'npm run build:realtime',
    'npm run build:world-order',
    'gh workflow run',
    'workflow_run:',
    'pull_request:',
    'push:',
  ]) {
    assert(!text.includes(forbidden), `workflow must not contain ${forbidden}`);
  }
}

function checkWorkflow() {
  const text = readWorkflow();
  if (!text) return;
  checkTriggers(text);
  checkRuntimeBaseline(text);
  checkSecretPolicy(text);
  checkProviderAndValidationPath(text);
  checkArtifactPolicy(text);
  checkCommitPolicy(text);
  checkForbiddenBuilds(text);
}

checkWorkflow();

if (errors.length > 0) {
  console.error('External AI production refresh workflow: FAIL');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('External AI production refresh workflow: PASS');
}
