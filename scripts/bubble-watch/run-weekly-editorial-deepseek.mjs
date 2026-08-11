import fs from 'node:fs/promises';
import process from 'node:process';

import { assertManualArtifactWritePath, shortHash, writeJson } from '../lib/check-script-helpers.mjs';
import {
  WEEKLY_EDITORIAL_PROVIDER_CONFIG,
  classifyProviderFailure,
  requestWeeklyEditorial
} from './weekly-editorial-provider.mjs';

const ARTIFACT_PREFIX = 'manual-artifacts/bubble-watch-weekly-editorial/';
const DEFAULT_INPUT = `${ARTIFACT_PREFIX}editorial-input-latest.json`;
const DEFAULT_OUTPUT = `${ARTIFACT_PREFIX}deepseek-output-latest.json`;
const DEFAULT_FAILURE = `${ARTIFACT_PREFIX}deepseek-failure-latest.json`;

function parseArgs(argv) {
  const options = { input: DEFAULT_INPUT, output: DEFAULT_OUTPUT, failureOutput: DEFAULT_FAILURE, allowNetwork: false };
  const pathFlags = new Map([
    ['--input', 'input'],
    ['--output', 'output'],
    ['--failure-output', 'failureOutput']
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const inline = [...pathFlags.keys()].find((flag) => arg.startsWith(`${flag}=`));
    if (inline) options[pathFlags.get(inline)] = arg.slice(inline.length + 1);
    else if (pathFlags.has(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`missing value for ${arg}`);
      options[pathFlags.get(arg)] = value;
      index += 1;
    } else if (arg === '--allow-network') options.allowNetwork = true;
    else throw new Error(`unsupported argument: ${arg}`);
  }
  return options;
}

function safeMessage(error) {
  if (/^DeepSeek HTTP \d{3}$/u.test(error?.message || '')) return error.message;
  if (/^(?:DEEPSEEK_API_KEY is required|weekly editorial prompt contract missing)/u.test(error?.message || '')) return error.message;
  if (['invalid_provider_json', 'provider_response_envelope_invalid', 'provider_output_contract_invalid'].includes(error?.category)) return error.message;
  return 'weekly_editorial_provider_failed';
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  assertManualArtifactWritePath(options.output, ARTIFACT_PREFIX);
  assertManualArtifactWritePath(options.failureOutput, ARTIFACT_PREFIX);
  if (!options.allowNetwork) throw new Error('DeepSeek weekly editorial requires --allow-network');
  const inputRaw = await fs.readFile(options.input, 'utf8');
  const input = JSON.parse(inputRaw);
  const apiKey = String(process.env.DEEPSEEK_API_KEY || '').trim();

  try {
    const result = await requestWeeklyEditorial({ input, apiKey });
    writeJson(options.output, result.output);
    console.log(`Bubble Watch DeepSeek weekly editorial PASS (apiCallCount=${result.diagnostics.apiCallCount}, retryCount=0, model=${result.diagnostics.model}, output=${options.output})`);
  } catch (error) {
    const classification = classifyProviderFailure(error);
    const failureArtifact = {
      schemaVersion: 'bubble-watch-weekly-editorial-provider-failure-v1',
      generatedAt: new Date().toISOString(),
      status: 'failed',
      provider: 'deepseek',
      model: WEEKLY_EDITORIAL_PROVIDER_CONFIG.model,
      message: safeMessage(error),
      failureClassification: classification,
      requestDiagnostics: {
        inputBytes: Buffer.byteLength(inputRaw),
        inputDigestShort: shortHash(input, 16),
        timeoutMs: WEEKLY_EDITORIAL_PROVIDER_CONFIG.timeoutMs,
        maxTokens: WEEKLY_EDITORIAL_PROVIDER_CONFIG.maxTokens,
        apiCallLimit: 1,
        retryCount: 0,
        response: error.responseDiagnostics || null
      },
      productionImpact: {
        outputWritten: false,
        productionDataWritten: false,
        frontendChanged: false,
        affectsBubbleWatchScoring: false,
        affectsGfrrScoring: false
      }
    };
    writeJson(options.failureOutput, failureArtifact);
    throw new Error(`${classification.category}; sanitized failure artifact=${options.failureOutput}`);
  }
}

main().catch((error) => {
  console.error(`Bubble Watch DeepSeek weekly editorial failed: ${error.message}`);
  process.exitCode = 1;
});
