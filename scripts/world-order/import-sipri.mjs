import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildEmptySummary,
  buildSourceResult,
  clampConfidence,
  finiteOrNull,
  safeJsonParse,
  sanitizeString,
  sanitizeStringArray
} from './normalize-world-order-inputs.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..', '..');
const DEFAULT_NORMALIZED_PATH = 'config/world-order-sipri-normalized.json';
const EXAMPLE_NORMALIZED_PATH = 'config/world-order-sipri-normalized.example.json';
const ALLOWED_TRENDS = new Set(['rising', 'stable', 'falling', 'unknown']);

function emptySipriSummary(extra = {}) {
  return buildEmptySummary({
    globalMilitarySpendTrend: null,
    majorPowerMilitarySpendTrend: null,
    militarySpendShareOfGDPTrend: null,
    updatedYear: null,
    sourceFreshness: 'manual_required',
    noteZh: 'SIPRI 慢变量尚未导入。请根据 config/world-order-sipri-normalized.example.json 准备 normalized 数据。',
    latestSpendUsdBillion: null,
    globalFiveYearGrowthPct: null,
    globalTenYearGrowthPct: null,
    majorPowersTracked: 0,
    regionsTracked: 0,
    confidence: 0,
    errors: [],
    ...extra
  });
}

function resolveNormalizedPath(config) {
  const configuredPath = typeof config.normalizedInputPath === 'string' && config.normalizedInputPath.trim()
    ? config.normalizedInputPath.trim()
    : DEFAULT_NORMALIZED_PATH;
  return path.isAbsolute(configuredPath) ? configuredPath : path.join(root, configuredPath);
}

function trendOrUnknown(value) {
  return ALLOWED_TRENDS.has(value) ? value : 'unknown';
}

function classifyGrowthTrend(value) {
  const numeric = finiteOrNull(value);
  if (numeric === null) return 'unknown';
  if (numeric >= 8) return 'rising';
  if (numeric <= -3) return 'falling';
  return 'stable';
}

function majorityTrend(items) {
  const trends = Array.isArray(items) ? items.map((item) => trendOrUnknown(item?.trend)) : [];
  const rising = trends.filter((trend) => trend === 'rising').length;
  const falling = trends.filter((trend) => trend === 'falling').length;
  if (rising > Math.max(falling, Math.floor(trends.length / 2))) return 'rising';
  if (falling > Math.max(rising, Math.floor(trends.length / 2))) return 'falling';
  if (trends.length > 0) return 'stable';
  return 'unknown';
}

function validateNormalizedPayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, errors: ['payload must be object'] };
  }
  if (payload.exampleOnly === true || payload.notForScoring === true) {
    return { ok: false, manualRequired: true, errors: ['示例或非真实数据不会参与评分'] };
  }
  if (payload.quality?.isRealData !== true) {
    return { ok: false, manualRequired: true, errors: ['quality.isRealData must be true'] };
  }
  if (payload.source !== 'sipri-milex-manual-normalized') errors.push('source invalid');
  if (!Number.isFinite(Number(payload.updatedYear))) errors.push('updatedYear must be finite number');
  if (typeof payload.preparedAt !== 'string' || !Number.isFinite(Date.parse(payload.preparedAt))) errors.push('preparedAt must be parseable ISO string');
  if (!payload.global || typeof payload.global !== 'object' || Array.isArray(payload.global)) errors.push('global must be object');
  if (!Array.isArray(payload.majorPowers)) errors.push('majorPowers must be array');
  if (!Array.isArray(payload.regions)) errors.push('regions must be array');
  if (!payload.quality || typeof payload.quality !== 'object' || Array.isArray(payload.quality)) errors.push('quality must be object');
  const confidence = finiteOrNull(payload.quality?.confidence);
  if (confidence === null || confidence < 0 || confidence > 1) errors.push('quality.confidence must be 0-1');
  for (const [index, item] of (Array.isArray(payload.majorPowers) ? payload.majorPowers : []).entries()) {
    if (!ALLOWED_TRENDS.has(item?.trend)) errors.push(`majorPowers[${index}].trend invalid`);
  }
  for (const [index, item] of (Array.isArray(payload.regions) ? payload.regions : []).entries()) {
    if (!ALLOWED_TRENDS.has(item?.trend)) errors.push(`regions[${index}].trend invalid`);
  }
  return { ok: errors.length === 0, errors };
}

