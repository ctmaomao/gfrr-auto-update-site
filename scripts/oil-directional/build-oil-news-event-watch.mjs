#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import {
  DEFAULT_GDELT_CACHE_OUTPUT,
  DEFAULT_SOURCES,
  GDELT_BROAD_QUERY_SPEC,
  GDELT_CACHE_MODULE,
  GDELT_CACHE_SCHEMA_VERSION,
  GDELT_CACHE_TTL_MINUTES,
  GDELT_ERROR_COOLDOWN_HOURS,
  GDELT_ERROR_COOLDOWN_HOURS_BY_CLASS,
  GDELT_LIVE_MAX_RETRIES,
  GDELT_RETRY_JITTER_MAX_MS,
  GDELT_STALE_MAX_HOURS,
  QUERY_SET,
  runDiagnosisWithTransientArticles
} from './diagnose-oil-news-events.mjs';
import { buildGdeltWebNgramsArticleShadow } from './build-gdelt-web-ngrams-article-shadow.mjs';
import { attachGdeltWebNgramsDisplayFallbackCache } from './gdelt-web-ngrams-display-fallback-cache.mjs';
import { buildClaimPolarityAggregate } from './oil-news-claim-classifier.mjs';

const SCHEMA_VERSION = 'oil-news-event-watch-1';
const MODULE = 'oil-news-event-watch';
const DEFAULT_OUTPUT = 'data/oil-news-event-watch.json';
const DEFAULT_WEB_NGRAMS_SHADOW_OUTPUT =
  'manual-artifacts/oil-news/gdelt-web-ngrams-article-shadow-latest.json';
const DEFAULT_WINDOW_DAYS = 7;
const DEFAULT_MAX_RESULTS = 8;
const TITLE_RISK_RULE_VERSION = 'oil-news-title-risk-p31';
const HIGH_CLAIM_TITLE_TERMS = [
  'attack',
  'attacks',
  'blockade',
  'closure',
  'closed',
  'disrupt',
  'disrupted',
  'disruption',
  'halt',
  'halts',
  'mine',
  'mines',
  'shutdown',
  'strike',
  'strikes',
  'war'
];
const BOUNDARY =
  'production read-only ODP oil-news event watch; display-only/audit-only; NOT in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function parseArgs(argv) {
  const options = {
    output: DEFAULT_OUTPUT,
    gdeltCacheOutput: DEFAULT_GDELT_CACHE_OUTPUT,
    sources: DEFAULT_SOURCES,
    windowDays: DEFAULT_WINDOW_DAYS,
    maxResults: DEFAULT_MAX_RESULTS,
    writeOutput: true,
    dryRun: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--no-output') {
      options.writeOutput = false;
      continue;
    }
    const nextValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      index += 1;
      return value;
    };
    if (arg === '--output') {
      options.output = nextValue();
    } else if (arg === '--sources') {
      options.sources = nextValue().split(',').map((value) => value.trim()).filter(Boolean);
    } else if (arg === '--gdelt-cache-output') {
      options.gdeltCacheOutput = nextValue();
    } else if (arg === '--window-days') {
      options.windowDays = Number(nextValue());
    } else if (arg === '--max-results') {
      options.maxResults = Number(nextValue());
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  const validSources = new Set(DEFAULT_SOURCES);
  const invalidSources = options.sources.filter((source) => !validSources.has(source));
  if (options.sources.length === 0 || invalidSources.length > 0) {
    throw new Error(`Unsupported oil-news source(s): ${invalidSources.join(', ') || '(none)'}`);
  }
  if (!Number.isInteger(options.windowDays) || options.windowDays < 1 || options.windowDays > 31) {
    throw new Error('Invalid --window-days. Expected integer 1..31.');
  }
  if (!Number.isInteger(options.maxResults) || options.maxResults < 1 || options.maxResults > 20) {
    throw new Error('Invalid --max-results. Expected integer 1..20 for production compact watch.');
  }
  if (options.writeOutput && !resolve(options.output).endsWith(resolve(DEFAULT_OUTPUT))) {
    throw new Error(`Refusing to write production oil-news artifact outside ${DEFAULT_OUTPUT}`);
  }
  if (options.writeOutput && !resolve(options.gdeltCacheOutput).endsWith(resolve(DEFAULT_GDELT_CACHE_OUTPUT))) {
    throw new Error(`Refusing to write GDELT cache artifact outside ${DEFAULT_GDELT_CACHE_OUTPUT}`);
  }
  return options;
}

