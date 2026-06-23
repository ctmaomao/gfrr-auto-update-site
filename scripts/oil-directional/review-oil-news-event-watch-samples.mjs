#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import process from 'node:process';

const REVIEW_VERSION = 'oil-news-event-watch-samples-review-p30';
const WATCH_PATH = 'data/oil-news-event-watch.json';
const DEFAULT_OUTPUT = 'manual-artifacts/oil-news/oil-news-event-watch-samples-review-latest.json';
const DEFAULT_MAX_COMMITS = 20;
const DEFAULT_MIN_SAMPLES = 2;
const HIGH_CLAIM_RE = /\b(blockade|closure|closed|shut|war|mine|mines|attack|strike|halt|disrupt|disruption)\b/iu;
const BOUNDARY =
  'manual oil-news event watch sample review only; not production data; not in values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function printUsage() {
  console.log(`Usage:
  npm run review:oil-news-event-watch-samples -- [options]

Options:
  --input <path>       Oil news watch artifact. May be repeated.
  --input-dir <path>   Directory of oil news watch JSON artifacts. Files are read alphabetically.
  --max-commits <n>    Recent git commits touching ${WATCH_PATH} to inspect when no --input is given. Default: ${DEFAULT_MAX_COMMITS}
  --min-samples <n>    Usable live samples required for calibration readiness. Default: ${DEFAULT_MIN_SAMPLES}
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
  if (!Number.isInteger(options.minSamples) || options.minSamples < 1 || options.minSamples > 100) {
    throw new Error('Invalid --min-samples. Expected integer 1..100.');
  }
  if (!isSafeOutputPath(options.output)) {
    throw new Error(`Refusing to write review outside manual-artifacts/: ${options.output}`);
  }
  return options;
}

function safeRelativePath(filePath) {
  const absolutePath = resolve(filePath);
  const relativePath = relative(process.cwd(), absolutePath);
  if (relativePath === '' || relativePath.startsWith('..')) return null;
  return relativePath.replace(/\\/g, '/');
}

function isManualArtifactPath(filePath) {
  const relativePath = safeRelativePath(filePath);
  return Boolean(relativePath && relativePath.startsWith('manual-artifacts/'));
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

function finiteNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 2) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
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
  return {
    text: readFileSync(filePath, 'utf8'),
    source: {
      type: 'file',
      path: resolve(filePath),
      safeInputPath: isSafeInputPath(filePath)
    }
  };
}

function rawInputs(options) {
  const fileInputs = expandInputFiles(options);
  if (fileInputs.length > 0) {
    return fileInputs.map(readInputFile);
  }
  return readCommitRows(options.maxCommits).map(readWatchAtCommit);
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

function sourceIsLive(status) {
  return status === 'live' || status === 'partial';
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

  const sourceStatus = artifact.sourceStatus || {};
  const topArticles = Array.isArray(artifact.topArticles) ? artifact.topArticles : [];
  const highClaimTitles = topArticles
    .filter((article) => typeof article.title === 'string' && HIGH_CLAIM_RE.test(article.title))
    .map((article) => ({
      title: article.title,
      domain: article.domain ?? null,
      sources: Array.isArray(article.sources) ? article.sources : []
    }));
  const buckets = Object.fromEntries(Object.entries(artifact.buckets || {}).map(([bucketId, bucket]) => [
    bucketId,
    {
      articleCount: finiteNumber(bucket?.articleCount, 0),
      sourceCount: finiteNumber(bucket?.sourceCount, 0),
      weightedSignal: finiteNumber(bucket?.weightedSignal, 0)
    }
  ]));
  const liveSourceCount = finiteNumber(artifact.aggregate?.liveSourceCount, 0);
  const uniqueArticleCount = finiteNumber(artifact.aggregate?.uniqueArticleCount, 0);

  return {
    index,
    source: raw.source,
    generatedAt,
    status: artifact.status ?? null,
    signalState: artifact.signalState ?? null,
    sourceStatus: {
      gdeltDoc: sourceStatus.gdeltDoc ?? 'not_queried',
      tavily: sourceStatus.tavily ?? 'not_queried',
      brave: sourceStatus.brave ?? 'not_queried',
      tavilyKey: sourceStatus.tavilyKey ?? null,
      braveKey: sourceStatus.braveKey ?? null
    },
    aggregate: {
      rawArticleCount: finiteNumber(artifact.aggregate?.rawArticleCount, 0),
      uniqueArticleCount,
      liveSourceCount,
      configuredSourceCount: finiteNumber(artifact.aggregate?.configuredSourceCount, 0),
      bucketCountWithHits: finiteNumber(artifact.aggregate?.bucketCountWithHits, 0),
      confidence: artifact.aggregate?.confidence ?? null
    },
    freshness: {
      latestArticleAt: isoOrNull(artifact.freshness?.latestArticleAt),
      latestArticleAgeHours: finiteNumber(artifact.freshness?.latestArticleAgeHours)
    },
    queryCoverage: {
      queryCount: finiteNumber(artifact.queryCoverage?.queryCount, 0),
      querySuccessCount: finiteNumber(artifact.queryCoverage?.querySuccessCount, 0),
      queryFailureCount: finiteNumber(artifact.queryCoverage?.queryFailureCount, 0)
    },
    buckets,
    topDomains: topArticles
      .map((article) => article.domain)
      .filter((domain) => typeof domain === 'string' && domain),
    highClaimTitles,
    usableForCalibration:
      liveSourceCount >= 2 &&
      uniqueArticleCount > 0 &&
      sourceIsLive(sourceStatus.tavily) &&
      sourceIsLive(sourceStatus.brave)
  };
}

function addWarning(review, message) {
  review.warnings.push(message);
}

function sourceHealth(samples, sourceKey) {
  const statuses = samples.map((sample) => sample.sourceStatus[sourceKey]);
  const liveOrPartial = statuses.filter(sourceIsLive).length;
  return {
    source: sourceKey,
    statuses,
    liveOrPartialCount: liveOrPartial,
    sampleCount: samples.length,
    liveOrPartialRate: samples.length === 0 ? 0 : round(liveOrPartial / samples.length, 3)
  };
}

function summarizeBuckets(samples) {
  const bucketIds = [...new Set(samples.flatMap((sample) => Object.keys(sample.buckets)))].sort();
  return bucketIds.map((bucketId) => {
    const rows = samples.map((sample) => sample.buckets[bucketId] || { articleCount: 0, sourceCount: 0, weightedSignal: 0 });
    const articleCounts = rows.map((row) => row.articleCount);
    const sourceCounts = rows.map((row) => row.sourceCount);
    return {
      bucketId,
      samplesWithHits: articleCounts.filter((count) => count > 0).length,
      minArticleCount: Math.min(...articleCounts),
      maxArticleCount: Math.max(...articleCounts),
      minSourceCount: Math.min(...sourceCounts),
      maxSourceCount: Math.max(...sourceCounts),
      averageArticleCount: round(articleCounts.reduce((sum, value) => sum + value, 0) / Math.max(1, articleCounts.length), 2)
    };
  });
}

function countDomains(samples) {
  const counts = new Map();
  for (const domain of samples.flatMap((sample) => sample.topDomains)) {
    counts.set(domain, (counts.get(domain) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([domain, count]) => ({ domain, count }));
}

function dateDiffHours(startIso, endIso) {
  if (!startIso || !endIso) return null;
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return round(Math.max(0, end - start) / 3600000, 2);
}

function buildReview(options, samples, invalid) {
  const usableSamples = samples.filter((sample) => sample.usableForCalibration);
  const sampleTimes = samples.map((sample) => sample.generatedAt).sort();
  const articleCounts = usableSamples.map((sample) => sample.aggregate.uniqueArticleCount);
  const minArticles = articleCounts.length ? Math.min(...articleCounts) : null;
  const maxArticles = articleCounts.length ? Math.max(...articleCounts) : null;
  const avgArticles = articleCounts.length
    ? articleCounts.reduce((sum, value) => sum + value, 0) / articleCounts.length
    : null;
  const titleClaims = samples.flatMap((sample) => sample.highClaimTitles.map((title) => ({
    sampleGeneratedAt: sample.generatedAt,
    ...title
  })));
  const sourceHealthRows = ['gdeltDoc', 'tavily', 'brave'].map((sourceKey) => sourceHealth(usableSamples, sourceKey));

  const review = {
    reviewVersion: REVIEW_VERSION,
    generatedAt: new Date().toISOString(),
    status: 'pass',
    recommendation: 'ready_for_display_only_manual_calibration_review',
    promotionEligible: false,
    input: {
      mode: options.inputs.length > 0 || options.inputDirs.length > 0 ? 'explicit_inputs' : 'git_history',
      maxCommits: options.maxCommits,
      minSamples: options.minSamples,
      watchPath: WATCH_PATH
    },
    summary: {
      sampleCount: samples.length,
      usableForCalibrationSampleCount: usableSamples.length,
      invalidSampleCount: invalid.length,
      firstSampleAt: sampleTimes[0] ?? null,
      lastSampleAt: sampleTimes[sampleTimes.length - 1] ?? null,
      sampleWindowHours: dateDiffHours(sampleTimes[0], sampleTimes[sampleTimes.length - 1]),
      minUniqueArticleCount: minArticles,
      maxUniqueArticleCount: maxArticles,
      averageUniqueArticleCount: round(avgArticles, 2),
      liveSourceMin: usableSamples.length ? Math.min(...usableSamples.map((sample) => sample.aggregate.liveSourceCount)) : null,
      liveSourceMax: usableSamples.length ? Math.max(...usableSamples.map((sample) => sample.aggregate.liveSourceCount)) : null,
      confidenceValues: [...new Set(usableSamples.map((sample) => sample.aggregate.confidence).filter(Boolean))],
      signalStates: [...new Set(usableSamples.map((sample) => sample.signalState).filter(Boolean))]
    },
    sourceHealth: sourceHealthRows,
    bucketStability: summarizeBuckets(usableSamples),
    topDomainFrequency: countDomains(usableSamples),
    titleRisk: {
      highClaimTitleCount: titleClaims.length,
      sample: titleClaims.slice(0, 10)
    },
    samples,
    invalid,
    warnings: [],
    blockers: [],
    calibrationDecision: {
      sampleReadiness: 'pending',
      sourceReadiness: 'pending',
      headlineDisplayReadiness: 'not_ready',
      scoringIntegrationReadiness: 'blocked_by_policy',
      nextStep: 'review_source_noise_before_expanding_frontend_detail'
    },
    productionImpact: productionImpactFalseMap(),
    boundary: BOUNDARY
  };

  if (invalid.length > 0) {
    addWarning(review, `${invalid.length} invalid sample(s) were skipped before calibration review.`);
  }
  if (samples.length === 0) {
    if (options.allowEmpty) {
      addWarning(review, 'No oil-news event watch samples were found.');
    } else {
      review.blockers.push('No oil-news event watch samples were found.');
    }
  }
  if (usableSamples.length < options.minSamples) {
    addWarning(review, `Need ${options.minSamples} usable live samples; found ${usableSamples.length}.`);
  }
  for (const row of sourceHealthRows) {
    if (row.source !== 'gdeltDoc' && row.liveOrPartialCount < usableSamples.length) {
      addWarning(review, `${row.source} was not live/partial in every usable sample.`);
    }
    if (row.source === 'gdeltDoc' && row.liveOrPartialRate < 0.75) {
      addWarning(review, 'GDELT DOC is unstable across recent oil-news samples; keep Tavily/Brave cross-check required.');
    }
  }
  if (titleClaims.length > 0) {
    addWarning(review, 'Top article titles contain high-claim event language; do not expose headlines directly without a separate reviewed UI/copy contract.');
  }
  if (avgArticles && minArticles !== null && maxArticles !== null && maxArticles / Math.max(1, minArticles) > 2) {
    addWarning(review, 'Unique article count is highly volatile across samples; collect more samples before tuning thresholds.');
  }

  review.calibrationDecision.sampleReadiness =
    usableSamples.length >= options.minSamples ? 'ready_for_manual_review' : 'collect_more_samples';
  review.calibrationDecision.sourceReadiness =
    sourceHealthRows.find((row) => row.source === 'tavily')?.liveOrPartialRate === 1 &&
    sourceHealthRows.find((row) => row.source === 'brave')?.liveOrPartialRate === 1
      ? 'tavily_brave_ready_gdelt_backup_unstable'
      : 'source_mix_not_ready';
  review.calibrationDecision.headlineDisplayReadiness =
    titleClaims.length === 0 ? 'candidate_ready_for_review' : 'not_ready_high_claim_title_noise';

  if (review.blockers.length > 0) {
    review.status = 'fail';
    review.recommendation = 'fix_samples_before_oil_news_calibration';
  } else if (review.warnings.length > 0) {
    review.status = 'warn';
    review.recommendation = usableSamples.length >= options.minSamples
      ? 'manual_calibration_ready_keep_display_only'
      : 'collect_more_samples_before_calibration';
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
  console.log(`Oil news event watch samples review: ${review.status.toUpperCase()}`);
  console.log(`recommendation: ${review.recommendation}`);
  console.log(`promotionEligible: ${review.promotionEligible}`);
  console.log(`sampleCount: ${review.summary.sampleCount}`);
  console.log(`usableForCalibrationSampleCount: ${review.summary.usableForCalibrationSampleCount}`);
  console.log(`sourceReadiness: ${review.calibrationDecision.sourceReadiness}`);
  console.log(`headlineDisplayReadiness: ${review.calibrationDecision.headlineDisplayReadiness}`);
  console.log(`uniqueArticleCountRange: ${review.summary.minUniqueArticleCount}..${review.summary.maxUniqueArticleCount}`);
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

  for (const [index, raw] of raws.entries()) {
    try {
      samples.push(extractSample(raw, index));
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
