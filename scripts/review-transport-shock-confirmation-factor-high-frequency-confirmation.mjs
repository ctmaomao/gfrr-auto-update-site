#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';

const SCHEMA_VERSION = 'transport-shock-confirmation-factor-high-frequency-confirmation-v1';
const NEWS_SCHEMA = 'oil-news-claim-ledger-p52';
const THERMAL_SCHEMA = 'oil-thermal-watch-1';
const NEWS_MANUAL_GATE_SCHEMA = 'transport-shock-confirmation-factor-news-manual-gate-v1';
const DEFAULT_NEWS_LEDGER = 'manual-artifacts/oil-news/oil-news-claim-ledger-latest.json';
const DEFAULT_NEWS_MANUAL_GATE =
  'manual-artifacts/transport-shock-confirmation-factor/news-manual-gate-latest.json';
const DEFAULT_OIL_THERMAL = 'data/oil-thermal-watch.json';
const DEFAULT_OUTPUT = 'manual-artifacts/transport-shock-confirmation-factor/high-frequency-confirmation-latest.json';
const BOUNDARY =
  'artifact-only high-frequency confirmation review for Oil News and Oil Thermal repeated/elevated observation; not production data; no score write; not in values, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function usage() {
  console.log(`Usage:
  npm run review:transport-shock-confirmation-factor-high-frequency-confirmation -- [options]

Options:
  --news-ledger <path>   Oil News claim ledger review. Default: ${DEFAULT_NEWS_LEDGER}
  --news-manual-gate <path> Optional news manual gate artifact. Default: ${DEFAULT_NEWS_MANUAL_GATE}
  --oil-thermal <path>   Oil Thermal watch/probe artifact. Default: ${DEFAULT_OIL_THERMAL}
  --output <path>        Ignored review artifact. Default: ${DEFAULT_OUTPUT}
  --json                 Print full JSON review to stdout.
  --no-output            Do not write ignored artifact.
  --help                 Show this help.

Boundary:
  Reads only data/oil-thermal-watch.json, manual-artifacts/oil-news/,
  manual-artifacts/transport-shock-confirmation-factor/,
  manual-artifacts/oil-thermal/, docs/fixtures/oil-news/,
  docs/fixtures/oil-thermal/, or docs/fixtures/transport-shock-confirmation-factor/.
  Writes only manual-artifacts/transport-shock-confirmation-factor/.
  No network, env, production write, workflow, Worker, frontend, ODP finalBias, or main judgment scoring.`);
}

function safeRelativePath(filePath) {
  const absolutePath = resolve(filePath);
  const relativePath = relative(process.cwd(), absolutePath);
  if (relativePath === '' || relativePath.startsWith('..')) return null;
  return relativePath.replace(/\\/g, '/');
}

function isManualOutputPath(filePath) {
  return safeRelativePath(filePath)?.startsWith('manual-artifacts/transport-shock-confirmation-factor/') === true;
}

function isFixturePath(filePath) {
  const relativePath = safeRelativePath(filePath);
  return relativePath?.startsWith('docs/fixtures/transport-shock-confirmation-factor/') === true
    || relativePath?.startsWith('docs/fixtures/oil-news/') === true
    || relativePath?.startsWith('docs/fixtures/oil-thermal/') === true;
}

function isNewsInputPath(filePath) {
  const relativePath = safeRelativePath(filePath);
  return relativePath?.startsWith('manual-artifacts/oil-news/') === true || isFixturePath(filePath);
}

function isNewsManualGateInputPath(filePath) {
  const relativePath = safeRelativePath(filePath);
  return relativePath?.startsWith('manual-artifacts/transport-shock-confirmation-factor/') === true
    || isFixturePath(filePath);
}

function isThermalInputPath(filePath) {
  const relativePath = safeRelativePath(filePath);
  return relativePath === DEFAULT_OIL_THERMAL
    || relativePath?.startsWith('manual-artifacts/oil-thermal/') === true
    || isFixturePath(filePath);
}

function parseArgs(argv) {
  const options = {
    newsLedger: DEFAULT_NEWS_LEDGER,
    newsManualGate: DEFAULT_NEWS_MANUAL_GATE,
    oilThermal: DEFAULT_OIL_THERMAL,
    output: DEFAULT_OUTPUT,
    printJson: false,
    writeOutput: true
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
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
    if (arg === '--news-ledger') options.newsLedger = nextValue();
    else if (arg === '--news-manual-gate') options.newsManualGate = nextValue();
    else if (arg === '--oil-thermal') options.oilThermal = nextValue();
    else if (arg === '--output') options.output = nextValue();
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!isNewsInputPath(options.newsLedger)) {
    throw new Error(`Refusing to read news ledger outside allowed paths: ${options.newsLedger}`);
  }
  if (!isNewsManualGateInputPath(options.newsManualGate)) {
    throw new Error(`Refusing to read news manual gate outside allowed paths: ${options.newsManualGate}`);
  }
  if (!isThermalInputPath(options.oilThermal)) {
    throw new Error(`Refusing to read oil thermal artifact outside allowed paths: ${options.oilThermal}`);
  }
  if (options.writeOutput && !isManualOutputPath(options.output)) {
    throw new Error(`Refusing to write high-frequency confirmation outside manual-artifacts/transport-shock-confirmation-factor/: ${options.output}`);
  }
  return options;
}

