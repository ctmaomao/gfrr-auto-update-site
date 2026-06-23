#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { fetchGdeltDocJson, sanitizeGdeltDiagnostics } from '../gdelt/fetch-gdelt.mjs';

const DIAGNOSIS_VERSION = 'oil-news-events-diagnosis-p28';
const DEFAULT_OUTPUT = 'manual-artifacts/oil-news/oil-news-events-diagnosis-latest.json';
const DEFAULT_WINDOW_DAYS = 7;
const DEFAULT_MAX_RESULTS = 12;
const DEFAULT_SOURCES = ['gdelt_doc', 'tavily', 'brave'];
const FETCH_TIMEOUT_MS = 20000;
const UA = 'gfrr-odp-oil-news-diagnosis/1.0 (+https://github.com/ctmaomao/gfrr-auto-update-site)';
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const BOUNDARY =
  'manual ODP oil-news event diagnosis only; not production data; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

const QUERY_SET = [
  {
    id: 'chokepoint_shipping',
    label: 'Chokepoint / tanker shipping',
    query:
      '("Strait of Hormuz" OR Hormuz OR "Red Sea" OR "Bab el-Mandeb" OR Suez) (oil OR crude OR tanker OR shipping OR export OR disruption OR blockade OR attack)',
    buckets: ['chokepoint', 'tanker_shipping', 'middle_east_risk']
  },
  {
    id: 'sanctions_shadow_fleet',
    label: 'Sanctions / shadow fleet',
    query:
      '(oil OR crude OR tanker OR refinery OR energy) (sanction OR sanctions OR OFAC OR embargo OR "price cap" OR "shadow fleet") (Russia OR Iran OR Venezuela OR shipping)',
    buckets: ['sanctions', 'tanker_shipping']
  },
  {
    id: 'facility_supply_disruption',
    label: 'Facility / supply disruption',
    query:
      '(oil OR crude OR refinery OR pipeline OR terminal OR port) (outage OR fire OR explosion OR attack OR shutdown OR disruption OR halt)',
    buckets: ['supply_disruption', 'facility_event']
  },
  {
    id: 'market_reaction',
    label: 'Oil market reaction',
    query:
      '(Brent OR WTI OR "oil prices" OR "crude prices") (surge OR jump OR fall OR slump OR futures OR risk premium OR supply)',
    buckets: ['market_reaction']
  }
];

const BUCKETS = {
  chokepoint: {
    labelZh: '通道/咽喉',
    weight: 3,
    patterns: [
      /\b(strait of hormuz|hormuz|red sea|bab el[- ]mandeb|suez|panama canal|turkish straits?)\b/iu,
      /\b(blockade|closed|closure|disruption|attack|strike|missile|seized|mined|mines)\b/iu
    ]
  },
  sanctions: {
    labelZh: '制裁/禁运',
    weight: 2,
    patterns: [
      /\b(sanction|sanctions|ofac|embargo|price cap|export ban|shadow fleet|insurance ban)\b/iu
    ]
  },
  supply_disruption: {
    labelZh: '供应中断',
    weight: 3,
    patterns: [
      /\b(outage|shutdown|shut down|halt|disruption|force majeure|pipeline leak|production cut|export halt)\b/iu
    ]
  },
  facility_event: {
    labelZh: '设施事件',
    weight: 2,
    patterns: [
      /\b(refinery|refineries|terminal|pipeline|oil field|oilfield|port|depot|storage|flare|fire|explosion|drone attack)\b/iu
    ]
  },
  tanker_shipping: {
    labelZh: '油轮/航运',
    weight: 1.5,
    patterns: [
      /\b(tanker|vlcc|shipping|freight|shipowner|vessel|insurance|charter|cargo|seaborne)\b/iu
    ]
  },
  middle_east_risk: {
    labelZh: '中东风险',
    weight: 1.5,
    patterns: [
      /\b(iran|israel|yemen|houthi|houthis|saudi|iraq|kuwait|uae|qatar|oman|lebanon|gulf)\b/iu
    ]
  },
  market_reaction: {
    labelZh: '市场反应',
    weight: 1,
    patterns: [
      /\b(brent|wti|crude prices?|oil prices?|futures|risk premium|prompt spread|backwardation)\b/iu
    ]
  }
};

