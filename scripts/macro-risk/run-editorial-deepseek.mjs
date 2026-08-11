import fs from 'node:fs/promises';
import process from 'node:process';

import { assertManualArtifactWritePath, shortHash, writeJson } from '../lib/check-script-helpers.mjs';
import { EDITORIAL_PROVIDER_CONFIG, classifyProviderFailure, requestEditorial } from './editorial-provider.mjs';

const PREFIX = 'manual-artifacts/macro-risk-editorial/';

function parseArgs(argv) {
  const options = { input: `${PREFIX}editorial-input-latest.json`, output: `${PREFIX}deepseek-output-latest.json`, failureOutput: `${PREFIX}deepseek-failure-latest.json`, allowNetwork: false };
  const flags = new Map([['--input', 'input'], ['--output', 'output'], ['--failure-output', 'failureOutput']]);
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--allow-network') options.allowNetwork = true;
    else if (flags.has(flag)) options[flags.get(flag)] = argv[++index];
    else throw new Error(`unsupported argument: ${flag}`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  assertManualArtifactWritePath(options.output, PREFIX);
  assertManualArtifactWritePath(options.failureOutput, PREFIX);
  if (!options.allowNetwork) throw new Error('DeepSeek macro risk editorial requires --allow-network');
  const inputRaw = await fs.readFile(options.input, 'utf8');
  const input = JSON.parse(inputRaw);
  try {
    const result = await requestEditorial({ input, apiKey: String(process.env.DEEPSEEK_API_KEY || '').trim() });
    writeJson(options.output, result.output);
    console.log(`Macro risk DeepSeek editorial PASS (apiCallCount=${result.diagnostics.apiCallCount}, retryCount=0, model=${result.diagnostics.model}, output=${options.output})`);
  } catch (error) {
    const failureClassification = classifyProviderFailure(error);
    writeJson(options.failureOutput, {
      schemaVersion: 'macro-risk-editorial-provider-failure-v1', generatedAt: new Date().toISOString(), status: 'failed', provider: 'deepseek', model: EDITORIAL_PROVIDER_CONFIG.model,
      message: ['invalid_provider_json', 'provider_response_envelope_invalid', 'provider_output_contract_invalid'].includes(error?.category) ? error.message : 'macro_risk_editorial_provider_failed',
      failureClassification,
      requestDiagnostics: { inputBytes: Buffer.byteLength(inputRaw), inputDigestShort: shortHash(input, 16), timeoutMs: EDITORIAL_PROVIDER_CONFIG.timeoutMs, maxTokens: EDITORIAL_PROVIDER_CONFIG.maxTokens, apiCallLimit: 1, retryCount: 0, response: error.responseDiagnostics || null },
      productionImpact: { outputWritten: false, productionDataWritten: false, frontendChanged: false, affectsGfrrScoring: false, affectsDecisionModel: false }
    });
    throw new Error(`${failureClassification.category}; sanitized failure artifact=${options.failureOutput}`);
  }
}

main().catch((error) => { console.error(`Macro risk DeepSeek editorial failed: ${error.message}`); process.exitCode = 1; });
