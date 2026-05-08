import assert from 'node:assert/strict';
import {
  assertManualProviderAllowed,
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
  const readyDeepSeekMetadata = getExternalAiProviderMetadata('deepseek', null, {
    allowNetwork: true,
    apiKeyAvailable: true
  });
  assert.equal(readyDeepSeekMetadata.endpointType, 'chat_completions');
  assert.equal(readyDeepSeekMetadata.sourceStatus, 'manual_api_test');
  assert.equal(readyDeepSeekMetadata.networkAllowed, true);
  assert.equal(readyDeepSeekMetadata.apiKeyRequired, true);
  assert.equal(readyDeepSeekMetadata.apiKeyRead, true);
  assert.equal(readyDeepSeekMetadata.usesExternalAiApi, true);
  assert.equal(readyDeepSeekMetadata.externalAiGenerated, false);
  assert.equal(
    getExternalAiProviderMetadata('deepseek', null, {
      allowNetwork: true,
      apiKeyAvailable: true,
      outputValidated: true
    }).externalAiGenerated,
    true
  );

  assert.doesNotThrow(() => assertProviderDisabled('none'));
  assert.throws(() => assertProviderDisabled('deepseek'), /only allows explicit DeepSeek manual artifact tests/);
  assert.throws(() => assertProviderDisabled('openai'), /only allows explicit DeepSeek manual artifact tests/);
  assert.doesNotThrow(() => assertManualProviderAllowed('none'));
  assert.throws(() => assertManualProviderAllowed('deepseek'), /requires --allow-network/);
  assert.throws(
    () => assertManualProviderAllowed('deepseek', { allowNetwork: true }),
    /requires DEEPSEEK_API_KEY/
  );
  assert.doesNotThrow(() => assertManualProviderAllowed('deepseek', {
    allowNetwork: true,
    apiKeyAvailable: true
  }));
  assert.throws(() => assertManualProviderAllowed('openai', {
    allowNetwork: true,
    apiKeyAvailable: true
  }), /OpenAI manual tests are not supported/);

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
  await assert.rejects(() => deepseekAdapter.runManualTest(), /requires --allow-network/);
  const readyDeepseekAdapter = createExternalAiProviderAdapter({
    provider: 'deepseek',
    allowNetwork: true,
    apiKeyAvailable: true
  });
  const readyDeepseekResult = await readyDeepseekAdapter.runManualTest();
  assert.equal(readyDeepseekResult.kind, 'external_ai_provider_manual_ready_result');
  assert.equal(readyDeepseekResult.provider, 'deepseek');
  assert.equal(readyDeepseekResult.networkAllowed, true);
  assert.equal(readyDeepseekResult.apiCalled, false);
  assert.equal(readyDeepseekResult.secretsRead, false);
  assertNotProviderOutput(readyDeepseekResult);

  const openaiAdapter = createExternalAiProviderAdapter({ provider: 'openai' });
  await assert.rejects(() => openaiAdapter.runManualTest(), /OpenAI manual tests are not supported/);

  console.log('External AI provider adapter skeleton: PASS');
}

await run();
