// ACLED data adapter — manual xlsx workflow (M-63a, 2026-05-19)
//
// This file used to contain an ACLED API adapter. That code path was removed in M-63a
// because the project owner was denied Research/Partner tier API access. ACLED data is
// now ingested via manual xlsx downloads sanitized by scripts/world-order/sanitize-acled-weekly.mjs
// (and future sanitize-acled-monthly.mjs in M-63b).
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
    sourceFreshness: 'not_configured',
    noteZh: 'ACLED 周度 xlsx 尚未手动导入，当前仅保留数据源占位。',
    ...overrides
  });
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function freshnessFromLatestWeek(latestWeek) {
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

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function buildOkNote(summary) {
  const delta = Number.isFinite(summary.eventsDelta4Vs12)
    ? `${Math.round(summary.eventsDelta4Vs12 * 100)}%`
    : '不可比';
  return `ACLED 手动周度聚合已覆盖 ${summary.regionsTracked} 个区域，最新周 ${summary.latestWeek}，近4周事件相对12周均值变化 ${delta}。`;
}

function buildOkEvidence(summary, weekly) {
  return [
    {
      labelZh: 'ACLED 周度冲突事件聚合',
      source: 'ACLED manual xlsx',
      summary: `近 4 周事件 ${summary.eventsLast4Weeks ?? 'n/a'} 起，死亡 ${summary.fatalitiesLast4Weeks ?? 'n/a'}，覆盖 ${summary.regionsTracked} 个区域。`,
      value: summary.eventsLast4Weeks,
      direction: Number.isFinite(summary.eventsDelta4Vs12) && summary.eventsDelta4Vs12 > 0 ? 'risk_up' : 'neutral',
      confidence: weekly.quality?.confidence ?? 0.85
    },
    {
      labelZh: 'ACLED 平民受害事件占比',
      source: 'ACLED manual xlsx',
      summary: `近 4 周平民受害事件占比 ${Number.isFinite(summary.civilianTargetingShareLast4Weeks) ? Math.round(summary.civilianTargetingShareLast4Weeks * 100) : 'n/a'}%。`,
      value: summary.civilianTargetingShareLast4Weeks,
      direction: Number.isFinite(summary.civilianTargetingShareLast4Weeks) && summary.civilianTargetingShareLast4Weeks >= 0.2 ? 'risk_up' : 'neutral',
      confidence: weekly.quality?.confidence ?? 0.85
    }
  ];
}

function loadWeeklyJson() {
  if (!fs.existsSync(weeklyPath)) return { ok: false, missing: true, error: null, value: null };
  try {
    return {
      ok: true,
      missing: false,
      error: null,
      value: JSON.parse(fs.readFileSync(weeklyPath, 'utf8'))
    };
  } catch (err) {
    return {
      ok: false,
      missing: false,
      error: err instanceof Error ? err.message : String(err),
      value: null
    };
  }
}

export async function fetchAcledSummary({ config = {}, previousSource = null } = {}) {
  void config;
  void previousSource;

  const weekly = loadWeeklyJson();
  if (weekly.missing) {
    return buildSourceResult({
      enabled: true,
      status: 'manual_required',
      lastFetchedAt: null,
      summary: emptySummary({
        sourceFreshness: 'not_configured',
        noteZh: 'ACLED 周度 xlsx 尚未导入；operator 需手动下载区域聚合文件后运行 acled:sanitize:weekly。'
      }),
      evidence: [
        {
          labelZh: 'ACLED 周度聚合数据',
          source: 'ACLED manual xlsx',
          summary: '尚未发现本地 ACLED 周度标准化 JSON，等待 operator 手动下载 xlsx 并运行 sanitizer。',
          value: null,
          direction: 'neutral',
          confidence: 0
        }
      ],
      confidence: 0,
      warnings: ['No ACLED weekly data ingested. Run acled:sanitize:weekly after downloading from acleddata.com.']
    });
  }

  if (!weekly.ok) {
    return buildSourceResult({
      enabled: true,
      status: 'error',
      lastFetchedAt: null,
      summary: emptySummary({
        sourceFreshness: 'error',
        noteZh: 'ACLED 周度标准化 JSON 解析失败，本轮不使用该数据源。',
        errors: [weekly.error || 'unknown JSON parse error']
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
      warnings: [`ACLED weekly JSON parse failed: ${weekly.error || 'unknown error'}`]
    });
  }

  if (!isObject(weekly.value) || weekly.value.quality?.isRealData !== true) {
    return buildSourceResult({
      enabled: true,
      status: 'manual_required',
      lastFetchedAt: null,
      summary: emptySummary({
        sourceFreshness: 'not_configured',
        noteZh: 'ACLED 周度 JSON 未标记为真实数据，等待 operator 重新导入真实 xlsx。'
      }),
      evidence: [
        {
          labelZh: 'ACLED 周度聚合数据未确认',
          source: 'ACLED manual xlsx',
          summary: 'ACLED weekly JSON quality.isRealData 不是 true，本轮按 manual_required 处理。',
          value: null,
          direction: 'neutral',
          confidence: 0
        }
      ],
      confidence: 0,
      warnings: ['ACLED weekly data is missing quality.isRealData=true.']
    });
  }

  const normalized = weekly.value;
  const summary = {
    eventsLast4Weeks: finiteOrNull(normalized.global?.eventsLast4Weeks),
    eventsLast12Weeks: finiteOrNull(normalized.global?.eventsLast12Weeks),
    eventsDelta4Vs12: finiteOrNull(normalized.global?.eventsDelta4Vs12),
    fatalitiesLast4Weeks: finiteOrNull(normalized.global?.fatalitiesLast4Weeks),
    fatalitiesLast12Weeks: finiteOrNull(normalized.global?.fatalitiesLast12Weeks),
    civilianTargetingShareLast4Weeks: finiteOrNull(normalized.global?.civilianTargetingShareLast4Weeks),
    latestWeek: normalized.latestWeek,
    regionsTracked: Array.isArray(normalized.regionalLast4Weeks) ? normalized.regionalLast4Weeks.length : 0,
    hotZonesTopCount: Array.isArray(normalized.hotZonesLast4Weeks) ? normalized.hotZonesLast4Weeks.length : 0,
    sourceFreshness: freshnessFromLatestWeek(normalized.latestWeek),
    noteZh: ''
  };
  summary.noteZh = buildOkNote(summary);

  return buildSourceResult({
    enabled: true,
    status: 'ok',
    lastFetchedAt: normalized.preparedAt,
    summary,
    evidence: buildOkEvidence(summary, normalized),
    confidence: normalized.quality?.confidence ?? 0.85,
    warnings: []
  });
}
