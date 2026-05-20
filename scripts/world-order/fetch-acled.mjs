// ACLED data adapter — manual xlsx workflow (M-63a weekly, M-63b monthly)
//
// This file used to contain an ACLED API adapter. That code path was removed in M-63a
// because the project owner was denied Research/Partner tier API access. ACLED data is
// now ingested via manual xlsx downloads sanitized by scripts/world-order/sanitize-acled-weekly.mjs
// (M-63a) and scripts/world-order/sanitize-acled-monthly.mjs (M-63b).
//
// To recover the API adapter code if Research tier access is ever obtained:
//   git show <commit-prior-to-m-63a-merge>:scripts/world-order/fetch-acled.mjs
//
// Per ACLED EULA §3.3 ("Scraping and crawling the Site is prohibited"), no automation
// may fetch from acleddata.com. This file therefore only reads local JSON.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildEmptySummary,
  buildSourceResult
} from './normalize-world-order-inputs.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..', '..');
const weeklyPath = path.join(root, 'config', 'world-order-acled-regional-weekly.json');
const monthlyPath = path.join(root, 'config', 'world-order-acled-global-monthly.json');

function emptySummary(overrides = {}) {
  return buildEmptySummary({
    eventsLast4Weeks: null,
    eventsLast12Weeks: null,
    eventsDelta4Vs12: null,
    fatalitiesLast4Weeks: null,
    fatalitiesLast12Weeks: null,
    civilianTargetingShareLast4Weeks: null,
    latestWeek: null,
    regionsTracked: 0,
    hotZonesTopCount: 0,
    politicalViolenceEventsLatestFullYear: null,
    politicalViolenceYoyDelta: null,
    civilianTargetingShareLatestFullYear: null,
    fatalitiesLatestFullYear: null,
    monthlyLatest12mVsPrior12mDelta: null,
    monthlyAsOfDate: null,
    monthlyLatestFullYear: null,
    sourceFreshness: 'not_configured',
    noteZh: 'ACLED 周度/月度 xlsx 尚未手动导入，当前仅保留数据源占位。',
    ...overrides
  });
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function weeklyFreshnessFromLatestWeek(latestWeek) {
  if (typeof latestWeek !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(latestWeek)) return 'expired';
  const latest = new Date(`${latestWeek}T00:00:00.000Z`);
  if (!Number.isFinite(latest.getTime())) return 'expired';
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const ageDays = Math.floor((today.getTime() - latest.getTime()) / 86_400_000);
  if (ageDays < 14) return 'fresh';
  if (ageDays <= 30) return 'aging';
  if (ageDays <= 90) return 'stale';
  return 'expired';
}

function monthlyFreshnessFromAsOfDate(asOfDate) {
  if (typeof asOfDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(asOfDate)) return 'expired';
  const target = new Date(`${asOfDate}T00:00:00.000Z`);
  if (!Number.isFinite(target.getTime())) return 'expired';
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const ageDays = Math.floor((today.getTime() - target.getTime()) / 86_400_000);
  if (ageDays <= 35) return 'fresh';
  if (ageDays <= 60) return 'aging';
  if (ageDays <= 120) return 'stale';
  return 'expired';
}

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) return { state: 'missing', value: null, error: null };
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!isObject(parsed)) return { state: 'error', value: null, error: 'payload is not an object' };
    if (parsed.quality?.isRealData !== true) return { state: 'manual_required', value: parsed, error: null };
    return { state: 'ok', value: parsed, error: null };
  } catch (err) {
    return { state: 'error', value: null, error: err instanceof Error ? err.message : String(err) };
  }
}

function combineStatus(weeklyState, monthlyState) {
  if (weeklyState === 'error') return 'error';
  if (weeklyState === 'ok' && monthlyState === 'ok') return 'ok';
  if (weeklyState === 'ok' && monthlyState === 'error') return 'partial';
  if (weeklyState === 'ok') return 'partial';
  if (monthlyState === 'ok') return 'partial';
  return 'manual_required';
}