function printUsage() {
  console.log(`Usage:
  npm run diagnose:oil-news-events -- [options]

Options:
  --allow-network       Actually call selected news sources. Default is dry-run/no network.
  --dry-run             Force no-network planning mode.
  --sources <list>      Comma list: gdelt_doc,tavily,brave. Default: ${DEFAULT_SOURCES.join(',')}
  --window-days <n>     Lookback window, 1..31 days. Default: ${DEFAULT_WINDOW_DAYS}
  --max-results <n>     Results per source/query, 1..50. Default: ${DEFAULT_MAX_RESULTS}
  --output <path>       Ignored manual artifact path. Default: ${DEFAULT_OUTPUT}
  --no-output           Do not write artifact.
  --strict              Exit non-zero when no source returns live results.
  --json                Print full JSON artifact instead of compact summary.
  --help                Show this help.`);
}

function parseArgs(argv) {
  const options = {
    allowNetwork: false,
    sources: DEFAULT_SOURCES,
    windowDays: DEFAULT_WINDOW_DAYS,
    maxResults: DEFAULT_MAX_RESULTS,
    output: DEFAULT_OUTPUT,
    writeOutput: true,
    strict: false,
    printJson: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--allow-network') {
      options.allowNetwork = true;
      continue;
    }
    if (arg === '--dry-run') {
      options.allowNetwork = false;
      continue;
    }
    if (arg === '--no-output') {
      options.writeOutput = false;
      continue;
    }
    if (arg === '--strict') {
      options.strict = true;
      continue;
    }
    if (arg === '--json') {
      options.printJson = true;
      continue;
    }

    const nextValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${arg}`);
      }
      index += 1;
      return value;
    };

    if (arg === '--sources') {
      options.sources = nextValue()
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    } else if (arg === '--window-days') {
      options.windowDays = Number(nextValue());
    } else if (arg === '--max-results') {
      options.maxResults = Number(nextValue());
    } else if (arg === '--output') {
      options.output = nextValue();
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  const validSources = new Set(DEFAULT_SOURCES);
  for (const source of options.sources) {
    if (!validSources.has(source)) {
      throw new Error(`Invalid --sources entry: ${source}`);
    }
  }
  if (!options.sources.length) {
    throw new Error('Invalid --sources. Expected at least one source.');
  }
  if (!Number.isInteger(options.windowDays) || options.windowDays < 1 || options.windowDays > 31) {
    throw new Error('Invalid --window-days. Expected integer 1..31.');
  }
  if (!Number.isInteger(options.maxResults) || options.maxResults < 1 || options.maxResults > 50) {
    throw new Error('Invalid --max-results. Expected integer 1..50.');
  }
  if (options.writeOutput && !isManualArtifactPath(options.output)) {
    throw new Error(`Refusing to write outside manual-artifacts/: ${options.output}`);
  }

  return options;
}

function safeRelativePath(filePath) {
  const absolutePath = resolve(filePath);
  const relativePath = relative(process.cwd(), absolutePath);
  if (relativePath === '' || relativePath.startsWith('..')) {
    return null;
  }
  return relativePath.replace(/\\/g, '/');
}

function isManualArtifactPath(filePath) {
  const relativePath = safeRelativePath(filePath);
  return Boolean(relativePath && relativePath.startsWith('manual-artifacts/'));
}

function readSecretList(envNames, filePaths = []) {
  const values = [];
  const sources = [];

  for (const name of envNames) {
    const raw = String(process.env[name] || '').trim();
    if (!raw) continue;
    const parsed = raw.split(/[\s,;]+/u).map((key) => key.trim()).filter(Boolean);
    values.push(...parsed);
    sources.push(`env:${name}`);
  }

  for (const filePath of filePaths) {
    const absolutePath = resolve(filePath);
    if (!existsSync(absolutePath)) continue;
    const raw = readFileSync(absolutePath, 'utf8').trim();
    if (!raw) continue;
    const parsed = raw.split(/[\s,;]+/u).map((key) => key.trim()).filter(Boolean);
    values.push(...parsed);
    sources.push(`file:${safeRelativePath(filePath) || filePath}`);
  }

  return {
    values: [...new Set(values)],
    sources: [...new Set(sources)]
  };
}

function getApiKeyState() {
  const tavily = readSecretList(
    ['TAVILY_API_KEYS', 'TAVILY_API_KEY'],
    [
      'manual-artifacts/oil-news/tavily-api-key.txt',
      'manual-artifacts/local-secrets/tavily-api-key.txt'
    ]
  );
  const brave = readSecretList(
    ['BRAVE_API_KEYS', 'BRAVE_API_KEY'],
    [
      'manual-artifacts/oil-news/brave-api-key.txt',
      'manual-artifacts/local-secrets/brave-api-key.txt'
    ]
  );

  return {
    tavily: {
      configured: tavily.values.length > 0,
      sourceCount: tavily.values.length,
      sources: tavily.sources
    },
    brave: {
      configured: brave.values.length > 0,
      sourceCount: brave.values.length,
      sources: brave.sources
    },
    _keys: {
      tavily: tavily.values,
      brave: brave.values
    }
  };
}

function compactSnippet(text, maxLen = 220) {
  const value = String(text || '').replace(/\s+/gu, ' ').trim();
  return value.length > maxLen ? `${value.slice(0, maxLen - 1)}...` : value;
}

function normalizeUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return raw;
  }
}

function domainFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./iu, '');
  } catch {
    return null;
  }
}

function parseDateToIso(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const trimmed = value.trim();
  const compact = trimmed.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/u);
  if (compact) {
    return `${compact[1]}-${compact[2]}-${compact[3]}T${compact[4]}:${compact[5]}:${compact[6]}Z`;
  }
  const time = Date.parse(trimmed);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function sourceEnabled(options, source) {
  return options.sources.includes(source);
}

function dryRunSourceResult(source, options, keyState) {
  const needsKey = source === 'tavily' || source === 'brave';
  const keyInfo = source === 'tavily' ? keyState.tavily : source === 'brave' ? keyState.brave : null;
  return {
    source,
    status: 'dry_run',
    enabled: sourceEnabled(options, source),
    networkUsed: false,
    requiresKey: needsKey,
    keyConfigured: needsKey ? keyInfo.configured : false,
    keySourceCount: needsKey ? keyInfo.sourceCount : 0,
    plannedRequests: QUERY_SET.map((query) => ({
      queryId: query.id,
      label: query.label,
      maxResults: options.maxResults,
      windowDays: options.windowDays
    })),
    articles: [],
    error: null
  };
}

async function fetchWithTimeout(url, fetchOptions = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), fetchOptions.timeoutMs || FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: fetchOptions.method || 'GET',
      headers: fetchOptions.headers || {},
      body: fetchOptions.body,
      signal: controller.signal,
      redirect: 'follow'
    });
    const text = await response.text();
    if (!response.ok) {
      const error = new Error(`${fetchOptions.label || 'fetch'} HTTP ${response.status}`);
      error.status = response.status;
      error.retryAfter = response.headers.get('Retry-After') || '';
      error.bodySnippet = compactSnippet(text, 180);
      throw error;
    }
    if (fetchOptions.asJson) {
      try {
        return JSON.parse(text);
      } catch (parseError) {
        throw new Error(`${fetchOptions.label || 'fetch'} JSON parse failed: ${parseError.message}`);
      }
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchGdeltDoc(querySpec, options) {
  const params = new URLSearchParams({
    query: querySpec.query,
    mode: 'ArtList',
    format: 'json',
    maxrecords: String(options.maxResults),
    timespan: `${options.windowDays}d`,
    sort: 'HybridRel'
  });
  const { json, diagnostics } = await fetchGdeltDocJson({
    queryParams: params,
    userAgent: BROWSER_UA,
    timeoutMs: FETCH_TIMEOUT_MS,
    label: 'GDELT DOC'
  });
  const articles = Array.isArray(json?.articles) ? json.articles : [];
  return {
    articles: articles.map((item) => normalizeArticle({
      source: 'gdelt_doc',
      querySpec,
      title: item.title,
      url: item.url,
      sourceName: item.domain,
      publishedAt: item.seendate,
      snippet: item.socialimage ? `image:${item.socialimage}` : ''
    })),
    requestDiagnostics: sanitizeGdeltDiagnostics(diagnostics)
  };
}

async function fetchTavily(querySpec, options, keys) {
  if (!keys.length) {
    throw new Error('TAVILY_API_KEYS not configured');
  }
  const payload = {
    query: querySpec.query,
    topic: 'news',
    search_depth: 'basic',
    max_results: options.maxResults,
    time_range: options.windowDays <= 7 ? 'week' : 'month',
    include_answer: false,
    include_raw_content: false,
    include_usage: true
  };
  let lastError = null;
  for (const [index, key] of keys.entries()) {
    try {
      const json = await fetchWithTimeout('https://api.tavily.com/search', {
        method: 'POST',
        asJson: true,
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'User-Agent': UA
        },
        body: JSON.stringify(payload),
        timeoutMs: FETCH_TIMEOUT_MS,
        label: `Tavily key ${index + 1}`
      });
      const rows = Array.isArray(json?.results) ? json.results : [];
      return rows.map((item) => normalizeArticle({
        source: 'tavily',
        querySpec,
        title: item.title,
        url: item.url,
        sourceName: domainFromUrl(item.url),
        publishedAt: item.published_date || item.publishedDate,
        snippet: item.content,
        score: Number.isFinite(item.score) ? item.score : null
      }));
    } catch (error) {
      lastError = error;
      console.warn(`[oil-news-events] Tavily key ${index + 1}/${keys.length} failed: ${error.message}`);
    }
  }
  throw lastError || new Error('Tavily Search API failed');
}

async function fetchBrave(querySpec, options, keys) {
  if (!keys.length) {
    throw new Error('BRAVE_API_KEYS not configured');
  }
  const params = new URLSearchParams({
    q: querySpec.query,
    freshness: options.windowDays <= 7 ? 'pw' : 'pm',
    count: String(options.maxResults),
    country: 'US',
    search_lang: 'en',
    ui_lang: 'en-US',
    extra_snippets: 'true'
  });
  let lastError = null;
  for (const [index, key] of keys.entries()) {
    try {
      const json = await fetchWithTimeout(`https://api.search.brave.com/res/v1/news/search?${params}`, {
        asJson: true,
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip',
          'User-Agent': UA,
          'X-Subscription-Token': key
        },
        timeoutMs: FETCH_TIMEOUT_MS,
        label: `Brave key ${index + 1}`
      });
      const rows = Array.isArray(json?.results) ? json.results : [];
      return rows.map((item) => {
        const extra = Array.isArray(item.extra_snippets) ? item.extra_snippets.join(' ') : '';
        return normalizeArticle({
          source: 'brave',
          querySpec,
          title: item.title,
          url: item.url,
          sourceName: item.meta_url?.hostname || item.profile?.name || domainFromUrl(item.url),
          publishedAt: item.page_age || item.age,
          snippet: `${item.description || ''} ${extra}`.trim()
        });
      });
    } catch (error) {
      lastError = error;
      console.warn(`[oil-news-events] Brave key ${index + 1}/${keys.length} failed: ${error.message}`);
    }
  }
  throw lastError || new Error('Brave News Search API failed');
}