function mapSourceStatus(status) {
  return ({
    ok: 'live',
    partial: 'partial',
    error: 'error',
    not_configured: 'not_configured',
    dry_run: 'dry_run',
    stale: 'stale'
  })[status] || 'error';
}

function statusFromSources({ dryRun, sourceResults, liveSourceCount }) {
  if (dryRun) return 'dry_run';
  if (liveSourceCount === 0) return 'source_unavailable';
  const configuredSources = sourceResults.filter((source) => source.status !== 'not_configured');
  if (configuredSources.length === 0) return 'not_configured';
  const fullLive = sourceResults.every((source) => source.status === 'ok');
  return fullLive ? 'ok' : 'partial';
}

function displayStatusZh(status, signalState) {
  if (status === 'dry_run') return 'Dry run';
  if (status === 'source_unavailable') return '源暂不可用';
  if (status === 'not_configured') return '待配置新闻源';
  return ({
    elevated_manual_review: '事件升高待核',
    watch: '观察',
    quiet: '未见直接压力',
    source_unavailable: '源暂不可用'
  })[signalState] || '观察层已接入';
}

function compactArticleForProduction(article) {
  return {
    domain: typeof article.domain === 'string' ? article.domain : null,
    publishedAt: typeof article.publishedAt === 'string' ? article.publishedAt : null,
    sources: Array.isArray(article.sources) ? article.sources.filter(Boolean) : [],
    buckets: Array.isArray(article.buckets) ? article.buckets.filter(Boolean) : [],
    queryIds: Array.isArray(article.queryIds) ? article.queryIds.filter(Boolean) : []
  };
}

function titleMatchesTerm(title, term) {
  if (typeof title !== 'string' || !title) return false;
  return new RegExp(`\\b${term}\\b`, 'iu').test(title);
}

function titleClaimTerms(title) {
  return HIGH_CLAIM_TITLE_TERMS.filter((term) => titleMatchesTerm(title, term));
}

function buildTitleRisk(topArticles) {
  const highClaimArticles = topArticles.filter((article) => titleClaimTerms(article.title).length > 0);
  const domains = [...new Set(highClaimArticles.map((article) => article.domain).filter(Boolean))].sort();
  const terms = [...new Set(highClaimArticles.flatMap((article) => titleClaimTerms(article.title)))].sort();
  return {
    ruleVersion: TITLE_RISK_RULE_VERSION,
    evaluatedArticleCount: topArticles.length,
    highClaimTitleCount: highClaimArticles.length,
    highClaimDomainCount: domains.length,
    highClaimDomains: domains.slice(0, 12),
    highClaimTerms: terms,
    directHeadlineDisplayAllowed: false,
    noteZh: highClaimArticles.length > 0
      ? '本轮 transient 新闻标题中包含封锁、战争、袭击、中断等高主张措辞;标题只用于构造聚合风险闸门,不得写入生产 JSON 或直接展示成事实确认。'
      : '本轮 transient 新闻标题未触发高主张标题规则;生产 JSON 仍不保存标题或 URL。'
  };
}

function buildHeadlineDisplayReadiness(status, titleRisk) {
  let state = 'candidate_ready_for_review';
  let reasonZh = '标题风险规则未触发,但仍需另开 reviewed UI/copy 审核后才可考虑展示标题。';

  if (status === 'dry_run') {
    state = 'dry_run_not_ready';
    reasonZh = 'Dry-run artifact 不可用于标题展示。';
  } else if (status === 'source_unavailable' || status === 'not_configured') {
    state = 'not_ready_source_unavailable';
    reasonZh = '新闻源不可用或未配置,不可展示标题。';
  } else if (titleRisk.highClaimTitleCount > 0) {
    state = 'not_ready_high_claim_title_noise';
    reasonZh = '本轮标题含高主张措辞,必须保持人工复核,不得直接进入前端标题展示。';
  }

  return {
    state,
    displayHeadlinesApproved: false,
    reasonZh,
    requiredNextReview: 'separate reviewed UI/copy PR with headline uncertainty copy and source attribution guards'
  };
}