function combineConfidence(weeklyState, monthlyState, weeklyConfidence, monthlyConfidence) {
  if (weeklyState !== 'ok' && monthlyState !== 'ok') return 0;
  let confidence = 0;
  if (weeklyState === 'ok') confidence = Math.max(confidence, weeklyConfidence ?? 0.85);
  if (monthlyState === 'ok') confidence = Math.max(confidence, (monthlyConfidence ?? 0.85) * 0.95);
  if (weeklyState === 'ok' && monthlyState === 'ok') confidence = Math.min(0.9, confidence + 0.05);
  return confidence;
}

function buildWeeklySummary(weekly) {
  return {
    eventsLast4Weeks: finiteOrNull(weekly.global?.eventsLast4Weeks),
    eventsLast12Weeks: finiteOrNull(weekly.global?.eventsLast12Weeks),
    eventsDelta4Vs12: finiteOrNull(weekly.global?.eventsDelta4Vs12),
    fatalitiesLast4Weeks: finiteOrNull(weekly.global?.fatalitiesLast4Weeks),
    fatalitiesLast12Weeks: finiteOrNull(weekly.global?.fatalitiesLast12Weeks),
    civilianTargetingShareLast4Weeks: finiteOrNull(weekly.global?.civilianTargetingShareLast4Weeks),
    latestWeek: weekly.latestWeek,
    regionsTracked: Array.isArray(weekly.regionalLast4Weeks) ? weekly.regionalLast4Weeks.length : 0,
    hotZonesTopCount: Array.isArray(weekly.hotZonesLast4Weeks) ? weekly.hotZonesLast4Weeks.length : 0,
    sourceFreshness: weeklyFreshnessFromLatestWeek(weekly.latestWeek)
  };
}

function buildMonthlyFields(monthly) {
  return {
    politicalViolenceEventsLatestFullYear: finiteOrNull(monthly.global?.politicalViolenceEventsLatestFullYear),
    politicalViolenceYoyDelta: finiteOrNull(monthly.global?.politicalViolenceYoyDelta),
    civilianTargetingShareLatestFullYear: finiteOrNull(monthly.global?.civilianTargetingShareLatestFullYear),
    fatalitiesLatestFullYear: finiteOrNull(monthly.global?.fatalitiesLatestFullYear),
    monthlyLatest12mVsPrior12mDelta: finiteOrNull(monthly.monthlyTrend?.latest12mVsPrior12mDelta),
    monthlyAsOfDate: typeof monthly.asOfDate === 'string' ? monthly.asOfDate : null,
    monthlyLatestFullYear: Number.isInteger(monthly.latestFullYear) ? monthly.latestFullYear : null,
    monthlySourceFreshness: monthlyFreshnessFromAsOfDate(monthly.asOfDate)
  };
}

function buildWeeklyEvidence(weekly, summary) {
  return [
    {
      labelZh: 'ACLED 周度冲突事件聚合',
      source: 'ACLED manual xlsx (weekly)',
      summary: `近 4 周事件 ${summary.eventsLast4Weeks ?? 'n/a'} 起，死亡 ${summary.fatalitiesLast4Weeks ?? 'n/a'}，覆盖 ${summary.regionsTracked} 个区域。`,
      value: summary.eventsLast4Weeks,
      direction: Number.isFinite(summary.eventsDelta4Vs12) && summary.eventsDelta4Vs12 > 0 ? 'risk_up' : 'neutral',
      confidence: weekly.quality?.confidence ?? 0.85
    },
    {
      labelZh: 'ACLED 平民受害事件占比',
      source: 'ACLED manual xlsx (weekly)',
      summary: `近 4 周平民受害事件占比 ${Number.isFinite(summary.civilianTargetingShareLast4Weeks) ? Math.round(summary.civilianTargetingShareLast4Weeks * 100) : 'n/a'}%。`,
      value: summary.civilianTargetingShareLast4Weeks,
      direction: Number.isFinite(summary.civilianTargetingShareLast4Weeks) && summary.civilianTargetingShareLast4Weeks >= 0.2 ? 'risk_up' : 'neutral',
      confidence: weekly.quality?.confidence ?? 0.85
    }
  ];
}

