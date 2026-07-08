#!/usr/bin/env node
import { isManualArtifactPath, safeRelativePath } from '../lib/check-script-helpers.mjs';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import process from 'node:process';

const REVIEW_VERSION = 'oil-news-source-health-samples-review-p34';
const WATCH_PATH = 'data/oil-news-event-watch.json';
const DEFAULT_OUTPUT = 'manual-artifacts/oil-news/oil-news-source-health-samples-review-latest.json';
const DEFAULT_MAX_COMMITS = 30;
const DEFAULT_MAX_SAMPLES = 12;
const DEFAULT_MIN_SAMPLES = 2;
const SOURCES = [
  { key: 'gdeltDoc', detailKey: 'gdelt_doc', label: 'GDELT DOC' },
  { key: 'tavily', detailKey: 'tavily', label: 'Tavily' },
  { key: 'brave', detailKey: 'brave', label: 'Brave' }
];
const SOURCE_STATUS_VALUES = ['live', 'partial', 'error', 'not_configured', 'not_queried', 'dry_run', 'missing'];
const HIGH_CLAIM_RE = /\b(blockade|closure|closed|shut|war|mine|mines|attack|attacks|strike|strikes|halt|halts|disrupt|disrupted|disruption|shutdown)\b/iu;
const BOUNDARY =
  'manual oil-news source-health sample review only; not production data; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function printUsage() {
  console.log(`Usage:
  npm run review:oil-news-source-health-samples -- [options]

Options:
  --input <path>       Oil news watch artifact. May be repeated.
  --input-dir <path>   Directory of oil news watch JSON artifacts. Files are read alphabetically.
  --max-commits <n>    Recent git commits touching ${WATCH_PATH} to inspect when no --input is given. Default: ${DEFAULT_MAX_COMMITS}
  --max-samples <n>    Maximum unique valid samples to review. Default: ${DEFAULT_MAX_SAMPLES}
  --min-samples <n>    Minimum valid samples before source-health readiness can be reviewed. Default: ${DEFAULT_MIN_SAMPLES}
  --output <path>      Manual review artifact path. Default: ${DEFAULT_OUTPUT}
  --allow-empty        Exit 0 if no valid sample exists.
  --strict             Exit non-zero on WARN or FAIL.
  --json               Print full JSON review to stdout.
  --no-output          Do not write the review artifact.
  --help               Show this help.`);
}

function parseArgs(argv) {
  const options = {
    inputs: [],
    inputDirs: [],
    maxCommits: DEFAULT_MAX_COMMITS,
    maxSamples: DEFAULT_MAX_SAMPLES,
    minSamples: DEFAULT_MIN_SAMPLES,
    output: DEFAULT_OUTPUT,
    allowEmpty: false,
    strict: false,
    printJson: false,
    writeOutput: true
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--allow-empty') {
      options.allowEmpty = true;
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

    if (arg === '--input') {
      options.inputs.push(nextValue());
    } else if (arg === '--input-dir') {
      options.inputDirs.push(nextValue());
    } else if (arg === '--max-commits') {
      options.maxCommits = Number(nextValue());
    } else if (arg === '--max-samples') {
      options.maxSamples = Number(nextValue());
    } else if (arg === '--min-samples') {
      options.minSamples = Number(nextValue());
    } else if (arg === '--output') {
      options.output = nextValue();
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.maxCommits) || options.maxCommits < 1 || options.maxCommits > 500) {
    throw new Error('Invalid --max-commits. Expected integer 1..500.');
  }
  if (!Number.isInteger(options.maxSamples) || options.maxSamples < 1 || options.maxSamples > 100) {
    throw new Error('Invalid --max-samples. Expected integer 1..100.');
  }
  if (!Number.isInteger(options.minSamples) || options.minSamples < 1 || options.minSamples > 100) {
    throw new Error('Invalid --min-samples. Expected integer 1..100.');
  }
  if (options.writeOutput && !isSafeOutputPath(options.output)) {
    throw new Error(`Refusing to write review outside manual-artifacts/: ${options.output}`);
  }
  return options;
}

