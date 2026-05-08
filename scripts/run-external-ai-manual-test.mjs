import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  DEFAULT_DEEPSEEK_MODEL,
  DEEPSEEK_BASE_URL,
  DEEPSEEK_CHAT_ENDPOINT,
  assertManualProviderAllowed,
  createExternalAiProviderAdapter,
  normalizeExternalAiProvider
} from './external-ai/provider-adapters.mjs';

const CONTRACT_VERSION = 'v28.0K-4D';
const DEFAULT_INPUT = 'docs/fixtures/external-ai/sample-input-v28.0K-1.json';
const DEFAULT_DEEPSEEK_TIMEOUT_MS = 90000;
const MAX_DEEPSEEK_TIMEOUT_MS = 180000;
const UNSAFE_OUTPUT_DIRS = [
  'data',
  'realtime',
  'config',
  'workers',
  'scripts/modules',
  '.github/workflows'
];
const UNSAFE_OUTPUT_FILES = new Set([
  'index.html',
  'scripts/app.js'
]);

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    input: DEFAULT_INPUT,
    provider: 'none',
    model: null,
    output: null,
    allowNetwork: false,
    validateOutput: false,
    timeoutMs: DEFAULT_DEEPSEEK_TIMEOUT_MS
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`missing value for ${arg}`);
      index += 1;
      return value;
    };

    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--input') {
      options.input = nextValue();
    } else if (arg.startsWith('--input=')) {
      options.input = arg.slice('--input='.length);
    } else if (arg === '--provider') {
      options.provider = nextValue();
    } else if (arg.startsWith('--provider=')) {
      options.provider = arg.slice('--provider='.length);
    } else if (arg === '--model') {
      options.model = nextValue();
    } else if (arg.startsWith('--model=')) {
      options.model = arg.slice('--model='.length);
    } else if (arg === '--output') {
      options.output = nextValue();
    } else if (arg.startsWith('--output=')) {
      options.output = arg.slice('--output='.length);
    } else if (arg === '--allow-network') {
      options.allowNetwork = true;
    } else if (arg === '--validate-output') {
      options.validateOutput = true;
    } else if (arg === '--timeout-ms') {
      options.timeoutMs = parseTimeoutMs(nextValue());
    } else if (arg.startsWith('--timeout-ms=')) {
      options.timeoutMs = parseTimeoutMs(arg.slice('--timeout-ms='.length));
    } else {
      throw new Error(`unsupported argument: ${arg}`);
    }
  }

  return options;
}

function parseTimeoutMs(value) {
  if (!/^\d+$/.test(value)) throw new Error(`invalid --timeout-ms value: ${value}`);
  const timeoutMs = Number(value);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error(`invalid --timeout-ms value: ${value}`);
  if (timeoutMs > MAX_DEEPSEEK_TIMEOUT_MS) {
    throw new Error(`--timeout-ms must be <= ${MAX_DEEPSEEK_TIMEOUT_MS}`);
  }
  return timeoutMs;
}

function assert(condition, errors, message) {
  if (!condition) errors.push(message);
}

function getPath(value, pathParts) {
  return pathParts.reduce((current, key) => (current && Object.hasOwn(current, key) ? current[key] : undefined), value);
}

function validateInput(input) {
  const errors = [];

  assert(typeof input.inputVersion === 'string' && input.inputVersion.length > 0, errors, 'inputVersion must be a non-empty string');
  assert(typeof input.generatedAt === 'string' && input.generatedAt.length > 0, errors, 'generatedAt must be a non-empty string');
  assert(input.siteData && typeof input.siteData === 'object', errors, 'siteData must be an object');

  for (const field of [
    'dailyBrief',
    'divergenceLayer',
    'brentPricingLayer',
    'aiInterpretationLayer',
    'dataHealth',
    'decisionContext'
  ]) {
    assert(Boolean(getPath(input, ['siteData', field])), errors, `siteData.${field} is required`);
  }

  assert(Boolean(getPath(input, ['siteData', 'macroDrivers', 'consumer'])), errors, 'siteData.macroDrivers.consumer is required');

  const boundaries = input.boundaries || {};
  assert(boundaries.siteStructuredDataOnly === true, errors, 'boundaries.siteStructuredDataOnly must be true');
  assert(boundaries.noExternalMarketData === true, errors, 'boundaries.noExternalMarketData must be true');
  assert(boundaries.noPrivateUserData === true, errors, 'boundaries.noPrivateUserData must be true');
  assert(boundaries.noSecrets === true, errors, 'boundaries.noSecrets must be true');
  assert(boundaries.readOnlyContext === true, errors, 'boundaries.readOnlyContext must be true');

  return errors;
}

