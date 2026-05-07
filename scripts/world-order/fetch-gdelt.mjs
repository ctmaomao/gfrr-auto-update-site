import {
  buildEmptySummary,
  buildSourceResult,
  clampConfidence,
  fetchTextWithTimeout,
  isoNow,
  normalizeErrorMessage,
  safeJsonParse,
  sanitizeStringArray
} from './normalize-world-order-inputs.mjs';

const GDELT_DOC_API = 'https://api.gdeltproject.org/api/v2/doc/doc';
const DEFAULT_THROTTLE_MS = 1000;
const DEFAULT_RATE_LIMIT_RETRY_MS = 2500;
const DEFAULT_MAX_QUERIES = 4;
const QUERY_STATUS = {
  ok: 'ok',
  error: 'error',
  rateLimited: 'rate_limited',
  skipped: 'skipped'
};

const DEFAULT_QUERIES = [
  {
    id: 'conflict-theater',
    labelZh: '多战区冲突报道',
    query: '(war OR conflict OR military OR strike) (Ukraine OR Russia OR Iran OR Taiwan OR "Middle East" OR "Red Sea" OR "South China Sea" OR "North Korea")'
  },
  {
    id: 'sanctions-weaponization',
    labelZh: '制裁与经济金融武器化',
    query: '(sanctions OR "export controls" OR "financial restrictions" OR blacklist OR OFAC)'
  },
  {
    id: 'chokepoint',
    labelZh: '封锁、海峡与关键通道',
    query: '(blockade OR Strait OR "Red Sea" OR "South China Sea" OR "Taiwan Strait")'
  },
  {
    id: 'bloc-formation',
    labelZh: '阵营化与联盟硬化',
    query: '(alliance OR NATO OR AUKUS OR BRICS OR decoupling OR "supply chain")'
  }
];

function extractRegionHits(text) {
  const regions = [
    'Taiwan',
    'Ukraine',
    'Russia',
    'Iran',
    'Middle East',
    'Red Sea',
    'South China Sea',
    'North Korea'
  ];
  return regions.filter((region) => text.toLowerCase().includes(region.toLowerCase()));
}

function estimateToneProxy(articles) {
  if (!articles.length) return 0;
  const negativeTerms = ['war', 'conflict', 'sanction', 'blockade', 'attack', 'crisis', 'tension'];
  const hits = articles.reduce((sum, article) => {
    const text = `${article.title || ''} ${article.seendate || ''}`.toLowerCase();
    return sum + negativeTerms.filter((term) => text.includes(term)).length;
  }, 0);
  return Number((-1 * hits / Math.max(articles.length, 1)).toFixed(2));
}