function isFixturePath(filePath) {
  const relativePath = safeRelativePath(filePath);
  return Boolean(relativePath && relativePath.startsWith('docs/fixtures/'));
}

function isProductionWatchPath(filePath) {
  const relativePath = safeRelativePath(filePath);
  return relativePath === WATCH_PATH;
}

function isSafeInputPath(filePath) {
  return isManualArtifactPath(filePath) || isFixturePath(filePath) || isProductionWatchPath(filePath);
}

function isSafeOutputPath(filePath) {
  return isManualArtifactPath(filePath);
}

function isoOrNull(value) {
  if (typeof value !== 'string') return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 3) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function average(values) {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return null;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function median(values) {
  const finite = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (finite.length === 0) return null;
  const mid = Math.floor(finite.length / 2);
  return finite.length % 2 ? finite[mid] : (finite[mid - 1] + finite[mid]) / 2;
}

function productionImpactFalseMap() {
  return {
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
  };
}

function runGit(args) {
  const result = spawnSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });
  if (result.error) throw new Error(`Failed to run git ${args.join(' ')}: ${result.error.message}`);
  if (result.status !== 0) {
    const stderr = String(result.stderr ?? '').trim();
    throw new Error(`git ${args.join(' ')} failed: ${stderr || `exit ${result.status}`}`);
  }
  return String(result.stdout ?? '');
}

function readCommitRows(maxCommits) {
  const output = runGit(['log', `--max-count=${maxCommits}`, '--format=%H%x09%ct%x09%s', '--', WATCH_PATH]);
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [hash, epochText, ...subjectParts] = line.split('\t');
      const epochSeconds = Number(epochText);
      return {
        hash,
        committedAt: Number.isFinite(epochSeconds) ? new Date(epochSeconds * 1000).toISOString() : null,
        subject: subjectParts.join('\t')
      };
    });
}

function readWatchAtCommit(commit) {
  return {
    text: runGit(['show', `${commit.hash}:${WATCH_PATH}`]),
    source: {
      type: 'git_history',
      path: WATCH_PATH,
      commitHash: commit.hash,
      committedAt: commit.committedAt,
      commitSubject: commit.subject
    }
  };
}

function expandInputFiles(options) {
  const files = [...options.inputs];
  for (const inputDir of options.inputDirs) {
    const absoluteDir = resolve(inputDir);
    if (!existsSync(absoluteDir)) throw new Error(`Input directory does not exist: ${inputDir}`);
    const jsonFiles = readdirSync(absoluteDir)
      .filter((name) => extname(name).toLowerCase() === '.json' && !name.endsWith('.archive-meta.json'))
      .sort((a, b) => a.localeCompare(b))
      .map((name) => `${inputDir.replace(/\\/g, '/')}/${name}`);
    files.push(...jsonFiles);
  }
  return [...new Set(files)];
}

function readInputFile(filePath) {
  if (!existsSync(resolve(filePath))) throw new Error(`Input file does not exist: ${filePath}`);
  if (!isSafeInputPath(filePath)) throw new Error(`Refusing unsafe input path: ${filePath}`);
  return {
    text: readFileSync(filePath, 'utf8'),
    source: {
      type: 'file',
      path: resolve(filePath),
      safeInputPath: true
    }
  };
}

function rawInputs(options) {
  const fileInputs = expandInputFiles(options);
  if (fileInputs.length > 0) {
    return fileInputs.map(readInputFile);
  }
  return readCommitRows(options.maxCommits).slice(0, options.maxSamples).map(readWatchAtCommit);
}

function validateNoForbiddenSerializedText(text, label) {
  for (const needle of [
    'TAVILY_API_KEY',
    'TAVILY_API_KEYS',
    'BRAVE_API_KEY',
    'BRAVE_API_KEYS',
    'Authorization',
    'X-Subscription-Token',
    'Bearer ',
    '"snippet"',
    '"body"',
    '"rawResponse"'
  ]) {
    if (text.includes(needle)) throw new Error(`${label} contains forbidden marker: ${needle}`);
  }
}