function collectLayersAvailable(input) {
  const layers = [];
  const siteData = input.siteData || {};
  for (const field of ['dailyBrief', 'divergenceLayer', 'brentPricingLayer', 'aiInterpretationLayer', 'dataHealth', 'decisionContext']) {
    if (siteData[field]) layers.push(field);
  }
  if (siteData.macroDrivers?.consumer) layers.push('macroDrivers.consumer');
  return layers;
}

function isUnsafeOutputPath(outputPath) {
  const absoluteOutput = path.resolve(outputPath);
  const cwd = process.cwd();
  const relative = path.relative(cwd, absoluteOutput);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return false;

  const normalizedRelative = relative.split(path.sep).join('/');
  return (
    UNSAFE_OUTPUT_FILES.has(normalizedRelative) ||
    UNSAFE_OUTPUT_DIRS.some((unsafeDir) => normalizedRelative === unsafeDir || normalizedRelative.startsWith(`${unsafeDir}/`))
  );
}

async function writeOutputFile(outputPath, text) {
  if (isUnsafeOutputPath(outputPath)) {
    throw new Error(`unsafe output path rejected: ${outputPath}`);
  }
  await fs.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
  await fs.writeFile(outputPath, text, 'utf8');
}

function buildDeepSeekSystemPrompt() {
  return [
    'You are a display-only external AI explanation layer for Global Financial Risk Radar manual testing.',
    'Use only the provided structured JSON input. Do not browse. Do not invent market data. Do not claim independent sources.',
    'Return valid JSON only.',
    'The entire response must be one JSON object.',
    'Return strict JSON only, with no markdown fences and no explanatory prose outside JSON.',
    'Do not output markdown.',
    'Do not output explanation outside JSON.',
    'User-facing text must be Chinese, professional, restrained, and non-sensational.',
    'Separate facts, inferences, modelJudgments, scenarioHypotheses, dataGaps, invalidationSignals, sourceAttribution, auditFlags, confidence, and boundaries.',
    'Do not provide investment advice, trading instructions, deterministic crisis claims, war probability, or world-war predictions.',
    'Do not put 投资建议, 交易建议, 买入, 卖出, 加仓, 减仓, 执行, or 仓位 in auditFlags.',
    'Express safety boundaries only through boundaries.notInvestmentAdvice=true and the other boolean boundaries.',
    'auditFlags must contain short neutral diagnostic tags only, not prose sentences.',
    'Allowed auditFlags vocabulary includes manual_artifact_only, sample_input_only, site_structured_data_only, validator_required, non_production_output, and no_frontend_display.',
    'sourceAttribution must be an array of objects, not a string and not an array of strings.',
    'Each sourceAttribution object must include sourceLayer, field, claimType, and noteZh.',
    'Each sourceAttribution.noteZh must include validator-recognized attribution wording: 样例结构化输入, 站内结构化数据, or sample input.',
    'For sample fixture based outputs, use noteZh: 来自提供的样例结构化输入.',
    'Do not use only 来自提供的结构化输入 because it may not satisfy validator attribution keyword detection.',
    'Keep claimType as one of site_structured_data, rule_based_interpretation, or sample_input.',
    'Every factual claim should map to one provided structured input layer: dailyBrief, divergenceLayer, brentPricingLayer, macroDrivers.consumer, aiInterpretationLayer, dataHealth, or decisionContext.',
    'Do not claim external web, news, or market verification.',
    'generatedAt must be an ISO timestamp and is artifact metadata only. If you cannot know current time, use the input generatedAt; do not invent a market-data timestamp.',
    'Do not affect scoring, decisionModel, executionLock, positionGuidance, execution, or position.',
    'The JSON must match the external AI output contract and include boundaries.displayOnly=true, boundaries.externalAiGenerated=true, boundaries.usesExternalAiApi=true, boundaries.affectsScoring=false, boundaries.affectsDecisionModel=false, boundaries.affectsExecutionLock=false, boundaries.affectsPositionGuidance=false, boundaries.notInvestmentAdvice=true.',
    'If unsure, still return a JSON object using dataGaps and low confidence.',
    'If evidence is insufficient, state 数据不足 or 暂不足以判断.'
  ].join('\n');
}

