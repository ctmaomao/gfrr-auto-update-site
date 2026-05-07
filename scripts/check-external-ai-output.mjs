import fs from 'node:fs';
import path from 'node:path';

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

const BANNED_COPY = [
  '危机已经爆发',
  '必然崩盘',
  '必然逼空',
  '世界大战',
  '战争概率',
  '已经进入第三次世界大战',
  '13步已走几步',
  'guaranteed',
  'certainty',
  'sure thing',
  'risk-free',
  '真实 Dated Brent 已接入',
  'Platts Dated Brent 已接入',
  '实物油价已经确认',
  'DeepSeek 已验证市场事实',
  'OpenAI 已验证市场事实',
  '外部 AI 已确认危机'
];

const UNSAFE_CLAIMS = [
  '买入',
  '卖出',
  '加仓',
  '满仓',
  '清仓',
  '必须买',
  '必须卖',
  '确定赚钱',
  '无风险',
  '投资建议',
  '交易建议',
  '立即执行',
  '已确认危机',
  '外部 AI 已确认'
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

function phraseAppearsNegated(text, phrase) {
  if (SAFE_NEGATIVE_CONTEXTS.some((safe) => text.includes(safe))) return true;

  const index = text.indexOf(phrase);
  if (index < 0) return false;

  const prefix = text.slice(Math.max(0, index - 8), index);
  return /(不|非|无|未|勿|别|禁止|避免|不得|不能|不可|不会|不应|不宜|not|no)\s*$/.test(prefix);
}

function hasSafeExternalDataContext(text) {
  const normalized = text.toLowerCase();
  return SAFE_EXTERNAL_DATA_CONTEXTS.some((safe) => normalized.includes(safe.toLowerCase()));
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
    if (
      EXTERNAL_MARKET_DATA_CLAIMS.some((claim) => serialized.toLowerCase().includes(claim.toLowerCase())) &&
      !hasSafeExternalDataContext(serialized)
    ) {
      addError(errors, `sourceAttribution[${index}] claims independent external market data`);
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
      if (value.includes(phrase) && !phraseAppearsNegated(value, phrase)) {
        addError(errors, `${stringPath} contains unsafe overreach wording: ${phrase}`);
      }
    }

    for (const phrase of EXTERNAL_MARKET_DATA_CLAIMS) {
      if (lower.includes(phrase.toLowerCase()) && !hasSafeExternalDataContext(value)) {
        addError(errors, `${stringPath} claims unavailable external market data: ${phrase}`);
      }
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

const inputPath = process.argv[2] || DEFAULT_INPUT;
const resolvedPath = path.resolve(inputPath);

let data;
let errors = [];
let warnings = [];

try {
  data = readJsonFile(resolvedPath);
  ({ errors, warnings } = validateOutput(data));
} catch (error) {
  errors = [`failed to read or parse JSON: ${error.message}`];
}

printResult({ filePath: inputPath, data: data || {}, errors, warnings });
process.exitCode = errors.length > 0 ? 1 : 0;
