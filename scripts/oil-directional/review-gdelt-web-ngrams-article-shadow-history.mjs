#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  assertWebNgramsArticleShadowCache
} from './gdelt-web-ngrams-article-shadow-cache.mjs';
import { WEB_NGRAMS_CROSS_SOURCE_TELEMETRY_CONTRACT } from './gdelt-web-ngrams-cross-source-telemetry.mjs';

export const WEB_NGRAMS_SHADOW_HISTORY_REVIEW_CONTRACT =
  'gdelt-web-ngrams-article-shadow-history-review-v2';
export const DEFAULT_POLICY_PATH = 'config/oil-news-discovery-policy.json';
const DEFAULT_OUTPUT =
  'manual-artifacts/oil-news/gdelt-web-ngrams-article-shadow-history-review-latest.json';
const PRODUCTION_PATH = 'data/oil-news-event-watch.json';

function roundRate(value) {
  return Number.isFinite(value) ? Math.round(value * 10000) / 10000 : null;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function parseArgs(argv) {
  const options = {
    policy: DEFAULT_POLICY_PATH,
    output: DEFAULT_OUTPUT,
    maxCommits: 500,
    writeOutput: true,
    strict: false,
    printJson: false,
    githubSummary: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--no-output') options.writeOutput = false;
    else if (arg === '--strict') options.strict = true;
    else if (arg === '--json') options.printJson = true;
    else if (arg === '--github-summary') options.githubSummary = true;
    else {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      index += 1;
      if (arg === '--policy') options.policy = value;
      else if (arg === '--output') options.output = value;
      else if (arg === '--max-commits') options.maxCommits = Number(value);
      else throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!Number.isInteger(options.maxCommits) || options.maxCommits < 1 || options.maxCommits > 1000) {
    throw new Error('--max-commits must be an integer from 1 to 1000');
  }
  return options;
}

export function assertOilNewsDiscoveryPolicy(policy) {
  if (policy?.contractVersion !== 'oil-news-discovery-policy-v1') {
    throw new Error('Oil News discovery policy contract invalid');
  }
  if (policy.activeMode !== 'gdelt_doc_primary_web_ngrams_shadow'
      || policy.targetModeAfterApproval !== 'web_ngrams_primary_gdelt_doc_fallback'
      || policy.webNgramsPrimaryApproved !== false
      || policy.automaticCutoverApproved !== false) {
    throw new Error('Oil News discovery policy must keep Web NGrams shadow-only');
  }
  const expected = {
    minimumObservationDays: 30,
    minimumUsableSamples: 120,
    minimumPairAvailabilityRate: 0.95,
    minimumUsableSampleRate: 0.8,
    minimumMedianCandidateCount: 10,
    minimumMedianSupportedLanguageCoverageRate: 0.7,
    minimumMedianIndependentSupportRate: 0.1,
    minimumMedianCrossProviderSupportRate: 0.05
  };
  for (const [key, value] of Object.entries(expected)) {
    if (policy.promotionPolicy?.[key] !== value) {
      throw new Error(`Oil News discovery policy ${key} drifted`);
    }
  }
  if (policy.fallbackPolicy?.failClosedOnMissingPair !== true
      || policy.fallbackPolicy?.singleProviderCannotConfirmEvent !== true) {
    throw new Error('Oil News discovery fallback policy invalid');
  }
  if (JSON.stringify(policy.fallbackPolicy.currentOrder)
      !== JSON.stringify(['gdelt_doc', 'tavily', 'brave'])
      || JSON.stringify(policy.fallbackPolicy.targetOrderAfterApproval)
      !== JSON.stringify(['gdelt_web_ngrams', 'tavily', 'brave', 'gdelt_doc'])) {
    throw new Error('Oil News discovery fallback order invalid');
  }
  if (!policy.boundaries
      || Object.values(policy.boundaries).some((value) => value !== false)) {
    throw new Error('Oil News discovery policy boundaries must remain false');
  }
  return true;
}

function readGitHistory(maxCommits) {
  const hashes = execFileSync(
    'git',
    ['log', `--max-count=${maxCommits}`, '--format=%H', '--', PRODUCTION_PATH],
    { encoding: 'utf8' }
  ).trim().split(/\r?\n/u).filter(Boolean);
  return hashes.flatMap((hash) => {
    try {
      const payload = JSON.parse(execFileSync(
        'git',
        ['show', `${hash}:${PRODUCTION_PATH}`],
        { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
      ));
      const cache = payload?.sourceCaches?.gdeltWebNgramsArticleShadow;
      return cache ? [{ commit: hash, cache }] : [];
    } catch {
      return [];
    }
  });
}

function gate(name, actual, required, passed) {
  return { name, actual, required, passed };
}

export function evaluateWebNgramsShadowHistory(samples, policy) {
  assertOilNewsDiscoveryPolicy(policy);
  const valid = [];
  let invalidSampleCount = 0;
  for (const sample of Array.isArray(samples) ? samples : []) {
    try {
      assertWebNgramsArticleShadowCache(sample.cache);
      valid.push(sample);
    } catch {
      invalidSampleCount += 1;
    }
  }
  const deduped = [...new Map(valid.map((sample) => [
    sample.cache.generatedAt,
    sample
  ])).values()].sort((left, right) => (
    Date.parse(left.cache.generatedAt) - Date.parse(right.cache.generatedAt)
  ));
  const summarize = (cohort, totalSampleCount = cohort.length) => {
    const usable = cohort.filter((sample) => sample.cache.status === 'shadow_observation_ready');
    const firstAt = usable[0]?.cache.generatedAt || null;
    const lastAt = usable.at(-1)?.cache.generatedAt || null;
    const observationDays = firstAt && lastAt
      ? Math.max(0, (Date.parse(lastAt) - Date.parse(firstAt)) / 86400000)
      : 0;
    const pairAvailableCount = cohort.filter((sample) => sample.cache.sourceFile.pairAvailable).length;
    return {
      totalSampleCount,
      validSampleCount: cohort.length,
      invalidSampleCount,
      usableSampleCount: usable.length,
      observationDays: Math.round(observationDays * 100) / 100,
      pairAvailabilityRate: roundRate(pairAvailableCount / Math.max(1, cohort.length)),
      usableSampleRate: roundRate(usable.length / Math.max(1, cohort.length)),
      medianCandidateCount: median(usable.map((sample) => (
        sample.cache.candidateAggregate?.candidateCount
      ))),
      medianSupportedLanguageCoverageRate: median(usable.map((sample) => (
        sample.cache.classificationAggregate?.supportedLanguageCoverageRate
      ))),
      medianIndependentSupportRate: median(usable.map((sample) => (
        sample.cache.crossSourceAggregate?.independentSupportRate
      ))),
      medianCrossProviderSupportRate: median(usable.map((sample) => (
        sample.cache.crossSourceAggregate?.crossProviderSupportRate
      )))
    };
  };
  const allHistoryMetrics = summarize(deduped, Array.isArray(samples) ? samples.length : 0);
  const requalified = deduped.filter(sample => (
    sample.cache.crossSourceTelemetryContractVersion === WEB_NGRAMS_CROSS_SOURCE_TELEMETRY_CONTRACT
  ));
  // Every quality gate below uses the new calculation cohort; legacy data is
  // still reported independently, never silently relabelled or recalculated.
  const metrics = summarize(requalified);
  const required = policy.promotionPolicy;
  const gates = [
    gate('invalid_samples', metrics.invalidSampleCount, 0,
      metrics.invalidSampleCount === 0),
    gate('observation_days', metrics.observationDays, required.minimumObservationDays,
      metrics.observationDays >= required.minimumObservationDays),
    gate('usable_samples', metrics.usableSampleCount, required.minimumUsableSamples,
      metrics.usableSampleCount >= required.minimumUsableSamples),
    gate('pair_availability_rate', metrics.pairAvailabilityRate,
      required.minimumPairAvailabilityRate,
      metrics.pairAvailabilityRate >= required.minimumPairAvailabilityRate),
    gate('usable_sample_rate', metrics.usableSampleRate, required.minimumUsableSampleRate,
      metrics.usableSampleRate >= required.minimumUsableSampleRate),
    gate('median_candidate_count', metrics.medianCandidateCount,
      required.minimumMedianCandidateCount,
      metrics.medianCandidateCount >= required.minimumMedianCandidateCount),
    gate('median_supported_language_coverage_rate',
      metrics.medianSupportedLanguageCoverageRate,
      required.minimumMedianSupportedLanguageCoverageRate,
      metrics.medianSupportedLanguageCoverageRate
        >= required.minimumMedianSupportedLanguageCoverageRate),
    gate('median_independent_support_rate', metrics.medianIndependentSupportRate,
      required.minimumMedianIndependentSupportRate,
      metrics.medianIndependentSupportRate >= required.minimumMedianIndependentSupportRate),
    gate('median_cross_provider_support_rate', metrics.medianCrossProviderSupportRate,
      required.minimumMedianCrossProviderSupportRate,
      metrics.medianCrossProviderSupportRate
        >= required.minimumMedianCrossProviderSupportRate)
  ];
  const qualityGatePassed = gates.every((row) => row.passed);
  return {
    contractVersion: WEB_NGRAMS_SHADOW_HISTORY_REVIEW_CONTRACT,
    generatedAt: new Date().toISOString(),
    status: qualityGatePassed
      ? 'ready_for_manual_cutover_review'
      : deduped.length === 0 ? 'insufficient_history'
        : requalified.length === 0 ? 'legacy_samples_require_requalification' : 'collecting_requalified_shadow_history',
    activeMode: policy.activeMode,
    targetModeAfterApproval: policy.targetModeAfterApproval,
    metrics: allHistoryMetrics,
    qualityMetrics: metrics,
    qualityTelemetryContractVersion: WEB_NGRAMS_CROSS_SOURCE_TELEMETRY_CONTRACT,
    legacySampleCount: deduped.length - requalified.length,
    legacyAggregatesRecomputed: false,
    gates,
    qualityGatePassed,
    readyForManualCutoverReview: qualityGatePassed,
    promotionEligible: false,
    automaticCutoverApproved: false,
    requiredNextStep: qualityGatePassed
      ? 'separate reviewed manual cutover PR'
      : 'collect v2 shadow samples under unchanged 30-day/120-sample policy; legacy observations remain historical evidence only',
    productionImpact: {
      writesProductionData: false,
      changesCurrentSignal: false,
      affectsScoring: false,
      affectsDecision: false,
      affectsExecution: false,
      affectsPosition: false,
      affectsOdpFinalBias: false
    },
    boundary:
      'read-only git-history review; never auto-switches discovery mode and never writes production data or scoring paths'
  };
}

function writeGitHubSummary(review) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) throw new Error('GITHUB_STEP_SUMMARY is required with --github-summary');
  const gateRows = review.gates.map((row) => (
    `| ${row.name} | ${row.actual ?? 'n/a'} | ${row.required} | ${row.passed ? 'PASS' : 'WAIT'} |`
  )).join('\n');
  const summary = [
    '## GDELT Web NGrams article shadow readiness',
    '',
    `- Status: \`${review.status}\``,
    `- All-history usable samples: **${review.metrics.usableSampleCount}**`,
    `- All-history observation days: **${review.metrics.observationDays}**`,
    `- Legacy samples (not requalified or recomputed): **${review.legacySampleCount}**`,
    `- V2 quality usable samples: **${review.qualityMetrics.usableSampleCount}**`,
    `- V2 quality observation days: **${review.qualityMetrics.observationDays}**`,
    '- Gates below use only v2 quality observations; thresholds and source mode are unchanged.',
    `- Quality gate passed: **${review.qualityGatePassed}**`,
    '- Promotion eligible: **false** (manual reviewed cutover PR required)',
    '',
    '| Gate | Actual | Required | Result |',
    '| --- | ---: | ---: | --- |',
    gateRows,
    ''
  ].join('\n');
  writeFileSync(summaryPath, summary, { flag: 'a' });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const policy = JSON.parse(readFileSync(resolve(options.policy), 'utf8'));
  const samples = readGitHistory(options.maxCommits);
  const review = evaluateWebNgramsShadowHistory(samples, policy);
  if (options.writeOutput) {
    const output = resolve(options.output);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(review, null, 2)}\n`);
  }
  if (options.githubSummary) writeGitHubSummary(review);
  if (options.printJson) console.log(JSON.stringify(review, null, 2));
  else {
    console.log(`Web NGrams article shadow history review: ${review.status}`);
    console.log(`usableSamples: ${review.metrics.usableSampleCount}`);
    console.log(`observationDays: ${review.metrics.observationDays}`);
    console.log(`legacySamples: ${review.legacySampleCount}`);
    console.log(`v2QualityUsableSamples: ${review.qualityMetrics.usableSampleCount}`);
    console.log(`v2QualityObservationDays: ${review.qualityMetrics.observationDays}`);
    console.log(`qualityGatePassed: ${review.qualityGatePassed}`);
    console.log('promotionEligible: false');
  }
  if (options.strict && !review.qualityGatePassed) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
