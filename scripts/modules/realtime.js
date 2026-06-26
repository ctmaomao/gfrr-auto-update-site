/**
 * @frozen M-94 V0 Path C
 * Retained for historical worker-first overlay logic, but intentionally not
 * imported by scripts/app.js. Reconnecting this module to the frontend requires
 * a reviewed product decision.
 */
import { dataUrl, historyUrl, localRealtimeUrl, worldOrderStressUrl, REMOTE_REALTIME_URL, realtimeSourcePolicy, fmtNumSafe } from './config.js?v=odp-evidence-timing-1';
import {
  computeAgeMinutes,
  classifyFreshnessLevel,
  buildRealtimeStatusLabel,
  shouldApplyRealtimeOverlay,
  canUseRealtimePayloadValues
} from './freshness.js?v=odp-evidence-timing-1';
import { buildHealthDashboardModel } from './health.js?v=odp-evidence-timing-1';
import { buildDecisionModel } from './decision.js?v=odp-evidence-timing-1';
import {
  buildAssetMatrixReasons,
  buildDecisionLineDisplay,
  buildHeatmapNotes,
  buildLiquidityNotes,
  buildPhaseSignalsDisplay,
  buildScenarioTreeTriggers,
  buildSignalEngineNotes,
  buildSummaryDisplay,
  buildTopRisksDisplay,
  buildTriggerPanelDisplay
} from './displayTextBuilders.js?v=odp-evidence-timing-1';

const STRUCTURAL_SIGNAL_LABELS_CN = {
  curveDeepInversion: '曲线深度倒挂',
  curveRapidSteepening: '曲线快速陡峭化',
  onRrpCritical: '逆回购准备金告急',
  fedRapidContraction: '美联储快速缩表',
  igOasStress: '投资级信用利差扩张'
};

const LOCAL_FALLBACK_MAX_AGE_MINUTES = 180;
const LOCAL_FALLBACK_KEY_FIELDS = ['brent', 'dxy', 'vix', 'hyOas', 'us10y', 'gold', 'spx'];
const LOCAL_FALLBACK_MIN_FINITE_KEY_FIELDS = 5;

// Preserved frozen realtime overlay coefficients; keep named to avoid accidental threshold drift.
const REALTIME_RISK_SCALE = Object.freeze({
  oil: { base: 60, multiplier: 2 },
  dollar: { base: 95, multiplier: 8 },
  hy: { base: 2.5, multiplier: 35 },
  vix: { base: 12, multiplier: 7 },
  rate: { base: 2.5, multiplier: 22 },
  realRate: { base: 0.5, multiplier: 33 },
  inflationBreakeven: { base: 1.5, multiplier: 45, oilWeight: 0.35 }
});

const REALTIME_MODULE_BLEND_WEIGHTS = Object.freeze({
  geopolitical: { base: 0.4, oil: 0.45, vix: 0.15 },
  energy: { base: 0.25, oil: 0.75 },
  inflation: { base: 0.25, inflation: 0.75 },
  liquidity: { base: 0.2, dollar: 0.3, hy: 0.3, vix: 0.12, rate: 0.08 },
  debt: { base: 0.25, realRate: 0.45, rate: 0.25, hy: 0.05 },
  banking: { base: 0.2, hy: 0.55, vix: 0.2, dollar: 0.05 }
});

const REALTIME_TOTAL_SCORE_WEIGHTS = Object.freeze({
  geopolitical: 0.15,
  energy: 0.16,
  inflation: 0.18,
  liquidity: 0.20,
  debt: 0.17,
  banking: 0.14
});