function sourceStatusIsUsable(status) {
  return status === 'live' || status === 'partial';
}

function normalizeStatus(value) {
  return SOURCE_STATUS_VALUES.includes(value) ? value : 'missing';
}

function statusWeight(status) {
  if (status === 'live') return 1;
  if (status === 'partial') return 0.5;
  return 0;
}

function sourceDetail(artifact, source) {
  const details = artifact.sourceStatus?.details;
  if (!details || typeof details !== 'object') return {};
  const detail = details[source.detailKey];
  return detail && typeof detail === 'object' ? detail : {};
}

function detailRuns(detail) {
  return Array.isArray(detail.queryRuns) ? detail.queryRuns : [];
}

function sampleHighClaimCount(artifact) {
  if (Number.isFinite(artifact.titleRisk?.highClaimTitleCount)) {
    return artifact.titleRisk.highClaimTitleCount;
  }
  const topArticles = Array.isArray(artifact.topArticles) ? artifact.topArticles : [];
  return topArticles.filter((article) => typeof article.title === 'string' && HIGH_CLAIM_RE.test(article.title)).length;
}

function extractSample(raw, index) {
  const label = raw.source.type === 'git_history'
    ? `${raw.source.commitHash}:${WATCH_PATH}`
    : raw.source.path;
  validateNoForbiddenSerializedText(raw.text, label);
  const artifact = JSON.parse(raw.text);
  if (artifact.schemaVersion !== 'oil-news-event-watch-1') {
    throw new Error(`${label} has unsupported schemaVersion: ${artifact.schemaVersion ?? '(missing)'}`);
  }
  if (artifact.module !== 'oil-news-event-watch') {
    throw new Error(`${label} has unsupported module: ${artifact.module ?? '(missing)'}`);
  }
  const generatedAt = isoOrNull(artifact.generatedAt);
  if (!generatedAt) throw new Error(`${label} has invalid generatedAt.`);
  if (artifact.promotionEligible !== false) throw new Error(`${label} must keep promotionEligible=false.`);
  if (artifact.productionDisplayApproved !== true) throw new Error(`${label} must keep productionDisplayApproved=true.`);
  const productionImpact = artifact.productionImpact && typeof artifact.productionImpact === 'object'
    ? artifact.productionImpact
    : null;
  if (!productionImpact) throw new Error(`${label} is missing productionImpact map.`);
  const truthyImpact = Object.entries(productionImpact)
    .filter(([, value]) => value === true)
    .map(([key]) => key);
  if (truthyImpact.length > 0) {
    throw new Error(`${label} has productionImpact=true fields: ${truthyImpact.join(', ')}`);
  }

  const sources = Object.fromEntries(SOURCES.map((source) => {
    const detail = sourceDetail(artifact, source);
    const status = normalizeStatus(artifact.sourceStatus?.[source.key] ?? detail.status);
    const runs = detailRuns(detail);
    const errorCounts = new Map();
    for (const run of runs) {
      if (run?.error) {
        const errorText = String(run.error).slice(0, 120);
        errorCounts.set(errorText, (errorCounts.get(errorText) || 0) + 1);
      }
    }
    return [
      source.key,
      {
        label: source.label,
        status,
        successCount: finiteNumber(detail.successCount),
        failureCount: finiteNumber(detail.failureCount),
        articleCount: finiteNumber(detail.articleCount),
        queryRunCount: runs.length,
        errorMessages: [...errorCounts.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .map(([message, count]) => ({ message, count }))
      }
    ];
  }));

  const queryCount = finiteNumber(artifact.queryCoverage?.queryCount);
  const querySuccessCount = finiteNumber(artifact.queryCoverage?.querySuccessCount);
  const queryFailureCount = finiteNumber(artifact.queryCoverage?.queryFailureCount);
  const querySuccessRate = queryCount > 0 ? querySuccessCount / queryCount : null;
  const liveSourceCount = finiteNumber(artifact.aggregate?.liveSourceCount);
  const configuredSourceCount = finiteNumber(artifact.aggregate?.configuredSourceCount);
  const uniqueArticleCount = finiteNumber(artifact.aggregate?.uniqueArticleCount);
  const highClaimTitleCount = sampleHighClaimCount(artifact);
  const displayHeadlinesApproved = artifact.headlineDisplayReadiness?.displayHeadlinesApproved === true;

  return {
    index,
    source: raw.source,
    generatedAt,
    status: artifact.status ?? null,
    signalState: artifact.signalState ?? null,
    sourceStatus: Object.fromEntries(SOURCES.map((source) => [source.key, sources[source.key].status])),
    sources,
    queryCoverage: {
      queryCount,
      querySuccessCount,
      queryFailureCount,
      querySuccessRate: round(querySuccessRate, 3)
    },
    aggregate: {
      rawArticleCount: finiteNumber(artifact.aggregate?.rawArticleCount),
      uniqueArticleCount,
      liveSourceCount,
      configuredSourceCount,
      bucketCountWithHits: finiteNumber(artifact.aggregate?.bucketCountWithHits),
      confidence: artifact.aggregate?.confidence ?? null
    },
    titleRisk: {
      evaluatedArticleCount: finiteNumber(artifact.titleRisk?.evaluatedArticleCount, Array.isArray(artifact.topArticles) ? artifact.topArticles.length : 0),
      highClaimTitleCount,
      highClaimDomainCount: finiteNumber(artifact.titleRisk?.highClaimDomainCount),
      highClaimTerms: Array.isArray(artifact.titleRisk?.highClaimTerms) ? artifact.titleRisk.highClaimTerms.slice(0, 12) : []
    },
    headlineDisplayReadiness: {
      state: artifact.headlineDisplayReadiness?.state ?? 'missing_legacy_guard',
      displayHeadlinesApproved
    },
    failClosedSignals: {
      sourceUnavailable: artifact.status === 'source_unavailable' || artifact.signalState === 'source_unavailable',
      anySourceError: Object.values(sources).some((source) => source.status === 'error'),
      anySourceMissingOrNotConfigured: Object.values(sources).some((source) => source.status === 'not_configured' || source.status === 'not_queried' || source.status === 'missing')
    },
    usableForSourceHealthReview:
      queryCount > 0 &&
      configuredSourceCount >= 2 &&
      sourceStatusIsUsable(sources.tavily.status) &&
      sourceStatusIsUsable(sources.brave.status)
  };
}

function buildSourceHealth(samples) {
  return SOURCES.map((source) => {
    const rows = samples.map((sample) => sample.sources[source.key]).filter(Boolean);
    const statusCounts = Object.fromEntries(SOURCE_STATUS_VALUES.map((status) => [
      status,
      rows.filter((row) => row.status === status).length
    ]));
    const score = rows.reduce((sum, row) => sum + statusWeight(row.status), 0);
    const usableRate = rows.length ? score / rows.length : 0;
    const liveRate = rows.length ? statusCounts.live / rows.length : 0;
    const errors = new Map();
    for (const row of rows) {
      for (const error of row.errorMessages) {
        errors.set(error.message, (errors.get(error.message) || 0) + error.count);
      }
    }
    let readiness = 'insufficient_samples';
    if (rows.length > 0) {
      if (source.key === 'gdeltDoc' && usableRate < 0.75) readiness = 'backup_unstable_keep_cross_check';
      else if (usableRate >= 0.9) readiness = 'stable_enough_for_display_health';
      else if (usableRate >= 0.5) readiness = 'usable_but_degraded';
      else readiness = 'unstable_keep_fail_closed';
    }
    return {
      source: source.key,
      label: source.label,
      sampleCount: rows.length,
      statusCounts,
      liveRate: round(liveRate, 3),
      usableRate: round(usableRate, 3),
      averageSuccessCount: round(average(rows.map((row) => row.successCount)), 2),
      averageFailureCount: round(average(rows.map((row) => row.failureCount)), 2),
      averageArticleCount: round(average(rows.map((row) => row.articleCount)), 2),
      topErrors: [...errors.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 5)
        .map(([message, count]) => ({ message, count })),
      readiness
    };
  });
}

function buildReview(options, samples, invalid) {
  const validSamples = samples.slice(0, options.maxSamples);
  const usableSamples = validSamples.filter((sample) => sample.usableForSourceHealthReview);
  const generatedAts = validSamples.map((sample) => sample.generatedAt).sort();
  const querySuccessRates = validSamples
    .map((sample) => sample.queryCoverage.querySuccessRate)
    .filter((value) => Number.isFinite(value));
  const liveSourceCounts = validSamples.map((sample) => sample.aggregate.liveSourceCount);
  const uniqueArticleCounts = validSamples.map((sample) => sample.aggregate.uniqueArticleCount);
  const highClaimTitleCounts = validSamples.map((sample) => sample.titleRisk.highClaimTitleCount);
  const sourceHealth = buildSourceHealth(validSamples);
  const tavily = sourceHealth.find((row) => row.source === 'tavily');
  const brave = sourceHealth.find((row) => row.source === 'brave');
  const gdeltDoc = sourceHealth.find((row) => row.source === 'gdeltDoc');

  const review = {
    reviewVersion: REVIEW_VERSION,
    generatedAt: new Date().toISOString(),
    status: 'pass',
    recommendation: 'source_health_review_ready_keep_display_only',
    promotionEligible: false,
    productionDisplayApproved: false,
    input: {
      mode: options.inputs.length > 0 || options.inputDirs.length > 0 ? 'explicit_inputs' : 'git_history',
      watchPath: WATCH_PATH,
      maxCommits: options.maxCommits,
      maxSamples: options.maxSamples,
      minSamples: options.minSamples
    },
    summary: {
      sampleCount: validSamples.length,
      usableForSourceHealthReviewSampleCount: usableSamples.length,
      invalidSampleCount: invalid.length,
      firstSampleAt: generatedAts[0] ?? null,
      lastSampleAt: generatedAts[generatedAts.length - 1] ?? null,
      minLiveSourceCount: liveSourceCounts.length ? Math.min(...liveSourceCounts) : null,
      medianLiveSourceCount: round(median(liveSourceCounts), 2),
      maxLiveSourceCount: liveSourceCounts.length ? Math.max(...liveSourceCounts) : null,
      minUniqueArticleCount: uniqueArticleCounts.length ? Math.min(...uniqueArticleCounts) : null,
      medianUniqueArticleCount: round(median(uniqueArticleCounts), 2),
      maxUniqueArticleCount: uniqueArticleCounts.length ? Math.max(...uniqueArticleCounts) : null,
      minQuerySuccessRate: querySuccessRates.length ? round(Math.min(...querySuccessRates), 3) : null,
      medianQuerySuccessRate: round(median(querySuccessRates), 3),
      maxQuerySuccessRate: querySuccessRates.length ? round(Math.max(...querySuccessRates), 3) : null,
      samplesWithAnySourceError: validSamples.filter((sample) => sample.failClosedSignals.anySourceError).length,
      samplesWithSourceUnavailable: validSamples.filter((sample) => sample.failClosedSignals.sourceUnavailable).length,
      samplesWithHighClaimTitles: validSamples.filter((sample) => sample.titleRisk.highClaimTitleCount > 0).length,
      highClaimTitleCountTotal: highClaimTitleCounts.reduce((sum, value) => sum + value, 0),
      headlineDisplayApprovedCount: validSamples.filter((sample) => sample.headlineDisplayReadiness.displayHeadlinesApproved).length
    },
    sourceHealth,
    fallbackHealth: {
      failClosedCopyStillRequired: true,
      legacyWorldOrderFallbackMustBeLabeled: true,
      singleSourceEventConfirmationAllowed: false,
      headlineDisplayAllowed: false,
      degradedSourceCount: validSamples.filter((sample) => sample.failClosedSignals.anySourceError || sample.failClosedSignals.anySourceMissingOrNotConfigured).length,
      gdeltErrorSampleCount: validSamples.filter((sample) => sample.sourceStatus.gdeltDoc === 'error').length,
      tavilyUsableSampleCount: validSamples.filter((sample) => sourceStatusIsUsable(sample.sourceStatus.tavily)).length,
      braveUsableSampleCount: validSamples.filter((sample) => sourceStatusIsUsable(sample.sourceStatus.brave)).length
    },
    sampleOutcomes: validSamples.map((sample) => ({
      generatedAt: sample.generatedAt,
      source: sample.source.type === 'git_history'
        ? { type: 'git_history', commitHash: sample.source.commitHash, committedAt: sample.source.committedAt }
        : { type: 'file', path: sample.source.path },
      status: sample.status,
      signalState: sample.signalState,
      sourceStatus: sample.sourceStatus,
      querySuccessRate: sample.queryCoverage.querySuccessRate,
      liveSourceCount: sample.aggregate.liveSourceCount,
      uniqueArticleCount: sample.aggregate.uniqueArticleCount,
      highClaimTitleCount: sample.titleRisk.highClaimTitleCount,
      headlineDisplayState: sample.headlineDisplayReadiness.state,
      displayHeadlinesApproved: sample.headlineDisplayReadiness.displayHeadlinesApproved
    })),
    invalid,
    warnings: [],
    blockers: [],
    calibrationDecision: {
      sourceHealthReadiness: 'pending',
      fallbackCopyReadiness: 'keep_fail_closed_copy',
      headlineDisplayReadiness: 'not_ready',
      productionIntegrationReadiness: 'blocked_by_policy_display_only_only',
      nextStep: 'continue_collecting_scheduled_samples_before_any_weight_or_headline_expansion'
    },
    productionImpact: productionImpactFalseMap(),
    boundary: BOUNDARY
  };

  if (invalid.length > 0) {
    review.warnings.push(`${invalid.length} invalid sample(s) were skipped before source-health review.`);
  }
  if (validSamples.length === 0) {
    if (options.allowEmpty) review.warnings.push('No oil-news event watch samples were found.');
    else review.blockers.push('No oil-news event watch samples were found.');
  }
  if (validSamples.length < options.minSamples) {
    review.warnings.push(`Need ${options.minSamples} valid samples before source-health review; found ${validSamples.length}.`);
  }
  if (review.summary.headlineDisplayApprovedCount > 0) {
    review.blockers.push('At least one sample has displayHeadlinesApproved=true; headline display must remain disabled.');
  }
  if (review.summary.highClaimTitleCountTotal > 0) {
    review.warnings.push('High-claim title language exists in sampled compact headlines; keep headline display disabled.');
  }
  if (gdeltDoc && gdeltDoc.usableRate < 0.75) {
    review.warnings.push('GDELT DOC source health is degraded/unstable across samples; keep Tavily/Brave cross-check and fail-closed copy.');
  }
  if (tavily && tavily.usableRate < 1) {
    review.warnings.push('Tavily was not usable in every sample; do not raise source-health confidence.');
  }
  if (brave && brave.usableRate < 1) {
    review.warnings.push('Brave was not usable in every sample; do not raise source-health confidence.');
  }
  if (review.summary.samplesWithAnySourceError > 0) {
    review.warnings.push('At least one sample had provider error status; fallback wording must remain visible.');
  }

  const paidSearchPairStable = Boolean(tavily && brave && tavily.usableRate === 1 && brave.usableRate === 1);
  const gdeltBackupUnstable = Boolean(gdeltDoc && gdeltDoc.usableRate < 0.75);
  if (validSamples.length >= options.minSamples && paidSearchPairStable && gdeltBackupUnstable) {
    review.calibrationDecision.sourceHealthReadiness = 'tavily_brave_ready_gdelt_backup_unstable';
  } else if (validSamples.length >= options.minSamples && paidSearchPairStable) {
    review.calibrationDecision.sourceHealthReadiness = 'three_source_or_pair_stable_keep_display_only';
  } else if (validSamples.length >= options.minSamples) {
    review.calibrationDecision.sourceHealthReadiness = 'source_mix_degraded_collect_more_samples';
  } else {
    review.calibrationDecision.sourceHealthReadiness = 'collect_more_samples';
  }
  review.calibrationDecision.headlineDisplayReadiness =
    review.summary.highClaimTitleCountTotal === 0 ? 'candidate_ready_for_separate_review' : 'not_ready_high_claim_title_noise';

  if (review.blockers.length > 0) {
    review.status = 'fail';
    review.recommendation = 'fix_source_health_sample_contract_before_review';
  } else if (review.warnings.length > 0) {
    review.status = 'warn';
    review.recommendation = validSamples.length >= options.minSamples
      ? 'source_health_review_ready_keep_display_only'
      : 'collect_more_samples_before_source_health_review';
  }

  return review;
}

function writeReview(review, options) {
  if (!options.writeOutput) return;
  const absoluteOutput = resolve(options.output);
  mkdirSync(dirname(absoluteOutput), { recursive: true });
  review.outputPath = absoluteOutput;
  writeFileSync(absoluteOutput, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
}

function printSummary(review) {
  console.log(`Oil news source-health samples review: ${review.status.toUpperCase()}`);
  console.log(`recommendation: ${review.recommendation}`);
  console.log(`promotionEligible: ${review.promotionEligible}`);
  console.log(`productionDisplayApproved: ${review.productionDisplayApproved}`);
  console.log(`sampleCount: ${review.summary.sampleCount}`);
  console.log(`sourceHealthReadiness: ${review.calibrationDecision.sourceHealthReadiness}`);
  console.log(`fallbackCopyReadiness: ${review.calibrationDecision.fallbackCopyReadiness}`);
  console.log(`headlineDisplayReadiness: ${review.calibrationDecision.headlineDisplayReadiness}`);
  console.log(`querySuccessRateRange: ${review.summary.minQuerySuccessRate}..${review.summary.maxQuerySuccessRate}`);
  console.log(`liveSourceRange: ${review.summary.minLiveSourceCount}..${review.summary.maxLiveSourceCount}`);
  if (review.outputPath) console.log(`outputPath: ${review.outputPath}`);
  console.log(`warnings: ${review.warnings.length}`);
  for (const [index, warning] of review.warnings.slice(0, 6).entries()) {
    console.log(`warning[${index}]: ${warning}`);
  }
  if (review.warnings.length > 6) console.log(`warning[more]: ${review.warnings.length - 6} additional warnings omitted`);
  console.log(`blockers: ${review.blockers.length}`);
  for (const [index, blocker] of review.blockers.slice(0, 5).entries()) {
    console.log(`blocker[${index}]: ${blocker}`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const raws = rawInputs(options);
  const samples = [];
  const invalid = [];
  const seenGeneratedAt = new Set();

  for (const [index, raw] of raws.entries()) {
    try {
      const sample = extractSample(raw, index);
      if (seenGeneratedAt.has(sample.generatedAt)) continue;
      seenGeneratedAt.add(sample.generatedAt);
      samples.push(sample);
    } catch (error) {
      invalid.push({
        source: raw.source,
        reason: error.message
      });
    }
  }

  const review = buildReview(options, samples, invalid);
  writeReview(review, options);

  if (options.printJson) {
    console.log(JSON.stringify(review, null, 2));
  } else {
    printSummary(review);
  }
  if (review.status === 'fail' || (options.strict && review.status !== 'pass')) {
    process.exit(1);
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
