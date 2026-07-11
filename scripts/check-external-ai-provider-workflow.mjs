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

function getBlock(text, startNeedle, endNeedles = []) {
  const start = text.indexOf(startNeedle);
  if (start === -1) return '';
  const candidates = endNeedles
    .map((needle) => text.indexOf(needle, start + startNeedle.length))
    .filter((index) => index !== -1);
  const end = candidates.length > 0 ? Math.min(...candidates) : text.length;
  return text.slice(start, end);
}

function checkTriggerShape(text) {
  assert(/^on:\s*\n\s+workflow_dispatch:/mu.test(text), 'workflow trigger must be workflow_dispatch only');
  assert(!/^on:\s*\[[^\]]/mu.test(text), 'workflow must not use compact trigger array');

  const forbiddenTriggers = ['schedule:', 'push:', 'pull_request:', 'workflow_run:'];
  const triggerBlock = getBlock(text, 'on:', ['\npermissions:']);
  for (const trigger of forbiddenTriggers) {
    assert(!triggerBlock.includes(trigger), `workflow must not include ${trigger}`);
  }
}

function checkPermissions(text) {
  const permissionsBlock = getBlock(text, 'permissions:', ['\nconcurrency:']);
  assert(permissionsBlock.includes('contents: read'), 'workflow permissions must include contents: read');
  assert(permissionsBlock.includes('actions: read'), 'workflow permissions must include actions: read');

  const forbiddenPermissions = [
    'contents: write',
    'actions: write',
    'deployments: write',
    'pages: write',
    'id-token: write',
    'packages: write',
  ];
  for (const permission of forbiddenPermissions) {
    assert(!permissionsBlock.includes(permission), `workflow must not include write permission ${permission}`);
  }
}

function checkRequiredText(text) {
  const requiredSnippets = [
    'name: External AI Manual Provider Test',
    'group: external-ai-manual-provider-test',
    'cancel-in-progress: false',
    'provider_test_dry_run_and_gate',
    'provider_call_artifact_only',
    'name: provider-test-dry-run-and-gate',
    'name: provider-call-artifact-only',
    'provider_path_requested',
    'dry_run',
    'allow_network',
    'acknowledge_cost',
    'acknowledge_non_production',
    'validate_output',
    'timeout_ms',
    'max_attempts',
    'upload_artifacts',
    'deepseek',
    'fixture_sample',
    'local_compact',
    'FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true',
    'actions/checkout@v6',
    'actions/setup-node@v6',
    'node-version: 24',
    'npm run check:external-ai-manual-workflow',
    'npm run check:external-ai-provider-workflow',
    'npm run check:external-ai-production-provider-path',
    'scripts/run-external-ai-manual-test.mjs --dry-run',
    'node scripts/build-external-ai-manual-input.mjs --compact --output "$input_artifact_path"',
    'environment: external-ai-manual',
    'missing_required_environment_secret',
    'node scripts/run-external-ai-manual-test.mjs --provider deepseek',
    '--input docs/fixtures/external-ai/sample-input-v28.0K-1.json',
    'input_artifact_path="manual-artifacts/external-ai/manual-input-compact-latest.json"',
    '--input "$input_artifact_path"',
    '"inputArtifactPath": "$input_artifact_path"',
    '--output manual-artifacts/external-ai/deepseek-output-latest.json',
    '--allow-network',
    '--validate-output',
    'npm run check:external-ai-output -- manual-artifacts/external-ai/deepseek-output-latest.json',
    'npm run review:external-ai-artifact -- --input manual-artifacts/external-ai/deepseek-output-latest.json --output manual-artifacts/external-ai/external-ai-quality-review-latest.json',
    'npm run check:external-ai-workflow-artifacts -- --workflow-provider-test',
    'actions/upload-artifact@v7',
    'retention-days: 3',
    'external-ai-manual-provider-test-gate-${{ github.run_id }}',
    'external-ai-manual-provider-test-provider-${{ github.run_id }}',
    'git diff --exit-code -- data realtime config index.html scripts/app.js scripts/modules workers',
    'provider command executed=',
    'apiCalled=',
    'networkUsed=',
    'outputValidation=',
    'qualityReview=',
    'productionDataWritten=false',
    'frontendDisplayChanged=false',
    'artifactOnly=true',
    'promotionEligible=false',
  ];

  for (const snippet of requiredSnippets) {
    assert(text.includes(snippet), `workflow must contain "${snippet}"`);
  }
}

