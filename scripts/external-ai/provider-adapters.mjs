const CONTRACT_VERSION = 'v28.0K-4C';
const SUPPORTED_PROVIDERS = new Set(['none', 'deepseek', 'openai']);
const DISABLED_PROVIDER_MESSAGE = 'v28.0K-4C provider adapters are disabled. Real provider calls require a later reviewed PR.';

export function normalizeExternalAiProvider(value) {
  if (value === undefined || value === null) return 'none';
  const normalized = String(value).trim().toLowerCase();
  if (normalized === '') return 'none';
  if (SUPPORTED_PROVIDERS.has(normalized)) return normalized;
  throw new Error(`unsupported external AI provider: ${value}`);
}

export function getExternalAiProviderMetadata(providerValue, modelValue = null) {
  const provider = normalizeExternalAiProvider(providerValue);
  const model = typeof modelValue === 'string' && modelValue.trim() ? modelValue.trim() : null;
  return {
    provider,
    model,
    endpointType: 'disabled',
    sourceStatus: 'disabled',
    networkAllowed: false,
    apiKeyRequired: false,
    apiKeyRead: false,
    externalAiGenerated: false,
    usesExternalAiApi: false
  };
}

export function assertProviderDisabled(providerValue) {
  const provider = normalizeExternalAiProvider(providerValue);
  if (provider === 'none') return;
  throw new Error(DISABLED_PROVIDER_MESSAGE);
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

export function createExternalAiProviderAdapter(options = {}) {
  const provider = normalizeExternalAiProvider(options.provider);
  const metadata = getExternalAiProviderMetadata(provider, options.model);
  return {
    provider,
    model: metadata.model,
    metadata,
    async runManualTest() {
      assertProviderDisabled(provider);
      return buildDisabledProviderResult(provider, metadata.model);
    }
  };
}