const REALTIME_EXECUTION_THRESHOLDS = Object.freeze({
  hardStop: { liquidity: 75, brent: 110, hy: 4.5, vix: 28, totalScore: 82 },
  caution: { liquidity: 60, brent: 90, hy: 3.7, vix: 20, totalScore: 65 },
  reset: { vix: 18, hy: 3.7, brent: 95, criticalMissing: 2 }
});

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function fetchJsonOrThrow(url, label) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${label} HTTP ${response.status}`);
  }
  return response.json();
}

export async function fetchBaselineData() {
  return fetchJsonOrThrow(dataUrl, 'baseline');
}

export async function fetchHistoryData() {
  return fetchJsonOrThrow(historyUrl, 'history');
}

export async function fetchWorldOrderStressData() {
  try {
    const response = await fetch(withCacheBust(worldOrderStressUrl), { cache: 'no-store' });
    if (!response.ok) {
      return {
        unavailable: true,
        error: `HTTP ${response.status}`,
        sourceUrl: worldOrderStressUrl
      };
    }
    const payload = await response.json();
    return payload && typeof payload === 'object'
      ? payload
      : { unavailable: true, error: 'invalid-json-shape', sourceUrl: worldOrderStressUrl };
  } catch (error) {
    return {
      unavailable: true,
      error: errorMessage(error),
      sourceUrl: worldOrderStressUrl
    };
  }
}

export function normalizeRealtimePayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const values = payload.values && typeof payload.values === 'object' ? payload.values : null;
  if (!values) return null;
  const fieldFreshness = payload.fieldFreshness && typeof payload.fieldFreshness === 'object' ? payload.fieldFreshness : {};
  const brentFreshnessRaw = fieldFreshness.brent && typeof fieldFreshness.brent === 'object' ? fieldFreshness.brent : null;
  const brentFreshness = brentFreshnessRaw ? {
    observedAt: typeof brentFreshnessRaw.observedAt === 'string' ? brentFreshnessRaw.observedAt : null,
    ageMinutes: Number.isFinite(brentFreshnessRaw.ageMinutes) ? brentFreshnessRaw.ageMinutes : null,
    freshnessLevel: typeof brentFreshnessRaw.freshnessLevel === 'string' ? brentFreshnessRaw.freshnessLevel : null,
    isStale: !!brentFreshnessRaw.isStale
  } : null;
  const asOf = typeof payload.asOf === 'string'
    ? payload.asOf
    : typeof payload.lastSuccessAt === 'string'
      ? payload.lastSuccessAt
      : typeof payload.updatedAt === 'string'
        ? payload.updatedAt
        : null;
  return {
    values,
    changes: payload.changes && typeof payload.changes === 'object' ? payload.changes : {},
    updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : null,
    asOf,
    ageMinutes: Number.isFinite(payload.ageMinutes) ? payload.ageMinutes : null,
    freshnessLevel: typeof payload.freshnessLevel === 'string' ? payload.freshnessLevel : null,
    unavailable: !!payload.unavailable,
    sourceMode: typeof payload.sourceMode === 'string' ? payload.sourceMode : null,
    degradedMode: !!payload.degradedMode,
    cacheOnly: !!payload.cacheOnly,
    healthScore: payload.healthScore ?? null,
    criticalMissing: payload.criticalMissing ?? null,
    fallbackCount: payload.fallbackCount ?? null,
    lastSuccessAt: typeof payload.lastSuccessAt === 'string' ? payload.lastSuccessAt : null,
    sourceStatus: payload.sourceStatus && typeof payload.sourceStatus === 'object' ? payload.sourceStatus : {},
    sourceDetails: payload.sourceDetails && typeof payload.sourceDetails === 'object' ? payload.sourceDetails : {},
    fieldFreshness: {
      brent: brentFreshness
    },
    brentValidation: payload.brentValidation && typeof payload.brentValidation === 'object' ? payload.brentValidation : null,
    notes: Array.isArray(payload.notes) ? payload.notes : []
  };
}

function parseLocalFallbackTimestamp(value) {
  if (typeof value !== 'string' || !value) return null;
  const normalized = value.includes('T') ? value : `${value}T00:00:00Z`;
  const time = Date.parse(normalized);
  return Number.isFinite(time) ? time : null;
}

function clampRiskScore(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function scaleRealtimeRisk(value, scale) {
  return value === null ? null : clampRiskScore((value - scale.base) * scale.multiplier);
}

export function isLocalRealtimeFallbackUsable(payload, nowMs = Date.now()) {
  if (!payload || typeof payload !== 'object') {
    return { usable: false, reason: 'local-fallback-invalid-structure' };
  }

  const values = payload.values && typeof payload.values === 'object' ? payload.values : null;
  const sourceStatus = payload.sourceStatus && typeof payload.sourceStatus === 'object' ? payload.sourceStatus : null;
  const timestamp = typeof payload.asOf === 'string'
    ? payload.asOf
    : typeof payload.updatedAt === 'string'
      ? payload.updatedAt
      : typeof payload.lastSuccessAt === 'string'
        ? payload.lastSuccessAt
        : null;
  const observedMs = parseLocalFallbackTimestamp(timestamp);
  const finiteKeyCount = LOCAL_FALLBACK_KEY_FIELDS
    .filter((key) => Number.isFinite(Number(values?.[key])))
    .length;
  const missingNewFields = [
    payload.fieldFreshness && typeof payload.fieldFreshness === 'object' ? null : 'fieldFreshness',
    payload.brentValidation && typeof payload.brentValidation === 'object' ? null : 'brentValidation'
  ].filter(Boolean);

  if (!values || !sourceStatus || Object.keys(sourceStatus).length === 0 || (!payload.freshnessLevel && observedMs === null)) {
    return { usable: false, reason: 'local-fallback-invalid-structure', finiteKeyCount, missingNewFields };
  }
  if (finiteKeyCount < LOCAL_FALLBACK_MIN_FINITE_KEY_FIELDS) {
    return { usable: false, reason: `local-fallback-missing-values(${finiteKeyCount}/${LOCAL_FALLBACK_KEY_FIELDS.length})`, finiteKeyCount, missingNewFields };
  }
  if (observedMs === null) {
    return { usable: false, reason: 'local-fallback-unparseable-time', finiteKeyCount, missingNewFields };
  }
  const ageMinutes = Math.max(0, Math.round((nowMs - observedMs) / 60000));
  if (ageMinutes > LOCAL_FALLBACK_MAX_AGE_MINUTES) {
    return { usable: false, reason: `local-fallback-stale(${ageMinutes}m)`, ageMinutes, finiteKeyCount, missingNewFields };
  }
  if (missingNewFields.length) {
    return { usable: false, reason: `local-fallback-missing-new-structure(${missingNewFields.join(',')})`, ageMinutes, finiteKeyCount, missingNewFields };
  }
  return { usable: true, reason: null, ageMinutes, finiteKeyCount, missingNewFields };
}

function withCacheBust(url) {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}_=${Date.now()}`;
}

function summarizeWorkerDiagnostics(payload) {
  const diagnostics = payload?.workerGeneratedPreview?.diagnostics;
  if (!diagnostics || typeof diagnostics !== 'object') return null;
  const summary = diagnostics.sourceHttpSummary || {};
  const sourceStatus = (key) => {
    const status = summary?.[key]?.status;
    return status == null ? 'n/a' : status;
  };
  const fredStatuses = Array.isArray(diagnostics.fredFailureStatuses)
    ? diagnostics.fredFailureStatuses.join('|')
    : 'n/a';
  return `FRED全部失败=${diagnostics.fredAllFailed ?? 'n/a'} / FRED状态=${fredStatuses || 'n/a'} / Yahoo=${sourceStatus('yahoo')} / Stooq=${sourceStatus('stooq')} / Gold=${sourceStatus('gold')}`;
}

function buildWorkerCandidateStatus(partial = {}) {
  return {
    available: false,
    status: 'unavailable',
    url: realtimeSourcePolicy.workerEndpoint,
    httpStatus: null,
    fetchedAt: new Date().toISOString(),
    updatedAt: null,
    ageMinutes: null,
    sourceMode: null,
    healthScore: null,
    criticalMissing: null,
    unavailable: null,
    rejectionReason: null,
    valuesSummary: {
      brent: null,
      dxy: null,
      vix: null,
      spx: null,
      us10y: null,
      real10y: null,
      gold: null
    },
    brentConsensus: null,
    canPromoteToPrimary: null,
    diagnosticsSummary: null,
    ...partial
  };
}

