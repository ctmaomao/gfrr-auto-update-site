import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  fetchGdeltCloudJson,
  sanitizeGdeltDiagnostics
} from '../gdelt/fetch-gdelt.mjs';
import {
  buildEmptySummary,
  buildSourceResult,
  clampConfidence,
  isoNow,
  normalizeErrorMessage,
  sanitizeStringArray,
  withPreviousSummaryOnFailure
} from './normalize-world-order-inputs.mjs';

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_WINDOW_DAYS = 7;
const API_BUDGET_NOTE = '100 units/month free tier';
const GDELT_CLOUD_USER_AGENT = 'gfrr-world-order-stress/1.0';

export const GDELT_WORLD_ORDER_CACHE_SCHEMA_VERSION = 'gdelt-world-order-cache-p39';
export const DEFAULT_GDELT_WORLD_ORDER_CACHE_OUTPUT = 'data/gdelt-world-order-cache.json';
export const GDELT_WORLD_ORDER_CACHE_MODULE = 'gdelt-world-order-cache';
export const GDELT_WORLD_ORDER_CACHE_SCOPE = 'world_order_gdelt_cloud';
export const GDELT_WORLD_ORDER_CACHE_TTL_HOURS = 12;
export const GDELT_WORLD_ORDER_STALE_MAX_HOURS = 72;
export const GDELT_WORLD_ORDER_ERROR_COOLDOWN_HOURS = 6;
export const GDELT_WORLD_ORDER_QUERY_ID = 'gdelt_world_order_conflict_country_summary';

export const KEY_CONFLICT_REGIONS = [
  'Russia',
  'Ukraine',
  'Israel',
  'Palestine',
  'Lebanon',
  'Iran',
  'Taiwan',
  'Yemen',
  'Sudan',
  'Myanmar',
  'Korea, North'
];

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampTone(value) {
  return Math.min(0, Math.max(-1, Number(value.toFixed(3))));
}

function hasReusableSummary(previousSource) {
  const summary = previousSource?.summary;
  if (!summary || typeof summary !== 'object') return false;
  return Number(summary.totalEvents || summary.totalArticles || 0) > 0 ||
    (Array.isArray(summary.regionsCovered) && summary.regionsCovered.length > 0) ||
    (Array.isArray(summary.topCountries) && summary.topCountries.length > 0);
}

function dateString(date) {
  return date.toISOString().slice(0, 10);
}

function buildDateWindow(windowDays) {
  const safeWindowDays = Number.isFinite(Number(windowDays))
    ? Math.max(1, Math.min(30, Number(windowDays)))
    : DEFAULT_WINDOW_DAYS;
  const end = new Date();
  const start = new Date(end.getTime() - safeWindowDays * 24 * 60 * 60 * 1000);
  return {
    dateStart: dateString(start),
    dateEnd: dateString(end),
    windowDays: safeWindowDays
  };
}

function emptyGdeltCloudSummary(extra = {}) {
  return buildEmptySummary({
    totalEvents: 0,
    totalArticles: 0,
    conflictEvents: 0,
    sanctionsEvents: 0,
    blockadeOrChokepointEvents: 0,
    regionsCovered: [],
    topThemes: [],
    averageTone: null,
    toneProxy: null,
    topCountries: [],
    countryCount: 0,
    fatalityEventCount: 0,
    fatalities: 0,
    keyConflictRegions: [],
    requestsUsed: 0,
    apiBudget: API_BUDGET_NOTE,
    queriesRun: [],
    successCount: 0,
    failureCount: 0,
    rateLimitedCount: 0,
    usedCachedSummary: false,
    cacheReason: null,
    attemptedAt: null,
    errors: [],
    ...extra
  });
}

function buildQueryRun({ status, articleCount = 0, error = null }) {
  return {
    label: 'GDELT Cloud conflict country summary',
    status,
    articleCount,
    error
  };
}

function readJsonIfExists(filePath) {
  try {
    const resolved = resolve(filePath);
    if (!existsSync(resolved)) return null;
    return JSON.parse(readFileSync(resolved, 'utf8'));
  } catch (_error) {
    return null;
  }
}

function cacheAgeHours(cache, nowIso) {
  const observedAt = Date.parse(cache?.lastFetchedAt || cache?.generatedAt || '');
  const nowMs = Date.parse(nowIso);
  if (!Number.isFinite(observedAt) || !Number.isFinite(nowMs)) return null;
  return Math.max(0, (nowMs - observedAt) / (60 * 60 * 1000));
}

