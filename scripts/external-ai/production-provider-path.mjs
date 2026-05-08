export const DEFAULT_EXTERNAL_AI_PRODUCTION_CONFIG = Object.freeze({
  enabled: false,
  provider: 'none',
  dailyEnabled: false,
  frontendVisible: false,
  requireQualityReview: true,
  maxDailyCalls: 1,
  allowManualOverride: false,
  networkAllowed: false,
  readSecrets: false,
  writeProductionData: false
});

const CONTRACT_VERSION = 'v28.0L-2';
const DISABLED_BECAUSE = 'v28.0L-2_does_not_allow_provider_activation';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasActivationAttempt(config) {
  return (
    config?.enabled === true ||
    (config?.provider !== undefined && config.provider !== 'none') ||
    config?.networkAllowed === true ||
    config?.readSecrets === true ||
    config?.writeProductionData === true ||
    config?.frontendVisible === true ||
    config?.dailyEnabled === true
  );
}

function createInputDigest(options) {
  const extraInputDigest = isPlainObject(options.inputDigest) ? options.inputDigest : {};
  return {
    ...extraInputDigest,
    siteStructuredDataOnly: true,
    usesPrivateUserData: false,
    usesSecrets: false,
    usesExternalMarketData: false
  };
}

export function createDisabledExternalAiProductionState(options = {}) {
  const state = {
    contractVersion: CONTRACT_VERSION,
    enabled: false,
    status: 'disabled',
    provider: 'none',
    model: null,
    mode: 'production_provider_path_disabled_skeleton',
    output: null,
    frontendVisible: false,
    inputDigest: createInputDigest(options),
    providerMetadata: {
      provider: 'none',
      model: null,
      endpointType: 'disabled',
      sourceStatus: 'disabled',
      networkAllowed: false,
      apiKeyRequired: false,
      apiKeyRead: false,
      externalAiGenerated: false,
      usesExternalAiApi: false
    },
    validation: {
      outputValidated: false,
      validator: 'check-external-ai-output',
      status: 'not_applicable'
    },
    qualityReview: {
      required: true,
      status: 'not_applicable',
      promotionEligible: false
    },
    failureClassification: null,
    fallback: {
      used: true,
      fallbackLayer: 'aiInterpretationLayer',
      reason: 'external_ai_production_provider_path_disabled'
    },
    boundaries: {
      displayOnly: true,
      affectsScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false,
      notInvestmentAdvice: true
    },
    productionImpact: {
      writesProductionData: false,
      modifiesFrontend: false,
      affectsScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false
    },
    audit: {
      apiCalled: false,
      secretsRead: false,
      networkUsed: false,
      productionDataWritten: false,
      frontendDisplayChanged: false,
      createdBy: 'disabled_production_provider_path_skeleton'
    }
  };

  if (typeof options.generatedAt === 'string' && options.generatedAt.length > 0) {
    state.generatedAt = options.generatedAt;
  }

  if (typeof options.sourceReference === 'string' && options.sourceReference.length > 0) {
    state.audit.sourceReference = options.sourceReference;
  }

  if (typeof options.disabledBecause === 'string' && options.disabledBecause.length > 0) {
    state.audit.disabledBecause = options.disabledBecause;
  }

  return state;
}

function expectValue(errors, label, actual, expected) {
  if (actual !== expected) {
    errors.push(`${label} must be ${String(expected)}`);
  }
}

function expectAllProductionImpactFalse(state, errors) {
  const impact = isPlainObject(state?.productionImpact) ? state.productionImpact : {};
  for (const field of [
    'writesProductionData',
    'modifiesFrontend',
    'affectsScoring',
    'affectsDecisionModel',
    'affectsExecutionLock',
    'affectsPositionGuidance'
  ]) {
    expectValue(errors, `productionImpact.${field}`, impact[field], false);
  }
}

export function validateDisabledExternalAiProductionState(state) {
  const errors = [];
  expectValue(errors, 'enabled', state?.enabled, false);
  expectValue(errors, 'status', state?.status, 'disabled');
  expectValue(errors, 'provider', state?.provider, 'none');
  expectValue(errors, 'output', state?.output, null);
  expectValue(errors, 'frontendVisible', state?.frontendVisible, false);
  expectValue(errors, 'providerMetadata.networkAllowed', state?.providerMetadata?.networkAllowed, false);
  expectValue(errors, 'providerMetadata.apiKeyRead', state?.providerMetadata?.apiKeyRead, false);
  expectValue(errors, 'providerMetadata.externalAiGenerated', state?.providerMetadata?.externalAiGenerated, false);
  expectValue(errors, 'providerMetadata.usesExternalAiApi', state?.providerMetadata?.usesExternalAiApi, false);
  expectValue(errors, 'inputDigest.usesPrivateUserData', state?.inputDigest?.usesPrivateUserData, false);
  expectValue(errors, 'inputDigest.usesSecrets', state?.inputDigest?.usesSecrets, false);
  expectValue(errors, 'boundaries.affectsScoring', state?.boundaries?.affectsScoring, false);
  expectValue(errors, 'boundaries.affectsDecisionModel', state?.boundaries?.affectsDecisionModel, false);
  expectValue(errors, 'boundaries.affectsExecutionLock', state?.boundaries?.affectsExecutionLock, false);
  expectValue(errors, 'boundaries.affectsPositionGuidance', state?.boundaries?.affectsPositionGuidance, false);
  expectAllProductionImpactFalse(state, errors);
  expectValue(errors, 'audit.apiCalled', state?.audit?.apiCalled, false);
  expectValue(errors, 'audit.secretsRead', state?.audit?.secretsRead, false);
  expectValue(errors, 'audit.networkUsed', state?.audit?.networkUsed, false);
  expectValue(errors, 'audit.productionDataWritten', state?.audit?.productionDataWritten, false);
  expectValue(errors, 'audit.frontendDisplayChanged', state?.audit?.frontendDisplayChanged, false);
  expectValue(errors, 'qualityReview.promotionEligible', state?.qualityReview?.promotionEligible, false);

  return {
    ok: errors.length === 0,
    errors
  };
}

export function getExternalAiProductionReadinessDecision() {
  return {
    readyForProductionIntegration: false,
    allowedNextStage: 'v28.0L-3 manual workflow_dispatch artifact-only design',
    currentStage: 'v28.0L-2 disabled production provider path skeleton',
    providerCallsAllowed: false,
    secretsAllowed: false,
    workflowAllowed: false,
    frontendVisibleAllowed: false,
    productionDataWriteAllowed: false
  };
}

export function maybeCreateExternalAiProductionLayer(config = DEFAULT_EXTERNAL_AI_PRODUCTION_CONFIG) {
  const disabledBecause = hasActivationAttempt(config) ? DISABLED_BECAUSE : undefined;
  return createDisabledExternalAiProductionState({ disabledBecause });
}
