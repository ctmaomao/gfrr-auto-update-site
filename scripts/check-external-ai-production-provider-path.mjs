import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_EXTERNAL_AI_PRODUCTION_CONFIG,
  createDisabledExternalAiProductionState,
  getExternalAiProductionReadinessDecision,
  maybeCreateExternalAiProductionLayer,
  validateDisabledExternalAiProductionState
} from './external-ai/production-provider-path.mjs';

const MODULE_PATH = 'scripts/external-ai/production-provider-path.mjs';
const errors = [];

function addError(message) {
  errors.push(message);
}

function assert(condition, message) {
  if (!condition) addError(message);
}

function validateMutationFails(label, mutate) {
  const state = createDisabledExternalAiProductionState();
  mutate(state);
  const result = validateDisabledExternalAiProductionState(state);
  assert(result.ok === false, `${label} must fail disabled-state validation`);
}

function checkDefaultConfigSafety() {
  assert(DEFAULT_EXTERNAL_AI_PRODUCTION_CONFIG.enabled === false, 'default enabled must be false');
  assert(DEFAULT_EXTERNAL_AI_PRODUCTION_CONFIG.provider === 'none', 'default provider must be none');
  assert(DEFAULT_EXTERNAL_AI_PRODUCTION_CONFIG.networkAllowed === false, 'default networkAllowed must be false');
  assert(DEFAULT_EXTERNAL_AI_PRODUCTION_CONFIG.readSecrets === false, 'default readSecrets must be false');
  assert(DEFAULT_EXTERNAL_AI_PRODUCTION_CONFIG.writeProductionData === false, 'default writeProductionData must be false');
}

function checkDisabledStateShape() {
  const state = createDisabledExternalAiProductionState({
    generatedAt: '2026-05-09T00:00:00.000Z',
    inputDigest: { sourceLayerCount: 3 },
    sourceReference: 'unit-test'
  });
  const validation = validateDisabledExternalAiProductionState(state);
  assert(validation.ok === true, `default disabled state must validate: ${validation.errors.join('; ')}`);
  assert(state.contractVersion === 'v28.0L-2', 'contractVersion must be v28.0L-2');
  assert(state.status === 'disabled', 'status must be disabled');
  assert(state.provider === 'none', 'provider must be none');
  assert(state.output === null, 'output must be null');
  assert(state.frontendVisible === false, 'frontendVisible must be false');
  assert(state.inputDigest.siteStructuredDataOnly === true, 'inputDigest.siteStructuredDataOnly must be true');
  assert(state.inputDigest.usesPrivateUserData === false, 'inputDigest.usesPrivateUserData must be false');
  assert(state.inputDigest.usesSecrets === false, 'inputDigest.usesSecrets must be false');
  assert(state.providerMetadata.networkAllowed === false, 'providerMetadata.networkAllowed must be false');
  assert(state.providerMetadata.apiKeyRead === false, 'providerMetadata.apiKeyRead must be false');
  assert(state.providerMetadata.externalAiGenerated === false, 'providerMetadata.externalAiGenerated must be false');
  assert(state.providerMetadata.usesExternalAiApi === false, 'providerMetadata.usesExternalAiApi must be false');
  assert(state.fallback.used === true, 'fallback.used must be true');
  assert(state.fallback.fallbackLayer === 'aiInterpretationLayer', 'fallback must use aiInterpretationLayer');
  assert(state.boundaries.affectsScoring === false, 'boundaries.affectsScoring must be false');
  assert(state.boundaries.affectsDecisionModel === false, 'boundaries.affectsDecisionModel must be false');
  assert(state.boundaries.affectsExecutionLock === false, 'boundaries.affectsExecutionLock must be false');
  assert(state.boundaries.affectsPositionGuidance === false, 'boundaries.affectsPositionGuidance must be false');
  assert(state.audit.apiCalled === false, 'audit.apiCalled must be false');
  assert(state.audit.secretsRead === false, 'audit.secretsRead must be false');
  assert(state.audit.networkUsed === false, 'audit.networkUsed must be false');
  assert(state.audit.productionDataWritten === false, 'audit.productionDataWritten must be false');
  assert(state.audit.frontendDisplayChanged === false, 'audit.frontendDisplayChanged must be false');
}