function readGdeltWorldOrderCache(cachePath = DEFAULT_GDELT_WORLD_ORDER_CACHE_OUTPUT) {
  const cache = readJsonIfExists(cachePath);
  if (!cache || typeof cache !== 'object') return null;
  if (cache.schemaVersion !== GDELT_WORLD_ORDER_CACHE_SCHEMA_VERSION) return null;
  if (cache.module !== GDELT_WORLD_ORDER_CACHE_MODULE) return null;
  if (cache.cacheScope !== GDELT_WORLD_ORDER_CACHE_SCOPE) return null;
  if (cache.query?.id !== GDELT_WORLD_ORDER_QUERY_ID) return null;
  return cache;
}

function classifyCacheUsability(cache, { nowIso, windowDays }) {
  if (!cache) return { state: 'miss', ageHours: null };
  if (cache.query?.windowDays !== windowDays) return { state: 'incompatible', ageHours: null };

  const ageHours = cacheAgeHours(cache, nowIso);
  if (!Number.isFinite(ageHours)) return { state: 'invalid_age', ageHours: null };
  if (cache.status === 'error' && ageHours <= GDELT_WORLD_ORDER_ERROR_COOLDOWN_HOURS) {
    return { state: 'error_cooldown', ageHours };
  }
  if (hasReusableSummary({ summary: cache.summary })) {
    if (ageHours <= GDELT_WORLD_ORDER_CACHE_TTL_HOURS) return { state: 'fresh', ageHours };
    if (ageHours <= GDELT_WORLD_ORDER_STALE_MAX_HOURS) return { state: 'stale', ageHours };
  }
  return { state: 'expired', ageHours };
}

function isRateLimited(error) {
  const status = Number(error?.gdeltDiagnostics?.status || error?.status);
  return status === 403 || status === 429;
}

function buildFailureSummary({ attemptedAt, status, error, rateLimited = false, requestDiagnostics = null }) {
  const normalizedError = normalizeErrorMessage(error);
  return emptyGdeltCloudSummary({
    requestsUsed: 1,
    attemptedAt,
    queriesRun: [buildQueryRun({
      status: rateLimited ? 'rate_limited' : 'error',
      error: normalizedError
    })],
    failureCount: 1,
    rateLimitedCount: rateLimited ? 1 : 0,
    errors: [normalizedError],
    requestDiagnostics: sanitizeGdeltDiagnostics(requestDiagnostics || {}),
    cacheReason: status === 'stale' ? 'gdelt-cloud-request-failed-using-previous-summary' : null
  });
}

function buildFailureResult({ status, error, previousSource, attemptedAt, rateLimited = false, requestDiagnostics = null }) {
  const canUsePrevious = hasReusableSummary(previousSource);
  const emptySummary = buildFailureSummary({
    attemptedAt,
    status: canUsePrevious ? 'stale' : status,
    error,
    rateLimited,
    requestDiagnostics
  });
  const fallback = withPreviousSummaryOnFailure({
    sourceKey: 'GDELT Cloud',
    status: canUsePrevious ? 'stale' : status,
    error,
    previousSource: canUsePrevious ? previousSource : null,
    emptySummary
  });

  if (!fallback.reusedPrevious) return fallback;

  return {
    ...fallback,
    status: 'stale',
    summary: {
      ...emptyGdeltCloudSummary(),
      ...fallback.summary,
      requestsUsed: 1,
      apiBudget: API_BUDGET_NOTE,
      queriesRun: emptySummary.queriesRun,
      successCount: 0,
      failureCount: 1,
      rateLimitedCount: rateLimited ? 1 : 0,
      usedCachedSummary: true,
      cacheReason: 'gdelt-cloud-request-failed-using-previous-summary',
      attemptedAt,
      requestDiagnostics: sanitizeGdeltDiagnostics(requestDiagnostics || {}),
      errors: emptySummary.errors
    },
    confidence: 0.25,
    warnings: ['GDELT Cloud 本轮请求失败，已沿用旧摘要。']
  };
}

function normalizeCountryBucket(bucket) {
  const key = typeof bucket?.key === 'string' && bucket.key.trim().length
    ? bucket.key.trim()
    : 'Unknown';
  const eventCount = finiteNumber(bucket?.event_count ?? bucket?.eventCount);
  const fatalityEventCount = finiteNumber(bucket?.fatality_event_count ?? bucket?.fatalityEventCount);
  const fatalities = finiteNumber(bucket?.fatalities ?? bucket?.fatality_count ?? bucket?.fatalityCount);
  return {
    ...bucket,
    key,
    event_count: eventCount,
    fatality_event_count: fatalityEventCount,
    fatalities
  };
}

