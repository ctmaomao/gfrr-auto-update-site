#!/usr/bin/env node
import { isManualArtifactPath, safeRelativePath } from './lib/check-script-helpers.mjs';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { GDELT_BROAD_QUERY_SPEC } from './oil-directional/diagnose-oil-news-events.mjs';
import { gdeltCacheAgeHours } from './gdelt/cache-age.mjs';
import {
  classifyBubbleScheduleContext,
  classifyOilNewsPostRefresh,
  summarizePostRefreshContexts
} from './gdelt/cache-health-context.mjs';

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
const BUBBLE_WATCH_REFRESH_COMMIT_SUBJECT = 'chore: refresh bubble watch';
const BUBBLE_WATCH_PLACEHOLDER_FAIL_AFTER_SUCCESSFUL_REFRESHES = 2;
const BUBBLE_WATCH_CACHE_TTL_HOURS = 132;
const BUBBLE_WATCH_CACHE_STALE_MAX_HOURS = 21 * 24;
const SENSITIVE_CACHE_FIELD_RE = /^(?:authorization|authorizationHeader|apiKey|api_key|secret|token|bearer|bearerToken|cookie|cookies|setCookie|headers|requestHeaders|responseHeaders|rawProviderResponse|providerResponse|rawResponse|responseBody|rawBody|body)$/iu;
const ALLOWED_SENSITIVE_POLICY_FLAG_PATHS = new Set([
  'cachePolicy.rawProviderResponseStored',
  'cachePolicy.authorizationStored'
]);

