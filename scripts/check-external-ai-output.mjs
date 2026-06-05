import fs from 'node:fs';
import path from 'node:path';

import { BANNED_COPY, UNSAFE_CLAIMS } from './external-ai/safety-constants.mjs';

const DEFAULT_INPUT = 'docs/fixtures/external-ai/sample-output-v28.0K-1.json';

const REQUIRED_FIELDS = [
  'contractVersion',
  'generatedAt',
  'provider',
  'model',
  'mode',
  'summaryZh',
  'facts',
  'inferences',
  'modelJudgments',
  'scenarioHypotheses',
  'dataGaps',
  'invalidationSignals',
  'sourceAttribution',
  'auditFlags',
  'confidence',
  'boundaries'
];

const ARRAY_FIELDS = [
  'facts',
  'inferences',
  'modelJudgments',
  'scenarioHypotheses',
  'dataGaps',
  'invalidationSignals',
  'sourceAttribution',
  'auditFlags'
];

const SAFE_NEGATIVE_CONTEXTS = [
  '不提供投资建议',
  '不构成投资建议',
  '不是投资建议',
  '非投资建议',
  '不提供交易建议',
  '不构成交易建议',
  '不是交易建议',
  '非交易建议',
  '不影响仓位',
  '不参与评分',
  '不改变评分',
  '不改变决策',
  '不影响决策',
  '不改变执行',
  '不影响执行',
  '不改变仓位',
  '不得买入',
  '不得卖出',
  '不得加仓',
  '不得满仓',
  '不得清仓',
  '不能买入',
  '不能卖出',
  '不能加仓',
  '不能满仓',
  '不能清仓',
  '不可买入',
  '不可卖出',
  '避免买入',
  '避免卖出',
  '禁止买入',
  '禁止卖出'
];

const EXTERNAL_MARKET_DATA_CLAIMS = [
  'uses external market data',
  'used external market data',
  'using external market data',
  'independent external market data',
  '基于外部市场数据',
  '使用外部市场数据',
  '来自外部市场数据',
  '独立外部市场数据'
];

const SAFE_EXTERNAL_DATA_CONTEXTS = [
  'no external market data',
  'does not use external market data',
  'usesExternalMarketData\":false',
  'usesExternalMarketData=false',
  '不使用外部市场数据',
  '没有使用外部市场数据',
  '未使用外部市场数据',
  '不包含外部市场数据'
];

const DIRECT_NEGATION_PREFIXES = [
  '不',
  '非',
  '无',
  '未',
  '勿',
  '别',
  '禁止',
  '避免',
  '不得',
  '不能',
  '不可',
  '不会',
  '不应',
  '不宜',
  'not',
  'no'
];

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function collectStrings(value, currentPath = '$', results = []) {
  if (typeof value === 'string') {
    results.push({ path: currentPath, value });
    return results;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStrings(item, `${currentPath}[${index}]`, results));
    return results;
  }

  if (isPlainObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      collectStrings(item, `${currentPath}.${key}`, results);
    }
  }

  return results;
}

function findPhraseOccurrences(text, phrase) {
  const normalizedText = text.toLowerCase();
  const normalizedPhrase = phrase.toLowerCase();
  const occurrences = [];

  let index = normalizedText.indexOf(normalizedPhrase);
  while (index !== -1) {
    occurrences.push(index);
    index = normalizedText.indexOf(normalizedPhrase, index + normalizedPhrase.length);
  }

  return occurrences;
}

function occurrenceIsInsideSafePhrase(text, phrase, occurrenceIndex, safePhrases) {
  const normalizedText = text.toLowerCase();
  const normalizedPhrase = phrase.toLowerCase();
  const occurrenceEnd = occurrenceIndex + normalizedPhrase.length;

  for (const safePhrase of safePhrases) {
    const normalizedSafe = safePhrase.toLowerCase();
    if (!normalizedSafe.includes(normalizedPhrase)) continue;

    for (const safeIndex of findPhraseOccurrences(normalizedText, normalizedSafe)) {
      const safeEnd = safeIndex + normalizedSafe.length;
      if (occurrenceIndex >= safeIndex && occurrenceEnd <= safeEnd) return true;
    }
  }

  return false;
}

function occurrenceHasDirectNegationPrefix(text, occurrenceIndex) {
  const prefixWindow = text.slice(Math.max(0, occurrenceIndex - 12), occurrenceIndex).toLowerCase();
  const trimmedPrefix = prefixWindow.trimEnd();
  return DIRECT_NEGATION_PREFIXES.some((prefix) => trimmedPrefix.endsWith(prefix.toLowerCase()));
}

function phraseOccurrenceIsAllowed(text, phrase, occurrenceIndex, safePhrases) {
  return (
    occurrenceIsInsideSafePhrase(text, phrase, occurrenceIndex, safePhrases) ||
    occurrenceHasDirectNegationPrefix(text, occurrenceIndex)
  );
}