function compactBucket(bucket) {
  return {
    labelZh: bucket.labelZh,
    articleCount: bucket.articleCount,
    sourceCount: bucket.sourceCount,
    weightedSignal: Number.isFinite(bucket.weightedScore) ? bucket.weightedScore : 0,
    topArticles: Array.isArray(bucket.topArticles) ? bucket.topArticles.slice(0, 3).map(compactArticleForProduction) : []
  };
}

function latestArticleAt(articles) {
  const dates = articles
    .map((article) => article.publishedAt)
    .filter((value) => typeof value === 'string' && !Number.isNaN(Date.parse(value)))
    .sort();
  return dates.length ? dates[dates.length - 1] : null;
}

function ageHours(iso, generatedAt) {
  if (!iso) return null;
  const then = Date.parse(iso);
  const now = Date.parse(generatedAt);
  if (Number.isNaN(then) || Number.isNaN(now)) return null;
  return Math.max(0, Math.round(((now - then) / 3600000) * 10) / 10);
}

function buildSourceStatus(sourceResults, diagnosis) {
  const sanitizeError = (value) => {
    if (!value) return null;
    const text = String(value);
    if (/API_KEYS?|Subscription-Token|Authorization|Bearer/iu.test(text)) return 'api_key_not_configured';
    return text.slice(0, 160);
  };
  const bySource = Object.fromEntries(sourceResults.map((result) => [
    result.source,
    {
      status: mapSourceStatus(result.status),
      networkUsed: result.networkUsed === true,
      successCount: Number.isFinite(result.successCount) ? result.successCount : 0,
      failureCount: Number.isFinite(result.failureCount) ? result.failureCount : 0,
      articleCount: Number.isFinite(result.articleCount) ? result.articleCount : 0,
      queryRuns: Array.isArray(result.queryRuns)
        ? result.queryRuns.map((query) => ({
            queryId: query.queryId,
            label: query.label,
            status: query.status,
            articleCount: Number.isFinite(query.articleCount) ? query.articleCount : 0,
            error: sanitizeError(query.error)
          }))
        : []
    }
  ]));
  const gdeltCache = diagnosis.sourceCaches?.gdelt_doc;
  const gdeltAvailability = gdeltCache?.availability;
  if (bySource.gdelt_doc && gdeltAvailability?.contractVersion === 'gdelt-doc-availability-v1') {
    bySource.gdelt_doc.availability = {
      contractVersion: gdeltAvailability.contractVersion,
      latestAttemptAt: gdeltAvailability.latestAttemptAt || null,
      lastLiveSuccessAt: gdeltAvailability.lastLiveSuccessAt || null,
      latestOutcome: gdeltAvailability.latestOutcome || null,
      windows: gdeltAvailability.windows || {}
    };
    bySource.gdelt_doc.cooldown = gdeltCache.lastFetchFailure
      ? {
          errorClass: gdeltCache.lastFetchFailure.errorClass || null,
          cooldownHours: Number.isFinite(gdeltCache.lastFetchFailure.cooldownHours)
            ? gdeltCache.lastFetchFailure.cooldownHours
            : null
        }
      : null;
  }
  return {
    gdeltDoc: bySource.gdelt_doc?.status || 'not_queried',
    tavily: bySource.tavily?.status || 'not_queried',
    brave: bySource.brave?.status || 'not_queried',
    tavilyKey: diagnosis.keyStatus?.tavily?.configured ? 'configured' : 'missing',
    braveKey: diagnosis.keyStatus?.brave?.configured ? 'configured' : 'missing',
    details: bySource
  };
}

function productionImpact() {
  return {
    affectsValues: false,
    affectsScoring: false,
    affectsDecisionModel: false,
    affectsExecutionLock: false,
    affectsPositionGuidance: false,
    affectsBrentPromotion: false,
    affectsOdpFinalBias: false,
    affectsGlobalRiskHeatmap: false,
    affectsCrossValidation: false
  };
}