function normalizeArticle({ source, querySpec, title, url, sourceName, publishedAt, snippet, score = null }) {
  const normalizedUrl = normalizeUrl(url);
  const text = `${title || ''} ${snippet || ''} ${normalizedUrl || ''}`;
  return {
    source,
    queryId: querySpec.id,
    queryLabel: querySpec.label,
    title: compactSnippet(title, 180) || null,
    url: normalizedUrl,
    domain: sourceName || domainFromUrl(normalizedUrl),
    publishedAt: parseDateToIso(publishedAt),
    snippet: compactSnippet(snippet, 260) || null,
    searchScore: score,
    buckets: classifyBuckets(text, querySpec.buckets)
  };
}

function classifyBuckets(text, queryBuckets = []) {
  const hits = new Set(queryBuckets);
  const value = String(text || '');
  for (const [bucket, config] of Object.entries(BUCKETS)) {
    if (config.patterns.some((pattern) => pattern.test(value))) {
      hits.add(bucket);
    }
  }
  return [...hits].sort();
}

async function collectSource(source, options, keyState) {
  const startedAt = new Date().toISOString();
  const articles = [];
  const queryRuns = [];
  let successCount = 0;
  let failureCount = 0;

  if (source === 'tavily' && keyState._keys.tavily.length === 0) {
    return {
      source,
      status: 'not_configured',
      enabled: true,
      networkUsed: false,
      startedAt,
      finishedAt: new Date().toISOString(),
      queryRuns: QUERY_SET.map((query) => ({
        queryId: query.id,
        label: query.label,
        status: 'skipped',
        error: 'TAVILY_API_KEYS not configured'
      })),
      successCount: 0,
      failureCount: QUERY_SET.length,
      articles: [],
      error: 'TAVILY_API_KEYS not configured'
    };
  }

  if (source === 'brave' && keyState._keys.brave.length === 0) {
    return {
      source,
      status: 'not_configured',
      enabled: true,
      networkUsed: false,
      startedAt,
      finishedAt: new Date().toISOString(),
      queryRuns: QUERY_SET.map((query) => ({
        queryId: query.id,
        label: query.label,
        status: 'skipped',
        error: 'BRAVE_API_KEYS not configured'
      })),
      successCount: 0,
      failureCount: QUERY_SET.length,
      articles: [],
      error: 'BRAVE_API_KEYS not configured'
    };
  }

  for (const querySpec of QUERY_SET) {
    try {
      let rows;
      let requestDiagnostics = null;
      if (source === 'gdelt_doc') {
        const result = await fetchGdeltDoc(querySpec, options);
        rows = result.articles;
        requestDiagnostics = result.requestDiagnostics;
      } else if (source === 'tavily') {
        rows = await fetchTavily(querySpec, options, keyState._keys.tavily);
      } else if (source === 'brave') {
        rows = await fetchBrave(querySpec, options, keyState._keys.brave);
      } else {
        throw new Error(`Unsupported source: ${source}`);
      }
      articles.push(...rows);
      successCount += 1;
      queryRuns.push({
        queryId: querySpec.id,
        label: querySpec.label,
        status: 'ok',
        articleCount: rows.length,
        requestDiagnostics
      });
    } catch (error) {
      failureCount += 1;
      queryRuns.push({
        queryId: querySpec.id,
        label: querySpec.label,
        status: 'error',
        error: compactSnippet(error.message, 180),
        requestDiagnostics: error.gdeltDiagnostics ? sanitizeGdeltDiagnostics(error.gdeltDiagnostics) : null
      });
    }
  }

  return {
    source,
    status: successCount > 0 ? (failureCount > 0 ? 'partial' : 'ok') : 'error',
    enabled: true,
    networkUsed: true,
    startedAt,
    finishedAt: new Date().toISOString(),
    queryRuns,
    successCount,
    failureCount,
    articles,
    error: successCount > 0 ? null : 'all oil-news queries failed'
  };
}

