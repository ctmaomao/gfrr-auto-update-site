import {
  buildEmptySummary,
  buildSourceResult,
  clampConfidence,
  isoNow,
  normalizeErrorMessage,
  safeJsonParse,
  sanitizeStringArray,
  withPreviousSummaryOnFailure
} from './normalize-world-order-inputs.mjs';

const GDELT_CLOUD_API_BASE = 'https://gdeltcloud.com/api/v2';
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_WINDOW_DAYS = 7;
const API_BUDGET_NOTE = '100 units/month free tier';

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

function buildFailureSummary({ attemptedAt, status, error, rateLimited = false }) {
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
    cacheReason: status === 'stale' ? 'gdelt-cloud-request-failed-using-previous-summary' : null
  });
}

function buildFailureResult({ status, error, previousSource, attemptedAt, rateLimited = false }) {
  const canUsePrevious = hasReusableSummary(previousSource);
  const emptySummary = buildFailureSummary({
    attemptedAt,
    status: canUsePrevious ? 'stale' : status,
    error,
    rateLimited
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

async function fetchTextWithHeaders(url, timeoutMs, apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        'User-Agent': 'gfrr-world-order-stress/1.0'
      }
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      text
    };
  } finally {
    clearTimeout(timer);
  }
}

function statusFromHttp(status, previousSource) {
  if (status === 403 || status === 429 || status >= 500) {
    return hasReusableSummary(previousSource) ? 'stale' : 'error';
  }
  return 'error';
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

  const apiKey = process.env.GDELT_CLOUD_API_KEY || '';
  if (!apiKey) {
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

  const timeoutMs = Number.isFinite(Number(config.timeoutMs)) ? Number(config.timeoutMs) : DEFAULT_TIMEOUT_MS;
  const { dateStart, dateEnd, windowDays } = buildDateWindow(config.windowDays);
  const params = new URLSearchParams({
    group_by: 'country',
    event_family: 'conflict',
    date_start: dateStart,
    date_end: dateEnd
  });
  const url = `${GDELT_CLOUD_API_BASE}/events/summary?${params.toString()}`;

  try {
    const response = await fetchTextWithHeaders(url, timeoutMs, apiKey);
    if (!response.ok) {
      const mappedStatus = statusFromHttp(response.status, previousSource);
      return buildFailureResult({
        status: mappedStatus,
        error: `HTTP ${response.status}`,
        previousSource: mappedStatus === 'stale' ? previousSource : null,
        attemptedAt,
        rateLimited: response.status === 403 || response.status === 429
      });
    }

    const parsed = safeJsonParse(response.text);
    if (!parsed.ok) {
      return buildFailureResult({
        status: hasReusableSummary(previousSource) ? 'stale' : 'error',
        error: parsed.error,
        previousSource,
        attemptedAt
      });
    }
    if (parsed.value?.success !== true) {
      return buildFailureResult({
        status: hasReusableSummary(previousSource) ? 'stale' : 'error',
        error: 'GDELT Cloud response.success is not true',
        previousSource,
        attemptedAt
      });
    }

    const buckets = Array.isArray(parsed.value?.data)
      ? parsed.value.data.map(normalizeCountryBucket).sort((a, b) => b.event_count - a.event_count)
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

    return buildSourceResult({
      enabled: true,
      status: 'ok',
      lastFetchedAt: attemptedAt,
      summary,
      evidence: [{
        labelZh: 'GDELT Cloud 冲突事件密度',
        source: 'GDELT Cloud v2',
        summary: `近 ${windowDays} 天返回 ${totalEvents} 起冲突事件，覆盖 ${buckets.length} 个国家/地区。`,
        value: totalEvents,
        direction: totalEvents > 0 ? 'up' : 'neutral',
        confidence: totalEvents > 0 ? 0.75 : 0.35
      }],
      confidence: clampConfidence(totalEvents > 0 ? 0.75 : 0.35)
    });
  } catch (error) {
    return buildFailureResult({
      status: hasReusableSummary(previousSource) ? 'stale' : 'error',
      error,
      previousSource,
      attemptedAt
    });
  }
}