function assertSanitized(artifact) {
  const serialized = JSON.stringify(artifact);
  const forbiddenField = serialized.match(/"(?:title|url)"\s*:/u);
  if (forbiddenField) {
    throw new Error(`Production oil-news artifact contains forbidden article field: ${forbiddenField[0]}`);
  }
  const forbidden = [
    'TAVILY_API_KEY',
    'TAVILY_API_KEYS',
    'BRAVE_API_KEY',
    'BRAVE_API_KEYS',
    'Authorization',
    'X-Subscription-Token',
    'Bearer ',
    '"snippet"',
    '"raw"',
    '"body"'
  ];
  for (const needle of forbidden) {
    if (serialized.includes(needle)) {
      throw new Error(`Production oil-news artifact contains forbidden marker: ${needle}`);
    }
  }
}

function buildProductionArtifact(
  options,
  diagnosis,
  previousWebNgramsCache = null,
  webNgramsShadow = null
) {
  const generatedAt = new Date().toISOString();
  const sourceResults = diagnosis.sourceResults || [];
  const sourceStatus = buildSourceStatus(sourceResults, diagnosis);
  const liveSourceCount = diagnosis.aggregate?.liveSourceCount ?? 0;
  const status = statusFromSources({ dryRun: options.dryRun, sourceResults, liveSourceCount });
  const signalState = options.dryRun ? 'dry_run' : (diagnosis.aggregate?.state || 'source_unavailable');
  const topArticleInputs = Array.isArray(diagnosis.topArticles)
    ? diagnosis.topArticles.slice(0, 12)
    : [];
  const topArticles = topArticleInputs.map(compactArticleForProduction);
  const titleRisk = buildTitleRisk(topArticleInputs);
  const headlineDisplayReadiness = buildHeadlineDisplayReadiness(status, titleRisk);
  const claimPolarity = buildClaimPolarityAggregate(topArticleInputs);
  const latestAt = latestArticleAt(topArticleInputs);
  const buckets = Object.fromEntries(Object.entries(diagnosis.buckets || {}).map(([key, bucket]) => [
    key,
    compactBucket(bucket)
  ]));
  const queryCount = sourceResults.reduce((sum, source) => sum + (Array.isArray(source.queryRuns) ? source.queryRuns.length : 0), 0);
  const querySuccessCount = sourceResults.reduce((sum, source) => sum + (Number.isFinite(source.successCount) ? source.successCount : 0), 0);
  const queryFailureCount = sourceResults.reduce((sum, source) => sum + (Number.isFinite(source.failureCount) ? source.failureCount : 0), 0);
  const reasonZh = signalState === 'source_unavailable'
    ? '新闻源本轮未返回可用结果,生产观察层保持 fail-closed,不推断油价事件压力。'
    : (diagnosis.aggregate?.reasonZh || '新闻事件观察暂不可用。');

  const artifact = {
    schemaVersion: SCHEMA_VERSION,
    module: MODULE,
    generatedAt,
    sourceKey: 'odp_oil_news_event_watch',
    source: 'GDELT DOC broad cache + Tavily Search API + Brave News Search API',
    sources: options.sources,
    status,
    signalState,
    displayStatusZh: displayStatusZh(status, signalState),
    sourceStatus,
    freshness: {
      windowDays: options.windowDays,
      latestArticleAt: latestAt,
      latestArticleAgeHours: ageHours(latestAt, generatedAt),
      cadenceZh: '约 6 小时 workflow + manual dispatch;新闻索引存在收录延迟、重复转载和标题噪声'
    },
    queryCoverage: {
      querySetVersion: 'odp-oil-news-query-set-p28',
      gdeltQuerySetVersion: 'gdelt-broad-oil-news-cache-p37',
      gdeltBroadQuery: {
        id: GDELT_BROAD_QUERY_SPEC.id,
        label: GDELT_BROAD_QUERY_SPEC.label
      },
      queryCount,
      querySuccessCount,
      queryFailureCount,
      topics: QUERY_SET.map((query) => ({
        id: query.id,
        label: query.label,
        buckets: query.buckets
      }))
    },
    aggregate: {
      rawArticleCount: diagnosis.aggregate?.rawArticleCount ?? 0,
      uniqueArticleCount: diagnosis.aggregate?.uniqueArticleCount ?? 0,
      liveSourceCount,
      configuredSourceCount: sourceResults.filter((source) => source.status !== 'not_configured').length,
      bucketCountWithHits: diagnosis.aggregate?.bucketCountWithHits ?? 0,
      confidence: diagnosis.aggregate?.confidence || 'none',
      reasonZh
    },
    buckets,
    topArticles,
    titleRisk,
    headlineDisplayReadiness,
    claimPolarity,
    recommendation: {
      state: signalState,
      operatorAction: signalState === 'elevated_manual_review'
        ? 'manual_review_before_interpretation'
        : 'display_only_cross_check',
      noteZh: signalState === 'elevated_manual_review'
        ? '多源新闻代理出现同类油价事件信号,需要人工核对标题、来源、时间和市场/物理层印证。'
        : '新闻层仅作为事件背景观察,需与价格结构、库存/供需锚点、咽喉转运和卫星/设施事件交叉观察。'
    },
    productionDisplayApproved: true,
    promotionEligible: false,
    productionImpact: productionImpact(),
    limitationsZh: [
      '新闻搜索结果会重复转载、标题党化或延迟收录;本文件只保存 domain/publishedAt/source/query/bucket 等 compact 元数据与聚合计数,不保存标题原文、URL、snippet、正文或 raw response。',
      '本层不确认霍尔木兹关闭、航道中断、油轮流向、炼厂事故、断供、制裁影响或油价方向。',
      '只有与价格结构、库存/供需锚点、咽喉转运和卫星/设施层同时印证时,才适合提高人工观察置信度。'
    ],
    boundary: BOUNDARY
  };
  const artifactWithFallbackCache = attachGdeltWebNgramsDisplayFallbackCache(artifact, {
    generatedAt,
    ...(webNgramsShadow?.diagnosis?.mode === 'manual_live_diagnosis'
      ? {
          diagnosis: webNgramsShadow.diagnosis,
          previousCache: previousWebNgramsCache
        }
      : { preservedCache: previousWebNgramsCache })
  });
  const artifactWithSourceCaches = webNgramsShadow?.productionCache
    ? {
        ...artifactWithFallbackCache,
        sourceCaches: {
          ...artifactWithFallbackCache.sourceCaches,
          gdeltWebNgramsArticleShadow: webNgramsShadow.productionCache
        }
      }
    : artifactWithFallbackCache;
  assertSanitized(artifactWithSourceCaches);
  return artifactWithSourceCaches;
}