function printUsage() {
  console.log(`Usage:
  npm run review:gdelt-cache-health -- [options]

Options:
  --output <path>      Manual artifact output path. Default: ${DEFAULT_OUTPUT}
  --no-output          Do not write the review artifact.
  --strict             Exit non-zero on WATCH/WARN/FAIL. Default exits non-zero on FAIL.
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
  if (!isManualArtifactPath(options.output)) {
    throw new Error(`Refusing output outside manual-artifacts/: ${options.output}`);
  }
  return options;
}

function manualArtifactWritePathChain(path) {
  if (!isManualArtifactPath(path)) {
    throw new Error(`Refusing output outside manual-artifacts/: ${path}`);
  }
  const outputPath = resolve(path);
  const rootPath = resolve('manual-artifacts');
  const outputDir = dirname(outputPath);
  const relativeDir = relative(rootPath, outputDir);
  const paths = [rootPath];
  let cursor = rootPath;
  if (relativeDir) {
    for (const segment of relativeDir.split(/[\\/]+/u).filter(Boolean)) {
      cursor = resolve(cursor, segment);
      paths.push(cursor);
    }
  }
  paths.push(outputPath);
  return paths;
}

function assertManualArtifactWritePath(path) {
  for (const existingPath of manualArtifactWritePathChain(path)) {
    if (!existsSync(existingPath)) continue;
    if (lstatSync(existingPath).isSymbolicLink()) {
      const displayPath = safeRelativePath(existingPath) || existingPath;
      throw new Error(`Refusing output through symlink/junction path segment: ${displayPath}`);
    }
  }
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
  const age = gdeltCacheAgeHours(value, nowMs);
  return Number.isFinite(age) ? Number(age.toFixed(2)) : null;
}

function compact(value, maxLength = 180) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/gu, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function pushFinding(row, severity, code, message) {
  row.findings.push({ severity, code, message });
}

function collectForbiddenCacheFields(value, path = []) {
  if (!value || typeof value !== 'object') return [];
  const findings = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      findings.push(...collectForbiddenCacheFields(item, [...path, String(index)]));
    });
    return findings;
  }
  for (const [key, child] of Object.entries(value)) {
    const childPath = [...path, key];
    const dottedPath = childPath.join('.');
    if (SENSITIVE_CACHE_FIELD_RE.test(key) && !ALLOWED_SENSITIVE_POLICY_FLAG_PATHS.has(dottedPath)) {
      findings.push(dottedPath);
    }
    findings.push(...collectForbiddenCacheFields(child, childPath));
  }
  return findings;
}

function assertNoForbiddenCacheFields(row, cache, codePrefix) {
  const paths = collectForbiddenCacheFields(cache);
  if (paths.length === 0) return;
  const sample = paths.slice(0, 5).join(', ');
  const suffix = paths.length > 5 ? `, +${paths.length - 5} more` : '';
  pushFinding(
    row,
    'fail',
    `${codePrefix}_cache_forbidden_sensitive_or_raw_field`,
    `GDELT cache contains forbidden sensitive/raw response field path(s): ${sample}${suffix}.`
  );
}

function gitOutput(args) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch {
    return null;
  }
}

function gitJsonAtCommit(commit, path) {
  return JSON.parse(execFileSync('git', ['show', `${commit}:${path}`], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore']
  }));
}

function summarizeBubblePlaceholderRefreshHistory(
  placeholderGeneratedAt,
  { gitOutputFn = gitOutput, gitJsonAtCommitFn = gitJsonAtCommit } = {}
) {
  const summary = {
    historyAvailable: false,
    historyUnavailableReason: null,
    successfulRefreshesWithPlaceholder: 0,
    inspectedRefreshes: []
  };
  if (!Number.isFinite(Date.parse(placeholderGeneratedAt || ''))) {
    summary.historyUnavailableReason = 'placeholder_generated_at_invalid';
    return summary;
  }
  const shallow = gitOutputFn(['rev-parse', '--is-shallow-repository']);
  if (shallow !== 'false') {
    summary.historyUnavailableReason = shallow === 'true' ? 'git_history_shallow' : 'git_unavailable';
    return summary;
  }
  const output = gitOutputFn([
    'log',
    '--format=%H%x09%aI%x09%s',
    `--since=${placeholderGeneratedAt}`
  ]);
  if (output === null) {
    summary.historyUnavailableReason = 'git_log_unavailable';
    return summary;
  }
  const refreshes = output.split(/\r?\n/u).filter(Boolean).map((line) => {
    const [commit, committedAt, ...subjectParts] = line.split('\t');
    return { commit, committedAt, subject: subjectParts.join('\t') };
  }).filter((row) => row.subject === BUBBLE_WATCH_REFRESH_COMMIT_SUBJECT);

  for (const refresh of refreshes) {
    try {
      const cache = gitJsonAtCommitFn(refresh.commit, CACHE_PATHS.bubbleWatch);
      const placeholder = cache?.status === 'not_initialized'
        || cache?.requestMode === 'placeholder_until_next_bubble_watch_refresh';
      summary.inspectedRefreshes.push({
        commit: refresh.commit.slice(0, 8),
        committedAt: refresh.committedAt,
        placeholder
      });
      if (!placeholder) break;
      summary.successfulRefreshesWithPlaceholder += 1;
    } catch {
      summary.historyUnavailableReason = 'git_cache_snapshot_unreadable';
      summary.successfulRefreshesWithPlaceholder = 0;
      return summary;
    }
  }
  summary.historyAvailable = true;
  return summary;
}

function bubblePlaceholderSeverity(successfulRefreshes, historyAvailable = true) {
  return historyAvailable
    && Number.isFinite(successfulRefreshes)
    && successfulRefreshes >= BUBBLE_WATCH_PLACEHOLDER_FAIL_AFTER_SUCCESSFUL_REFRESHES
    ? 'fail'
    : 'watch';
}

function bubbleCacheAgeStatus(cacheAgeHours) {
  if (!Number.isFinite(cacheAgeHours)) return 'invalid';
  if (cacheAgeHours <= BUBBLE_WATCH_CACHE_TTL_HOURS) return 'fresh';
  if (cacheAgeHours <= BUBBLE_WATCH_CACHE_STALE_MAX_HOURS) return 'stale';
  return 'expired';
}

function worstSeverity(rows) {
  const severities = rows.flatMap((row) => row.findings.map((finding) => finding.severity));
  if (severities.includes('fail')) return 'fail';
  if (severities.includes('warn')) return 'warn';
  if (severities.includes('watch')) return 'watch';
  return 'ok';
}

function failFindingCodes(rows) {
  return rows.flatMap((row) =>
    row.findings
      .filter((finding) => finding.severity === 'fail')
      .map((finding) => finding.code)
  );
}

function onlyBubblePlaceholderFail(rows) {
  const codes = failFindingCodes(rows);
  return codes.length > 0 && codes.every((code) => code === 'bubble_cache_placeholder_refresh_threshold_exceeded');
}

function awaitingPostMigrationRefresh(rows) {
  return rows.some((row) => row.findings.some((finding) =>
    /awaits_/u.test(finding.code) || finding.code === 'bubble_cache_placeholder_refresh_threshold_exceeded'
  ));
}

function recommendationFor(status, rows) {
  if (onlyBubblePlaceholderFail(rows)) {
    return 'investigate_bubble_watch_refresh_history_then_rerun_review';
  }
  if (status === 'fail') return 'fix_schema_or_policy_before_relying_on_gdelt_caches';
  if (status === 'warn') return 'review_gdelt_cache_errors_before_next_promotion';
  if (rows.some((row) => row.refreshContext?.state === 'persistent_error_after_cooldown_expiry')) {
    return 'diagnose_oil_news_cooldown_persistence_without_loosening_ttl_or_backoff';
  }
  if (rows.some((row) => row.refreshContext?.state === 'scheduled_refresh_overdue')) {
    return 'diagnose_scheduled_refresh_or_cache_write_before_policy_change';
  }
  if (rows.some((row) => row.refreshContext?.state === 'expected_error_cooldown_after_refresh')) {
    return 'wait_until_error_cooldown_expires_then_rerun_after_scheduled_refresh';
  }
  if (rows.some((row) => row.refreshContext?.state === 'degraded_awaiting_post_cooldown_refresh_evidence')) {
    return 'wait_for_first_scheduled_refresh_after_error_cooldown_then_rerun_strict_review';
  }
  return status === 'watch'
    ? 'wait_for_next_scheduled_refresh_then_rerun_review'
    : 'gdelt_cache_health_current';
}

function formatPostRefreshSummary(postRefresh) {
  if (!postRefresh || typeof postRefresh !== 'object') return null;
  return [
    `expectedCooldown=${Number(postRefresh.expectedErrorCooldownCount) || 0}`,
    `awaitingPostCooldownRefresh=${Number(postRefresh.awaitingPostCooldownRefreshCount) || 0}`,
    `persistentAfterCooldown=${Number(postRefresh.persistentAfterCooldownCount) || 0}`,
    `expectedScheduleGap=${Number(postRefresh.expectedScheduleGapCount) || 0}`,
    `scheduledOverdue=${Number(postRefresh.scheduledRefreshOverdueCount) || 0}`
  ].join(' ');
}

function formatRefreshContext(context) {
  if (!context || typeof context !== 'object' || !context.state) return null;
  const details = [`state=${context.state}`];
  if (Number.isFinite(context.cooldownRemainingHours)) {
    details.push(`cooldownRemainingHours=${context.cooldownRemainingHours}`);
  }
  if (Number.isFinite(context.hoursPastFreshTtl)) {
    details.push(`hoursPastFreshTtl=${context.hoursPastFreshTtl}`);
  }
  if (Number.isFinite(context.hoursPastScheduledCadence)) {
    details.push(`hoursPastScheduledCadence=${context.hoursPastScheduledCadence}`);
  }
  if (context.nextAction) {
    details.push(`nextAction=${context.nextAction}`);
  }
  return details.join(' ');
}

function shouldExitNonZero(status, strict) {
  return status === 'fail' || (strict && status !== 'ok');
}

function reviewOilNewsCache(nowMs, cacheOverride = null) {
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
    lastUsableCacheGeneratedAt: null,
    lastUsableCacheAgeHours: null,
    lastUsableArticleCount: null,
    lastUsableUsedForCurrentSignal: null,
    productionArtifactStatus: null,
    productionArtifactGeneratedAt: null,
    productionRequestMode: null,
    refreshContext: null,
    findings: []
  };
  const cacheRead = cacheOverride
    ? { ok: true, path: CACHE_PATHS.oilNews, value: cacheOverride }
    : readJson(CACHE_PATHS.oilNews);
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
  if (cache.lastUsableCache && typeof cache.lastUsableCache === 'object') {
    row.lastUsableCacheGeneratedAt = cache.lastUsableCache.generatedAt || null;
    row.lastUsableCacheAgeHours = ageHours(cache.lastUsableCache.generatedAt, nowMs);
    row.lastUsableArticleCount = Array.isArray(cache.lastUsableCache.articles) ? cache.lastUsableCache.articles.length : null;
    row.lastUsableUsedForCurrentSignal = cache.lastUsableCache.usedForCurrentSignal ?? null;
  }
  assertNoForbiddenCacheFields(row, cache, 'oil_news');

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
  if (
    (row.status === 'error' || row.sourceStatus === 'error')
    && !row.rateLimited
    && !['json_parse_failed', 'query_rejected_length'].includes(row.errorCode)
  ) {
    pushFinding(row, 'watch', 'oil_news_gdelt_source_error', `GDELT DOC cache reports source error: ${row.errorCode || 'unknown_error'}.`);
  }
  if (row.rateLimited) {
    pushFinding(row, 'watch', 'oil_news_gdelt_rate_limited', 'GDELT DOC is rate limited; Tavily/Brave fallbacks should remain authoritative for display-only event watch.');
    if (!cache.lastUsableCache) {
      pushFinding(row, 'watch', 'oil_news_last_usable_cache_missing_after_rate_limit', 'Rate-limited cache has no last usable compact cache yet; next successful or stale run should preserve one for audit-only context.');
    } else if (cache.lastUsableCache.usedForCurrentSignal !== false) {
      pushFinding(row, 'fail', 'oil_news_last_usable_cache_signal_boundary_invalid', 'lastUsableCache must be preserved for audit only and must not affect the current Oil News signal.');
    }
  }

  const watchRead = readJson(CACHE_PATHS.oilNewsWatch);
  if (watchRead.ok) {
    row.productionArtifactStatus = watchRead.value?.sourceStatus?.gdeltDoc || null;
    row.productionArtifactGeneratedAt = watchRead.value?.generatedAt || null;
    row.productionRequestMode =
      watchRead.value?.sourceStatus?.details?.gdelt_doc?.queryRuns?.[0]?.status || null;
    row.refreshContext = classifyOilNewsPostRefresh({
      cacheGeneratedAt: row.generatedAt,
      cacheAgeHours: row.ageHours,
      errorCooldownHours: cache.cachePolicy?.errorCooldownHours,
      productionGeneratedAt: row.productionArtifactGeneratedAt,
      productionStatus: row.productionArtifactStatus,
      productionRequestMode: row.productionRequestMode
    });
    if (row.productionArtifactStatus === 'error' && row.status === 'ok') {
      pushFinding(row, 'watch', 'oil_news_artifact_not_refreshed_after_cache', 'Oil News watch artifact has not yet reflected a healthier GDELT cache state.');
    }
  } else {
    pushFinding(row, 'warn', 'oil_news_watch_missing', `Unable to read ${CACHE_PATHS.oilNewsWatch}: ${watchRead.error}`);
  }
  if (row.findings.length === 0) pushFinding(row, 'ok', 'oil_news_cache_healthy', 'Oil News GDELT cache shape and query state look current.');
  return row;
}

function reviewBubbleWatchCache(nowMs, cacheOverride = null, refreshHistoryOverride = null) {
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
    placeholderRefreshHistoryAvailable: null,
    placeholderHistoryUnavailableReason: null,
    placeholderSuccessfulRefreshesObserved: null,
    placeholderFailAfterSuccessfulRefreshes: BUBBLE_WATCH_PLACEHOLDER_FAIL_AFTER_SUCCESSFUL_REFRESHES,
    refreshContext: null,
    findings: []
  };
  const cacheRead = cacheOverride
    ? { ok: true, path: CACHE_PATHS.bubbleWatch, value: cacheOverride }
    : readJson(CACHE_PATHS.bubbleWatch);
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
  row.refreshContext = classifyBubbleScheduleContext(row.ageHours, BUBBLE_WATCH_CACHE_TTL_HOURS);
  assertNoForbiddenCacheFields(row, cache, 'bubble');

  if (cache.schemaVersion !== row.expectedSchemaVersion || cache.module !== 'gdelt-bubble-watch-cache') {
    pushFinding(row, 'fail', 'bubble_cache_schema_mismatch', 'Bubble Watch GDELT cache schema/module mismatch.');
  }
  if (cache.cacheScope !== 'bubble_watch_ceo_hedging') {
    pushFinding(row, 'fail', 'bubble_cache_scope_mismatch', 'Bubble Watch cacheScope must be bubble_watch_ceo_hedging.');
  }
  if (cache.cachePolicy?.lowFrequencyCache !== true || cache.cachePolicy?.broadQueryLocalClassification !== true) {
    pushFinding(row, 'fail', 'bubble_cache_policy_missing', 'Bubble Watch GDELT cache policy must declare lowFrequencyCache and broadQueryLocalClassification.');
  }
  const isPlaceholder = row.status === 'not_initialized' || row.requestMode === 'placeholder_until_next_bubble_watch_refresh';
  if (!isPlaceholder) {
    const ageStatus = bubbleCacheAgeStatus(row.ageHours);
    if (ageStatus === 'invalid') {
      pushFinding(row, 'warn', 'bubble_cache_generated_at_invalid', 'Bubble Watch GDELT cache generatedAt is missing or invalid.');
    } else if (ageStatus === 'expired') {
      pushFinding(row, 'warn', 'bubble_cache_expired', `Bubble Watch GDELT cache age ${row.ageHours}h exceeds the ${BUBBLE_WATCH_CACHE_STALE_MAX_HOURS}h stale fallback window.`);
    } else if (ageStatus === 'stale') {
      pushFinding(row, 'watch', 'bubble_cache_stale', `Bubble Watch GDELT cache age ${row.ageHours}h exceeds the ${BUBBLE_WATCH_CACHE_TTL_HOURS}h fresh TTL.`);
    }
  }
  if (isPlaceholder) {
    const history = refreshHistoryOverride || summarizeBubblePlaceholderRefreshHistory(row.generatedAt);
    row.placeholderRefreshHistoryAvailable = history.historyAvailable;
    row.placeholderHistoryUnavailableReason = history.historyUnavailableReason;
    row.placeholderSuccessfulRefreshesObserved = history.successfulRefreshesWithPlaceholder;
    const severity = bubblePlaceholderSeverity(
      row.placeholderSuccessfulRefreshesObserved,
      row.placeholderRefreshHistoryAvailable
    );
    const code = severity === 'fail'
      ? 'bubble_cache_placeholder_refresh_threshold_exceeded'
      : 'bubble_cache_awaits_first_post_p38_refresh';
    const countLabel = row.placeholderSuccessfulRefreshesObserved === null
      ? 'unknown'
      : String(row.placeholderSuccessfulRefreshesObserved);
    pushFinding(
      row,
      severity,
      code,
      `Bubble Watch GDELT cache is still the P38 placeholder after ${countLabel}/${BUBBLE_WATCH_PLACEHOLDER_FAIL_AFTER_SUCCESSFUL_REFRESHES} successful refresh commits; refresh should write live/error/stale state.`
    );
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
  assertNoForbiddenCacheFields(row, cache, 'world_order');

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

function assertSelfTest(condition, message) {
  if (!condition) throw new Error(`GDELT cache health self-test failed: ${message}`);
}

function runSelfTests() {
  const placeholderGeneratedAt = '2026-06-23T00:00:00.000Z';
  const placeholderCache = {
    status: 'not_initialized',
    requestMode: 'placeholder_until_next_bubble_watch_refresh'
  };
  const refreshHistory = summarizeBubblePlaceholderRefreshHistory(placeholderGeneratedAt, {
    gitOutputFn: (args) => args[0] === 'rev-parse'
      ? 'false'
      : [
          `bbbbbbbb\t2026-07-06T05:30:00.000Z\t${BUBBLE_WATCH_REFRESH_COMMIT_SUBJECT}`,
          `aaaaaaaa\t2026-06-29T05:30:00.000Z\t${BUBBLE_WATCH_REFRESH_COMMIT_SUBJECT}`
        ].join('\n'),
    gitJsonAtCommitFn: () => placeholderCache
  });
  assertSelfTest(refreshHistory.historyAvailable === true, 'full git history is trusted');
  assertSelfTest(refreshHistory.successfulRefreshesWithPlaceholder === 2, 'counts successful refresh commits that remain placeholder');
  const shallowHistory = summarizeBubblePlaceholderRefreshHistory(placeholderGeneratedAt, {
    gitOutputFn: () => 'true'
  });
  assertSelfTest(shallowHistory.historyAvailable === false, 'shallow git history is diagnostic only');
  assertSelfTest(bubblePlaceholderSeverity(2, false) === 'watch', 'untrusted history cannot upgrade placeholder to FAIL');
  assertSelfTest(bubblePlaceholderSeverity(1, true) === 'watch', 'placeholder remains WATCH before successful refresh threshold');
  assertSelfTest(bubblePlaceholderSeverity(2, true) === 'fail', 'placeholder becomes FAIL at successful refresh threshold');
  assertSelfTest(bubbleCacheAgeStatus(132) === 'fresh', 'bubble cache stays fresh through 132h');
  assertSelfTest(bubbleCacheAgeStatus(132.01) === 'stale', 'bubble cache becomes stale after 132h');
  assertSelfTest(bubbleCacheAgeStatus(504.01) === 'expired', 'bubble cache expires after 21d');
  assertSelfTest(bubbleCacheAgeStatus(null) === 'invalid', 'bubble cache rejects invalid age');
  const fixedNowMs = Date.parse('2026-07-12T12:00:00.000Z');
  assertSelfTest(gdeltCacheAgeHours('2026-07-12T12:04:00.000Z', fixedNowMs) === 0, 'minor GDELT cache clock skew is tolerated');
  assertSelfTest(gdeltCacheAgeHours('2026-07-12T12:06:00.000Z', fixedNowMs) === null, 'future GDELT cache timestamps are rejected');
  assertSelfTest(isManualArtifactPath(DEFAULT_OUTPUT), 'default output path stays inside manual-artifacts');
  assertSelfTest(!isManualArtifactPath('data/gdelt-cache-health.json'), 'production data output path is rejected');
  assertManualArtifactWritePath(DEFAULT_OUTPUT);
  const writeReviewSource = writeReview.toString();
  const firstPathCheck = writeReviewSource.indexOf('assertManualArtifactWritePath(resolved)');
  const mkdirIndex = writeReviewSource.indexOf('mkdirSync(dirname(resolved)');
  const secondPathCheck = writeReviewSource.lastIndexOf('assertManualArtifactWritePath(resolved)');
  assertSelfTest(
    firstPathCheck !== -1 && firstPathCheck < mkdirIndex && mkdirIndex < secondPathCheck,
    'manual artifact path is checked before and after directory creation'
  );
  assertSelfTest(
    collectForbiddenCacheFields({ cachePolicy: { rawProviderResponseStored: false, authorizationStored: false } }).length === 0,
    'policy flags for not storing raw/auth are allowed'
  );
  assertSelfTest(
    collectForbiddenCacheFields({ requestDiagnostics: { status: 429 }, notes: ['Authorization header is not stored.'] }).length === 0,
    'safe diagnostic fields and boundary notes do not trip sensitive scan'
  );
  assertSelfTest(
    collectForbiddenCacheFields({ requestHeaders: { Authorization: 'Bearer redacted' } }).includes('requestHeaders'),
    'request headers trip sensitive scan'
  );
  assertSelfTest(
    collectForbiddenCacheFields({ rawProviderResponse: { ok: true } }).includes('rawProviderResponse'),
    'raw provider response trips sensitive scan'
  );
  assertSelfTest(shouldExitNonZero('fail', false) === true, 'default mode exits non-zero on FAIL');
  assertSelfTest(shouldExitNonZero('watch', false) === false, 'default mode keeps WATCH non-blocking');
  assertSelfTest(shouldExitNonZero('watch', true) === true, 'strict mode exits non-zero on WATCH');
  assertSelfTest(
    classifyOilNewsPostRefresh({
      cacheGeneratedAt: '2026-07-25T00:00:00.000Z',
      cacheAgeHours: 25,
      errorCooldownHours: 24,
      productionGeneratedAt: '2026-07-26T00:00:00.000Z',
      productionStatus: 'error',
      productionRequestMode: 'error_cooldown_cache_hit'
    }).state === 'persistent_error_after_cooldown_expiry',
    'newer degraded Oil News artifact beyond cooldown is persistent evidence'
  );
  assertSelfTest(
    classifyOilNewsPostRefresh({
      cacheGeneratedAt: '2026-07-25T00:00:00.000Z',
      cacheAgeHours: 12,
      errorCooldownHours: 24,
      productionGeneratedAt: '2026-07-25T12:00:00.000Z',
      productionStatus: 'error',
      productionRequestMode: 'error_cooldown_cache_hit'
    }).state === 'expected_error_cooldown_after_refresh',
    'newer degraded Oil News artifact inside cooldown is expected bounded behavior'
  );
  assertSelfTest(
    classifyOilNewsPostRefresh({
      cacheGeneratedAt: '2026-07-25T00:00:00.000Z',
      cacheAgeHours: 25,
      errorCooldownHours: 24,
      productionGeneratedAt: '2026-07-25T00:10:00.000Z',
      productionStatus: 'error',
      productionRequestMode: 'error_cooldown_cache_hit'
    }).state === 'degraded_awaiting_post_cooldown_refresh_evidence',
    'elapsed wall time alone cannot prove persistence without a post-cooldown refresh'
  );
  assertSelfTest(
    classifyBubbleScheduleContext(141, BUBBLE_WATCH_CACHE_TTL_HOURS).state
      === 'expected_pre_refresh_schedule_gap',
    'weekly Bubble Watch cache gap is distinguished from overdue refresh'
  );
  assertSelfTest(
    classifyBubbleScheduleContext(181, BUBBLE_WATCH_CACHE_TTL_HOURS).state
      === 'scheduled_refresh_overdue',
    'Bubble Watch cache beyond cadence grace is overdue'
  );

  const oilNetworkErrorRow = reviewOilNewsCache(Date.parse('2026-07-10T16:00:00.000Z'), {
    schemaVersion: 'gdelt-news-cache-p37',
    module: 'gdelt-news-cache',
    status: 'error',
    sourceStatus: 'error',
    requestMode: 'error_cooldown_cache_hit',
    generatedAt: '2026-07-10T15:00:00.000Z',
    cachePolicy: { lowFrequencyCache: true, broadQueryLocalClassification: true },
    query: { query: GDELT_BROAD_QUERY_SPEC.query },
    requestDiagnostics: { errorCode: 'network_error' },
    articles: []
  });
  assertSelfTest(
    oilNetworkErrorRow.findings.some((finding) => finding.severity === 'watch' && finding.code === 'oil_news_gdelt_source_error'),
    'network_error cache becomes WATCH instead of healthy'
  );

  const placeholderRow = reviewBubbleWatchCache(Date.parse('2026-07-06T05:30:00.000Z'), {
    schemaVersion: 'gdelt-bubble-watch-cache-p38',
    module: 'gdelt-bubble-watch-cache',
    cacheScope: 'bubble_watch_ceo_hedging',
    cachePolicy: {
      lowFrequencyCache: true,
      broadQueryLocalClassification: true
    },
    status: 'not_initialized',
    sourceStatus: 'missing',
    requestMode: 'placeholder_until_next_bubble_watch_refresh',
    generatedAt: placeholderGeneratedAt,
    articles: []
  }, refreshHistory);
  assertSelfTest(
    placeholderRow.findings.some((finding) => finding.severity === 'fail' && finding.code === 'bubble_cache_placeholder_refresh_threshold_exceeded'),
    'placeholder fixture becomes FAIL at threshold'
  );
  assertSelfTest(
    recommendationFor('fail', [placeholderRow]) === 'investigate_bubble_watch_refresh_history_then_rerun_review',
    'placeholder threshold fail routes to scheduled refresh triage'
  );
  assertSelfTest(
    recommendationFor('fail', [
      placeholderRow,
      { findings: [{ severity: 'fail', code: 'world_order_cache_schema_mismatch' }] }
    ]) === 'fix_schema_or_policy_before_relying_on_gdelt_caches',
    'mixed placeholder and schema fail routes to schema/policy triage'
  );
  assertSelfTest(
    awaitingPostMigrationRefresh([placeholderRow]) === true,
    'placeholder threshold fail remains a post-migration refresh state'
  );
  assertSelfTest(
    formatPostRefreshSummary({
      expectedErrorCooldownCount: 1,
      awaitingPostCooldownRefreshCount: 0,
      persistentAfterCooldownCount: 0,
      expectedScheduleGapCount: 2,
      scheduledRefreshOverdueCount: 0
    }) === 'expectedCooldown=1 awaitingPostCooldownRefresh=0 persistentAfterCooldown=0 expectedScheduleGap=2 scheduledOverdue=0',
    'post-refresh summary formatter emits stable operator summary'
  );
  assertSelfTest(
    formatRefreshContext({
      state: 'expected_error_cooldown_after_refresh',
      cooldownRemainingHours: 11.74,
      nextAction: 'wait_until_error_cooldown_expires_then_rerun_after_scheduled_refresh'
    }) === 'state=expected_error_cooldown_after_refresh cooldownRemainingHours=11.74 nextAction=wait_until_error_cooldown_expires_then_rerun_after_scheduled_refresh',
    'refresh-context formatter emits cooldown details'
  );
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
  const recommendation = recommendationFor(status, rows);
  const postRefresh = summarizePostRefreshContexts(rows);
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
      awaitingPostMigrationRefresh: awaitingPostMigrationRefresh(rows),
      postRefresh
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
  assertManualArtifactWritePath(resolved);
  mkdirSync(dirname(resolved), { recursive: true });
  assertManualArtifactWritePath(resolved);
  writeFileSync(resolved, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
  review.outputPath = resolved;
}

function printSummary(review) {
  console.log(`GDELT cache health review: ${review.status.toUpperCase()}`);
  console.log(`recommendation: ${review.recommendation}`);
  const postRefreshSummary = formatPostRefreshSummary(review.summary?.postRefresh);
  if (postRefreshSummary) {
    console.log(`postRefresh: ${postRefreshSummary}`);
  }
  const nextActions = review.summary?.postRefresh?.nextActions;
  if (Array.isArray(nextActions) && nextActions.length > 0) {
    console.log(`postRefreshNextActions: ${nextActions.join(', ')}`);
  }
  for (const row of review.rows) {
    const primary = row.findings[0] || { severity: 'ok', code: 'ok' };
    const generated = row.generatedAt ? ` generatedAt=${row.generatedAt}` : '';
    const age = row.ageHours === null ? '' : ` ageHours=${row.ageHours}`;
    console.log(`- ${row.key}: ${primary.severity}/${primary.code} status=${row.status} requestMode=${row.requestMode || 'null'}${generated}${age}`);
    const refreshContextSummary = formatRefreshContext(row.refreshContext);
    if (refreshContextSummary) {
      console.log(`  refreshContext: ${refreshContextSummary}`);
    }
  }
  if (review.outputPath) console.log(`outputPath: ${review.outputPath}`);
}

async function main() {
  runSelfTests();
  const options = parseArgs(process.argv.slice(2));
  const review = buildReview();
  if (options.writeOutput) writeReview(review, options.output);
  if (options.printJson) {
    console.log(JSON.stringify(review, null, 2));
  } else {
    printSummary(review);
  }
  if (shouldExitNonZero(review.status, options.strict)) process.exit(1);
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