function buildQueryMetadata({ dateStart, dateEnd, windowDays }) {
  return {
    id: GDELT_WORLD_ORDER_QUERY_ID,
    endpoint: 'GDELT Cloud v2 events/summary',
    path: '/events/summary',
    groupBy: 'country',
    eventFamily: 'conflict',
    dateStart,
    dateEnd,
    windowDays,
    classification: 'single_cloud_summary_local_normalization'
  };
}

function buildCachePolicy() {
  return {
    lowFrequencyCache: true,
    sharedWrapper: 'scripts/gdelt/fetch-gdelt.mjs',
    ttlHours: GDELT_WORLD_ORDER_CACHE_TTL_HOURS,
    staleMaxHours: GDELT_WORLD_ORDER_STALE_MAX_HOURS,
    errorCooldownHours: GDELT_WORLD_ORDER_ERROR_COOLDOWN_HOURS,
    singleAttemptAfterCacheExpiry: true,
    rawProviderResponseStored: false,
    authorizationStored: false,
    productionImpact: 'world-order-overlay-only'
  };
}

function buildCacheArtifact({
  generatedAt,
  status,
  sourceStatus,
  requestMode,
  query,
  lastFetchedAt = null,
  summary = {},
  requestDiagnostics = null,
  error = null
}) {
  return {
    schemaVersion: GDELT_WORLD_ORDER_CACHE_SCHEMA_VERSION,
    module: GDELT_WORLD_ORDER_CACHE_MODULE,
    cacheScope: GDELT_WORLD_ORDER_CACHE_SCOPE,
    generatedAt,
    status,
    sourceStatus,
    requestMode,
    source: 'GDELT Cloud v2 events/summary',
    lastFetchedAt: typeof lastFetchedAt === 'string' ? lastFetchedAt : null,
    query,
    cachePolicy: buildCachePolicy(),
    summary: emptyGdeltCloudSummary(summary),
    requestDiagnostics: sanitizeGdeltDiagnostics(requestDiagnostics || {}),
    error: error ? normalizeErrorMessage(error) : null,
    productionImpact: {
      worldOrderOverlayOnly: true,
      affectsValues: false,
      affectsMainScoring: false,
      affectsDecisionModel: false,
      affectsExecution: false,
      affectsPosition: false,
      affectsOilDirection: false,
      affectsCrossValidation: false
    },
    boundary: 'World Order GDELT Cloud cache is a low-frequency sanitized proxy; it does not confirm war, supply outages, chokepoint closure, oil direction, trading action, execution, or position guidance.'
  };
}

function attachCacheArtifact(sourceResult, cacheArtifact = null) {
  if (!cacheArtifact) return sourceResult;
  return {
    ...sourceResult,
    cacheArtifact
  };
}

function buildCachedSourceResult({ cache, cacheState, attemptedAt, query }) {
  const cachedSummary = cache.summary || {};
  const totalEvents = finiteNumber(cachedSummary.totalEvents || cachedSummary.totalArticles);
  const status = cacheState === 'fresh' ? 'ok' : 'stale';
  const cacheReason = cacheState === 'fresh'
    ? 'gdelt-cloud-fresh-cache-hit'
    : 'gdelt-cloud-stale-cache-fallback';
  const summary = emptyGdeltCloudSummary({
    ...cachedSummary,
    requestsUsed: 0,
    apiBudget: API_BUDGET_NOTE,
    queriesRun: [buildQueryRun({ status: 'ok', articleCount: totalEvents })],
    usedCachedSummary: true,
    cacheReason,
    attemptedAt,
    errors: []
  });
  return attachCacheArtifact(buildSourceResult({
    enabled: true,
    status,
    lastFetchedAt: cache.lastFetchedAt || cache.generatedAt || null,
    summary,
    evidence: [{
      labelZh: 'GDELT Cloud 冲突事件密度',
      source: 'GDELT Cloud v2 cache',
      summary: `读取 ${cacheState === 'fresh' ? 'fresh' : 'stale'} cache: 近 ${query.windowDays} 天摘要为 ${totalEvents} 起冲突事件。`,
      value: totalEvents,
      direction: totalEvents > 0 ? 'up' : 'neutral',
      confidence: cacheState === 'fresh' ? 0.65 : 0.25
    }],
    confidence: cacheState === 'fresh' ? 0.65 : 0.25,
    warnings: cacheState === 'fresh' ? [] : ['GDELT Cloud live 未刷新，已使用本地 stale cache。']
  }), buildCacheArtifact({
    generatedAt: attemptedAt,
    status,
    sourceStatus: status,
    requestMode: cacheState === 'fresh' ? 'fresh_cache_hit' : 'stale_cache_read',
    query,
    lastFetchedAt: cache.lastFetchedAt || cache.generatedAt || null,
    summary
  }));
}

