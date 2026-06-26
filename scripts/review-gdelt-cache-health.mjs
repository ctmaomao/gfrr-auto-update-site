#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { GDELT_BROAD_QUERY_SPEC } from './oil-directional/diagnose-oil-news-events.mjs';

const REVIEW_VERSION = 'gdelt-cache-health-review-p40';
const DEFAULT_OUTPUT = 'manual-artifacts/gdelt-cache-health/gdelt-cache-health-latest.json';
const CACHE_PATHS = {
  oilNews: 'data/gdelt-news-cache.json',
  oilNewsWatch: 'data/oil-news-event-watch.json',
  bubbleWatch: 'data/gdelt-bubble-watch-cache.json',
  worldOrder: 'data/gdelt-world-order-cache.json',
  worldOrderStress: 'data/world-order-stress.json'
};
const BOUNDARY =
  'read-only GDELT cache health review; does not fetch external sources, write production data, change scoring, decision, execution, position, ODP finalBias, Brent promotion, Global Risk Heatmap, or cross-validation';

function printUsage() {
  console.log(`Usage:
  npm run review:gdelt-cache-health -- [options]

Options:
  --output <path>      Manual artifact output path. Default: ${DEFAULT_OUTPUT}
  --no-output          Do not write the review artifact.
  --strict             Exit non-zero on WATCH/WARN/FAIL.
  --json               Print full JSON review.
  --help               Show this help.`);
}