function readJsonInput(filePath) {
  const absolutePath = resolve(filePath);
  if (!existsSync(absolutePath)) {
    return {
      present: false,
      path: safeRelativePath(filePath),
      data: null
    };
  }
  return {
    present: true,
    path: safeRelativePath(filePath),
    data: JSON.parse(readFileSync(absolutePath, 'utf8'))
  };
}

function asNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function falseImpactMap() {
  return {
    writesProductionData: false,
    modifiesFrontend: false,
    modifiesWorkerRuntime: false,
    modifiesWorkflow: false,
    affectsValues: false,
    affectsDisplayInputsBaseline: false,
    affectsEffectiveDisplayInputs: false,
    affectsScoring: false,
    affectsDecisionModel: false,
    affectsExecutionLock: false,
    affectsPositionGuidance: false,
    affectsBrentPromotion: false,
    affectsOdpFinalBias: false,
    affectsMainJudgment: false,
    affectsGlobalRiskHeatmap: false,
    affectsCrossValidation: false
  };
}

function boundaries() {
  return {
    outputOnlyToManualArtifacts: true,
    noNetworkCall: true,
    noEnvironmentRead: true,
    noProductionWrite: true,
    noRealtimeWrite: true,
    noWorkflowChange: true,
    noFrontendChange: true,
    noWorkerRuntimeChange: true,
    noRawProviderResponseStored: true,
    noHeadlineTextOutput: true,
    noScoreWrite: true
  };
}

function evaluateNewsManualGate(input) {
  const gate = input.data;
  if (!input.present) {
    return {
      inputPath: input.path,
      inputPresent: false,
      ready: false,
      status: 'missing',
      gateClear: false,
      blockers: ['news_manual_gate_missing']
    };
  }
  const blockers = [];
  if (gate?.schemaVersion !== NEWS_MANUAL_GATE_SCHEMA) blockers.push('news_manual_gate_schema_invalid');
  if (gate?.gateClear !== true) blockers.push('news_manual_gate_not_clear');
  if (gate?.scoreWriteApproved === true || gate?.eligibleForMainScore === true) {
    blockers.push('news_manual_gate_score_approval_claimed');
  }
  return {
    inputPath: input.path,
    inputPresent: true,
    ready: blockers.length === 0,
    status: gate?.status ?? null,
    gateClear: gate?.gateClear === true,
    manualReviewBlockers: gate?.manualReviewBlockers ?? null,
    rawRuleBlockers: gate?.rawRuleBlockers ?? null,
    operatorReviewApplied: gate?.operatorReviewApplied === true,
    blockers
  };
}