function readPreviousWebNgramsCache(path) {
  if (!existsSync(resolve(path))) return null;
  try {
    const previous = JSON.parse(readFileSync(resolve(path), 'utf8'));
    return previous?.sourceCaches?.gdeltWebNgramsFallback || null;
  } catch {
    return null;
  }
}

function buildGdeltCacheArtifact(diagnosis) {
  const cache = diagnosis.sourceCaches?.gdelt_doc;
  if (cache && cache.schemaVersion === GDELT_CACHE_SCHEMA_VERSION && cache.module === GDELT_CACHE_MODULE) {
    return cache;
  }
  return {
    schemaVersion: GDELT_CACHE_SCHEMA_VERSION,
    module: GDELT_CACHE_MODULE,
    generatedAt: new Date().toISOString(),
    sourceKey: 'gdelt_news_cache',
    cacheScope: 'odp_oil_news_event_watch',
    status: 'not_initialized',
    sourceStatus: 'not_initialized',
    requestMode: 'no_gdelt_source_result',
    source: 'GDELT DOC public search',
    cachePolicy: {
      ttlMinutes: GDELT_CACHE_TTL_MINUTES,
      staleMaxHours: GDELT_STALE_MAX_HOURS,
      errorCooldownHours: GDELT_ERROR_COOLDOWN_HOURS,
      errorCooldownHoursByClass: { ...GDELT_ERROR_COOLDOWN_HOURS_BY_CLASS },
      lowFrequencyCache: true,
      broadQueryLocalClassification: true,
      liveRetryPolicy: 'one_bounded_retry_after_cache_or_classified_error_cooldown',
      liveMaxRetries: GDELT_LIVE_MAX_RETRIES,
      retryJitterMaxMs: GDELT_RETRY_JITTER_MAX_MS,
      lastUsableCachePreservedOnError: true,
      lastUsableCacheAffectsCurrentSignal: false
    },
    query: {
      id: GDELT_BROAD_QUERY_SPEC.id,
      label: GDELT_BROAD_QUERY_SPEC.label,
      query: GDELT_BROAD_QUERY_SPEC.query,
      windowDays: null,
      maxRecords: null,
      mode: 'ArtList',
      sort: 'HybridRel'
    },
    requestDiagnostics: null,
    availability: {
      contractVersion: 'gdelt-doc-availability-v1',
      historyLimit: 64,
      latestAttemptAt: null,
      lastLiveSuccessAt: null,
      latestOutcome: null,
      windows: {
        days7: { attemptCount: 0, successCount: 0, failureCount: 0, successRatePct: null },
        days30: { attemptCount: 0, successCount: 0, failureCount: 0, successRatePct: null }
      },
      history: []
    },
    aggregate: {
      articleCount: 0,
      bucketCounts: {}
    },
    articles: [],
    error: 'gdelt source was not selected',
    promotionEligible: false,
    productionDisplayApproved: false,
    productionImpact: productionImpact(),
    limitationsZh: [
      'GDELT 是低频缓存型新闻代理源,不是高频实时行情或事件确认源。',
      '本 cache 只保存 compact 摘要,不保存 snippet、正文或 raw response。'
    ],
    boundary: 'production read-only GDELT compact news cache for ODP oil-news event watch; display-only/audit-only cache; NOT in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation'
  };
}