function buildMonthlyEvidence(monthly, fields) {
  const yoyText = Number.isFinite(fields.politicalViolenceYoyDelta)
    ? `${(fields.politicalViolenceYoyDelta * 100).toFixed(1)}%`
    : 'n/a';
  const monthlyDeltaText = Number.isFinite(fields.monthlyLatest12mVsPrior12mDelta)
    ? `${(fields.monthlyLatest12mVsPrior12mDelta * 100).toFixed(1)}%`
    : 'n/a';
  const civilianShareText = Number.isFinite(fields.civilianTargetingShareLatestFullYear)
    ? `${Math.round(fields.civilianTargetingShareLatestFullYear * 100)}%`
    : 'n/a';
  return [
    {
      labelZh: 'ACLED 年度暴力事件（最新完整年）',
      source: 'ACLED manual xlsx (monthly)',
      summary: `${fields.monthlyLatestFullYear ?? 'n/a'} 年政治暴力事件 ${fields.politicalViolenceEventsLatestFullYear ?? 'n/a'} 起，相对前 3 年均值变化 ${yoyText}。`,
      value: fields.politicalViolenceEventsLatestFullYear,
      direction: Number.isFinite(fields.politicalViolenceYoyDelta) && fields.politicalViolenceYoyDelta > 0 ? 'risk_up' : 'neutral',
      confidence: monthly.quality?.confidence ?? 0.85
    },
    {
      labelZh: 'ACLED 最近 12 个月暴力事件趋势',
      source: 'ACLED manual xlsx (monthly)',
      summary: `last-12m vs prior-12m 事件变化 ${monthlyDeltaText}。`,
      value: fields.monthlyLatest12mVsPrior12mDelta,
      direction: Number.isFinite(fields.monthlyLatest12mVsPrior12mDelta) && fields.monthlyLatest12mVsPrior12mDelta > 0 ? 'risk_up' : 'neutral',
      confidence: monthly.quality?.confidence ?? 0.85
    },
    {
      labelZh: 'ACLED 年度平民受害事件占比',
      source: 'ACLED manual xlsx (monthly)',
      summary: `${fields.monthlyLatestFullYear ?? 'n/a'} 年平民受害事件占比 ${civilianShareText}。`,
      value: fields.civilianTargetingShareLatestFullYear,
      direction: Number.isFinite(fields.civilianTargetingShareLatestFullYear) && fields.civilianTargetingShareLatestFullYear >= 0.25 ? 'risk_up' : 'neutral',
      confidence: monthly.quality?.confidence ?? 0.85
    }
  ];
}

function buildCombinedNote(state, weekly, monthly, summary) {
  if (state.combinedStatus === 'manual_required') {
    return 'ACLED 周度与月度 xlsx 均未导入；operator 需手动下载后运行 acled:sanitize:weekly / acled:sanitize:monthly。';
  }
  if (state.combinedStatus === 'error') {
    return 'ACLED weekly JSON 解析失败，本轮不使用该数据源。';
  }
  const parts = [];
  if (state.weeklyState === 'ok') {
    const delta = Number.isFinite(weekly.global?.eventsDelta4Vs12)
      ? `${(weekly.global.eventsDelta4Vs12 * 100).toFixed(1)}%`
      : '不可比';
    parts.push(`周度覆盖 ${summary.regionsTracked} 个区域，最新周 ${summary.latestWeek}，近4周事件相对12周均值变化 ${delta}`);
  } else {
    parts.push('周度数据缺失或待导入');
  }
  if (state.monthlyState === 'ok') {
    const yoy = Number.isFinite(monthly.global?.politicalViolenceYoyDelta)
      ? `${(monthly.global.politicalViolenceYoyDelta * 100).toFixed(1)}%`
      : '不可比';
    parts.push(`月度最新完整年 ${monthly.latestFullYear} 年政治暴力事件相对前 3 年均值 ${yoy}`);
  } else if (state.monthlyState === 'manual_required') {
    parts.push('月度数据待导入');
  } else if (state.monthlyState === 'error') {
    parts.push('月度数据解析失败，本轮忽略');
  }
  return `${parts.join('；')}。`;
}