export function canUseWorkerGeneratedRealtimePayload(payload, nowMs = Date.now(), httpStatus = 200) {
  if (httpStatus !== 200) return { usable: false, reason: `http-${httpStatus || 0}` };
  if (!payload || typeof payload !== 'object') return { usable: false, reason: 'invalid-payload' };
  if (payload?.workerGeneratedPreview?.enabled !== true) return { usable: false, reason: 'worker-preview-disabled' };
  if (payload.unavailable === true) return { usable: false, reason: 'worker-unavailable' };
  if (payload.sourceMode !== 'worker-generated-preview') return { usable: false, reason: 'source-mode-not-worker-preview' };
  const healthScore = Number(payload.healthScore);
  if (!Number.isFinite(healthScore) || healthScore < realtimeSourcePolicy.workerMinHealthScore) return { usable: false, reason: `health-score-below-${realtimeSourcePolicy.workerMinHealthScore}` };
  const criticalMissing = Number(payload.criticalMissing);
  if (!Number.isFinite(criticalMissing) || criticalMissing > realtimeSourcePolicy.workerMaxCriticalMissing) return { usable: false, reason: `critical-missing-above-${realtimeSourcePolicy.workerMaxCriticalMissing}` };
  const updatedAtMs = Date.parse(payload.updatedAt);
  if (!Number.isFinite(updatedAtMs)) return { usable: false, reason: 'updatedAt-invalid' };
  const ageMinutes = Math.max(0, Math.round((nowMs - updatedAtMs) / 60000));
  if (ageMinutes > realtimeSourcePolicy.workerMaxAgeMinutes) return { usable: false, reason: `worker-stale(${ageMinutes}m)` };
  if (!payload.values || typeof payload.values !== 'object') return { usable: false, reason: 'values-missing' };
  for (const key of realtimeSourcePolicy.workerRequiredFields) {
    const value = Number(payload.values[key]);
    if (!Number.isFinite(value)) return { usable: false, reason: `${key}-not-finite` };
    if (key === 'brent' && value === 0) return { usable: false, reason: 'brent-zero' };
  }
  return { usable: true, reason: null, ageMinutes };
}

function buildWorkerCandidateFromPayload(payload, httpStatus, fetchedAt, gate) {
  const healthScore = Number(payload.healthScore);
  const criticalMissing = Number(payload.criticalMissing);
  const ageMinutes = computeAgeMinutes(payload.updatedAt);
  const unavailable = payload.unavailable === true;
  const available = gate.usable;
  const values = payload.values || {};
  const consensus = payload?.brentValidation?.consensus || {};
  return buildWorkerCandidateStatus({
    available,
    status: available ? 'ok' : gate.reason || 'unavailable',
    httpStatus,
    fetchedAt,
    updatedAt: payload.updatedAt,
    ageMinutes,
    sourceMode: payload.sourceMode,
    healthScore,
    criticalMissing,
    unavailable,
    rejectionReason: gate.reason,
    valuesSummary: {
      brent: getRealtimeNumber(values, 'brent'),
      dxy: getRealtimeNumber(values, 'dxy'),
      vix: getRealtimeNumber(values, 'vix'),
      spx: getRealtimeNumber(values, 'spx'),
      us10y: getRealtimeNumber(values, 'us10y'),
      real10y: getRealtimeNumber(values, 'real10y'),
      gold: getRealtimeNumber(values, 'gold')
    },
    brentConsensus: Number.isFinite(Number(consensus.recommendedValue))
      ? Number(consensus.recommendedValue)
      : null,
    canPromoteToPrimary: consensus.canPromoteToPrimary === true,
    diagnosticsSummary: summarizeWorkerDiagnostics(payload)
  });
}