function buildStaleCacheAfterFailure({ cache, attemptedAt, query, error, requestDiagnostics = null }) {
  const normalizedError = normalizeErrorMessage(error);
  const rateLimited = isRateLimited(error);
  const cachedSummary = cache.summary || {};
  const summary = emptyGdeltCloudSummary({
    ...cachedSummary,
    requestsUsed: 1,
    apiBudget: API_BUDGET_NOTE,
    queriesRun: [buildQueryRun({
      status: rateLimited ? 'rate_limited' : 'error',
      error: normalizedError
    })],
    successCount: 0,
    failureCount: 1,
    rateLimitedCount: rateLimited ? 1 : 0,
    usedCachedSummary: true,
    cacheReason: 'gdelt-cloud-request-failed-using-local-cache',
    attemptedAt,
    requestDiagnostics: sanitizeGdeltDiagnostics(requestDiagnostics || {}),
    errors: [normalizedError]
  });
  const result = buildSourceResult({
    enabled: true,
    status: 'stale',
    lastFetchedAt: cache.lastFetchedAt || cache.generatedAt || null,
    summary,
    evidence: [{
      labelZh: 'GDELT Cloud 冲突事件密度',
      source: 'GDELT Cloud v2 stale cache',
      summary: `GDELT Cloud 本轮请求失败，沿用本地 cache 摘要。`,
      value: finiteNumber(cachedSummary.totalEvents || cachedSummary.totalArticles),
      direction: 'neutral',
      confidence: 0.25
    }],
    confidence: 0.25,
    warnings: ['GDELT Cloud 本轮请求失败，已使用本地 stale cache。']
  });
  return attachCacheArtifact(result, buildCacheArtifact({
    generatedAt: attemptedAt,
    status: 'stale',
    sourceStatus: 'stale',
    requestMode: 'stale_cache_after_fetch_error',
    query,
    lastFetchedAt: cache.lastFetchedAt || cache.generatedAt || null,
    summary,
    requestDiagnostics,
    error
  }));
}

function buildLiveSuccessResult({ attemptedAt, query, parsed }) {
  const buckets = Array.isArray(parsed?.data)
    ? parsed.data.map(normalizeCountryBucket).sort((a, b) => b.event_count - a.event_count)
    : [];
  const totalEvents = buckets.reduce((sum, bucket) => sum + bucket.event_count, 0);
  const fatalityEventCount = buckets.reduce((sum, bucket) => sum + bucket.fatality_event_count, 0);
  const fatalities = buckets.reduce((sum, bucket) => sum + bucket.fatalities, 0);
  const keyConflictRegions = buckets
    .map((bucket) => bucket.key)
    .filter((key) => KEY_CONFLICT_REGIONS.includes(key));
  const toneProxy = totalEvents > 0 ? clampTone(-1 * fatalityEventCount / totalEvents) : 0;
  const regionsCovered = sanitizeStringArray(buckets.map((bucket) => bucket.key)).slice(0, 10);

  const summary = emptyGdeltCloudSummary({
    totalEvents,
    totalArticles: totalEvents,
    conflictEvents: totalEvents,
    sanctionsEvents: 0,
    blockadeOrChokepointEvents: 0,
    regionsCovered,
    topThemes: [],
    averageTone: null,
    toneProxy,
    topCountries: buckets,
    countryCount: buckets.length,
    fatalityEventCount,
    fatalities,
    keyConflictRegions,
    requestsUsed: 1,
    queriesRun: [buildQueryRun({ status: 'ok', articleCount: totalEvents })],
    successCount: 1,
    failureCount: 0,
    rateLimitedCount: 0,
    usedCachedSummary: false,
    cacheReason: null,
    attemptedAt,
    errors: []
  });

  const result = buildSourceResult({
    enabled: true,
    status: 'ok',
    lastFetchedAt: attemptedAt,
    summary,
    evidence: [{
      labelZh: 'GDELT Cloud 冲突事件密度',
      source: 'GDELT Cloud v2',
      summary: `近 ${query.windowDays} 天返回 ${totalEvents} 起冲突事件，覆盖 ${buckets.length} 个国家/地区。`,
      value: totalEvents,
      direction: totalEvents > 0 ? 'up' : 'neutral',
      confidence: totalEvents > 0 ? 0.75 : 0.35
    }],
    confidence: clampConfidence(totalEvents > 0 ? 0.75 : 0.35)
  });
  return attachCacheArtifact(result, buildCacheArtifact({
    generatedAt: attemptedAt,
    status: 'ok',
    sourceStatus: 'ok',
    requestMode: 'live_cloud_query',
    query,
    lastFetchedAt: attemptedAt,
    summary
  }));
}