function checkForbiddenText(text) {
  const forbiddenSnippets = [
    'npm run build:data',
    'npm run build:realtime',
    'npm run build:world-order',
    'build:data',
    'build:realtime',
    'build:world-order',
    'wrangler',
    'pages deploy',
    'DEEPSEEK_API_KEY=',
    '--api-key',
    '--api_key',
    '--deepseek-api-key',
    '--source-url',
    'source-url',
    'echo $DEEPSEEK_API_KEY',
    'echo "$DEEPSEEK_API_KEY"',
    'printenv',
    'env |',
    'data/radar-data.json',
    '"secretName":',
    '.env',
    'GITHUB_TOKEN:',
    'contents: write',
    'actions: write',
    'actions/upload-artifact@v4',
    'actions/download-artifact@v4',
    'actions/checkout@v4',
    'actions/checkout@v5',
    'actions/setup-node@v4',
    'actions/setup-node@v5',
    'node-version: 20',
    'node20',
    'ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION',
    'FORCE_JAVASCRIPT_ACTIONS_TO_NODE20',
    'l3h_first_provider_call_requires_fixture_sample',
  ];

  for (const snippet of forbiddenSnippets) {
    assert(!text.includes(snippet), `workflow must not contain "${snippet}"`);
  }
}

function checkSecretPolicy(text) {
  const secretReferenceCount = countOccurrences(text, 'secrets.DEEPSEEK_API_KEY');
  assert(secretReferenceCount === 1, 'workflow must reference secrets.DEEPSEEK_API_KEY exactly once');

  const secretReference = 'DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}';
  assert(text.includes(secretReference), 'secret must be injected as a step env var');

  const providerJob = getBlock(text, 'provider_call_artifact_only:', []);
  assert(providerJob.includes('environment: external-ai-manual'), 'provider-call job must use external-ai-manual environment');
  assert(providerJob.includes(secretReference), 'secret reference must be inside provider-call job');
  assert(providerJob.includes('"secretReference": "environment_scoped_provider_key"'), 'provider diagnostics must use a generic secret reference label');
  assert(providerJob.includes('"secretConfigured": false'), 'missing-secret diagnostic must record secretConfigured=false');
  assert(providerJob.includes('"secretConfigured": true'), 'provider-call diagnostic must record secretConfigured=true');

  const providerStep = getBlock(providerJob, 'name: Run DeepSeek provider call', ['\n      - name: Validate provider output artifact']);
  assert(providerStep.includes(secretReference), 'secret reference must be inside provider-call step');
  assert(!providerStep.includes('--api-key'), 'provider-call step must not pass API key by CLI arg');
  assert(!providerStep.includes('echo $DEEPSEEK_API_KEY'), 'provider-call step must not echo the secret');
  assert(!providerStep.includes('echo "$DEEPSEEK_API_KEY"'), 'provider-call step must not echo the secret');

  const beforeProviderJob = text.slice(0, text.indexOf('provider_call_artifact_only:'));
  assert(!beforeProviderJob.includes('secrets.DEEPSEEK_API_KEY'), 'dry-run/gate job must not read the secret');
}

function checkProviderJob(text) {
  const providerJob = getBlock(text, 'provider_call_artifact_only:', []);
  const dryRunJob = getBlock(text, 'provider_test_dry_run_and_gate:', ['\n  provider_call_artifact_only:']);

  assert(!dryRunJob.includes('secrets.DEEPSEEK_API_KEY'), 'dry-run/gate job must not receive secret');
  assert(!dryRunJob.includes('--provider deepseek'), 'dry-run/gate job must not contain provider command');

  const providerCommandCount = countOccurrences(text, 'node scripts/run-external-ai-manual-test.mjs --provider deepseek');
  assert(providerCommandCount === 1, 'provider command must appear exactly once');

  const requiredGateChecks = [
    '[ "$provider" != "deepseek" ]',
    'fixture_sample)',
    'local_compact)',
    'node scripts/build-external-ai-manual-input.mjs --compact --output "$input_artifact_path"',
    '[ "$dry_run" != "false" ]',
    '[ "$allow_network" != "true" ]',
    '[ "$acknowledge_cost" != "true" ]',
    '[ "$acknowledge_non_production" != "true" ]',
    '[ "$validate_output" != "true" ]',
    '[ "$max_attempts" != "1" ]',
    'timeout_ms must be numeric',
    'timeout_ms must be <= 180000',
    'if [ -z "${DEEPSEEK_API_KEY:-}" ]; then',
  ];

  for (const gateCheck of requiredGateChecks) {
    assert(providerJob.includes(gateCheck), `provider-call job must enforce gate: ${gateCheck}`);
  }

  const providerStep = getBlock(providerJob, 'name: Run DeepSeek provider call', ['\n      - name: Validate provider output artifact']);
  const commandIndex = providerStep.indexOf('node scripts/run-external-ai-manual-test.mjs --provider deepseek');
  const secretCheckIndex = providerStep.indexOf('if [ -z "${DEEPSEEK_API_KEY:-}" ]; then');
  assert(secretCheckIndex !== -1 && commandIndex > secretCheckIndex, 'missing-secret check must happen before provider command');
  assert(providerStep.includes('--input "$input_artifact_path"'), 'provider command must use selected input artifact path');
  assert(providerStep.includes('manual-artifacts/external-ai/manual-input-compact-latest.json'), 'provider-call job must support local_compact input artifact');
}