function dedupeArticles(rows) {
  const out = [];
  const byKey = new Map();
  for (const row of rows) {
    const key = row.url || `${row.title || ''}|${row.domain || ''}`.toLowerCase();
    if (!key.trim()) continue;
    const existing = byKey.get(key);
    if (existing) {
      existing.sources = [...new Set([...existing.sources, row.source])].sort();
      existing.queryIds = [...new Set([...existing.queryIds, row.queryId])].sort();
      existing.buckets = [...new Set([...existing.buckets, ...row.buckets])].sort();
      continue;
    }
    const normalized = {
      ...row,
      sources: [row.source],
      queryIds: [row.queryId]
    };
    byKey.set(key, normalized);
    out.push(normalized);
  }
  return out;
}

function bucketSummary(articles) {
  const summary = {};
  for (const [bucket, config] of Object.entries(BUCKETS)) {
    const hits = articles.filter((article) => article.buckets.includes(bucket));
    const sources = new Set(hits.flatMap((article) => article.sources || [article.source]).filter(Boolean));
    summary[bucket] = {
      labelZh: config.labelZh,
      articleCount: hits.length,
      sourceCount: sources.size,
      weightedScore: Number((hits.length * sources.size * config.weight).toFixed(2)),
      topArticles: hits.slice(0, 5).map(compactArticleForOutput)
    };
  }
  return summary;
}