export async function fetchGdeltCloudSummary({ config = {}, previousSource = null } = {}) {
  const attemptedAt = isoNow();

  if (config.enabled === false) {
    return buildSourceResult({
      enabled: false,
      status: 'disabled',
      summary: emptyGdeltCloudSummary({
        attemptedAt,
        queriesRun: [buildQueryRun({ status: 'skipped' })]
      })
    });
  }

  const timeoutMs = Number.isFinite(Number(config.timeoutMs)) ? Number(config.timeoutMs) : DEFAULT_TIMEOUT_MS;
  const { dateStart, dateEnd, windowDays } = buildDateWindow(config.windowDays);
  const query = buildQueryMetadata({ dateStart, dateEnd, windowDays });
  const cachePath = typeof config.cachePath === 'string' && config.cachePath.trim().length
    ? config.cachePath
    : DEFAULT_GDELT_WORLD_ORDER_CACHE_OUTPUT;
  const cache = readGdeltWorldOrderCache(cachePath);
  const cacheUsability = classifyCacheUsability(cache, { nowIso: attemptedAt, windowDays });

  if (cacheUsability.state === 'fresh') {
    return buildCachedSourceResult({ cache, cacheState: 'fresh', attemptedAt, query });
  }

  const apiKey = process.env.GDELT_CLOUD_API_KEY || '';
  if (!apiKey) {
    if (cacheUsability.state === 'stale') {
      return buildStaleCacheAfterFailure({
        cache,
        attemptedAt,
        query,
        error: new Error('GDELT_CLOUD_API_KEY not configured')
      });
    }
    return buildSourceResult({
      enabled: false,
      status: 'not_configured',
      lastFetchedAt: null,
      summary: emptyGdeltCloudSummary({
        attemptedAt,
        queriesRun: [buildQueryRun({
          status: 'skipped',
          error: 'GDELT_CLOUD_API_KEY not configured'
        })],
        errors: ['GDELT_CLOUD_API_KEY not configured']
      }),
      evidence: [{
        labelZh: 'GDELT Cloud v2',
        source: 'GDELT Cloud v2',
        summary: 'GDELT_CLOUD_API_KEY 未配置，世界秩序 GDELT 层等待 GitHub Actions secret。',
        value: null,
        direction: 'neutral',
        confidence: 0
      }],
      confidence: 0
    });
  }

  if (cacheUsability.state === 'error_cooldown') {
    return buildFailureResult({
      status: hasReusableSummary(previousSource) ? 'stale' : 'error',
      error: 'GDELT Cloud recent error cache is still inside cooldown window',
      previousSource,
      attemptedAt,
      rateLimited: false
    });
  }

  try {
    const { json, diagnostics } = await fetchGdeltCloudJson({
      path: '/events/summary',
      queryParams: {
        group_by: 'country',
        event_family: 'conflict',
        date_start: dateStart,
        date_end: dateEnd
      },
      apiKey,
      userAgent: GDELT_CLOUD_USER_AGENT,
      timeoutMs,
      maxRetries: 0,
      label: 'GDELT Cloud conflict country summary'
    });

    if (json?.success !== true) {
      throw new Error('GDELT Cloud response.success is not true');
    }

    const result = buildLiveSuccessResult({ attemptedAt, query, parsed: json });
    return attachCacheArtifact(result, {
      ...result.cacheArtifact,
      requestDiagnostics: sanitizeGdeltDiagnostics(diagnostics)
    });
  } catch (error) {
    const requestDiagnostics = sanitizeGdeltDiagnostics(error?.gdeltDiagnostics || {});
    if (cacheUsability.state === 'stale') {
      return buildStaleCacheAfterFailure({
        cache,
        attemptedAt,
        query,
        error,
        requestDiagnostics
      });
    }
    return buildFailureResult({
      status: hasReusableSummary(previousSource) ? 'stale' : 'error',
      error,
      previousSource,
      attemptedAt,
      rateLimited: isRateLimited(error),
      requestDiagnostics
    });
  }
}
