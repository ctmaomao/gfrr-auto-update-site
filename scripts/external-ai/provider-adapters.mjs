const CONTRACT_VERSION = 'v28.0K-4D';
const SUPPORTED_PROVIDERS = new Set(['none', 'deepseek', 'openai']);
const DISABLED_PROVIDER_MESSAGE = 'v28.0K-4D only allows explicit DeepSeek manual artifact tests. This provider is disabled.';
export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash';
export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
export const DEEPSEEK_CHAT_ENDPOINT = '/chat/completions';

export function normalizeExternalAiProvider(value) {
  if (value === undefined || value === null) return 'none';
  const normalized = String(value).trim().toLowerCase();
  if (normalized === '') return 'none';
  if (SUPPORTED_PROVIDERS.has(normalized)) return normalized;
  throw new Error(`unsupported external AI provider: ${value}`);
}

export function getExternalAiProviderMetadata(providerValue, modelValue = null, options = {}) {
  const provider = normalizeExternalAiProvider(providerValue);
  const model = typeof modelValue === 'string' && modelValue.trim()
    ? modelValue.trim()
    : provider === 'deepseek'
      ? DEFAULT_DEEPSEEK_MODEL
      : null;
  const allowNetwork = options.allowNetwork === true;
  const apiKeyAvailable = options.apiKeyAvailable === true;
  const outputValidated = options.outputValidated === true;
  const deepseekReady = provider === 'deepseek' && allowNetwork && apiKeyAvailable;

  return {
    provider,
    model,
    endpointType: deepseekReady ? 'chat_completions' : 'disabled',
    sourceStatus: deepseekReady ? 'manual_api_test' : 'disabled',
    networkAllowed: deepseekReady,
    apiKeyRequired: provider === 'deepseek',
    apiKeyRead: provider === 'deepseek' && apiKeyAvailable,
    externalAiGenerated: provider === 'deepseek' && outputValidated,
    usesExternalAiApi: deepseekReady
  };
}

export function assertProviderDisabled(providerValue) {
  const provider = normalizeExternalAiProvider(providerValue);
  if (provider === 'none') return;
  throw new Error(DISABLED_PROVIDER_MESSAGE);
}

export function assertManualProviderAllowed(providerValue, options = {}) {
  const provider = normalizeExternalAiProvider(providerValue);
  if (provider === 'none') return;
  if (provider === 'openai') {
    throw new Error('OpenAI manual tests are not supported in v28.0K-4D.');
  }
  if (provider === 'deepseek' && options.allowNetwork !== true) {
    throw new Error('DeepSeek manual test requires --allow-network.');
  }
  if (provider === 'deepseek' && options.apiKeyAvailable !== true) {
    throw new Error('DeepSeek manual test requires DEEPSEEK_API_KEY.');
  }
}

export function buildDisabledProviderResult(providerValue, modelValue = null) {
  const metadata = getExternalAiProviderMetadata(providerValue, modelValue);
  return {
    kind: 'external_ai_provider_disabled_result',
    contractVersion: CONTRACT_VERSION,
    provider: metadata.provider,
    model: metadata.model,
    status: metadata.provider === 'none' ? 'disabled_noop' : 'disabled',
    networkAllowed: false,
    apiCalled: false,
    secretsRead: false,
    output: null,
    reasonZh: 'v28.0K-4C 仅提供 provider adapter 骨架，不调用外部 AI API。'
  };
}

export function buildManualProviderReadyResult(providerValue, modelValue = null, options = {}) {
  const metadata = getExternalAiProviderMetadata(providerValue, modelValue, options);
  return {
    kind: 'external_ai_provider_manual_ready_result',
    contractVersion: CONTRACT_VERSION,
    provider: metadata.provider,
    model: metadata.model,
    status: 'manual_ready',
    networkAllowed: metadata.networkAllowed,
    apiCalled: false,
    secretsRead: false,
    output: null,
    reasonZh: 'v28.0K-4D 仅允许显式 DeepSeek manual artifact test；输出必须通过 validator 后才能保留为 artifact。'
  };
}

export function createExternalAiProviderAdapter(options = {}) {
  const provider = normalizeExternalAiProvider(options.provider);
  const metadata = getExternalAiProviderMetadata(provider, options.model, options);
  return {
    provider,
    model: metadata.model,
    metadata,
    async runManualTest() {
      if (provider !== 'none') {
        assertManualProviderAllowed(provider, options);
        return buildManualProviderReadyResult(provider, metadata.model, options);
      }
      return buildDisabledProviderResult(provider, metadata.model);
    }
  };
}