function compactArticleForOutput(article) {
  return {
    title: article.title,
    url: article.url,
    domain: article.domain,
    publishedAt: article.publishedAt,
    sources: article.sources || [article.source],
    buckets: article.buckets,
    queryIds: article.queryIds || [article.queryId],
    snippet: article.snippet
  };
}

function rankArticles(articles) {
  return [...articles]
    .map((article) => {
      const score = article.buckets.reduce((sum, bucket) => sum + (BUCKETS[bucket]?.weight || 0), 0) *
        Math.max(1, (article.sources || [article.source]).length);
      return { article, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ article }) => compactArticleForOutput(article));
}

function deriveRecommendation(summary, sourceResults) {
  const availableSourceCount = sourceResults.filter((source) => ['ok', 'partial'].includes(source.status)).length;
  const chokepoint = summary.chokepoint?.weightedScore || 0;
  const supply = summary.supply_disruption?.weightedScore || 0;
  const sanctions = summary.sanctions?.weightedScore || 0;
  const market = summary.market_reaction?.weightedScore || 0;
  const hardEventScore = chokepoint + supply + sanctions;
  const totalScore = hardEventScore + market;

  if (availableSourceCount === 0) {
    return {
      state: 'source_unavailable',
      confidence: 'none',
      recommendation: 'configure_or_retry_manual_news_sources',
      reasonZh: '没有新闻源返回可用结果,只能保留为手动诊断空结果。'
    };
  }
  if (availableSourceCount >= 2 && (chokepoint >= 12 || supply >= 12 || hardEventScore >= 18)) {
    return {
      state: 'elevated_manual_review',
      confidence: 'medium',
      recommendation: 'manual_review_required_before_display',
      reasonZh: '至少两个新闻索引返回同类通道/供应/制裁事件信号,需要人工复核标题与来源后才可进入展示层。'
    };
  }
  if (totalScore >= 8 || hardEventScore >= 6) {
    return {
      state: 'watch',
      confidence: availableSourceCount >= 2 ? 'medium_low' : 'low',
      recommendation: 'keep_observing_cross_check_with_market_and_physical_layers',
      reasonZh: '新闻代理出现油价相关事件报道,但尚未达到多源强确认或硬事件强度门槛。'
    };
  }
  return {
    state: 'quiet',
    confidence: availableSourceCount >= 2 ? 'medium_low' : 'low',
    recommendation: 'no_direct_oil_news_pressure_observed',
    reasonZh: '本轮查询未形成可复核的油价事件压力。'
  };
}

