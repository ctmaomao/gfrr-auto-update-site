// scripts/app.js — M-94 V0 路径 C · Stage 4b-1A 主 JS 入口
// 职责:数据加载(3 个 JSON)+ issue-meta 填充 + 调用 renderMacroOverview
// 创建于 Stage 4a (2026-05-27),Stage 4b-1A 扩展

import {
  dataUrl,
  worldOrderStressUrl,
} from './modules/config.js';

const APP_VERSION = 'xval-gap-wording-1';
const MARKET_PRICING_METRICS_URL = './data/market-pricing-metrics.json';
const RADAR_HISTORY_URL = './data/radar-history.json';

const ISSUE_META_FALLBACK = {
  issue: '—',
  asOf: '—',
  cache: '—',
  dataHealth: '—',
  dataHealthMax: '—',
};

// ---------------- 数据加载 ----------------

async function fetchJson(url, label) {
  try {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) {
      console.error(`[app] Failed to fetch ${label}: HTTP ${response.status} ${response.statusText}`);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error(`[app] Error loading ${label}:`, error);
    return null;
  }
}

async function loadAllData() {
  // 并行 fetch 4 个 JSON 文件
  const [radarData, worldOrderStressData, marketPricingMetricsData, radarHistoryData] = await Promise.all([
    fetchJson(dataUrl, 'radar-data.json'),
    fetchJson(worldOrderStressUrl, 'world-order-stress.json'),
    fetchJson(MARKET_PRICING_METRICS_URL, 'market-pricing-metrics.json'),
    fetchJson(RADAR_HISTORY_URL, 'radar-history.json'),
  ]);

  if (!radarData) {
    console.error('[app] CRITICAL: radar-data.json failed to load. Issue meta + macro-overview will use fallback.');
  }
  if (!worldOrderStressData) {
    console.error('[app] WARN: world-order-stress.json failed to load. World Order overlay will use fallback.');
  }
  if (!marketPricingMetricsData) {
    console.error('[app] WARN: market-pricing-metrics.json failed to load. Market Temperature will use fallback.');
  }
  if (!radarHistoryData) {
    console.error('[app] WARN: radar-history.json failed to load. Trend SVG will use fallback.');
  }

  return { radarData, worldOrderStressData, marketPricingMetricsData, radarHistoryData };
}

// ---------------- issue-meta 填充(Stage 4a 不动)----------------

function formatAsOfTimestamp(updatedAtIso) {
  if (!updatedAtIso || typeof updatedAtIso !== 'string') return ISSUE_META_FALLBACK.asOf;
  try {
    const d = new Date(updatedAtIso);
    if (Number.isNaN(d.getTime())) return ISSUE_META_FALLBACK.asOf;
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const min = String(d.getUTCMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${min} UTC`;
  } catch (error) {
    return ISSUE_META_FALLBACK.asOf;
  }
}

function deriveIssueMeta(radarData) {
  if (!radarData) return ISSUE_META_FALLBACK;

  const version = typeof radarData.version === 'string' ? radarData.version : ISSUE_META_FALLBACK.issue;
  const updatedAt = typeof radarData.updatedAt === 'string' ? radarData.updatedAt : null;
  const sourceMode = radarData.dailyRealtimeInput && typeof radarData.dailyRealtimeInput.sourceMode === 'string'
    ? radarData.dailyRealtimeInput.sourceMode
    : ISSUE_META_FALLBACK.cache;
  const healthScore = radarData.dailyRealtimeInput && Number.isFinite(radarData.dailyRealtimeInput.healthScore)
    ? radarData.dailyRealtimeInput.healthScore
    : null;

  return {
    issue: version,
    asOf: formatAsOfTimestamp(updatedAt),
    cache: sourceMode,
    dataHealth: healthScore !== null ? String(healthScore) : ISSUE_META_FALLBACK.dataHealth,
    dataHealthMax: healthScore !== null ? '100' : ISSUE_META_FALLBACK.dataHealthMax,
  };
}

function applyIssueMetaToDom(meta) {
  const issueEl = document.getElementById('issue-meta-issue');
  const asOfEl = document.getElementById('issue-meta-asof');
  const cacheEl = document.getElementById('issue-meta-cache');

  if (issueEl) {
    issueEl.innerHTML = `<strong>ISSUE ${meta.issue}</strong>`;
  }
  if (asOfEl) {
    asOfEl.textContent = `AS OF ${meta.asOf}`;
  }
  if (cacheEl) {
    cacheEl.textContent = `CACHE ${meta.cache} · DATA HEALTH ${meta.dataHealth}/${meta.dataHealthMax}`;
  }
}

// ---------------- 主入口 ----------------

async function main() {
  const { radarData, worldOrderStressData, marketPricingMetricsData, radarHistoryData } = await loadAllData();

  // Stage 4a: 填充 issue-meta
  const issueMeta = deriveIssueMeta(radarData);
  applyIssueMetaToDom(issueMeta);

  // Stage 4b-1A: 调用 renderMacroOverview (Hero + threshold + pressure-sources)
  try {
    const { renderMacroOverview } = await import('./modules/renderMacroOverview.js?v=xval-gap-wording-1');
    renderMacroOverview({ radarData, worldOrderStressData, marketPricingMetricsData, radarHistoryData });
  } catch (error) {
    console.error('[app] Failed to import / run renderMacroOverview:', error);
  }

  // Stage 4c stub: 后续 sub-stage 在此 import + 调用 renderer
  // 例如:
  console.log(`[app] Stage 5d-2 init complete. APP_VERSION=${APP_VERSION}`);
  console.log('[app] Data loaded:', {
    radarDataPresent: radarData !== null,
    worldOrderStressDataPresent: worldOrderStressData !== null,
    marketPricingMetricsDataPresent: marketPricingMetricsData !== null,
    radarHistoryDataPresent: radarHistoryData !== null,
  });
}

// 启动
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