function buildDeepSeekUserPrompt(input) {
  return [
    'Return a JSON object with this shape:',
    JSON.stringify({
      contractVersion: 'v28.0K-4D-manual',
      generatedAt: 'ISO string',
      provider: 'deepseek',
      model: DEFAULT_DEEPSEEK_MODEL,
      mode: 'external_ai_manual_artifact_test',
      summaryZh: 'string',
      facts: [],
      inferences: [],
      modelJudgments: [],
      scenarioHypotheses: [
        {
          titleZh: 'string',
          triggerConditions: [],
          invalidationConditions: []
        }
      ],
      dataGaps: [],
      invalidationSignals: [],
      sourceAttribution: [
        {
          sourceLayer: 'dailyBrief',
          field: 'macroState',
          claimType: 'sample_input',
          noteZh: '来自提供的样例结构化输入'
        }
      ],
      auditFlags: [
        'manual_artifact_only',
        'sample_input_only',
        'site_structured_data_only',
        'validator_required',
        'non_production_output'
      ],
      confidence: {
        level: 'low',
        score: 0,
        reasonZh: 'string'
      },
      boundaries: {
        displayOnly: true,
        externalAiGenerated: true,
        usesExternalAiApi: true,
        affectsScoring: false,
        affectsDecisionModel: false,
        affectsExecutionLock: false,
        affectsPositionGuidance: false,
        notInvestmentAdvice: true
      }
    }, null, 2),
    'generatedAt requirements:',
    '- generatedAt must be an ISO timestamp.',
    '- If current time is unavailable, use the input generatedAt.',
    '- Do not invent a market-data timestamp; generatedAt is artifact metadata only.',
    'auditFlags requirements:',
    '- Use only short neutral diagnostic tags such as manual_artifact_only, sample_input_only, site_structured_data_only, validator_required, non_production_output, and no_frontend_display.',
    '- Do not use prose sentences in auditFlags.',
    '- Do not put 投资建议, 交易建议, 买入, 卖出, 加仓, 减仓, 执行, or 仓位 in auditFlags.',
    '- Express safety boundaries only through boundaries.notInvestmentAdvice=true and other boolean boundaries.',
    'sourceAttribution requirements:',
    '- sourceAttribution must be an array of objects, never a string and never an array of strings.',
    '- Each object must include sourceLayer, field, claimType, and noteZh.',
    '- sourceLayer must be one of dailyBrief, divergenceLayer, brentPricingLayer, macroDrivers.consumer, aiInterpretationLayer, dataHealth, or decisionContext.',
    '- claimType must be one of site_structured_data, rule_based_interpretation, or sample_input.',
    '- noteZh must include validator-recognized attribution wording: 样例结构化输入, 站内结构化数据, or sample input.',
    '- For sample fixture based outputs, use noteZh: 来自提供的样例结构化输入.',
    '- For future production site data outputs, use noteZh wording that includes 站内结构化数据.',
    '- Do not use only 来自提供的结构化输入 because it may not satisfy validator attribution keyword detection.',
    '- Every factual claim should map to one of the provided structured input layers.',
    '- Do not claim external web, news, or market verification.',
    'Use only this structured input JSON:',
    JSON.stringify(input, null, 2)
  ].join('\n\n');
}