function buildGdeltUrl(query, maxRecords) {
  const params = new URLSearchParams({
    query,
    mode: 'ArtList',
    format: 'json',
    maxrecords: String(maxRecords),
    sort: 'HybridRel'
  });
  return `${GDELT_DOC_API}?${params.toString()}`;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function emptyGdeltSummary(extra = {}) {
  return buildEmptySummary({
    totalEvents: 0,
    totalArticles: 0,
    conflictEvents: 0,
    sanctionsEvents: 0,
    blockadeOrChokepointEvents: 0,
    regionsCovered: [],
    topThemes: [],
    averageTone: null,
    toneProxy: 0,
    queriesRun: [],
    successCount: 0,
    failureCount: 0,
    rateLimitedCount: 0,
    usedCachedSummary: false,
    cacheReason: null,
    errors: [],
    ...extra
  });
}

function hasReusableGdeltSummary(previousSource) {
  const summary = previousSource?.summary;
  if (!summary || typeof summary !== 'object') return false;
  return Number(summary.totalArticles || summary.totalEvents || 0) > 0 ||
    (Array.isArray(summary.regionsCovered) && summary.regionsCovered.length > 0) ||
    (Array.isArray(summary.topThemes) && summary.topThemes.length > 0);
}

function normalizeCachedSummary(previousSource, queryRuns, errors, attemptedAt) {
  const previousSummary = previousSource?.summary && typeof previousSource.summary === 'object'
    ? previousSource.summary
    : {};
  return {
    ...emptyGdeltSummary(),
    ...previousSummary,
    totalEvents: Number.isFinite(Number(previousSummary.totalEvents))
      ? Number(previousSummary.totalEvents)
      : Number(previousSummary.totalArticles || 0),
    totalArticles: Number(previousSummary.totalArticles || previousSummary.totalEvents || 0),
    conflictEvents: Number(previousSummary.conflictEvents || 0),
    sanctionsEvents: Number(previousSummary.sanctionsEvents || 0),
    blockadeOrChokepointEvents: Number(previousSummary.blockadeOrChokepointEvents || 0),
    regionsCovered: sanitizeStringArray(previousSummary.regionsCovered),
    topThemes: sanitizeStringArray(previousSummary.topThemes),
    averageTone: previousSummary.averageTone === null
      ? null
      : Number.isFinite(Number(previousSummary.averageTone))
        ? Number(previousSummary.averageTone)
        : null,
    toneProxy: Number.isFinite(Number(previousSummary.toneProxy)) ? Number(previousSummary.toneProxy) : 0,
    queriesRun: queryRuns,
    successCount: 0,
    failureCount: queryRuns.filter((item) => item.status === QUERY_STATUS.error || item.status === QUERY_STATUS.rateLimited).length,
    rateLimitedCount: queryRuns.filter((item) => item.status === QUERY_STATUS.rateLimited).length,
    usedCachedSummary: true,
    cacheReason: 'all-current-gdelt-queries-failed-using-previous-summary',
    attemptedAt,
    errors
  };
}

function normalizeQueryConfigs(config) {
  const rawQueries = Array.isArray(config.queries) && config.queries.length ? config.queries : DEFAULT_QUERIES;
  const maxQueries = Number.isFinite(config.maxQueries) ? Math.max(1, Math.min(6, Number(config.maxQueries))) : DEFAULT_MAX_QUERIES;
  return rawQueries
    .map((queryConfig) => ({
      id: String(queryConfig.id || queryConfig.labelZh || queryConfig.query || 'gdelt-query'),
      labelZh: String(queryConfig.labelZh || queryConfig.id || queryConfig.query || 'GDELT query'),
      query: String(queryConfig.query || '').trim()
    }))
    .filter((queryConfig) => queryConfig.query.length > 0)
    .slice(0, maxQueries);
}

async function requestGdeltQuery(queryConfig, maxRecords, timeoutMs, retryDelayMs) {
  const url = buildGdeltUrl(queryConfig.query, maxRecords);
  const firstResponse = await fetchTextWithTimeout(url, timeoutMs);
  if (firstResponse.status === 429) {
    await delay(retryDelayMs);
    const retryResponse = await fetchTextWithTimeout(url, timeoutMs);
    if (retryResponse.status === 429) {
      return {
        articles: [],
        run: {
          label: queryConfig.labelZh,
          status: QUERY_STATUS.rateLimited,
          articleCount: 0,
          error: 'HTTP 429 rate limited'
        }
      };
    }
    return parseGdeltResponse(queryConfig, retryResponse);
  }
  return parseGdeltResponse(queryConfig, firstResponse);
}

function parseGdeltResponse(queryConfig, response) {
  if (!response.ok) {
    return {
      articles: [],
      run: {
        label: queryConfig.labelZh,
        status: QUERY_STATUS.error,
        articleCount: 0,
        error: `HTTP ${response.status}`
      }
    };
  }
  const parsed = safeJsonParse(response.text);
  if (!parsed.ok) {
    return {
      articles: [],
      run: {
        label: queryConfig.labelZh,
        status: QUERY_STATUS.error,
        articleCount: 0,
        error: normalizeErrorMessage(parsed.error)
      }
    };
  }
  const articles = Array.isArray(parsed.value?.articles) ? parsed.value.articles : [];
  return {
    articles: articles.map((article) => ({ ...article, queryId: queryConfig.id })),
    run: {
      label: queryConfig.labelZh,
      status: QUERY_STATUS.ok,
      articleCount: articles.length,
      error: null
    }
  };
}

export async function fetchGdeltSummary({ config = {}, previousSource = null } = {}) {
  const attemptedAt = isoNow();
  if (config.enabled === false) {
    return buildSourceResult({
      enabled: false,
      status: 'disabled',
      summary: emptyGdeltSummary({
        queriesRun: [{
          label: 'GDELT disabled',
          status: QUERY_STATUS.skipped,
          articleCount: 0,
          error: null
        }],
        attemptedAt
      })
    });
  }

  const queries = normalizeQueryConfigs(config);
  const maxRecords = Number.isFinite(config.maxRecords) ? config.maxRecords : 50;
  const timeoutMs = Number.isFinite(config.timeoutMs) ? config.timeoutMs : 9000;
  const throttleMs = Number.isFinite(config.throttleMs) ? Math.max(0, Number(config.throttleMs)) : DEFAULT_THROTTLE_MS;
  const retryDelayMs = Number.isFinite(config.rateLimitRetryMs) ? Math.max(0, Number(config.rateLimitRetryMs)) : DEFAULT_RATE_LIMIT_RETRY_MS;
  const errors = [];
  const allArticles = [];
  const queryRuns = [];

  for (const [index, queryConfig] of queries.entries()) {
    if (index > 0 && throttleMs > 0) await delay(throttleMs);
    try {
      const result = await requestGdeltQuery(queryConfig, maxRecords, timeoutMs, retryDelayMs);
      allArticles.push(...result.articles);
      queryRuns.push(result.run);
      if (result.run.error) errors.push(`${queryConfig.id}: ${result.run.error}`);
    } catch (error) {
      const normalizedError = normalizeErrorMessage(error);
      errors.push(`${queryConfig.id}: ${normalizedError}`);
      queryRuns.push({
        label: queryConfig.labelZh,
        status: QUERY_STATUS.error,
        articleCount: 0,
        error: normalizedError
      });
    }
  }

  const successCount = queryRuns.filter((item) => item.status === QUERY_STATUS.ok).length;
  const rateLimitedCount = queryRuns.filter((item) => item.status === QUERY_STATUS.rateLimited).length;
  const failureCount = queryRuns.filter((item) => item.status === QUERY_STATUS.error || item.status === QUERY_STATUS.rateLimited).length;
  const text = allArticles.map((article) => `${article.title || ''} ${article.url || ''}`).join(' ');
  const conflictEvents = allArticles.filter((article) => /war|conflict|attack|military|escalation|strike/iu.test(article.title || '')).length;
  const sanctionsEvents = allArticles.filter((article) => /sanction|export control|financial restriction|blacklist|ofac/iu.test(article.title || '')).length;
  const blockadeOrChokepointEvents = allArticles.filter((article) => /blockade|strait|red sea|south china sea|taiwan/iu.test(article.title || '')).length;
  const regionsCovered = extractRegionHits(text);
  const topThemes = queryRuns
    .filter((item) => item.articleCount > 0)
    .sort((a, b) => b.articleCount - a.articleCount)
    .map((item) => item.label)
    .slice(0, 6);
  const toneProxy = estimateToneProxy(allArticles);

  if (successCount === 0) {
    if (hasReusableGdeltSummary(previousSource)) {
      const summary = normalizeCachedSummary(previousSource, queryRuns, errors, attemptedAt);
      return buildSourceResult({
        enabled: true,
        status: 'stale',
        lastFetchedAt: typeof previousSource?.lastFetchedAt === 'string' ? previousSource.lastFetchedAt : null,
        summary,
        evidence: [{
          labelZh: 'GDELT 缓存摘要',
          source: 'GDELT DOC 2.0',
          summary: '本轮 GDELT 查询全部失败，沿用上一轮摘要并标记为缓存。',
          value: summary.totalArticles,
          direction: 'neutral',
          confidence: 0.22
        }],
        confidence: 0.22,
        reusedPrevious: true,
        warnings: ['GDELT 本轮全部查询失败，已沿用旧摘要。']
      });
    }
    return buildSourceResult({
      enabled: true,
      status: 'error',
      lastFetchedAt: attemptedAt,
      summary: emptyGdeltSummary({
        queriesRun: queryRuns,
        failureCount,
        rateLimitedCount,
        attemptedAt,
        errors
      }),
      evidence: [{
        labelZh: 'GDELT 查询失败',
        source: 'GDELT DOC 2.0',
        summary: '本轮 GDELT 查询全部失败，且没有可复用缓存摘要。',
        value: 0,
        direction: 'neutral',
        confidence: 0.05
      }],
      confidence: 0.05,
      warnings: ['GDELT 本轮全部查询失败，且没有可复用缓存。']
    });
  }

  const summary = emptyGdeltSummary({
    totalEvents: allArticles.length,
    totalArticles: allArticles.length,
    conflictEvents,
    sanctionsEvents,
    blockadeOrChokepointEvents,
    regionsCovered: sanitizeStringArray(regionsCovered),
    topThemes: sanitizeStringArray(topThemes),
    averageTone: null,
    toneProxy,
    queriesRun: queryRuns,
    successCount,
    failureCount,
    rateLimitedCount,
    usedCachedSummary: false,
    cacheReason: null,
    attemptedAt,
    errors
  });

  const status = successCount >= 3 && allArticles.length > 0 && failureCount === 0 ? 'ok' : 'partial';
  const evidence = [
    {
      labelZh: 'GDELT 全球冲突与制裁报道热度',
      source: 'GDELT DOC 2.0',
      summary: `近端查询返回 ${allArticles.length} 篇相关文章，覆盖 ${regionsCovered.length} 个重点区域。`,
      value: allArticles.length,
      direction: allArticles.length > 0 ? 'up' : 'neutral',
      confidence: status === 'ok' ? 0.65 : 0.45
    }
  ];

  return buildSourceResult({
    enabled: true,
    status,
    lastFetchedAt: attemptedAt,
    summary,
    evidence,
    confidence: clampConfidence(status === 'ok' ? 0.65 : 0.45 - Math.min(failureCount * 0.06, 0.18)),
    warnings: failureCount > 0 ? ['GDELT 部分查询失败，已保留成功查询摘要。'] : []
  });
}
