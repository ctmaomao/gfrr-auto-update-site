// scripts/app.js — M-94 V0 路径 C · Stage 4b-1A 主 JS 入口
// 职责:数据加载(5 个 JSON)+ issue-meta 填充 + 调用 renderMacroOverview
// 创建于 Stage 4a (2026-05-27),Stage 4b-1A 扩展

import {
  dataUrl,
  worldOrderStressUrl,
} from './modules/config.js';

const APP_VERSION = 'odp-wti-market-proxy-1';
const RELEASE_VERSION_FALLBACK = 'v28.0.10';
const MARKET_PRICING_METRICS_URL = './data/market-pricing-metrics.json';
const RADAR_HISTORY_URL = './data/radar-history.json';
const OIL_DIRECTIONAL_URL = `./data/oil-directional-pressure.json?v=${APP_VERSION}`;
const DATA_LOADING_CLASS = 'gfrr-data-loading';
const DATA_READY_CLASS = 'gfrr-data-ready';
const DATA_FAILED_CLASS = 'gfrr-data-failed';

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

function normalizeReleaseDisplayText(value, releaseVersion) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/^当前已进入 v27\.0 /u, `当前已进入 ${releaseVersion} `)
    .replace(/^v27\.0 /u, `${releaseVersion} `);
}

function normalizeRadarReleaseVersion(radarData) {
  if (!radarData || typeof radarData !== 'object') return radarData;
  const releaseVersion = typeof radarData.releaseVersion === 'string' ? radarData.releaseVersion : RELEASE_VERSION_FALLBACK;
  return {
    ...radarData,
    releaseVersion,
    versionSemantics: radarData.versionSemantics && typeof radarData.versionSemantics === 'object'
      ? radarData.versionSemantics
      : {
          releaseVersion,
          dataContractVersion: typeof radarData.version === 'string' ? radarData.version : null,
          decisionModelContractVersion: typeof radarData.decisionModel?.contractVersion === 'string' ? radarData.decisionModel.contractVersion : null,
        },
    decisionLine: normalizeReleaseDisplayText(radarData.decisionLine, releaseVersion),
    summary: normalizeReleaseDisplayText(radarData.summary, releaseVersion),
  };
}

async function loadAllData() {
  // 并行 fetch 5 个 JSON 文件
  const [radarData, worldOrderStressData, marketPricingMetricsData, radarHistoryData, oilDirectionalData] = await Promise.all([
    fetchJson(dataUrl, 'radar-data.json'),
    fetchJson(worldOrderStressUrl, 'world-order-stress.json'),
    fetchJson(MARKET_PRICING_METRICS_URL, 'market-pricing-metrics.json'),
    fetchJson(RADAR_HISTORY_URL, 'radar-history.json'),
    fetchJson(OIL_DIRECTIONAL_URL, 'oil-directional-pressure.json'),
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
  if (!oilDirectionalData) {
    console.error('[app] WARN: oil-directional-pressure.json failed to load. Oil Directional theme will use fallback.');
  }

  return {
    radarData: normalizeRadarReleaseVersion(radarData),
    worldOrderStressData,
    marketPricingMetricsData,
    radarHistoryData,
    oilDirectionalData,
  };
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

  // releaseVersion is the product/release display version; radarData.version remains the legacy data contract marker.
  const version = typeof radarData.releaseVersion === 'string' ? radarData.releaseVersion : RELEASE_VERSION_FALLBACK;
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

function markDataReady() {
  document.body?.classList.remove(DATA_LOADING_CLASS, DATA_FAILED_CLASS);
  document.body?.classList.add(DATA_READY_CLASS);
}

function markDataUnavailable() {
  document.body?.classList.remove(DATA_LOADING_CLASS, DATA_READY_CLASS);
  document.body?.classList.add(DATA_FAILED_CLASS);
  const cacheEl = document.getElementById('issue-meta-cache');
  if (cacheEl) {
    cacheEl.textContent = 'DATA LOAD INCOMPLETE · 暂不显示数据';
  }
}

function allRenderableDataPresent({ radarData, worldOrderStressData, marketPricingMetricsData, radarHistoryData, oilDirectionalData }) {
  return Boolean(radarData && worldOrderStressData && marketPricingMetricsData && radarHistoryData && oilDirectionalData);
}

// ---------------- 主入口 ----------------

async function main() {
  const { radarData, worldOrderStressData, marketPricingMetricsData, radarHistoryData, oilDirectionalData } = await loadAllData();
  const dataReady = allRenderableDataPresent({ radarData, worldOrderStressData, marketPricingMetricsData, radarHistoryData, oilDirectionalData });

  // Stage 4a: 填充 issue-meta
  const issueMeta = deriveIssueMeta(radarData);
  applyIssueMetaToDom(issueMeta);

  // Stage 4b-1A: 调用 renderMacroOverview (Hero + threshold + pressure-sources)
  let macroOverviewRendered = false;
  try {
    const { renderMacroOverview } = await import('./modules/renderMacroOverview.js?v=odp-wti-market-proxy-1');
    renderMacroOverview({ radarData, worldOrderStressData, marketPricingMetricsData, radarHistoryData, oilDirectionalData });
    macroOverviewRendered = true;
  } catch (error) {
    console.error('[app] Failed to import / run renderMacroOverview:', error);
  }

  // PR4: Oil Directional Pressure (ODP) 独立能源专题 — display-only, 独立数据文件。
  let oilDirectionalRendered = false;
  try {
    const { renderOilDirectional } = await import(`./modules/renderOilDirectional.js?v=${APP_VERSION}`);
    renderOilDirectional({ oilData: oilDirectionalData, radarData, worldOrderStressData });
    oilDirectionalRendered = true;
  } catch (error) {
    console.error('[app] Failed to import / run renderOilDirectional:', error);
  }

  if (dataReady && macroOverviewRendered && oilDirectionalRendered) {
    markDataReady();
  } else {
    markDataUnavailable();
  }

  console.log(`[app] Stage 5d-2 init complete. APP_VERSION=${APP_VERSION}`);
  console.log('[app] Data loaded:', {
    radarDataPresent: radarData !== null,
    worldOrderStressDataPresent: worldOrderStressData !== null,
    marketPricingMetricsDataPresent: marketPricingMetricsData !== null,
    radarHistoryDataPresent: radarHistoryData !== null,
    oilDirectionalDataPresent: oilDirectionalData !== null,
  });
}

// 启动
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