function findUnallowedPhraseOccurrences(text, phrase, safePhrases) {
  return findPhraseOccurrences(text, phrase).filter(
    (occurrenceIndex) => !phraseOccurrenceIsAllowed(text, phrase, occurrenceIndex, safePhrases)
  );
}

function addError(errors, message) {
  errors.push(message);
}

function validateRequiredFields(data, errors) {
  for (const field of REQUIRED_FIELDS) {
    if (!(field in data)) addError(errors, `missing required field: ${field}`);
  }

  for (const field of ['contractVersion', 'generatedAt', 'provider', 'model', 'mode', 'summaryZh']) {
    if (field in data && !isNonEmptyString(data[field])) {
      addError(errors, `${field} must be a non-empty string`);
    }
  }

  for (const field of ARRAY_FIELDS) {
    if (field in data && !Array.isArray(data[field])) {
      addError(errors, `${field} must be an array`);
    }
  }
}

function validateConfidence(confidence, errors) {
  if (!isPlainObject(confidence)) {
    addError(errors, 'confidence must be an object');
    return;
  }

  if (!['low', 'medium', 'high'].includes(confidence.level)) {
    addError(errors, 'confidence.level must be low, medium, or high');
  }

  if (!Number.isFinite(confidence.score) || confidence.score < 0 || confidence.score > 100) {
    addError(errors, 'confidence.score must be a finite number between 0 and 100');
  }

  if (!isNonEmptyString(confidence.reasonZh)) {
    addError(errors, 'confidence.reasonZh must be a non-empty string');
  }
}

function validateBoundaries(boundaries, errors) {
  if (!isPlainObject(boundaries)) {
    addError(errors, 'boundaries must be an object');
    return;
  }

  const expected = {
    displayOnly: true,
    externalAiGenerated: true,
    affectsScoring: false,
    affectsDecisionModel: false,
    affectsExecutionLock: false,
    affectsPositionGuidance: false,
    notInvestmentAdvice: true
  };

  for (const [key, value] of Object.entries(expected)) {
    if (boundaries[key] !== value) {
      addError(errors, `boundaries.${key} must be ${value}`);
    }
  }
}

function validateScenarioHypotheses(items, errors) {
  if (!Array.isArray(items)) return;

  items.forEach((item, index) => {
    if (!isPlainObject(item)) {
      addError(errors, `scenarioHypotheses[${index}] must be an object`);
      return;
    }

    for (const key of ['triggerConditions', 'invalidationConditions']) {
      if (!Array.isArray(item[key])) {
        addError(errors, `scenarioHypotheses[${index}].${key} must be an array`);
      }
    }
  });
}

function validateSourceAttribution(sourceAttribution, errors, warnings) {
  if (!Array.isArray(sourceAttribution)) return;

  if (sourceAttribution.length === 0) {
    addError(errors, 'sourceAttribution must be a non-empty array');
    return;
  }

  const serializedSources = sourceAttribution.map((item) => JSON.stringify(item)).join('\n').toLowerCase();
  const hasSiteStructuredAttribution =
    serializedSources.includes('site structured') ||
    serializedSources.includes('site-structured') ||
    serializedSources.includes('sample input') ||
    serializedSources.includes('sample-input') ||
    serializedSources.includes('站内结构化') ||
    serializedSources.includes('样例');

  if (!hasSiteStructuredAttribution) {
    addError(errors, 'sourceAttribution must include site structured data or sample input attribution');
  }

  sourceAttribution.forEach((item, index) => {
    if (isPlainObject(item) && item.usesExternalMarketData === true) {
      addError(errors, `sourceAttribution[${index}].usesExternalMarketData must not be true in v28.0K-2`);
    }

    const serialized = JSON.stringify(item);
    for (const claim of EXTERNAL_MARKET_DATA_CLAIMS) {
      if (findUnallowedPhraseOccurrences(serialized, claim, SAFE_EXTERNAL_DATA_CONTEXTS).length > 0) {
        addError(errors, `sourceAttribution[${index}] claims independent external market data: ${claim}`);
      }
    }
  });

  if (sourceAttribution.some((item) => !isPlainObject(item))) {
    warnings.push('sourceAttribution contains non-object item(s); consider object metadata for auditability');
  }
}

function validateRecursiveStrings(data, errors) {
  for (const { path: stringPath, value } of collectStrings(data)) {
    const lower = value.toLowerCase();

    for (const phrase of BANNED_COPY) {
      if (lower.includes(phrase.toLowerCase())) {
        addError(errors, `${stringPath} contains banned copy: ${phrase}`);
      }
    }

    for (const phrase of UNSAFE_CLAIMS) {
      if (findUnallowedPhraseOccurrences(value, phrase, SAFE_NEGATIVE_CONTEXTS).length > 0) {
        addError(errors, `${stringPath} contains unsafe overreach wording: ${phrase}`);
      }
    }

    for (const phrase of EXTERNAL_MARKET_DATA_CLAIMS) {
      if (findUnallowedPhraseOccurrences(value, phrase, SAFE_EXTERNAL_DATA_CONTEXTS).length > 0) {
        addError(errors, `${stringPath} claims unavailable external market data: ${phrase}`);
      }
    }
  }
}