async function runDeepSeekRequest({ input, apiKey, model, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${DEEPSEEK_BASE_URL}${DEEPSEEK_CHAT_ENDPOINT}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        stream: false,
        temperature: 0.2,
        max_tokens: 2400,
        thinking: { type: 'disabled' },
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: buildDeepSeekSystemPrompt() },
          { role: 'user', content: buildDeepSeekUserPrompt(input) }
        ]
      }),
      signal: controller.signal
    });

    const responseJson = await response.json();
    if (!response.ok) {
      const error = new Error(`DeepSeek API returned HTTP ${response.status}`);
      error.responseDiagnostics = buildResponseDiagnostics(responseJson, 'http_error');
      throw error;
    }

    return responseJson;
  } finally {
    clearTimeout(timeout);
  }
}

function sanitizedResponseError(responseJson) {
  const error = responseJson?.error;
  if (!error || typeof error !== 'object') return null;
  return {
    type: typeof error.type === 'string' ? error.type : null,
    code: typeof error.code === 'string' || typeof error.code === 'number' ? error.code : null,
    message: typeof error.message === 'string' ? error.message : null
  };
}

function buildResponseDiagnostics(responseJson, errorType = 'provider_response') {
  const choices = Array.isArray(responseJson?.choices) ? responseJson.choices : [];
  const firstChoice = choices[0] || null;
  const message = firstChoice?.message && typeof firstChoice.message === 'object' ? firstChoice.message : null;
  const content = message?.content;
  const reasoningContent = message?.reasoning_content;
  const usage = responseJson?.usage && typeof responseJson.usage === 'object' ? responseJson.usage : null;
  const diagnostics = {
    responseId: typeof responseJson?.id === 'string' ? responseJson.id : null,
    responseModel: typeof responseJson?.model === 'string' ? responseJson.model : null,
    choicesLength: choices.length,
    firstChoiceFinishReason: typeof firstChoice?.finish_reason === 'string' ? firstChoice.finish_reason : null,
    firstChoiceIndex: typeof firstChoice?.index === 'number' ? firstChoice.index : null,
    firstChoiceMessageKeys: message ? Object.keys(message).sort() : [],
    hasMessage: Boolean(message),
    hasContent: typeof content === 'string' && content.length > 0,
    contentType: content === undefined ? null : typeof content,
    contentLength: typeof content === 'string' ? content.length : null,
    hasReasoningContent: typeof reasoningContent === 'string' && reasoningContent.length > 0,
    reasoningContentLength: typeof reasoningContent === 'string' ? reasoningContent.length : null,
    hasUsage: Boolean(usage),
    usageKeys: usage ? Object.keys(usage).sort() : [],
    errorType
  };
  const responseError = sanitizedResponseError(responseJson);
  if (responseError) diagnostics.error = responseError;
  return diagnostics;
}

function extractProviderContent(responseJson) {
  const firstChoice = responseJson?.choices?.[0] || {};
  const finishReason = typeof firstChoice.finish_reason === 'string' ? firstChoice.finish_reason : 'unknown';
  const message = firstChoice.message && typeof firstChoice.message === 'object' ? firstChoice.message : null;
  const messageKeys = message ? Object.keys(message).sort().join(',') : 'none';
  const content = message?.content;
  if (typeof content === 'string' && content.trim().length > 0) {
    return content.trim();
  }
  if (finishReason === 'length') {
    throw new Error(`DeepSeek response content missing or truncated; finish_reason=length. message_keys=${messageKeys}`);
  }
  if (finishReason === 'content_filter') {
    throw new Error(`DeepSeek response omitted by content_filter. message_keys=${messageKeys}`);
  }
  if (finishReason === 'insufficient_system_resource') {
    throw new Error(`DeepSeek response interrupted by insufficient_system_resource. message_keys=${messageKeys}`);
  }
  throw new Error(`DeepSeek response did not include message content; finish_reason=${finishReason}; message_keys=${messageKeys}`);
}

function runValidator(outputPath) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['scripts/check-external-ai-output.mjs', outputPath], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