function writeJson(path, payload) {
  const absolutePath = resolve(path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(payload, null, 2)}\n`);
  return absolutePath;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const previousWebNgramsCache = readPreviousWebNgramsCache(options.output);
  const diagnosisResult = await runDiagnosisWithTransientArticles({
    allowNetwork: !options.dryRun,
    sources: options.sources,
    windowDays: options.windowDays,
    maxResults: options.maxResults,
    gdeltCachePath: options.gdeltCacheOutput,
    output: '',
    writeOutput: false,
    strict: false,
    printJson: false
  });
  const diagnosis = diagnosisResult.diagnosis;
  const webNgramsShadow = await buildGdeltWebNgramsArticleShadow({
    allowNetwork: !options.dryRun,
    referenceArticles: diagnosisResult.referenceArticles
  });
  const artifact = buildProductionArtifact(
    options,
    diagnosis,
    previousWebNgramsCache,
    webNgramsShadow
  );
  const gdeltCacheArtifact = buildGdeltCacheArtifact(diagnosis);
  const outputPath = options.writeOutput ? writeJson(options.output, artifact) : null;
  const gdeltCacheOutputPath = options.writeOutput ? writeJson(options.gdeltCacheOutput, gdeltCacheArtifact) : null;
  const webNgramsShadowOutputPath = options.writeOutput
    ? writeJson(DEFAULT_WEB_NGRAMS_SHADOW_OUTPUT, webNgramsShadow.observation)
    : null;
  console.log(JSON.stringify({
    status: artifact.status,
    signalState: artifact.signalState,
    sourceStatus: {
      gdeltDoc: artifact.sourceStatus.gdeltDoc,
      tavily: artifact.sourceStatus.tavily,
      brave: artifact.sourceStatus.brave,
      tavilyKey: artifact.sourceStatus.tavilyKey,
      braveKey: artifact.sourceStatus.braveKey
    },
    aggregate: artifact.aggregate,
    outputPath,
    gdeltCacheOutputPath,
    webNgramsShadowOutputPath,
    webNgramsShadowStatus: webNgramsShadow.productionCache.status,
    boundary: artifact.boundary
  }, null, 2));
}

main().catch((error) => {
  console.error(`Oil news event watch build failed: ${error.message}`);
  process.exit(1);
});