function createArtifact(options, keyState, sourceResults) {
  const allArticles = sourceResults.flatMap((result) => result.articles || []);
  const deduped = dedupeArticles(allArticles);
  const buckets = bucketSummary(deduped);
  const sourcePublic = sourceResults.map((result) => ({
    source: result.source,
    status: result.status,
    enabled: result.enabled,
    networkUsed: result.networkUsed,
    successCount: result.successCount ?? null,
    failureCount: result.failureCount ?? null,
    queryRuns: result.queryRuns || [],
    articleCount: Array.isArray(result.articles) ? result.articles.length : 0,
    error: result.error || null,
    plannedRequests: result.plannedRequests || null
  }));
  const recommendation = deriveRecommendation(buckets, sourceResults);
  const status = options.allowNetwork
    ? recommendation.state === 'source_unavailable' ? 'warn' : 'ok'
    : 'dry_run';

  return {
    diagnosisVersion: DIAGNOSIS_VERSION,
    generatedAt: new Date().toISOString(),
    status,
    mode: options.allowNetwork ? 'manual_live_diagnosis' : 'dry_run_no_network',
    sourceKey: 'odp_oil_news_event_manual_diagnosis',
    input: {
      allowNetwork: options.allowNetwork,
      sources: options.sources,
      windowDays: options.windowDays,
      maxResultsPerQuery: options.maxResults,
      querySet: QUERY_SET.map((query) => ({
        id: query.id,
        label: query.label,
        buckets: query.buckets,
        query: query.query
      }))
    },
    keyStatus: {
      tavily: {
        configured: keyState.tavily.configured,
        sourceCount: keyState.tavily.sourceCount,
        sources: keyState.tavily.sources
      },
      brave: {
        configured: keyState.brave.configured,
        sourceCount: keyState.brave.sourceCount,
        sources: keyState.brave.sources
      }
    },
    sourceResults: sourcePublic,
    aggregate: {
      rawArticleCount: allArticles.length,
      uniqueArticleCount: deduped.length,
      liveSourceCount: sourceResults.filter((source) => ['ok', 'partial'].includes(source.status)).length,
      bucketCountWithHits: Object.values(buckets).filter((bucket) => bucket.articleCount > 0).length,
      state: recommendation.state,
      confidence: recommendation.confidence,
      recommendation: recommendation.recommendation,
      reasonZh: recommendation.reasonZh
    },
    buckets,
    topArticles: rankArticles(deduped).slice(0, 12),
    productionImpact: {
      writesProductionData: false,
      modifiesFrontend: false,
      affectsValues: false,
      affectsScoring: false,
      affectsDecisionModel: false,
      affectsExecutionLock: false,
      affectsPositionGuidance: false,
      affectsBrentPromotion: false,
      affectsOdpFinalBias: false,
      affectsGlobalRiskHeatmap: false,
      affectsCrossValidation: false
    },
    promotionEligible: false,
    productionDisplayApproved: false,
    nextStep: 'manual review artifact first; production display-only layer requires a separate reviewed P29 change',
    limitations: [
      'News search result counts are noisy and can duplicate syndicated articles.',
      'This artifact does not confirm chokepoint closure, refinery outage, supply interruption, tanker flow, or oil-price direction.',
      'Any production display must remain read-only and cross-check market, inventory, transport, and thermal/facility layers before raising confidence.'
    ],
    boundary: BOUNDARY
  };
}