function buildOkSummary(payload) {
  const global = payload.global || {};
  const majorPowers = Array.isArray(payload.majorPowers) ? payload.majorPowers : [];
  const regions = Array.isArray(payload.regions) ? payload.regions : [];
  const fiveYearGrowth = finiteOrNull(global.fiveYearGrowthPct);
  const shareOfGdp = finiteOrNull(global.militarySpendShareOfGdpPct);
  return emptySipriSummary({
    updatedYear: Number(payload.updatedYear),
    sourceFreshness: 'manual_normalized',
    globalMilitarySpendTrend: classifyGrowthTrend(fiveYearGrowth),
    majorPowerMilitarySpendTrend: majorityTrend(majorPowers),
    militarySpendShareOfGDPTrend: classifyGrowthTrend(shareOfGdp),
    latestSpendUsdBillion: finiteOrNull(global.latestSpendUsdBillion),
    latestSpendRealTermsGrowthPct: finiteOrNull(global.latestSpendRealTermsGrowthPct),
    globalFiveYearGrowthPct: fiveYearGrowth,
    globalTenYearGrowthPct: finiteOrNull(global.tenYearGrowthPct),
    militarySpendShareOfGdpPct: shareOfGdp,
    majorPowersTracked: majorPowers.length,
    regionsTracked: regions.length,
    risingMajorPowers: majorPowers.filter((item) => item.trend === 'rising').length,
    risingRegions: regions.filter((item) => item.trend === 'rising').length,
    sourceName: sanitizeString(payload.sourceName, 'SIPRI Military Expenditure Database'),
    sourceUrl: sanitizeString(payload.quality?.sourceUrl, null),
    methodologyNoteZh: sanitizeString(payload.quality?.methodologyNoteZh, ''),
    notesZh: sanitizeString(payload.notesZh, ''),
    confidence: clampConfidence(payload.quality?.confidence),
    noteZh: sanitizeString(payload.notesZh, '手动标准化的 SIPRI 军费慢变量数据。'),
    errors: []
  });
}

export async function importSipriSummary({ config = {} } = {}) {
  if (config.enabled === false) {
    return buildSourceResult({
      enabled: false,
      status: 'disabled',
      summary: buildEmptySummary({
        globalMilitarySpendTrend: null,
        majorPowerMilitarySpendTrend: null,
        militarySpendShareOfGDPTrend: null,
        updatedYear: null,
        sourceFreshness: 'not-applicable',
        noteZh: 'SIPRI 数据源已关闭。'
      })
    });
  }

  const normalizedPath = resolveNormalizedPath(config);
  if (!fs.existsSync(normalizedPath)) {
    return buildSourceResult({
      enabled: true,
      status: 'manual_required',
      lastFetchedAt: null,
      summary: emptySipriSummary(),
      evidence: [
        {
          labelZh: 'SIPRI 军费慢变量',
          source: 'SIPRI manual import',
          summary: '当前尚未导入真实 SIPRI 标准化数据，因此只降低结构性评分置信度，不伪造军费趋势。',
          value: null,
          direction: 'neutral',
          confidence: 0
        }
      ],
      confidence: 0.05,
      warnings: [`SIPRI 需要手动导入标准化数据：${EXAMPLE_NORMALIZED_PATH}`]
    });
  }

  const parsed = safeJsonParse(fs.readFileSync(normalizedPath, 'utf8'));
  if (!parsed.ok) {
    return buildSourceResult({
      enabled: true,
      status: 'error',
      lastFetchedAt: null,
      summary: emptySipriSummary({
        sourceFreshness: 'error',
        noteZh: 'SIPRI normalized 文件 JSON 解析失败，未参与评分。',
        errors: [parsed.error]
      }),
      confidence: 0.02,
      warnings: ['SIPRI normalized 文件 JSON 解析失败。']
    });
  }

  const validation = validateNormalizedPayload(parsed.value);
  if (!validation.ok) {
    const manualRequired = validation.manualRequired === true;
    return buildSourceResult({
      enabled: true,
      status: manualRequired ? 'manual_required' : 'error',
      lastFetchedAt: null,
      summary: emptySipriSummary({
        sourceFreshness: manualRequired ? 'manual_required' : 'error',
        noteZh: manualRequired
          ? 'SIPRI normalized 文件是示例或非真实数据，不会参与评分。请导入 quality.isRealData=true 的真实标准化数据。'
          : 'SIPRI normalized 文件校验失败，未参与评分。',
        errors: sanitizeStringArray(validation.errors)
      }),
      confidence: manualRequired ? 0.05 : 0.02,
      warnings: validation.errors
    });
  }

  const summary = buildOkSummary(parsed.value);
  return buildSourceResult({
    enabled: true,
    status: 'ok',
    lastFetchedAt: typeof parsed.value.preparedAt === 'string' ? parsed.value.preparedAt : null,
    summary,
    evidence: [
      {
        labelZh: 'SIPRI 军费慢变量显示全球或主要大国军费趋势上升',
        source: 'sipri',
        summary: `SIPRI 手动标准化数据更新至 ${summary.updatedYear}，全球五年军费变化 ${summary.globalFiveYearGrowthPct ?? '--'}%，主要大国趋势 ${summary.majorPowerMilitarySpendTrend}。`,
        value: summary.globalFiveYearGrowthPct,
        direction: summary.globalMilitarySpendTrend === 'rising' || summary.majorPowerMilitarySpendTrend === 'rising' ? 'risk_up' : 'neutral',
        confidence: summary.confidence
      }
    ],
    confidence: summary.confidence,
    warnings: []
  });
}