function checkShellInputPolicy(text) {
  for (const stepName of [
    'Validate provider-test workflow inputs',
    'Evaluate provider gates',
    'Run DeepSeek provider call',
  ]) {
    const step = getBlock(text, `name: ${stepName}`, ['\n      - name:']);
    const runBlock = step.slice(step.indexOf('run:'));
    assert(runBlock && !runBlock.includes('${{ github.event.inputs.'), `${stepName} must not interpolate dispatch inputs into shell`);
    assert(step.includes('TIMEOUT_MS: ${{ github.event.inputs.timeout_ms }}'), `${stepName} must pass timeout_ms through step env`);
    assert(step.includes('MAX_ATTEMPTS: ${{ github.event.inputs.max_attempts }}'), `${stepName} must pass max_attempts through step env`);
  }
}

function checkArtifactPolicy(text) {
  const uploadPaths = [
    'manual-artifacts/external-ai/workflow-dry-run-report.json',
    'manual-artifacts/external-ai/manual-input-compact-latest.json',
    'manual-artifacts/external-ai/provider-test-gate-status.json',
    'manual-artifacts/external-ai/provider-test-missing-secret.json',
    'manual-artifacts/external-ai/provider-test-secret-present-blocked.json',
    'manual-artifacts/external-ai/deepseek-output-latest.json',
    'manual-artifacts/external-ai/external-ai-quality-review-latest.json',
  ];

  for (const uploadPath of uploadPaths) {
    if (uploadPath.endsWith('provider-test-secret-present-blocked.json')) continue;
    assert(text.includes(uploadPath), `workflow must include artifact path ${uploadPath}`);
  }

  assert(countOccurrences(text, 'retention-days: 3') >= 2, 'artifact uploads must use retention-days: 3');
  assert(text.includes('steps.sanitize_dry_run_artifacts.outcome == \'success\''), 'dry-run upload must be gated by sanitizer success');
  assert(text.includes('steps.sanitize_provider_artifacts.outcome == \'success\''), 'provider upload must be gated by sanitizer success');

  const providerJob = getBlock(text, 'provider_call_artifact_only:', []);
  const qualityReviewIndex = providerJob.indexOf('name: Run external AI quality review');
  const sanitizerIndex = providerJob.indexOf('id: sanitize_provider_artifacts');
  const uploadIndex = providerJob.indexOf('name: Upload sanitized provider-call artifacts');
  assert(
    qualityReviewIndex !== -1 && sanitizerIndex > qualityReviewIndex && uploadIndex > sanitizerIndex,
    'provider sanitizer and upload must run after quality review',
  );

  const providerSanitizerStep = getBlock(providerJob, 'id: sanitize_provider_artifacts', ['\n      - name: Upload sanitized provider-call artifacts']);
  assert(providerSanitizerStep.includes('if: ${{ always() }}'), 'provider sanitizer must run even after quality review failure');

  const providerUploadStep = getBlock(providerJob, 'name: Upload sanitized provider-call artifacts', ['\n      - name: Write provider-call summary']);
  assert(
    providerUploadStep.includes("if: ${{ always() && github.event.inputs.upload_artifacts == 'true' && steps.sanitize_provider_artifacts.outcome == 'success' }}"),
    'provider artifact upload must stay sanitizer-gated and always-evaluated',
  );
}

function checkWorkflow() {
  const text = readWorkflow();
  if (!text) return;
  checkTriggerShape(text);
  checkPermissions(text);
  checkRequiredText(text);
  checkForbiddenText(text);
  checkSecretPolicy(text);
  checkProviderJob(text);
  checkShellInputPolicy(text);
  checkArtifactPolicy(text);
}

checkWorkflow();

if (errors.length > 0) {
  console.error('External AI provider workflow gate: FAIL');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('External AI provider workflow gate: PASS');
}