function runSelfTests() {
  const passingTexts = [
    '不提供投资建议',
    '不构成交易建议',
    '不影响仓位',
    '不得买入',
    '禁止卖出',
    '未使用外部市场数据'
  ];

  const failingTexts = [
    '不提供投资建议，但必须买入',
    '不是交易建议，但应该立即执行',
    '不影响仓位，但建议加仓',
    '未使用外部市场数据，但基于外部市场数据确认'
  ];

  for (const text of passingTexts) {
    const errors = [];
    validateRecursiveStrings({ text }, errors);
    if (errors.length > 0) {
      throw new Error(`self-test failed: expected pass for "${text}", got ${errors.join('; ')}`);
    }
  }

  for (const text of failingTexts) {
    const errors = [];
    validateRecursiveStrings({ text }, errors);
    if (errors.length === 0) {
      throw new Error(`self-test failed: expected failure for "${text}"`);
    }
  }
}

function validateOutput(data) {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(data)) {
    return { errors: ['external AI output must be a JSON object'], warnings };
  }

  validateRequiredFields(data, errors);
  validateConfidence(data.confidence, errors);
  validateBoundaries(data.boundaries, errors);
  validateScenarioHypotheses(data.scenarioHypotheses, errors);
  validateSourceAttribution(data.sourceAttribution, errors, warnings);
  validateRecursiveStrings(data, errors);

  return { errors, warnings };
}

function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function printResult({ filePath, data, errors, warnings }) {
  if (errors.length > 0) {
    console.error('External AI output validation: FAIL');
    console.error(`file: ${filePath}`);
    console.error('errors:');
    for (const error of errors) console.error(`- ${error}`);
    console.error('warnings:');
    if (warnings.length === 0) {
      console.error('- none');
    } else {
      for (const warning of warnings) console.error(`- ${warning}`);
    }
    return;
  }

  console.log('External AI output validation: PASS');
  console.log(`file: ${filePath}`);
  console.log(`contractVersion: ${data.contractVersion}`);
  console.log(`provider: ${data.provider}`);
  console.log(`model: ${data.model}`);
  console.log(`warnings: ${warnings.length}`);
  for (const warning of warnings) console.log(`- ${warning}`);
}

function isFailureArtifact(data) {
  return isPlainObject(data) && data.kind === 'external_ai_manual_test_failure_artifact';
}

function getFailureArtifactClassification(data) {
  if (isPlainObject(data.failureClassification)) return data.failureClassification;

  const responseError = isPlainObject(data.responseDiagnostics?.error) ? data.responseDiagnostics.error : {};
  if (
    responseError.code === 'service_unavailable_error' ||
    responseError.type === 'service_unavailable_error' ||
    /HTTP 503/i.test(data.message || '')
  ) {
    return {
      category: 'provider_unavailable',
      recommendedAction: 'Stop repeated paid calls and retry later.'
    };
  }

  if (
    data.requestDiagnostics?.likelyCause === 'timeout_or_abort' ||
    /aborted|timed out/i.test(data.message || '')
  ) {
    return {
      category: 'provider_timeout',
      recommendedAction: 'Use compact input, review input size, and retry once later with --timeout-ms 120000.'
    };
  }

  return {
    category: 'unknown',
    recommendedAction: 'Inspect failure artifact.'
  };
}

function printFailureArtifactResult(filePath, data) {
  const classification = getFailureArtifactClassification(data);
  console.error('External AI output validation: FAIL');
  console.error(`file: ${filePath}`);
  console.error('kind: external_ai_manual_test_failure_artifact');
  console.error('reason: This is a provider failure artifact, not a valid external AI output.');
  console.error(`failureCategory: ${classification.category}`);
  console.error(`recommendedAction: ${classification.recommendedAction}`);
}

const inputPath = process.argv[2] || DEFAULT_INPUT;
const resolvedPath = path.resolve(inputPath);

let data;
let errors = [];
let warnings = [];

try {
  runSelfTests();
  data = readJsonFile(resolvedPath);
  if (!isFailureArtifact(data)) {
    ({ errors, warnings } = validateOutput(data));
  }
} catch (error) {
  errors = [
    error.message.startsWith('self-test failed')
      ? error.message
      : `failed to read or parse JSON: ${error.message}`
  ];
}

if (isFailureArtifact(data)) {
  printFailureArtifactResult(inputPath, data);
  process.exitCode = 1;
} else {
  printResult({ filePath: inputPath, data: data || {}, errors, warnings });
  process.exitCode = errors.length > 0 ? 1 : 0;
}