function evaluateNews(input, manualGateInput) {
  const ledger = input.data;
  if (!input.present) {
    return {
      inputPath: input.path,
      inputPresent: false,
      status: 'missing',
      repeatedElevatedObservation: false,
      manualReviewRequired: true,
      blockers: ['news_claim_ledger_missing'],
      warnings: [],
      evidence: {}
    };
  }
  const blockers = [];
  const warnings = [];
  if (ledger?.reviewVersion !== NEWS_SCHEMA) blockers.push('news_claim_ledger_schema_invalid');

  const outcomes = Array.isArray(ledger?.sampleOutcomes) ? ledger.sampleOutcomes : [];
  const sampleCount = asNumber(ledger?.summary?.sampleCount, outcomes.length);
  const elevatedSampleCount = outcomes.filter((sample) => (
    sample?.signalState === 'elevated_manual_review'
    && asNumber(sample?.liveSourceCount) >= 2
  )).length;
  const claimCount = asNumber(ledger?.summary?.claimCount);
  const repeatedElevatedObservation = sampleCount >= 2 && elevatedSampleCount >= 2 && claimCount > 0;
  const lowConfidenceHighClaimCount = asNumber(
    ledger?.summary?.lowConfidenceHighClaimCount,
    asNumber(ledger?.manualReviewPriorities?.lowConfidenceHighClaimCount)
  );
  const contradictionState = ledger?.contradiction?.state ?? null;
  const headlineAllowed = ledger?.displayReadiness?.directHeadlineDisplayAllowed === true
    || ledger?.displayReadiness?.originalHeadlineOutputAllowed === true
    || outcomes.some((sample) => sample?.displayHeadlinesApproved === true);
  const manualBlockers = [];
  if (contradictionState === 'mixed_claims') manualBlockers.push('mixed_claims');
  if (lowConfidenceHighClaimCount > 0) manualBlockers.push('low_confidence_high_claims');
  if (headlineAllowed) manualBlockers.push('headline_display_claimed');
  if (!repeatedElevatedObservation) blockers.push('news_repeated_elevated_observation_missing');
  if (manualBlockers.length > 0) {
    warnings.push('news_claims_remain_manual_review_required');
  }
  const manualGate = evaluateNewsManualGate(manualGateInput);
  const manualGateClearsReview = manualGate.ready && manualBlockers.length > 0;
  if (manualGateClearsReview) {
    const warningIndex = warnings.indexOf('news_claims_remain_manual_review_required');
    if (warningIndex >= 0) warnings.splice(warningIndex, 1);
    warnings.push('news_manual_gate_applied_for_cross_confirmation_only');
  }

  return {
    inputPath: input.path,
    inputPresent: true,
    status: repeatedElevatedObservation
      ? (manualGateClearsReview ? 'repeated_elevated_manual_gate_clear' : 'repeated_elevated_manual_review')
      : 'not_repeated_elevated',
    repeatedElevatedObservation,
    manualReviewRequired: manualBlockers.length > 0 && !manualGateClearsReview,
    manualBlockers: manualGateClearsReview ? [] : manualBlockers,
    rawManualBlockers: manualBlockers,
    manualGate,
    blockers,
    warnings,
    evidence: {
      sampleCount,
      elevatedManualReviewSampleCount: elevatedSampleCount,
      firstSampleAt: ledger?.summary?.firstSampleAt ?? null,
      lastSampleAt: ledger?.summary?.lastSampleAt ?? null,
      claimCount,
      uniqueTitleHashCount: ledger?.summary?.uniqueTitleHashCount ?? null,
      lowConfidenceHighClaimCount,
      contradictionState,
      directHeadlineDisplayAllowed: headlineAllowed,
      polarityCounts: ledger?.polarityCounts ?? null,
      eventTypeCounts: ledger?.eventTypeCounts ?? null,
      sourceTierCounts: ledger?.sourceTierCounts ?? null
    }
  };
}

function evaluateThermal(input) {
  const artifact = input.data;
  if (!input.present) {
    return {
      inputPath: input.path,
      inputPresent: false,
      status: 'missing',
      repeatedObservation: false,
      elevatedRepeatedObservation: false,
      blockers: ['oil_thermal_artifact_missing'],
      warnings: [],
      evidence: {}
    };
  }
  const blockers = [];
  if (artifact?.schemaVersion !== THERMAL_SCHEMA) blockers.push('oil_thermal_schema_invalid');

  const aggregate = artifact?.aggregate || {};
  const baseline = artifact?.baseline || {};
  const baselineEstablished = baseline.status === 'established' || aggregate.baselineStatus === 'established';
  const repeatedObservationCount = asNumber(aggregate.repeatedObservationCount);
  const elevatedRepeatedObservationCount = asNumber(aggregate.elevatedRepeatedObservationCount);
  const repeatedObservation = baselineEstablished && repeatedObservationCount > 0;
  const elevatedRepeatedObservation = repeatedObservation && elevatedRepeatedObservationCount > 0;
  if (!baselineEstablished) blockers.push('oil_thermal_baseline_not_established');
  if (!repeatedObservation) blockers.push('thermal_repeated_observation_missing');
  if (!elevatedRepeatedObservation) blockers.push('thermal_elevated_repeated_observation_missing');

  return {
    inputPath: input.path,
    inputPresent: true,
    status: elevatedRepeatedObservation
      ? 'elevated_repeated_observation'
      : (repeatedObservation ? 'repeated_observation_not_elevated' : 'not_repeated'),
    repeatedObservation,
    elevatedRepeatedObservation,
    blockers,
    warnings: elevatedRepeatedObservation ? [] : ['thermal_repeated_signal_not_elevated'],
    evidence: {
      status: artifact?.status ?? null,
      signalState: artifact?.signalState ?? null,
      sourceStatus: artifact?.sourceStatus?.firms ?? null,
      windowDays: artifact?.freshness?.windowDays ?? null,
      latestAcqAt: artifact?.freshness?.latestAcqAt ?? null,
      latestAgeHours: artifact?.freshness?.latestAgeHours ?? null,
      baselineStatus: baseline.status ?? null,
      baselineQuality: baseline?.sourceReview?.baselineQuality ?? null,
      baselineSampleCount: baseline?.sourceReview?.sampleCount ?? null,
      facilityCount: aggregate.facilityCount ?? null,
      facilitiesWithDetections: aggregate.facilitiesWithDetections ?? null,
      repeatedObservationCount,
      elevatedRepeatedObservationCount,
      rowCount: aggregate.rowCount ?? null,
      maxFrp: aggregate.maxFrp ?? null,
      highConfidenceCount: aggregate.highConfidenceCount ?? null,
      frpOver50Count: aggregate.frpOver50Count ?? null,
      frpOver100Count: aggregate.frpOver100Count ?? null,
      facilitiesByAnomalyLevel: aggregate.facilitiesByAnomalyLevel ?? null
    }
  };
}