function parseArgs(argv) {
  const options = {
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
    if (arg === '--output') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      options.output = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function readJson(path) {
  try {
    if (!existsSync(resolve(path))) {
      return { ok: false, path, error: 'missing' };
    }
    return { ok: true, path, value: JSON.parse(readFileSync(resolve(path), 'utf8')) };
  } catch (error) {
    return { ok: false, path, error: error instanceof Error ? error.message : String(error) };
  }
}

function ageHours(value, nowMs = Date.now()) {
  const parsed = Date.parse(value || '');
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Number(((nowMs - parsed) / 3600000).toFixed(2)));
}

function compact(value, maxLength = 180) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/gu, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function pushFinding(row, severity, code, message) {
  row.findings.push({ severity, code, message });
}

function worstSeverity(rows) {
  const severities = rows.flatMap((row) => row.findings.map((finding) => finding.severity));
  if (severities.includes('fail')) return 'fail';
  if (severities.includes('warn')) return 'warn';
  if (severities.includes('watch')) return 'watch';
  return 'ok';
}

function reviewOilNewsCache(nowMs) {
  const row = {
    key: 'oil_news_gdelt_doc',
    label: 'Oil News GDELT DOC',
    path: CACHE_PATHS.oilNews,
    expectedSchemaVersion: 'gdelt-news-cache-p37',
    status: 'missing',
    sourceStatus: 'missing',
    requestMode: null,
    generatedAt: null,
    ageHours: null,
    errorCode: null,
    rateLimited: false,
    queryCurrent: false,
    articleCount: null,
    productionArtifactStatus: null,
    findings: []
  };
  const cacheRead = readJson(CACHE_PATHS.oilNews);
  if (!cacheRead.ok) {
    pushFinding(row, 'fail', 'oil_news_cache_missing', `Unable to read ${CACHE_PATHS.oilNews}: ${cacheRead.error}`);
    return row;
  }
  const cache = cacheRead.value;
  row.status = cache.status || 'unknown';
  row.sourceStatus = cache.sourceStatus || 'unknown';
  row.requestMode = cache.requestMode || null;
  row.generatedAt = cache.generatedAt || null;
  row.ageHours = ageHours(cache.generatedAt, nowMs);
  row.errorCode = cache.requestDiagnostics?.errorCode || null;
  row.rateLimited = cache.requestDiagnostics?.rateLimited === true || cache.requestDiagnostics?.status === 429;
  row.queryCurrent = cache.query?.query === GDELT_BROAD_QUERY_SPEC.query;
  row.articleCount = Array.isArray(cache.articles) ? cache.articles.length : null;

  if (cache.schemaVersion !== row.expectedSchemaVersion || cache.module !== 'gdelt-news-cache') {
    pushFinding(row, 'fail', 'oil_news_cache_schema_mismatch', 'Oil News GDELT cache schema/module mismatch.');
  }
  if (cache.cachePolicy?.lowFrequencyCache !== true || cache.cachePolicy?.broadQueryLocalClassification !== true) {
    pushFinding(row, 'fail', 'oil_news_cache_policy_missing', 'Oil News GDELT cache policy must declare lowFrequencyCache and broadQueryLocalClassification.');
  }
  if (!row.queryCurrent) {
    pushFinding(row, 'watch', 'oil_news_cache_awaits_short_query_refresh', 'Cache still reflects an older broad query; next Oil News refresh should write the current shortened query.');
  }
  if (row.errorCode === 'json_parse_failed') {
    const severity = row.queryCurrent ? 'warn' : 'watch';
    pushFinding(row, severity, 'oil_news_legacy_json_parse_failed', 'Existing cache reports json_parse_failed; P40 wrapper should classify future GDELT non-JSON responses more specifically.');
  }
  if (row.errorCode === 'query_rejected_length') {
    pushFinding(row, 'warn', 'oil_news_query_rejected_length', 'Current cache was rejected by GDELT for query length; the broad query needs further shortening.');
  }
  if (row.rateLimited) {
    pushFinding(row, 'watch', 'oil_news_gdelt_rate_limited', 'GDELT DOC is rate limited; Tavily/Brave fallbacks should remain authoritative for display-only event watch.');
  }

  const watchRead = readJson(CACHE_PATHS.oilNewsWatch);
  if (watchRead.ok) {
    row.productionArtifactStatus = watchRead.value?.sourceStatus?.gdeltDoc || null;
    if (row.productionArtifactStatus === 'error' && row.status === 'ok') {
      pushFinding(row, 'watch', 'oil_news_artifact_not_refreshed_after_cache', 'Oil News watch artifact has not yet reflected a healthier GDELT cache state.');
    }
  } else {
    pushFinding(row, 'warn', 'oil_news_watch_missing', `Unable to read ${CACHE_PATHS.oilNewsWatch}: ${watchRead.error}`);
  }
  if (row.findings.length === 0) pushFinding(row, 'ok', 'oil_news_cache_healthy', 'Oil News GDELT cache shape and query state look current.');
  return row;
}

function reviewBubbleWatchCache(nowMs) {
  const row = {
    key: 'bubble_watch_gdelt_doc',
    label: 'Bubble Watch GDELT DOC',
    path: CACHE_PATHS.bubbleWatch,
    expectedSchemaVersion: 'gdelt-bubble-watch-cache-p38',
    status: 'missing',
    sourceStatus: 'missing',
    requestMode: null,
    generatedAt: null,
    ageHours: null,
    errorCode: null,
    rateLimited: false,
    articleCount: null,
    findings: []
  };
  const cacheRead = readJson(CACHE_PATHS.bubbleWatch);
  if (!cacheRead.ok) {
    pushFinding(row, 'fail', 'bubble_cache_missing', `Unable to read ${CACHE_PATHS.bubbleWatch}: ${cacheRead.error}`);
    return row;
  }
  const cache = cacheRead.value;
  row.status = cache.status || 'unknown';
  row.sourceStatus = cache.sourceStatus || 'unknown';
  row.requestMode = cache.requestMode || null;
  row.generatedAt = cache.generatedAt || null;
  row.ageHours = ageHours(cache.generatedAt, nowMs);
  row.errorCode = cache.requestDiagnostics?.errorCode || null;
  row.rateLimited = cache.requestDiagnostics?.rateLimited === true || cache.requestDiagnostics?.status === 429;
  row.articleCount = Array.isArray(cache.articles) ? cache.articles.length : null;

  if (cache.schemaVersion !== row.expectedSchemaVersion || cache.module !== 'gdelt-bubble-watch-cache') {
    pushFinding(row, 'fail', 'bubble_cache_schema_mismatch', 'Bubble Watch GDELT cache schema/module mismatch.');
  }
  if (cache.cacheScope !== 'bubble_watch_ceo_hedging') {
    pushFinding(row, 'fail', 'bubble_cache_scope_mismatch', 'Bubble Watch cacheScope must be bubble_watch_ceo_hedging.');
  }
  if (cache.cachePolicy?.lowFrequencyCache !== true || cache.cachePolicy?.broadQueryLocalClassification !== true) {
    pushFinding(row, 'fail', 'bubble_cache_policy_missing', 'Bubble Watch GDELT cache policy must declare lowFrequencyCache and broadQueryLocalClassification.');
  }
  if (row.status === 'not_initialized' || row.requestMode === 'placeholder_until_next_bubble_watch_refresh') {
    pushFinding(row, 'watch', 'bubble_cache_awaits_first_post_p38_refresh', 'Bubble Watch GDELT cache is still the P38 placeholder; next weekly refresh should write live/error/stale state.');
  }
  if (row.rateLimited) {
    pushFinding(row, 'watch', 'bubble_gdelt_rate_limited', 'Bubble Watch GDELT DOC is rate limited; Tavily/Brave/Wind fallback order should remain visible.');
  }
  if (row.findings.length === 0) pushFinding(row, 'ok', 'bubble_cache_healthy', 'Bubble Watch GDELT cache shape and state look usable.');
  return row;
}

function reviewWorldOrderCache(nowMs) {
  const row = {
    key: 'world_order_gdelt_cloud',
    label: 'World Order GDELT Cloud',
    path: CACHE_PATHS.worldOrder,
    expectedSchemaVersion: 'gdelt-world-order-cache-p39',
    status: 'missing',
    sourceStatus: 'missing',
    requestMode: null,
    generatedAt: null,
    ageHours: null,
    lastFetchedAt: null,
    sourceAgeHours: null,
    errorCode: null,
    rateLimited: false,
    totalEvents: null,
    productionArtifactStatus: null,
    findings: []
  };
  const cacheRead = readJson(CACHE_PATHS.worldOrder);
  if (!cacheRead.ok) {
    pushFinding(row, 'fail', 'world_order_cache_missing', `Unable to read ${CACHE_PATHS.worldOrder}: ${cacheRead.error}`);
    return row;
  }
  const cache = cacheRead.value;
  row.status = cache.status || 'unknown';
  row.sourceStatus = cache.sourceStatus || 'unknown';
  row.requestMode = cache.requestMode || null;
  row.generatedAt = cache.generatedAt || null;
  row.ageHours = ageHours(cache.generatedAt, nowMs);
  row.lastFetchedAt = cache.lastFetchedAt || null;
  row.sourceAgeHours = ageHours(cache.lastFetchedAt || cache.generatedAt, nowMs);
  row.errorCode = cache.requestDiagnostics?.errorCode || null;
  row.rateLimited = cache.requestDiagnostics?.rateLimited === true || cache.requestDiagnostics?.status === 429;
  row.totalEvents = Number.isFinite(Number(cache.summary?.totalEvents)) ? Number(cache.summary.totalEvents) : null;

  if (cache.schemaVersion !== row.expectedSchemaVersion || cache.module !== 'gdelt-world-order-cache') {
    pushFinding(row, 'fail', 'world_order_cache_schema_mismatch', 'World Order GDELT cache schema/module mismatch.');
  }
  if (cache.cacheScope !== 'world_order_gdelt_cloud') {
    pushFinding(row, 'fail', 'world_order_cache_scope_mismatch', 'World Order cacheScope must be world_order_gdelt_cloud.');
  }
  if (cache.cachePolicy?.lowFrequencyCache !== true || cache.cachePolicy?.sharedWrapper !== 'scripts/gdelt/fetch-gdelt.mjs') {
    pushFinding(row, 'fail', 'world_order_cache_policy_missing', 'World Order cache must declare lowFrequencyCache and shared wrapper path.');
  }
  if (cache.cachePolicy?.rawProviderResponseStored !== false || cache.cachePolicy?.authorizationStored !== false) {
    pushFinding(row, 'fail', 'world_order_cache_raw_or_auth_storage', 'World Order cache must explicitly avoid raw provider response and authorization storage.');
  }
  if (row.requestMode === 'seeded_from_world_order_stress_existing_summary') {
    pushFinding(row, 'watch', 'world_order_cache_awaits_post_p39_refresh', 'World Order cache is seeded from existing summary; next scheduled refresh should produce live/fresh/stale cache mode.');
  }
  if (row.rateLimited) {
    pushFinding(row, 'watch', 'world_order_gdelt_rate_limited', 'World Order GDELT Cloud is rate limited; stale cache fallback should remain visible.');
  }

  const stressRead = readJson(CACHE_PATHS.worldOrderStress);
  if (stressRead.ok) {
    row.productionArtifactStatus = stressRead.value?.externalSources?.gdelt?.status || null;
    if (row.productionArtifactStatus && row.status === 'ok' && row.productionArtifactStatus !== 'ok') {
      pushFinding(row, 'watch', 'world_order_artifact_cache_status_divergence', 'World Order public artifact has not yet reflected the cache status.');
    }
  } else {
    pushFinding(row, 'warn', 'world_order_stress_missing', `Unable to read ${CACHE_PATHS.worldOrderStress}: ${stressRead.error}`);
  }
  if (row.findings.length === 0) pushFinding(row, 'ok', 'world_order_cache_healthy', 'World Order GDELT cache shape and state look usable.');
  return row;
}

function buildReview() {
  const now = new Date().toISOString();
  const nowMs = Date.parse(now);
  const rows = [
    reviewOilNewsCache(nowMs),
    reviewBubbleWatchCache(nowMs),
    reviewWorldOrderCache(nowMs)
  ];
  const status = worstSeverity(rows);
  const issueCounts = rows
    .flatMap((row) => row.findings)
    .reduce((counts, finding) => {
      counts[finding.severity] = (counts[finding.severity] || 0) + 1;
      return counts;
    }, {});
  const recommendation = status === 'fail'
    ? 'fix_schema_or_policy_before_relying_on_gdelt_caches'
    : status === 'warn'
      ? 'review_gdelt_cache_errors_before_next_promotion'
      : status === 'watch'
        ? 'wait_for_next_scheduled_refresh_then_rerun_review'
        : 'gdelt_cache_health_current';
  return {
    reviewVersion: REVIEW_VERSION,
    generatedAt: now,
    status,
    recommendation,
    paths: CACHE_PATHS,
    summary: {
      rowCount: rows.length,
      issueCounts,
      hasJsonParseFailed: rows.some((row) => row.errorCode === 'json_parse_failed'),
      hasRateLimited: rows.some((row) => row.rateLimited === true),
      awaitingPostMigrationRefresh: rows.some((row) => row.findings.some((finding) => /awaits_/u.test(finding.code)))
    },
    rows,
    productionImpact: {
      writesProductionData: false,
      fetchesExternalSources: false,
      affectsValues: false,
      affectsScoring: false,
      affectsDecisionModel: false,
      affectsExecution: false,
      affectsPosition: false,
      affectsOdpFinalBias: false,
      affectsBrentPromotion: false,
      affectsGlobalRiskHeatmap: false,
      affectsCrossValidation: false
    },
    boundary: BOUNDARY
  };
}

function writeReview(review, outputPath) {
  const resolved = resolve(outputPath);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
  review.outputPath = resolved;
}

function printSummary(review) {
  console.log(`GDELT cache health review: ${review.status.toUpperCase()}`);
  console.log(`recommendation: ${review.recommendation}`);
  for (const row of review.rows) {
    const primary = row.findings[0] || { severity: 'ok', code: 'ok' };
    const generated = row.generatedAt ? ` generatedAt=${row.generatedAt}` : '';
    const age = row.ageHours === null ? '' : ` ageHours=${row.ageHours}`;
    console.log(`- ${row.key}: ${primary.severity}/${primary.code} status=${row.status} requestMode=${row.requestMode || 'null'}${generated}${age}`);
  }
  if (review.outputPath) console.log(`outputPath: ${review.outputPath}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const review = buildReview();
  if (options.writeOutput) writeReview(review, options.output);
  if (options.printJson) {
    console.log(JSON.stringify(review, null, 2));
  } else {
    printSummary(review);
  }
  if (options.strict && review.status !== 'ok') process.exit(1);
}

export {
  buildReview
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
