import {
  buildEmptySummary,
  buildSourceResult,
  clampConfidence,
  fetchTextWithTimeout,
  isoNow,
  normalizeErrorMessage,
  safeJsonParse,
  sanitizeStringArray,
  withPreviousSummaryOnFailure
} from './normalize-world-order-inputs.mjs';

const GDELT_DOC_API = 'https://api.gdeltproject.org/api/v2/doc/doc';

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

export async function fetchGdeltSummary({ config = {}, previousSource = null } = {}) {
  if (config.enabled === false) {
    return buildSourceResult({
      enabled: false,
      status: 'disabled',
      summary: buildEmptySummary({
        totalArticles: 0,
        conflictEvents: 0,
        sanctionsEvents: 0,
        blockadeOrChokepointEvents: 0,
        regionsCovered: [],
        topThemes: [],
        averageTone: null,
        toneProxy: 0,
        queriesRun: 0
      })
    });
  }

  const queries = Array.isArray(config.queries) ? config.queries : [];
  const maxRecords = Number.isFinite(config.maxRecords) ? config.maxRecords : 50;
  const timeoutMs = Number.isFinite(config.timeoutMs) ? config.timeoutMs : 9000;
  const errors = [];
  const allArticles = [];
  const queryStats = [];

  try {
    for (const queryConfig of queries) {
      const query = String(queryConfig.query || '').trim();
      if (!query) continue;
      const url = buildGdeltUrl(query, maxRecords);
      const response = await fetchTextWithTimeout(url, timeoutMs);
      if (!response.ok) {
        errors.push(`${queryConfig.id || query}: HTTP 请求失败 ${response.status}`);
        continue;
      }
      const parsed = safeJsonParse(response.text);
      if (!parsed.ok) {
        errors.push(`${queryConfig.id || query}: ${normalizeErrorMessage(parsed.error)}`);
        continue;
      }
      const articles = Array.isArray(parsed.value?.articles) ? parsed.value.articles : [];
      allArticles.push(...articles.map((article) => ({ ...article, queryId: queryConfig.id })));
      queryStats.push({
        id: queryConfig.id || query,
        labelZh: queryConfig.labelZh || query,
        count: articles.length
      });
    }

    const text = allArticles.map((article) => `${article.title || ''} ${article.url || ''}`).join(' ');
    const conflictEvents = allArticles.filter((article) => /war|conflict|attack|military|escalation/iu.test(article.title || '')).length;
    const sanctionsEvents = allArticles.filter((article) => /sanction|export control|financial restriction/iu.test(article.title || '')).length;
    const blockadeOrChokepointEvents = allArticles.filter((article) => /blockade|strait|red sea|south china sea|taiwan/iu.test(article.title || '')).length;
    const regionsCovered = extractRegionHits(text);
    const topThemes = queryStats
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count)
      .map((item) => item.labelZh)
      .slice(0, 6);
    const toneProxy = estimateToneProxy(allArticles);

    const summary = {
      totalEvents: allArticles.length,
      totalArticles: allArticles.length,
      conflictEvents,
      sanctionsEvents,
      blockadeOrChokepointEvents,
      regionsCovered: sanitizeStringArray(regionsCovered),
      topThemes: sanitizeStringArray(topThemes),
      averageTone: null,
      toneProxy,
      queriesRun: queryStats.length,
      errors
    };

    const status = allArticles.length > 0 ? (errors.length ? 'partial' : 'ok') : 'error';
    const evidence = [
      {
        labelZh: 'GDELT 全球冲突与制裁报道热度',
        source: 'GDELT DOC 2.0',
        summary: `近端查询返回 ${allArticles.length} 篇相关文章，覆盖 ${regionsCovered.length} 个重点区域。`,
        value: allArticles.length,
        direction: allArticles.length > 0 ? 'up' : 'neutral',
        confidence: allArticles.length > 0 ? 0.65 : 0.1
      }
    ];

    return buildSourceResult({
      enabled: true,
      status,
      lastFetchedAt: isoNow(),
      summary,
      evidence,
      confidence: clampConfidence(allArticles.length > 0 ? 0.65 - Math.min(errors.length * 0.08, 0.25) : 0.1),
      warnings: errors.length ? ['GDELT 部分查询失败，已保留成功查询摘要。'] : []
    });
  } catch (err) {
    return withPreviousSummaryOnFailure({
      sourceKey: 'GDELT',
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
      previousSource,
      emptySummary: buildEmptySummary({
        totalEvents: 0,
        totalArticles: 0,
        conflictEvents: 0,
        sanctionsEvents: 0,
        blockadeOrChokepointEvents: 0,
        regionsCovered: [],
        topThemes: [],
        averageTone: null,
        toneProxy: 0,
        queriesRun: 0
      })
    });
  }
}
