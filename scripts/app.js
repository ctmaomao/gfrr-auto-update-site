// scripts/app.js — M-94 V0 路径 C · Stage 4a 主 JS 入口
// 职责:数据加载 + issue-meta 填充 + Stage 4b/c renderer 注入点 stub
// 创建于 Stage 4a (2026-05-27)

import {
  dataUrl,
  worldOrderStressUrl,
} from './modules/config.js';

const APP_VERSION = 'stage-4a-1';

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
  // 并行 fetch radar-data.json + world-order-stress.json
  const [radarData, worldOrderStressData] = await Promise.all([
    fetchJson(dataUrl, 'radar-data.json'),
    fetchJson(worldOrderStressUrl, 'world-order-stress.json'),
  ]);

  if (!radarData) {
    console.error('[app] CRITICAL: radar-data.json failed to load. Issue meta will use fallback.');
  }
  if (!worldOrderStressData) {
    console.error('[app] WARN: world-order-stress.json failed to load. World Order overlay will use fallback.');
  }

  return { radarData, worldOrderStressData };
}

// ---------------- issue-meta 填充 ----------------

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
    // 保持 <strong> 包裹格式(与 Stage 3a 原结构一致)
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
  const { radarData, worldOrderStressData } = await loadAllData();

  // Stage 4a: 填充 issue-meta
  const issueMeta = deriveIssueMeta(radarData);
  applyIssueMetaToDom(issueMeta);

  // Stage 4b/c stub: 后续 sub-stage 在此 import + 调用 renderer
  // 例如:
  // import('./modules/renderMacroOverview.js').then(({ renderMacroOverview }) => {
  //   renderMacroOverview({ radarData, worldOrderStressData });
  // });
  // import('./modules/renderPlainSummary.js').then(({ renderPlainSummary }) => {
  //   renderPlainSummary({ radarData });
  // });

  console.log(`[app] Stage 4a init complete. APP_VERSION=${APP_VERSION}`);
  console.log('[app] Data loaded:', {
    radarDataPresent: radarData !== null,
    worldOrderStressDataPresent: worldOrderStressData !== null,
  });
}

// 启动
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}