export async function fetchAcledSummary({ config = {}, previousSource = null } = {}) {
  void config;
  void previousSource;

  const weekly = loadJson(weeklyPath);
  const monthly = loadJson(monthlyPath);

  const combinedStatus = combineStatus(weekly.state, monthly.state);
  const combinedConfidence = combineConfidence(
    weekly.state,
    monthly.state,
    weekly.value?.quality?.confidence,
    monthly.value?.quality?.confidence
  );
  const lastFetchedAt = weekly.value?.preparedAt || monthly.value?.preparedAt || null;
  const warnings = [];

  if (weekly.state === 'missing') warnings.push('ACLED weekly data not ingested. Run acled:sanitize:weekly after downloading from acleddata.com.');
  else if (weekly.state === 'manual_required') warnings.push('ACLED weekly JSON quality.isRealData is not true; treated as missing.');
  else if (weekly.state === 'error') warnings.push(`ACLED weekly JSON parse failed: ${weekly.error || 'unknown error'}`);
  if (monthly.state === 'missing') warnings.push('ACLED monthly data not ingested. Run acled:sanitize:monthly after downloading from acleddata.com.');
  else if (monthly.state === 'manual_required') warnings.push('ACLED monthly JSON quality.isRealData is not true; treated as missing.');
  else if (monthly.state === 'error') warnings.push(`ACLED monthly JSON parse failed: ${monthly.error || 'unknown error'}`);

  const weeklySummary = weekly.state === 'ok' ? buildWeeklySummary(weekly.value) : {};
  const monthlyFields = monthly.state === 'ok' ? buildMonthlyFields(monthly.value) : {};

  const evidence = [];
  if (weekly.state === 'ok') evidence.push(...buildWeeklyEvidence(weekly.value, weeklySummary));
  if (monthly.state === 'ok') evidence.push(...buildMonthlyEvidence(monthly.value, monthlyFields));

  if (combinedStatus === 'manual_required') {
    return buildSourceResult({
      enabled: true,
      status: 'manual_required',
      lastFetchedAt: null,
      summary: emptySummary({
        sourceFreshness: 'not_configured',
        noteZh: 'ACLED 周度与月度 xlsx 均待导入；operator 需手动下载后运行 sanitizer。'
      }),
      evidence: [
        {
          labelZh: 'ACLED 周度/月度聚合数据',
          source: 'ACLED manual xlsx',
          summary: '尚未发现本地 ACLED 标准化 JSON，等待 operator 手动下载 xlsx 并运行 sanitizer。',
          value: null,
          direction: 'neutral',
          confidence: 0
        }
      ],
      confidence: 0,
      warnings
    });
  }

  if (combinedStatus === 'error') {
    return buildSourceResult({
      enabled: true,
      status: 'error',
      lastFetchedAt: null,
      summary: emptySummary({
        sourceFreshness: 'error',
        noteZh: 'ACLED weekly 标准化 JSON 解析失败，本轮不使用该数据源。',
        errors: [weekly.error || 'unknown weekly error']
      }),
      evidence: [
        {
          labelZh: 'ACLED 周度聚合数据异常',
          source: 'ACLED manual xlsx',
          summary: `ACLED weekly JSON parse failed: ${weekly.error || 'unknown error'}`,
          value: null,
          direction: 'neutral',
          confidence: 0.05
        }
      ],
      confidence: 0.05,
      warnings
    });
  }

  const summary = {
    ...weeklySummary,
    ...monthlyFields,
    sourceFreshness: weeklySummary.sourceFreshness || monthlyFields.monthlySourceFreshness || 'not_configured',
    noteZh: ''
  };
  if (Array.isArray(summary.errors)) {
    delete summary.errors;
  }
  summary.noteZh = buildCombinedNote(
    { combinedStatus, weeklyState: weekly.state, monthlyState: monthly.state },
    weekly.value || {},
    monthly.value || {},
    summary
  );

  return buildSourceResult({
    enabled: true,
    status: combinedStatus,
    lastFetchedAt,
    summary,
    evidence,
    confidence: combinedConfidence,
    warnings
  });
}