async function fetchWorkerGeneratedCandidateResult() {
  const fetchedAt = new Date().toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), realtimeSourcePolicy.workerTimeoutMs);
  try {
    const response = await fetch(withCacheBust(realtimeSourcePolicy.workerEndpoint), {
      cache: 'no-store',
      signal: controller.signal
    });
    if (!response.ok) {
      return {
        payload: null,
        candidate: buildWorkerCandidateStatus({
        status: 'http-error',
        httpStatus: response.status,
          fetchedAt,
          rejectionReason: `http-${response.status}`
        })
      };
    }
    let payload;
    try {
      payload = await response.json();
    } catch (_error) {
      return {
        payload: null,
        candidate: buildWorkerCandidateStatus({
        status: 'json-error',
        httpStatus: response.status,
          fetchedAt,
          rejectionReason: 'json-error'
        })
      };
    }
    const gate = canUseWorkerGeneratedRealtimePayload(payload, Date.now(), response.status);
    return {
      payload: gate.usable ? normalizeRealtimePayload(payload) : null,
      candidate: buildWorkerCandidateFromPayload(payload, response.status, fetchedAt, gate)
    };
  } catch (error) {
    const status = error?.name === 'AbortError' ? 'timeout' : 'unavailable';
    return {
      payload: null,
      candidate: buildWorkerCandidateStatus({
        status,
        fetchedAt,
        rejectionReason: status
      })
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchWorkerGeneratedCandidate() {
  const result = await fetchWorkerGeneratedCandidateResult();
  return result.candidate;
}

function buildWorkerFirstDisabledResult() {
  const candidate = buildWorkerCandidateStatus({
    status: 'disabled-by-config',
    fetchedAt: new Date().toISOString(),
    rejectionReason: 'worker-first-disabled-by-config'
  });
  return { payload: null, candidate };
}

function buildRealtimeFetchAudit({ realtimeResult, realtimePayload, runtimeMetadata }) {
  const fromResult = realtimeResult?.realtimeFetchAudit || runtimeMetadata?.realtimeFetchAudit;
  if (fromResult && typeof fromResult === 'object') {
    return fromResult;
  }
  const selectedSource = runtimeMetadata?.realtimeSource || 'none';
  return {
    attemptedAt: new Date().toISOString(),
    remoteUrl: REMOTE_REALTIME_URL,
    cacheBusted: true,
    selectedSource,
    remoteUpdatedAt: realtimePayload?.updatedAt || runtimeMetadata?.realtimeUpdatedAt || null,
    remoteSourceMode: realtimePayload?.sourceMode || runtimeMetadata?.realtimeSourceMode || null,
    remoteHealthScore: Number.isFinite(realtimePayload?.healthScore)
      ? realtimePayload.healthScore
      : Number.isFinite(runtimeMetadata?.realtimeHealthScore) ? runtimeMetadata.realtimeHealthScore : null,
    fallbackReason: runtimeMetadata?.realtimeFetchFailed
      ? runtimeMetadata?.realtimeFallbackUsed ? 'remote-failed-local-fallback-used' : 'remote-and-local-failed'
      : selectedSource === 'worker-generated-preview' || selectedSource === 'github-realtime-data' ? null : runtimeMetadata?.realtimeError || null
  };
}

export async function fetchRealtimePayload() {
  const workerResult = realtimeSourcePolicy.workerFirstEnabled
    ? await fetchWorkerGeneratedCandidateResult()
    : buildWorkerFirstDisabledResult();
  const realtimeFetchAudit = {
    attemptedAt: new Date().toISOString(),
    remoteUrl: REMOTE_REALTIME_URL,
    workerUrl: realtimeSourcePolicy.workerEndpoint,
    cacheBusted: true,
    selectedSource: 'none',
    remoteUpdatedAt: null,
    remoteSourceMode: null,
    remoteHealthScore: null,
    workerStatus: workerResult.candidate.status,
    workerRejectionReason: workerResult.candidate.rejectionReason,
    fallbackReason: null
  };
  const realtimeSourcePriority = {
    selected: 'none',
    policy: {
      workerFirstEnabled: realtimeSourcePolicy.workerFirstEnabled,
      rollbackMode: !realtimeSourcePolicy.workerFirstEnabled,
      reason: realtimeSourcePolicy.workerFirstEnabled ? 'worker-first-enabled' : 'worker-first-disabled-by-config'
    },
    workerCandidate: {
      attempted: realtimeSourcePolicy.workerFirstEnabled,
      available: workerResult.candidate.available,
      status: workerResult.candidate.status,
      rejectionReason: workerResult.candidate.rejectionReason,
      ageMinutes: workerResult.candidate.ageMinutes,
      healthScore: workerResult.candidate.healthScore,
      criticalMissing: workerResult.candidate.criticalMissing
    },
    githubFallback: {
      attempted: false,
      used: false,
      status: null,
      ageMinutes: null
    }
  };

  if (realtimeSourcePolicy.workerFirstEnabled && workerResult.payload && workerResult.candidate.available) {
    realtimeSourcePriority.selected = 'worker-generated-preview';
    return {
      payload: workerResult.payload,
      realtimeSource: 'worker-generated-preview',
      realtimeAvailable: true,
      realtimeFetchFailed: false,
      realtimeFallbackUsed: false,
      realtimeUpdatedAt: workerResult.payload.updatedAt,
      realtimeError: null,
      workerGeneratedCandidate: workerResult.candidate,
      realtimeSourcePriority,
      realtimeFetchAudit: {
        ...realtimeFetchAudit,
        selectedSource: 'worker-generated-preview',
        remoteUpdatedAt: workerResult.payload.updatedAt,
        remoteSourceMode: workerResult.payload.sourceMode,
        remoteHealthScore: Number.isFinite(workerResult.payload.healthScore) ? workerResult.payload.healthScore : null,
        fallbackReason: null
      }
    };
  }

  const attempts = [
    { url: withCacheBust(REMOTE_REALTIME_URL), source: 'github-realtime-data', fallbackUsed: false, fetchOptions: { cache: 'no-store' } },
    { url: localRealtimeUrl, source: 'local-fallback', fallbackUsed: true, fetchOptions: { cache: 'no-store' } }
  ];
  let lastError = null;
  for (const attempt of attempts) {
    try {
      const response = await fetch(attempt.url, attempt.fetchOptions);
      if (attempt.source === 'github-realtime-data') {
        realtimeSourcePriority.githubFallback.attempted = true;
        realtimeSourcePriority.githubFallback.status = response.status;
      }
      if (!response.ok) {
        lastError = `${attempt.source}:${response.status}`;
        continue;
      }
      const rawPayload = await response.json();
      const payload = normalizeRealtimePayload(rawPayload);
      if (!payload) {
        lastError = `${attempt.source}:invalid-payload`;
        continue;
      }
      if (attempt.source === 'github-realtime-data') {
        realtimeFetchAudit.remoteUpdatedAt = payload.updatedAt;
        realtimeFetchAudit.remoteSourceMode = payload.sourceMode;
        realtimeFetchAudit.remoteHealthScore = Number.isFinite(payload.healthScore) ? payload.healthScore : null;
        realtimeSourcePriority.githubFallback.ageMinutes = computeAgeMinutes(payload.updatedAt);
      }
      if (attempt.fallbackUsed) {
        const fallbackGate = isLocalRealtimeFallbackUsable(rawPayload);
        if (!fallbackGate.usable) {
          lastError = fallbackGate.reason;
          continue;
        }
        payload.notes = [
          ...payload.notes,
          `local-fallback-accepted:age=${fallbackGate.ageMinutes}m`
        ];
      }
      realtimeSourcePriority.selected = attempt.source;
      if (attempt.source === 'github-realtime-data') realtimeSourcePriority.githubFallback.used = true;
      return {
        payload,
        realtimeSource: attempt.source,
        realtimeAvailable: true,
        realtimeFetchFailed: false,
        realtimeFallbackUsed: attempt.fallbackUsed,
        realtimeUpdatedAt: payload.updatedAt,
        realtimeError: lastError,
        workerGeneratedCandidate: workerResult.candidate,
        realtimeSourcePriority,
        realtimeFetchAudit: {
          ...realtimeFetchAudit,
          selectedSource: attempt.source,
          fallbackReason: attempt.source === 'github-realtime-data' ? workerResult.candidate.rejectionReason : lastError
        }
      };
    } catch (error) {
      lastError = `${attempt.source}:${errorMessage(error)}`;
    }
  }
  return {
    payload: null,
    realtimeSource: 'none',
    realtimeAvailable: false,
    realtimeFetchFailed: true,
    realtimeFallbackUsed: false,
    realtimeUpdatedAt: null,
    realtimeError: lastError,
    workerGeneratedCandidate: workerResult.candidate,
    realtimeSourcePriority,
    realtimeFetchAudit: {
      ...realtimeFetchAudit,
      selectedSource: 'none',
      fallbackReason: lastError
    }
  };
}

export function buildRuntimeState(baseline, history, realtimeResult) {
  const realtimePayload = realtimeResult.payload;
  const workerGeneratedCandidate = realtimeResult.workerGeneratedCandidate || buildWorkerCandidateStatus();
  const brentFieldFreshness = realtimePayload?.fieldFreshness?.brent || null;
  const brentFreshnessLevel = brentFieldFreshness?.freshnessLevel || null;
  const brentIsStale = brentFreshnessLevel === 'stale' || brentFreshnessLevel === 'unavailable';
  // B-worker: worker promotion audit flags when values.brent is a held/anchor value
  // older than the held-age cap. Soft display warning only — never gates overlay use,
  // never drops Brent, never touches scoring. Absent (pre-deploy / fallback) → false.
  const brentAudit = realtimePayload?.brentValidation?.audit || null;
  const brentHeldBeyondAgeCap = brentAudit?.heldBeyondAgeCap === true;
  const brentSelectedAgeHours = Number.isFinite(brentAudit?.selectedAgeHours)
    ? brentAudit.selectedAgeHours
    : null;
  const realtimeAsOf = realtimePayload?.asOf || realtimePayload?.lastSuccessAt || realtimePayload?.updatedAt || null;
  const realtimeAgeMinutes = computeAgeMinutes(realtimeAsOf);
  const realtimeFreshnessLevel = classifyFreshnessLevel(realtimeAgeMinutes, !!realtimePayload?.values);
  const realtimeDegraded = !!(realtimePayload?.degradedMode || realtimePayload?.cacheOnly || realtimeResult.realtimeFallbackUsed);
  const realtimeUnavailable = realtimeFreshnessLevel === 'unavailable' || !realtimePayload?.values;
  const runtimeMetadata = {
    realtimeSource: realtimeResult.realtimeSource,
    realtimeAvailable: realtimeResult.realtimeAvailable,
    realtimeFetchFailed: realtimeResult.realtimeFetchFailed,
    realtimeFallbackUsed: realtimeResult.realtimeFallbackUsed,
    realtimeUpdatedAt: realtimeResult.realtimeUpdatedAt,
    realtimeError: realtimeResult.realtimeError,
    realtimeAsOf,
    realtimeFreshnessLevel,
    realtimeAgeMinutes,
    realtimeDegraded,
    realtimeUnavailable,
    realtimeCacheOnly: !!realtimePayload?.cacheOnly,
    realtimeHealthScore: realtimePayload?.healthScore ?? null,
    realtimeCriticalMissing: realtimePayload?.criticalMissing ?? null,
    realtimeSourceMode: realtimePayload?.sourceMode || null,
    realtimeSourceStatus: realtimePayload?.sourceStatus || {},
    realtimeSourceDetails: realtimePayload?.sourceDetails || {},
    workerGeneratedCandidate,
    realtimeSourcePriority: realtimeResult.realtimeSourcePriority || null,
    realtimeSourcePolicy: {
      ...(realtimeResult.realtimeSourcePriority?.policy || {
        workerFirstEnabled: realtimeSourcePolicy.workerFirstEnabled,
        rollbackMode: !realtimeSourcePolicy.workerFirstEnabled,
        reason: realtimeSourcePolicy.workerFirstEnabled ? 'worker-first-enabled' : 'worker-first-disabled-by-config'
      }),
      selected: realtimeResult.realtimeSourcePriority?.selected || realtimeResult.realtimeSource || 'none'
    },
    brentObservedAt: brentFieldFreshness?.observedAt ?? null,
    brentAgeMinutes: brentFieldFreshness?.ageMinutes ?? null,
    brentFreshnessLevel,
    brentIsStale,
    realtimeHasStaleKeyFields: brentIsStale,
    realtimeBrentHeldBeyondAgeCap: brentHeldBeyondAgeCap,
    realtimeBrentSelectedAgeHours: brentSelectedAgeHours
  };
  runtimeMetadata.realtimeFetchAudit = buildRealtimeFetchAudit({ realtimeResult, realtimePayload, runtimeMetadata });
  runtimeMetadata.realtimeStatusLabel = buildRealtimeStatusLabel(runtimeMetadata);
  runtimeMetadata.realtimeOverlayEnabled = shouldApplyRealtimeOverlay(runtimeMetadata, realtimePayload);
  const data = runtimeMetadata.realtimeOverlayEnabled
    ? applyRealtimeOverlay(baseline, realtimePayload)
    : rebuildDisplayTexts(structuredClone(baseline), baseline, realtimePayload);
  const healthDashboard = buildHealthDashboardModel({
    baseline,
    history,
    realtimePayload,
    runtimeMetadata,
    data
  });
  const decisionRuntimeMetadata = { ...runtimeMetadata };
  delete decisionRuntimeMetadata.workerGeneratedCandidate;
  delete decisionRuntimeMetadata.realtimeSourcePriority;
  delete decisionRuntimeMetadata.realtimeSourcePolicy;
  data.decisionModel = buildDecisionModel(data, history, decisionRuntimeMetadata, healthDashboard);
  data.__workerGeneratedCandidate = workerGeneratedCandidate;
  console.info('[gfrr] Worker candidate:', workerGeneratedCandidate);
  return { baseline, history, realtimePayload, realtimeFetchAudit: runtimeMetadata.realtimeFetchAudit, runtimeMetadata, healthDashboard, data };
}

export function getRealtimeNumber(values, key) {
  const value = Number(values?.[key]);
  return Number.isFinite(value) ? value : null;
}

function buildBaselineFallbackInputs(base) {
  const toNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  const dib = base?.displayInputsBaseline && typeof base.displayInputsBaseline === 'object'
    ? base.displayInputsBaseline
    : {};
  const creditHyOas = toNumber(base?.macroDrivers?.credit?.hyOas);
  const dibHyOas = toNumber(dib.hyOas);
  return {
    brent: toNumber(dib.brent),
    dxy: toNumber(dib.dxy),
    vix: toNumber(dib.vix),
    hyOas: dibHyOas !== null ? dibHyOas : creditHyOas,
    us10y: toNumber(dib.us10y),
    real10y: toNumber(dib.real10y),
    breakeven10y: toNumber(dib.breakeven10y),
    gold: toNumber(dib.gold),
    spx: toNumber(dib.spx)
  };
}

function buildEffectiveDisplayInputs(realtimePayload, base) {
  const values = canUseRealtimePayloadValues(realtimePayload) ? (realtimePayload?.values || {}) : {};
  const baseline = buildBaselineFallbackInputs(base);
  const pick = (key) => {
    const rtValue = getRealtimeNumber(values, key);
    if (Number.isFinite(rtValue)) return rtValue;
    const baseValue = baseline[key];
    return Number.isFinite(baseValue) ? baseValue : null;
  };
  return {
    brent: pick('brent'),
    dxy: pick('dxy'),
    vix: pick('vix'),
    hyOas: pick('hyOas'),
    us10y: pick('us10y'),
    real10y: pick('real10y'),
    breakeven10y: pick('breakeven10y'),
    gold: pick('gold'),
    spx: pick('spx')
  };
}

function rebuildDisplayTexts(target, base, realtimePayload) {
  const effectiveDisplayInputs = buildEffectiveDisplayInputs(realtimePayload, base);
  const gating = readStructuralGatingFromBase(base);
  const lock = target?.tradingSystem?.executionLock || null;
  target.topRisks = buildTopRisksDisplay(effectiveDisplayInputs);
  target.phaseSignals = buildPhaseSignalsDisplay(effectiveDisplayInputs, realtimePayload);
  target.summary = buildSummaryDisplay(effectiveDisplayInputs);
  target.decisionLine = buildDecisionLineDisplay(realtimePayload, lock, gating);
  target.triggerPanel = buildTriggerPanelDisplay(effectiveDisplayInputs, base);
  target.assetMatrix = buildAssetMatrixReasons(target.assetMatrix, effectiveDisplayInputs);
  target.scenarioTree = buildScenarioTreeTriggers(target.scenarioTree, effectiveDisplayInputs);
  if (target.tradingSystem && target.tradingSystem.signalEngine && typeof target.tradingSystem.signalEngine === 'object') {
    target.tradingSystem.signalEngine = {
      ...target.tradingSystem.signalEngine,
      notes: buildSignalEngineNotes(effectiveDisplayInputs, realtimePayload, lock, gating)
    };
  }
  if (target.liquidityIndex && typeof target.liquidityIndex === 'object') {
    target.liquidityIndex = {
      ...target.liquidityIndex,
      notes: buildLiquidityNotes(effectiveDisplayInputs, realtimePayload)
    };
  }
  target.heatmap = buildHeatmapNotes(target.heatmap, effectiveDisplayInputs);
  target.__effectiveDisplayInputs = effectiveDisplayInputs;
  return target;
}

function readStructuralGatingFromBase(base) {
  const md = base?.macroDrivers;
  if (!md || typeof md !== 'object') {
    return {
      available: false,
      allMissing: true,
      activeLabels: [],
      structuralRed: false,
      structuralYellow: false,
      redReasons: [],
      yellowReasons: []
    };
  }

  const pipelineEval = md.gatingEvaluation;
  const activeSignals = Array.isArray(md.activeSignals) ? md.activeSignals : [];
  const activeLabels = activeSignals
    .filter((s) => s && s.reliability !== 'missing')
    .map((s) => s?.label || STRUCTURAL_SIGNAL_LABELS_CN[s?.key] || s?.key)
    .filter(Boolean);

  const fed = md.fedLiquidity || {};
  const fedStatus = fed.sourceStatus || {};
  const curve = md.curve || {};
  const curveStatus = curve.sourceStatus || {};
  const credit = md.credit || {};
  const creditStatus = credit.sourceStatus || {};

  const walclAvailable = fedStatus.walcl && fedStatus.walcl !== 'missing';
  const onRrpAvailable = fedStatus.onRrp && fedStatus.onRrp !== 'missing';
  const curveAvailable = curveStatus.t10y2y && curveStatus.t10y2y !== 'missing';
  const creditAvailable = creditStatus.igOas && creditStatus.igOas !== 'missing';
  const allMissing = !walclAvailable && !onRrpAvailable && !curveAvailable && !creditAvailable;

  if (pipelineEval && typeof pipelineEval === 'object') {
    return {
      available: !allMissing,
      allMissing,
      activeLabels,
      structuralRed: !!pipelineEval.structuralRed,
      structuralYellow: !!pipelineEval.structuralYellow,
      redReasons: Array.isArray(pipelineEval.redReasons) ? pipelineEval.redReasons : [],
      yellowReasons: Array.isArray(pipelineEval.yellowReasons) ? pipelineEval.yellowReasons : []
    };
  }

  const t10y2y = curveAvailable && Number.isFinite(curve.t10y2y) ? curve.t10y2y : null;
  const onRrp = onRrpAvailable && Number.isFinite(fed.onRrp) ? fed.onRrp : null;
  const walcl4w = walclAvailable && Number.isFinite(fed.walcl4wChange) ? fed.walcl4wChange : null;
  const igOas = creditAvailable && Number.isFinite(credit.igOas) ? credit.igOas : null;

  const redCurveCreditDouble = t10y2y !== null && t10y2y <= -0.8 && igOas !== null && igOas >= 2.0;
  const onRrpCatastrophic = onRrp !== null && onRrp < 50;
  const structuralRed = redCurveCreditDouble || onRrpCatastrophic;

  const yellowCurveFedDouble = t10y2y !== null && t10y2y <= -0.5 && walcl4w !== null && walcl4w <= -1.0;
  const yellowIgWatch = igOas !== null && igOas >= 1.5;
  const yellowOnRrpCritical = onRrp !== null && onRrp < 100;
  const yellowCurveDeep = t10y2y !== null && t10y2y <= -0.5;
  const structuralYellow = yellowCurveFedDouble || yellowIgWatch || yellowOnRrpCritical || yellowCurveDeep;

  const redReasons = [];
  if (redCurveCreditDouble) redReasons.push('曲线严重倒挂且投资级信用告警');
  if (onRrpCatastrophic) redReasons.push('逆回购准备金临界告急');
  const yellowReasons = [];
  if (yellowCurveFedDouble) yellowReasons.push('曲线深度倒挂叠加美联储缩表');
  if (yellowIgWatch) yellowReasons.push('投资级信用利差进入应力区');
  if (yellowOnRrpCritical) yellowReasons.push('逆回购余额告急');
  if (yellowCurveDeep) yellowReasons.push('曲线深度倒挂');

  return {
    available: !allMissing,
    allMissing,
    activeLabels,
    structuralRed,
    structuralYellow,
    redReasons,
    yellowReasons
  };
}

export function applyRealtimeOverlay(base, realtimePayload) {
  if (!realtimePayload?.values) return base;

  const next = structuredClone(base);
  const brent = getRealtimeNumber(realtimePayload.values, 'brent');
  const dxy = getRealtimeNumber(realtimePayload.values, 'dxy');
  const vix = getRealtimeNumber(realtimePayload.values, 'vix');
  const hy = getRealtimeNumber(realtimePayload.values, 'hyOas');
  const us10y = getRealtimeNumber(realtimePayload.values, 'us10y');
  const real10y = getRealtimeNumber(realtimePayload.values, 'real10y');
  const gold = getRealtimeNumber(realtimePayload.values, 'gold');
  const spx = getRealtimeNumber(realtimePayload.values, 'spx');
  const breakeven10y = getRealtimeNumber(realtimePayload.values, 'breakeven10y');

  const oilRisk = scaleRealtimeRisk(brent, REALTIME_RISK_SCALE.oil);
  const dollarRisk = scaleRealtimeRisk(dxy, REALTIME_RISK_SCALE.dollar);
  const hyRisk = scaleRealtimeRisk(hy, REALTIME_RISK_SCALE.hy);
  const vixRisk = scaleRealtimeRisk(vix, REALTIME_RISK_SCALE.vix);
  const rateRisk = scaleRealtimeRisk(us10y, REALTIME_RISK_SCALE.rate);
  const realRisk = scaleRealtimeRisk(real10y, REALTIME_RISK_SCALE.realRate);
  const inflationRisk = breakeven10y === null || oilRisk === null
    ? null
    : clampRiskScore(
      (breakeven10y - REALTIME_RISK_SCALE.inflationBreakeven.base) * REALTIME_RISK_SCALE.inflationBreakeven.multiplier
      + oilRisk * REALTIME_RISK_SCALE.inflationBreakeven.oilWeight
    );

  if (oilRisk !== null && vixRisk !== null) {
    const weights = REALTIME_MODULE_BLEND_WEIGHTS.geopolitical;
    next.modules.geopolitical = clampRiskScore((next.modules.geopolitical * weights.base) + (oilRisk * weights.oil) + (vixRisk * weights.vix));
  }
  if (oilRisk !== null) {
    const weights = REALTIME_MODULE_BLEND_WEIGHTS.energy;
    next.modules.energy = clampRiskScore((next.modules.energy * weights.base) + oilRisk * weights.oil);
  }
  if (inflationRisk !== null) {
    const weights = REALTIME_MODULE_BLEND_WEIGHTS.inflation;
    next.modules.inflation = clampRiskScore((next.modules.inflation * weights.base) + inflationRisk * weights.inflation);
  }
  if (dollarRisk !== null && hyRisk !== null && vixRisk !== null && rateRisk !== null) {
    const weights = REALTIME_MODULE_BLEND_WEIGHTS.liquidity;
    next.modules.liquidity = clampRiskScore((next.modules.liquidity * weights.base) + dollarRisk * weights.dollar + hyRisk * weights.hy + vixRisk * weights.vix + rateRisk * weights.rate);
  }
  if (realRisk !== null && rateRisk !== null && hyRisk !== null) {
    const weights = REALTIME_MODULE_BLEND_WEIGHTS.debt;
    next.modules.debt = clampRiskScore((next.modules.debt * weights.base) + realRisk * weights.realRate + rateRisk * weights.rate + hyRisk * weights.hy);
  }
  if (hyRisk !== null && vixRisk !== null && dollarRisk !== null) {
    const weights = REALTIME_MODULE_BLEND_WEIGHTS.banking;
    next.modules.banking = clampRiskScore((next.modules.banking * weights.base) + hyRisk * weights.hy + vixRisk * weights.vix + dollarRisk * weights.dollar);
  }

  const totalScore = Math.round(
    next.modules.geopolitical * REALTIME_TOTAL_SCORE_WEIGHTS.geopolitical +
    next.modules.energy * REALTIME_TOTAL_SCORE_WEIGHTS.energy +
    next.modules.inflation * REALTIME_TOTAL_SCORE_WEIGHTS.inflation +
    next.modules.liquidity * REALTIME_TOTAL_SCORE_WEIGHTS.liquidity +
    next.modules.debt * REALTIME_TOTAL_SCORE_WEIGHTS.debt +
    next.modules.banking * REALTIME_TOTAL_SCORE_WEIGHTS.banking
  );
  next.score = totalScore;
  next.liquidityIndex.score = next.modules.liquidity;
  next.liquidityIndex.regime = next.modules.liquidity >= 70 ? '限制性偏紧' : next.modules.liquidity >= 55 ? '偏紧缓解' : '流动性修复';
  next.liquidityIndex.directionLabel = realtimePayload.cacheOnly ? '快变量缓存模式' : realtimePayload.degradedMode ? '快变量带回退' : '快变量已实时覆盖';

  const hardStopThresholds = REALTIME_EXECUTION_THRESHOLDS.hardStop;
  const cautionThresholds = REALTIME_EXECUTION_THRESHOLDS.caution;
  const hardStopBase = realtimePayload.cacheOnly
    || next.modules.liquidity >= hardStopThresholds.liquidity
    || (brent !== null && brent >= hardStopThresholds.brent)
    || (hy !== null && hy >= hardStopThresholds.hy)
    || (vix !== null && vix >= hardStopThresholds.vix)
    || totalScore >= hardStopThresholds.totalScore;
  const cautionBase = !hardStopBase && (
    realtimePayload.degradedMode
    || next.modules.liquidity >= cautionThresholds.liquidity
    || (brent !== null && brent >= cautionThresholds.brent)
    || (hy !== null && hy >= cautionThresholds.hy)
    || (vix !== null && vix >= cautionThresholds.vix)
    || totalScore >= cautionThresholds.totalScore
  );

  const gating = readStructuralGatingFromBase(base);

  const hardStop = hardStopBase || gating.structuralRed;
  const caution = !hardStop && (cautionBase || gating.structuralYellow);

  let level = 'green';
  let levelLabel = '绿灯 / 允许分批进攻';
  let title = '今天允许小幅加仓，但必须按纪律分批执行';
  let desc = '流动性、信用和波动率均回到相对稳定区，系统允许提高风险暴露，但必须按分批规则执行。';
  let allow = ['允许分三笔以内提高总仓位。', '允许增加质量权益和部分成长观察仓。', '允许适度降低美元/短票仓位。'];
  let block = ['禁止一次性打满仓位。', '禁止单日大涨后追高。', '禁止取消全部对冲。'];
  let mandatory = ['单日净加仓不得超过总资产 5%。', '若状态灯重新转黄，次日停止加仓。', '若周回撤 > -3%，立即切回黄灯。'];
  let structurallyTriggered = false;

  if (hardStop) {
    level = 'red';
    levelLabel = '红灯 / 禁止新增';
    title = '今天禁止主动加仓，只允许减仓与恢复防御层';
    const structDesc = (gating.structuralRed && !hardStopBase)
      ? `结构性双压触发红灯（${gating.redReasons.join('、')}）。`
      : '';
    desc = structDesc + (
      realtimePayload.cacheOnly
        ? '关键快变量不足，系统进入缓存模式。为避免误判，执行引擎直接锁为红灯：禁止新增，只允许风险收缩。'
        : '高压风险组合已触发。执行引擎直接锁为红灯：任何新增风险动作都被禁止，只允许减仓、补现金和恢复防御仓。'
    );
    allow = ['允许减仓风险资产。', '允许补充美元/短票与现金。', '允许把黄金对冲恢复到上限。'];
    block = ['禁止新增股票与高波动仓位。', '禁止盘中追涨。', '禁止主观覆盖系统阈值。'];
    mandatory = ['若总仓位高于 42%，必须先减回 38%-42%。', '若高波动资产 > 2%，立即降回 2% 以下。', '若现金缓冲 < 30%，立即补回。'];
    structurallyTriggered = gating.structuralRed && !hardStopBase;
  } else if (caution) {
    level = 'yellow';
    levelLabel = '黄灯 / 仅允许微调';
    title = '今天不能主动加风险，只允许对齐目标仓位与防守再平衡';
    const structDesc = (gating.structuralYellow && !cautionBase)
      ? `结构性压力触发黄灯（${gating.yellowReasons.join('、')}）。`
      : '';
    desc = structDesc + '风险尚未解除，执行引擎只允许微调。允许围绕目标仓位做再平衡，但禁止新增进攻性仓位。';
    allow = ['允许把总仓位向 48% 靠拢。', '允许维持能源、美元/短票、黄金对冲层。', '允许保留防御型股票观察仓。'];
    block = ['禁止新增高波动与久期进攻仓位。', '禁止因为单日反弹而加仓。', '禁止无视执行状态灯。'];
    mandatory = ['若总仓位高于 53%，先减仓。', '若高波动资产 > 3%，降回上限以内。', '若现金缓冲 < 25%，恢复到安全区间。'];
    structurallyTriggered = gating.structuralYellow && !cautionBase;
  }

  // v27 允许保留的修改之一：executionLock（结构性红灯/黄灯门控 + structurallyTriggered）
  next.tradingSystem.executionLock = {
    tag: realtimePayload.cacheOnly ? '缓存模式 · 主观不得覆盖' : realtimePayload.degradedMode ? '带回退实时模式 · 主观不得覆盖' : '实时模式 · 主观不得覆盖',
    level,
    levelLabel,
    title,
    description: desc.trim(),
    allow,
    block,
    mandatory,
    structurallyTriggered
  };

  // v27 允许保留的修改之二：actionLayer.checkpoints 的结构性兼容合并（不整块重写 actionLayer）
  if (!next.tradingSystem.actionLayer || typeof next.tradingSystem.actionLayer !== 'object') {
    next.tradingSystem.actionLayer = {};
  }
  {
    const baseCheckpoints = [
      `布伦特 当前 ${fmtNumSafe(brent,1)}`,
      `广义美元指数 当前 ${fmtNumSafe(dxy,2)}`,
      `波动率指数 当前 ${fmtNumSafe(vix,2)}`,
      `高收益利差 当前 ${fmtNumSafe(hy,2)}%`
    ];
    const prevCheckpoints = Array.isArray(base?.tradingSystem?.actionLayer?.checkpoints)
      ? base.tradingSystem.actionLayer.checkpoints
      : [];
    const structuralCheckpoints = prevCheckpoints.filter((cp) => {
      const text = String(cp);
      return text.includes('曲线') || text.includes('投资级信用利差') || text.includes('逆回购') || text.includes('10年-2年');
    });
    next.tradingSystem.actionLayer.checkpoints = [...baseCheckpoints, ...structuralCheckpoints];
  }

  // v27 允许保留的修改之三：riskControl.hardThresholds / resetThresholds 保留 pipeline 结构性规则不被覆盖
  if (!next.tradingSystem.riskControl || typeof next.tradingSystem.riskControl !== 'object') {
    next.tradingSystem.riskControl = {};
  }
  {
    const prevHard = Array.isArray(base?.tradingSystem?.riskControl?.hardThresholds)
      ? base.tradingSystem.riskControl.hardThresholds
      : [];
    const prevReset = Array.isArray(base?.tradingSystem?.riskControl?.resetThresholds)
      ? base.tradingSystem.riskControl.resetThresholds
      : [];
    const resetThresholds = REALTIME_EXECUTION_THRESHOLDS.reset;
    const realtimeHardRules = [
      `流动性 ≥ ${hardStopThresholds.liquidity}：总仓位降至 42%。`,
      `布伦特 ≥ ${hardStopThresholds.brent}：能源上调，股票下调。`,
      `高收益利差 ≥ ${hardStopThresholds.hy}%：暂停新增风险仓位。`,
      `波动率指数 ≥ ${hardStopThresholds.vix}：切入红灯。`
    ];
    const realtimeResetRules = [
      `波动率指数 < ${resetThresholds.vix} 且高收益利差 < ${resetThresholds.hy}：才允许回到绿灯。`,
      `布伦特 < ${resetThresholds.brent} 且美元走弱：才允许提高成长仓。`,
      `关键缺失 < ${resetThresholds.criticalMissing}：解除数据回退约束。`
    ];
    const pipelineStructuralHard = prevHard.filter((rule) => {
      const text = String(rule);
      return text.includes('结构性') || text.includes('曲线') || text.includes('投资级信用利差') || text.includes('逆回购');
    });
    const pipelineStructuralReset = prevReset.filter((rule) => {
      const text = String(rule);
      return text.includes('结构性') || text.includes('曲线') || text.includes('投资级信用利差') || text.includes('逆回购');
    });
    const uniq = (arr) => [...new Set(arr.filter(Boolean))];
    next.tradingSystem.riskControl.hardThresholds = uniq([...realtimeHardRules, ...pipelineStructuralHard]);
    next.tradingSystem.riskControl.resetThresholds = uniq([...realtimeResetRules, ...pipelineStructuralReset]);
  }

  return rebuildDisplayTexts(next, base, realtimePayload);
}
