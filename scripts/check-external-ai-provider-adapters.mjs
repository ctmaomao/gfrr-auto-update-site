import assert from 'node:assert/strict';
import {
  assertProviderDisabled,
  buildDisabledProviderResult,
  createExternalAiProviderAdapter,
  getExternalAiProviderMetadata,
  normalizeExternalAiProvider
} from './external-ai/provider-adapters.mjs';

function assertDisabledMetadata(metadata) {
  assert.equal(metadata.networkAllowed, false);
  assert.equal(metadata.apiKeyRead, false);
  assert.equal(metadata.usesExternalAiApi, false);
  assert.equal(metadata.externalAiGenerated, false);
  assert.equal(metadata.endpointType, 'disabled');
  assert.equal(metadata.sourceStatus, 'disabled');
}

function assertNotProviderOutput(result) {
  assert.equal(Object.hasOwn(result, 'facts'), false);
  assert.equal(Object.hasOwn(result, 'inferences'), false);
  assert.equal(Object.hasOwn(result, 'modelJudgments'), false);
  assert.equal(Object.hasOwn(result, 'scenarioHypotheses'), false);
  assert.equal(result.output, null);
  assert.equal(result.apiCalled, false);
  assert.equal(result.secretsRead, false);
}

async function run() {
  assert.equal(normalizeExternalAiProvider(), 'none');
  assert.equal(normalizeExternalAiProvider(null), 'none');
  assert.equal(normalizeExternalAiProvider(''), 'none');
  assert.equal(normalizeExternalAiProvider('none'), 'none');
  assert.equal(normalizeExternalAiProvider('deepseek'), 'deepseek');
  assert.equal(normalizeExternalAiProvider('openai'), 'openai');
  assert.throws(() => normalizeExternalAiProvider('bad-provider'), /unsupported external AI provider/);

  assertDisabledMetadata(getExternalAiProviderMetadata('none'));
  assertDisabledMetadata(getExternalAiProviderMetadata('deepseek'));
  assertDisabledMetadata(getExternalAiProviderMetadata('openai'));

  assert.doesNotThrow(() => assertProviderDisabled('none'));
  assert.throws(() => assertProviderDisabled('deepseek'), /provider adapters are disabled/);
  assert.throws(() => assertProviderDisabled('openai'), /provider adapters are disabled/);

  const noneAdapter = createExternalAiProviderAdapter({ provider: 'none' });
  assert.equal(noneAdapter.provider, 'none');
  const noneResult = await noneAdapter.runManualTest();
  assert.equal(noneResult.kind, 'external_ai_provider_disabled_result');
  assert.equal(noneResult.status, 'disabled_noop');
  assertNotProviderOutput(noneResult);

  const disabledResult = buildDisabledProviderResult('deepseek', 'placeholder-model');
  assert.equal(disabledResult.provider, 'deepseek');
  assert.equal(disabledResult.model, 'placeholder-model');
  assert.equal(disabledResult.status, 'disabled');
  assertNotProviderOutput(disabledResult);

  const deepseekAdapter = createExternalAiProviderAdapter({ provider: 'deepseek' });
  await assert.rejects(() => deepseekAdapter.runManualTest(), /provider adapters are disabled/);

  const openaiAdapter = createExternalAiProviderAdapter({ provider: 'openai' });
  await assert.rejects(() => openaiAdapter.runManualTest(), /provider adapters are disabled/);

  console.log('External AI provider adapter skeleton: PASS');
}

await run();