async function writeFailureArtifact(outputPath, stage, message, providerMetadata, responseDiagnostics = null, requestDiagnostics = null) {
  const artifact = {
    contractVersion: CONTRACT_VERSION,
    kind: 'external_ai_manual_test_failure_artifact',
    generatedAt: new Date().toISOString(),
    provider: 'deepseek',
    status: 'failed',
    stage,
    message,
    providerMetadata,
    productionImpact: {
      writesProductionData: false,
      modifiesFrontend: false,
      affectsScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false
    },
    note: 'Manual artifact only. Do not import into production data or frontend.',
    noteZh: '该 artifact 仅用于手动诊断，不得进入生产数据或前端展示。'
  };
  if (responseDiagnostics) artifact.responseDiagnostics = responseDiagnostics;
  if (requestDiagnostics) artifact.requestDiagnostics = requestDiagnostics;
  await writeOutputFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`);
}

function isAbortError(error) {
  return error?.name === 'AbortError' || /aborted/i.test(error?.message || '');
}

function buildRequestDiagnostics({ timeoutMs, inputText, model, provider, allowNetwork, validateOutput, outputPathSafe, likelyCause }) {
  return {
    timeoutMs,
    inputApproxBytes: Buffer.byteLength(inputText, 'utf8'),
    inputApproxChars: inputText.length,
    model,
    provider,
    allowNetwork,
    validateOutput,
    outputPathSafe,
    likelyCause
  };
}

async function runDeepSeekManualTest(options, provider, environmentProvider) {
  if (environmentProvider && environmentProvider !== 'none' && environmentProvider !== provider) {
    fail('Provider environment variables are intentionally ignored unless they match the explicit provider.');
    return;
  }

  if (options.dryRun) {
    fail('DeepSeek manual test is not dry-run. Use --provider deepseek with --allow-network, --validate-output, and --output.');
    return;
  }
  if (!options.allowNetwork) {
    fail('DeepSeek manual test requires --allow-network.');
    return;
  }
  if (!options.output) {
    fail('DeepSeek manual test requires --output to a safe artifact path.');
    return;
  }
  if (isUnsafeOutputPath(options.output)) {
    fail(`unsafe output path rejected: ${options.output}`);
    return;
  }
  if (!options.validateOutput) {
    fail('DeepSeek manual test requires --validate-output.');
    return;
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    fail('DeepSeek manual test requires DEEPSEEK_API_KEY.');
    return;
  }

  const providerAdapter = createExternalAiProviderAdapter({
    provider,
    model: options.model || DEFAULT_DEEPSEEK_MODEL,
    allowNetwork: true,
    apiKeyAvailable: true
  });
  providerAdapter.metadata.timeoutMs = options.timeoutMs;

  try {
    await providerAdapter.runManualTest();
  } catch (error) {
    fail(error.message);
    return;
  }

  let input;
  let inputText;
  try {
    inputText = await fs.readFile(options.input, 'utf8');
    input = JSON.parse(inputText);
  } catch (error) {
    fail(`failed to read input JSON: ${error.message}`);
    return;
  }

  const validationErrors = validateInput(input);
  if (validationErrors.length > 0) {
    fail(`invalid manual scaffold input:\n- ${validationErrors.join('\n- ')}`);
    return;
  }

  let providerOutput;
  let responseDiagnostics = null;
  try {
    const responseJson = await runDeepSeekRequest({
      input,
      apiKey,
      model: providerAdapter.model,
      timeoutMs: options.timeoutMs
    });
    responseDiagnostics = buildResponseDiagnostics(responseJson);
    providerOutput = JSON.parse(extractProviderContent(responseJson));
  } catch (error) {
    const aborted = isAbortError(error);
    const requestDiagnostics = buildRequestDiagnostics({
      timeoutMs: options.timeoutMs,
      inputText,
      model: providerAdapter.model,
      provider,
      allowNetwork: options.allowNetwork,
      validateOutput: options.validateOutput,
      outputPathSafe: !isUnsafeOutputPath(options.output),
      likelyCause: aborted ? 'timeout_or_abort' : 'provider_response_error'
    });
    const message = aborted
      ? 'DeepSeek manual request timed out or was aborted'
      : error.message;
    await writeFailureArtifact(
      options.output,
      'provider_response',
      message,
      providerAdapter.metadata,
      error.responseDiagnostics || responseDiagnostics,
      requestDiagnostics
    );
    fail(`DeepSeek manual test failed before validation: ${message}`);
    return;
  }

  try {
    await writeOutputFile(options.output, `${JSON.stringify(providerOutput, null, 2)}\n`);
  } catch (error) {
    fail(error.message);
    return;
  }

  const validator = await runValidator(options.output);
  if (validator.stdout) process.stdout.write(validator.stdout);
  if (validator.stderr) process.stderr.write(validator.stderr);
  if (validator.code !== 0) {
    fail('DeepSeek manual output failed check:external-ai-output validation. Artifact must remain hidden and non-production.');
    return;
  }

  console.log('DeepSeek manual API test: PASS');
  console.log(`artifact: ${options.output}`);
  console.log(`provider: ${providerAdapter.provider}`);
  console.log(`model: ${providerAdapter.model}`);
  console.log('productionDataWritten: false');
  console.log('frontendDisplayChanged: false');
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    fail(error.message);
    return;
  }

  let provider;
  try {
    provider = normalizeExternalAiProvider(options.provider);
  } catch (error) {
    fail(error.message);
    return;
  }

  const environmentProvider = process.env.EXTERNAL_AI_PROVIDER;
  let normalizedEnvironmentProvider;
  try {
    normalizedEnvironmentProvider = normalizeExternalAiProvider(environmentProvider);
  } catch (error) {
    fail(error.message);
    return;
  }
  if (provider === 'deepseek') {
    await runDeepSeekManualTest(options, provider, normalizedEnvironmentProvider);
    return;
  }

  if (provider === 'openai') {
    fail('OpenAI manual tests are not supported in v28.0K-4D.');
    return;
  }

  if (!options.dryRun) {
    fail('K-4D provider=none only supports --dry-run. Use manual:external-ai:deepseek for explicit DeepSeek artifact tests.');
    return;
  }

  if (normalizedEnvironmentProvider !== 'none') {
    fail('K-4D is no-network for dry-run. Provider environment variables are intentionally ignored.');
    return;
  }

  try {
    assertManualProviderAllowed(provider);
  } catch (error) {
    fail(error.message);
    return;
  }
  const providerAdapter = createExternalAiProviderAdapter({ provider, model: options.model });

  let input;
  try {
    input = JSON.parse(await fs.readFile(options.input, 'utf8'));
  } catch (error) {
    fail(`failed to read input JSON: ${error.message}`);
    return;
  }

  const validationErrors = validateInput(input);
  if (validationErrors.length > 0) {
    fail(`invalid manual scaffold input:\n- ${validationErrors.join('\n- ')}`);
    return;
  }

  const report = {
    contractVersion: CONTRACT_VERSION,
    kind: 'external_ai_manual_test_scaffold_report',
    generatedAt: new Date().toISOString(),
    status: 'dry_run_only',
    provider: providerAdapter.provider,
    model: providerAdapter.model,
    providerMetadata: providerAdapter.metadata,
    networkAllowed: false,
    apiCalled: false,
    secretsRead: false,
    input: {
      path: options.input,
      inputVersion: input.inputVersion,
      siteStructuredDataOnly: input.boundaries.siteStructuredDataOnly,
      layersAvailable: collectLayersAvailable(input)
    },
    productionImpact: {
      writesProductionData: false,
      modifiesFrontend: false,
      affectsScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false
    },
    nextAllowedStep: 'A later reviewed version may add real provider calls only behind an explicit environment gate.',
    notesZh: [
      '该命令仅为本地 dry-run scaffold。',
      '本版本不联网、不读取 API key、不调用外部 AI provider。',
      '该输出不是 external AI output，不能进入前端或生产数据。'
    ]
  };

  const outputText = `${JSON.stringify(report, null, 2)}\n`;
  try {
    if (options.output) await writeOutputFile(options.output, outputText);
  } catch (error) {
    fail(error.message);
    return;
  }

  process.stdout.write(outputText);
}

await main();