async function runDiagnosis(options) {
  const keyState = getApiKeyState();
  const sources = options.sources;
  let sourceResults;

  if (!options.allowNetwork) {
    sourceResults = sources.map((source) => dryRunSourceResult(source, options, keyState));
  } else {
    sourceResults = [];
    for (const source of sources) {
      sourceResults.push(await collectSource(source, options, keyState));
    }
  }

  return createArtifact(options, keyState, sourceResults);
}

function writeArtifact(artifact, options) {
  if (!options.writeOutput) return;
  const outputPath = resolve(options.output);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  artifact.outputPath = outputPath;
}

function printSummary(artifact) {
  console.log(`Oil news event diagnosis: ${artifact.status.toUpperCase()}`);
  console.log(`mode: ${artifact.mode}`);
  console.log(`sources: ${artifact.input.sources.join(',')}`);
  console.log(`uniqueArticleCount: ${artifact.aggregate.uniqueArticleCount}`);
  console.log(`liveSourceCount: ${artifact.aggregate.liveSourceCount}`);
  console.log(`state: ${artifact.aggregate.state}`);
  console.log(`confidence: ${artifact.aggregate.confidence}`);
  console.log(`recommendation: ${artifact.aggregate.recommendation}`);
  if (artifact.outputPath) {
    console.log(`outputPath: ${artifact.outputPath}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const artifact = await runDiagnosis(options);
  writeArtifact(artifact, options);

  if (options.printJson) {
    console.log(JSON.stringify(artifact, null, 2));
  } else {
    printSummary(artifact);
  }

  if (options.strict && artifact.aggregate.liveSourceCount === 0) {
    process.exit(1);
  }
}

export {
  BUCKETS,
  DEFAULT_SOURCES,
  QUERY_SET,
  getApiKeyState,
  runDiagnosis
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