function buildReview(options, inputs) {
  const news = evaluateNews(inputs.newsLedger, inputs.newsManualGate);
  const thermal = evaluateThermal(inputs.oilThermal);
  const readinessBlockers = [
    ...news.blockers,
    ...(news.manualReviewRequired ? ['news_manual_review_required'] : []),
    ...thermal.blockers
  ];
  const warnings = [...news.warnings, ...thermal.warnings];
  const newsReady = news.repeatedElevatedObservation && !news.manualReviewRequired;
  const thermalReady = thermal.elevatedRepeatedObservation;
  const partialProgress = news.repeatedElevatedObservation && thermal.repeatedObservation;
  const status = newsReady && thermalReady
    ? 'high_frequency_confirmation_ready_for_separate_review_no_score_write'
    : (partialProgress ? 'partial_progress_keep_display_only' : 'not_ready_keep_display_only');
  const partialRecommendation = newsReady
    ? 'news_gate_clear_and_thermal_repeated_observed_wait_for_elevated_thermal_confirmation'
    : 'news_repeated_elevated_and_thermal_repeated_observed_but_keep_manual_review';

  return {
    schemaVersion: SCHEMA_VERSION,
    status,
    recommendation: status === 'high_frequency_confirmation_ready_for_separate_review_no_score_write'
      ? 'open_separate_review_for_confirmation_design_keep_no_score_write'
      : (partialProgress
        ? partialRecommendation
        : 'collect_more_cross_source_repeated_observations_keep_display_only'),
    generatedAt: new Date().toISOString(),
    inputPaths: {
      newsLedger: safeRelativePath(options.newsLedger),
      newsManualGate: safeRelativePath(options.newsManualGate),
      oilThermal: safeRelativePath(options.oilThermal)
    },
    news,
    thermal,
    summary: {
      newsRepeatedElevatedObservation: news.repeatedElevatedObservation,
      newsManualReviewRequired: news.manualReviewRequired,
      thermalRepeatedObservation: thermal.repeatedObservation,
      thermalElevatedRepeatedObservation: thermal.elevatedRepeatedObservation,
      readinessBlockerCount: readinessBlockers.length,
      readinessBlockers,
      warningCount: warnings.length
    },
    scoreReadinessApproved: false,
    scoreIntegrationApproved: false,
    scoreWriteApproved: false,
    productionWriteApproved: false,
    frontendDisplayApproved: false,
    eligibleForMainScore: false,
    promotionEligible: false,
    routeFreightConfirmation: 'not_connected',
    marketConfirmation: 'not_connected',
    blockers: readinessBlockers,
    warnings,
    productionImpact: falseImpactMap(),
    boundaries: boundaries(),
    boundary: BOUNDARY,
    limitationZh: '本审阅只区分新闻重复升高、设施热异常重复观察和设施热异常升高重复观察;即使出现 partial progress,也不得确认断供、炼厂事故、霍尔木兹中断或油价方向,不得写入今日总判断打分。'
  };
}

function writeJson(outputPath, review) {
  const absoluteOutput = resolve(outputPath);
  mkdirSync(dirname(absoluteOutput), { recursive: true });
  writeFileSync(absoluteOutput, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
}

function printSummary(review) {
  console.log(`Transport Shock high-frequency confirmation: ${review.status}`);
  console.log(`recommendation: ${review.recommendation}`);
  console.log(`newsRepeatedElevatedObservation: ${review.summary.newsRepeatedElevatedObservation}`);
  console.log(`newsManualReviewRequired: ${review.summary.newsManualReviewRequired}`);
  console.log(`thermalRepeatedObservation: ${review.summary.thermalRepeatedObservation}`);
  console.log(`thermalElevatedRepeatedObservation: ${review.summary.thermalElevatedRepeatedObservation}`);
  console.log(`scoreWriteApproved: ${review.scoreWriteApproved}`);
  console.log(`boundary: ${review.boundary}`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const review = buildReview(options, {
      newsLedger: readJsonInput(options.newsLedger),
      newsManualGate: readJsonInput(options.newsManualGate),
      oilThermal: readJsonInput(options.oilThermal)
    });
    if (options.writeOutput) writeJson(options.output, review);
    if (options.printJson) console.log(JSON.stringify(review, null, 2));
    else printSummary(review);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