function checkUnsafeMutationsFail() {
  validateMutationFails('enabled=true', (state) => {
    state.enabled = true;
  });
  validateMutationFails('provider=deepseek', (state) => {
    state.provider = 'deepseek';
  });
  validateMutationFails('output object', (state) => {
    state.output = { summaryZh: 'not allowed' };
  });
  validateMutationFails('providerMetadata.networkAllowed=true', (state) => {
    state.providerMetadata.networkAllowed = true;
  });
  validateMutationFails('providerMetadata.apiKeyRead=true', (state) => {
    state.providerMetadata.apiKeyRead = true;
  });
  validateMutationFails('audit.apiCalled=true', (state) => {
    state.audit.apiCalled = true;
  });
  validateMutationFails('audit.secretsRead=true', (state) => {
    state.audit.secretsRead = true;
  });
  validateMutationFails('productionImpact.writesProductionData=true', (state) => {
    state.productionImpact.writesProductionData = true;
  });
  validateMutationFails('frontendVisible=true', (state) => {
    state.frontendVisible = true;
  });
  validateMutationFails('qualityReview.promotionEligible=true', (state) => {
    state.qualityReview.promotionEligible = true;
  });
}

function checkActivationAttemptsStayDisabled() {
  const state = maybeCreateExternalAiProductionLayer({
    enabled: true,
    provider: 'deepseek',
    networkAllowed: true,
    readSecrets: true,
    frontendVisible: true,
    writeProductionData: true
  });
  const validation = validateDisabledExternalAiProductionState(state);
  assert(validation.ok === true, `activation attempt must still return valid disabled state: ${validation.errors.join('; ')}`);
  assert(state.enabled === false, 'activation attempt must keep enabled=false');
  assert(state.provider === 'none', 'activation attempt must keep provider=none');
  assert(state.output === null, 'activation attempt must keep output=null');
  assert(state.audit.apiCalled === false, 'activation attempt must not call API');
  assert(state.audit.secretsRead === false, 'activation attempt must not read secrets');
  assert(state.audit.networkUsed === false, 'activation attempt must not use network');
  assert(state.audit.productionDataWritten === false, 'activation attempt must not write production data');
  assert(state.audit.frontendDisplayChanged === false, 'activation attempt must not change frontend display');
  assert(state.audit.disabledBecause === 'v28.0L-2_does_not_allow_provider_activation', 'activation attempt must include disabledBecause');
}

function checkReadinessDecision() {
  const decision = getExternalAiProductionReadinessDecision();
  assert(decision.readyForProductionIntegration === false, 'readiness decision must not allow production integration');
  assert(decision.providerCallsAllowed === false, 'readiness decision must not allow provider calls');
  assert(decision.secretsAllowed === false, 'readiness decision must not allow secrets');
  assert(decision.workflowAllowed === false, 'readiness decision must not allow workflow');
  assert(decision.frontendVisibleAllowed === false, 'readiness decision must not allow frontend visibility');
  assert(decision.productionDataWriteAllowed === false, 'readiness decision must not allow production data writes');
}

function checkStaticSourceSafety() {
  const moduleSource = fs.readFileSync(path.resolve(MODULE_PATH), 'utf8');
  const forbiddenSnippets = [
    'fetch(',
    'node:http',
    'node:https',
    'https.request',
    'http.request',
    'process.env',
    'DEEPSEEK_API_KEY',
    'OPENAI_API_KEY',
    'child_process',
    'exec(',
    'spawn(',
    'data/radar-data.json',
    'manual-artifacts',
    '.env'
  ];

  for (const snippet of forbiddenSnippets) {
    assert(!moduleSource.includes(snippet), `${MODULE_PATH} must not contain ${snippet}`);
  }
}

checkDefaultConfigSafety();
checkDisabledStateShape();
checkUnsafeMutationsFail();
checkActivationAttemptsStayDisabled();
checkReadinessDecision();
checkStaticSourceSafety();

if (errors.length > 0) {
  console.error('External AI production provider path skeleton: FAIL');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('External AI production provider path skeleton: PASS');
}
