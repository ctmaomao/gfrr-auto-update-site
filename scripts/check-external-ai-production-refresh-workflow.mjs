import fs from 'node:fs';
import { targetDisplayStateAllowsWrite } from './write-external-ai-production-data.mjs';

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
    'group: gfrr-main-writer-main',
    'cancel-in-progress: false',
    'queue: max',
    "if: ${{ github.ref == 'refs/heads/main' }}",
    'FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true',
    'actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10',
    'actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e',
    'node-version: 24',
    'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
    'retention-days: 3',
    'npm run check:external-ai-production-refresh-workflow',
    'git pull --ff-only origin main',
  ];
  for (const marker of required) {
    assert(text.includes(marker), `workflow missing required runtime marker: ${marker}`);
  }

  const checkoutStep = getBlock(text, 'name: Checkout repository', ['\n      - name: Setup Node.js']);
  assert(checkoutStep.includes('ref: main'), 'production refresh checkout must be pinned to main');

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

  const providerStep = getBlock(text, 'name: Run DeepSeek production refresh provider call', ['\n      - name: Run external AI quality review']);
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
    'name: Sanitize selected production input before provider call',
    'npm run check:external-ai-workflow-artifacts -- --workflow-provider-test --input-only "${{ steps.refresh_inputs.outputs.input_artifact_path }}"',
    'allow_network="true"',
    'acknowledge_cost="true"',
    'node scripts/run-external-ai-manual-test.mjs \\',
    '--provider deepseek',
    '--input "${{ steps.refresh_inputs.outputs.input_artifact_path }}"',
    '--output manual-artifacts/external-ai/deepseek-output-latest.json',
    '--allow-network',
    '--validate-output',
    '--timeout-ms "${{ steps.refresh_inputs.outputs.timeout_ms }}"',
    'npm run review:external-ai-artifact -- --input manual-artifacts/external-ai/deepseek-output-latest.json --output manual-artifacts/external-ai/external-ai-quality-review-latest.json',
    'node scripts/project-external-ai-production-dry-run.mjs \\',
    '--preserve-display-state-from data/radar-data.json',
    '--restore-visible-display',
    'npm run check:external-ai-workflow-artifacts -- --workflow-provider-test',
    'npm run write:external-ai-production -- \\',
    '--confirm-production-write',
    '--data-only',
    '--no-frontend-display',
    '--preserve-visible-display',
    'npm run check:external-ai-production-publish',
  ];
  for (const marker of required) {
    assert(text.includes(marker), `workflow missing provider/validation marker: ${marker}`);
  }

  assert(countOccurrences(text, 'node scripts/run-external-ai-manual-test.mjs') === 1, 'workflow must call provider command exactly once');
  assert(countOccurrences(text, '--validate-output') === 1, 'provider output must be validated exactly once by the provider runner');
  assert(!text.includes('name: Validate provider output'), 'workflow must not repeat provider output validation');
  assert(!text.includes('name: Validate projection'), 'writer already validates the projection contract; workflow must not repeat it');
  assert(!text.includes('npm run check:all'), 'paid production refresh must use its scoped publish gate instead of unrelated full-repository checks');
  assert(countOccurrences(text, 'npm run check:external-ai-production-publish') === 1, 'workflow must run the scoped production publish gate exactly once');
  assert(countOccurrences(text, 'npm run check:external-ai-workflow-artifacts -- --workflow-provider-test') === 2, 'workflow must sanitize input before the provider call and sanitize the complete artifact set before upload');
  assert(
    text.indexOf('name: Sanitize selected production input before provider call') < text.indexOf('name: Run DeepSeek production refresh provider call'),
    'input artifact sanitizer must run before the provider call',
  );
  assert(
    getBlock(text, 'if [ "${{ github.event_name }}" = "workflow_dispatch" ]; then', ['\n          fi']).includes('else') &&
      text.includes('input_source="analyst_compact_v1"'),
    'scheduled path must default to analyst_compact_v1',
  );
  assert(
    targetDisplayStateAllowsWrite(
      {
        externalAiInterpretationLayer: {
          displayEnabled: false,
          status: 'disabled',
          fallback: { used: true },
          boundaries: {
            frontendDisplayApproved: false,
            externalAiGenerated: false,
            usesExternalAiApi: false,
          },
        },
      },
      { displayEnabled: true, frontendDisplayApproved: true },
    ),
    'approved production refresh must be able to restore a hidden fallback layer',
  );
  assert(
    !targetDisplayStateAllowsWrite(
      {
        externalAiInterpretationLayer: {
          displayEnabled: false,
          status: 'valid',
          boundaries: {
            frontendDisplayApproved: false,
            externalAiGenerated: true,
            usesExternalAiApi: true,
          },
        },
      },
      { displayEnabled: true, frontendDisplayApproved: true },
    ),
    'production writer must not override a deliberately hidden valid layer',
  );
  assert(
    !targetDisplayStateAllowsWrite(
      {
        externalAiInterpretationLayer: {
          displayEnabled: true,
          boundaries: { frontendDisplayApproved: false },
        },
      },
      { displayEnabled: true, frontendDisplayApproved: true },
    ),
    'production writer must reject mismatched target display approval state',
  );
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
