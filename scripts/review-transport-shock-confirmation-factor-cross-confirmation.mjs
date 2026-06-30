#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';

const SCHEMA_VERSION = 'transport-shock-confirmation-factor-cross-confirmation-v1';
const CANDIDATE_VERSION = 'transport-shock-candidate-v1';
const NEWS_GATE_SCHEMA = 'transport-shock-confirmation-factor-news-manual-gate-v1';
const HIGH_FREQUENCY_SCHEMA = 'transport-shock-confirmation-factor-high-frequency-confirmation-v1';
const MARKET_PROJECTION_SCHEMA = 'transport-shock-market-confirmation-display-projection-v1';
const ODP_SCHEMA = 'odp-1';
const DEFAULT_RADAR = 'data/radar-data.json';
const DEFAULT_NEWS_GATE = 'manual-artifacts/transport-shock-confirmation-factor/news-manual-gate-latest.json';
const DEFAULT_HIGH_FREQUENCY = 'manual-artifacts/transport-shock-confirmation-factor/high-frequency-confirmation-latest.json';
const DEFAULT_MARKET_PROJECTION = 'manual-artifacts/transport-shock-confirmation-factor/market-confirmation-display-projection-latest.json';
const DEFAULT_OIL_DIRECTIONAL = 'data/oil-directional-pressure.json';
const DEFAULT_OUTPUT = 'manual-artifacts/transport-shock-confirmation-factor/cross-confirmation-latest.json';
const BOUNDARY =
  'artifact-only Transport Shock cross-confirmation review; reads production candidate plus manual review artifacts only; not production data; no score write; not in values, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function usage() {
  console.log(`Usage:
  npm run review:transport-shock-confirmation-factor-cross-confirmation -- [options]

Options:
  --radar <path>           Radar data JSON. Default: ${DEFAULT_RADAR}
  --news-gate <path>       P-score-36 news manual gate artifact. Default: ${DEFAULT_NEWS_GATE}
  --high-frequency <path>  P-score-35 high-frequency confirmation artifact. Default: ${DEFAULT_HIGH_FREQUENCY}
  --market-projection <path> Market-confirmation display projection artifact. Default: ${DEFAULT_MARKET_PROJECTION}
  --oil-directional <path> ODP JSON. Default: ${DEFAULT_OIL_DIRECTIONAL}
  --output <path>          Ignored cross-confirmation artifact. Default: ${DEFAULT_OUTPUT}
  --max-portwatch-age-days <n> Maximum PortWatch latestAgeDays. Default: 7
  --json                  Print full JSON review to stdout.
  --no-output             Do not write ignored artifact.
  --help                  Show this help.

Boundary:
  Reads only data/radar-data.json, data/oil-directional-pressure.json,
  docs/fixtures/transport-shock-confirmation-factor/, or
  manual-artifacts/transport-shock-confirmation-factor/.
  Writes only manual-artifacts/transport-shock-confirmation-factor/.
  No network, env, production write, workflow, Worker, frontend, ODP finalBias, or main judgment scoring.`);
}

function safeRelativePath(filePath) {
  const absolutePath = resolve(filePath);
  const relativePath = relative(process.cwd(), absolutePath);
  if (relativePath === '' || relativePath.startsWith('..')) return null;
  return relativePath.replace(/\\/g, '/');
}

function isFixturePath(filePath) {
  return safeRelativePath(filePath)?.startsWith('docs/fixtures/transport-shock-confirmation-factor/') === true;
}

function isManualArtifactPath(filePath) {
  return safeRelativePath(filePath)?.startsWith('manual-artifacts/transport-shock-confirmation-factor/') === true;
}

function isRadarInputPath(filePath) {
  const relativePath = safeRelativePath(filePath);
  return relativePath === DEFAULT_RADAR || isFixturePath(filePath);
}

function isOilDirectionalInputPath(filePath) {
  const relativePath = safeRelativePath(filePath);
  return relativePath === DEFAULT_OIL_DIRECTIONAL || isFixturePath(filePath);
}

function isManualOrFixtureInputPath(filePath) {
  return isManualArtifactPath(filePath) || isFixturePath(filePath);
}

function parseArgs(argv) {
  const options = {
    radar: DEFAULT_RADAR,
    newsGate: DEFAULT_NEWS_GATE,
    highFrequency: DEFAULT_HIGH_FREQUENCY,
    marketProjection: DEFAULT_MARKET_PROJECTION,
    oilDirectional: DEFAULT_OIL_DIRECTIONAL,
    output: DEFAULT_OUTPUT,
    maxPortWatchAgeDays: 7,
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
    if (arg === '--radar') options.radar = nextValue();
    else if (arg === '--news-gate') options.newsGate = nextValue();
    else if (arg === '--high-frequency') options.highFrequency = nextValue();
    else if (arg === '--market-projection') options.marketProjection = nextValue();
    else if (arg === '--oil-directional') options.oilDirectional = nextValue();
    else if (arg === '--output') options.output = nextValue();
    else if (arg === '--max-portwatch-age-days') options.maxPortWatchAgeDays = Number(nextValue());
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isFinite(options.maxPortWatchAgeDays) || options.maxPortWatchAgeDays < 1 || options.maxPortWatchAgeDays > 30) {
    throw new Error('Invalid --max-portwatch-age-days. Expected number 1..30.');
  }
  if (!isRadarInputPath(options.radar)) throw new Error(`Refusing to read radar outside allowed paths: ${options.radar}`);
  if (!isManualOrFixtureInputPath(options.newsGate)) throw new Error(`Refusing to read news gate outside allowed paths: ${options.newsGate}`);
  if (!isManualOrFixtureInputPath(options.highFrequency)) throw new Error(`Refusing to read high-frequency artifact outside allowed paths: ${options.highFrequency}`);
  if (!isManualOrFixtureInputPath(options.marketProjection)) throw new Error(`Refusing to read market projection outside allowed paths: ${options.marketProjection}`);
  if (!isOilDirectionalInputPath(options.oilDirectional)) {
    throw new Error(`Refusing to read oil directional outside allowed paths: ${options.oilDirectional}`);
  }
  if (options.writeOutput && !isManualArtifactPath(options.output)) {
    throw new Error(`Refusing to write cross-confirmation outside manual-artifacts/transport-shock-confirmation-factor/: ${options.output}`);
  }
  return options;
}

function readJsonInput(filePath, { optional = false } = {}) {
  const absolutePath = resolve(filePath);
  if (!existsSync(absolutePath)) {
    if (optional) {
      return { present: false, path: safeRelativePath(filePath), data: null };
    }
    throw new Error(`Input file does not exist: ${filePath}`);
  }
  return {
    present: true,
    path: safeRelativePath(filePath),
    data: JSON.parse(readFileSync(absolutePath, 'utf8'))
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asNumber(value) {
  return Number.isFinite(value) ? value : null;
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
    noScoreWrite: true,
    crossConfirmationReviewOnly: true
  };
}

function row({ id, labelZh, status, severity, reasonZh, evidence = {} }) {
  return { id, labelZh, status, severity, reasonZh, evidence };
}

function candidateBoundaryOk(candidate) {
  const boundaryMap = candidate?.boundaries;
  if (!isPlainObject(boundaryMap)) return false;
  return [
    'affectsValues',
    'affectsDisplayInputsBaseline',
    'affectsEffectiveDisplayInputs',
    'affectsScoring',
    'affectsDecisionModel',
    'affectsExecutionLock',
    'affectsPositionGuidance',
    'affectsBrentPromotion',
    'affectsGlobalRiskHeatmap',
    'affectsCrossValidation'
  ].every((key) => boundaryMap[key] === false);
}

function marketProjectionReady(marketInput) {
  const projection = marketInput?.data;
  const blockers = [];
  if (!marketInput?.present) blockers.push('market_projection_missing');
  if (projection?.schemaVersion !== MARKET_PROJECTION_SCHEMA) blockers.push('market_projection_schema_invalid');
  if (projection?.status !== 'dry_run_only') blockers.push('market_projection_not_dry_run');
  if (projection?.projectionState !== 'manual_market_confirmation_review_ready_non_production') blockers.push('market_projection_not_ready');
  if (Number(projection?.input?.acceptedObservationCount || projection?.displayCandidate?.acceptedObservationCount || 0) < 3) {
    blockers.push('market_projection_accepted_observations_below_threshold');
  }
  if (Number(projection?.input?.rejectedObservationCount || projection?.displayCandidate?.rejectedObservationCount || 0) > 0) {
    blockers.push('market_projection_rejected_observations_present');
  }
  if (projection?.approvals?.marketConfirmationWriteApproved === true || projection?.approvals?.scoreWriteApproved === true) {
    blockers.push('market_projection_write_approval_claimed');
  }
  if (projection?.currentProductionState?.marketConfirmation !== 'not_connected') {
    blockers.push('market_projection_production_market_confirmation_claimed');
  }
  if (projection?.boundaries?.noMarketConfirmationWrite !== true || projection?.boundaries?.noScoreWrite !== true) {
    blockers.push('market_projection_boundaries_invalid');
  }
  return {
    ready: blockers.length === 0,
    blockers,
    evidence: {
      inputPath: marketInput?.path ?? null,
      schemaVersion: projection?.schemaVersion ?? null,
      status: projection?.status ?? null,
      projectionState: projection?.projectionState ?? null,
      acceptedObservationCount: projection?.input?.acceptedObservationCount ?? projection?.displayCandidate?.acceptedObservationCount ?? null,
      rejectedObservationCount: projection?.input?.rejectedObservationCount ?? projection?.displayCandidate?.rejectedObservationCount ?? null,
      bucketCoverage: projection?.displayCandidate?.bucketCoverage ?? null,
      currentProductionMarketConfirmation: projection?.currentProductionState?.marketConfirmation ?? null,
      blockers
    }
  };
}

function buildCandidateRows(radarInput, marketInput, options) {
  const radar = radarInput.data;
  const energyTransport = radar?.macroDrivers?.energyTransport;
  const candidate = energyTransport?.transportShockCandidate;
  const candidateBlockers = [];
  if (!isPlainObject(candidate)) candidateBlockers.push('candidate_missing');
  if (candidate?.contractVersion !== CANDIDATE_VERSION) candidateBlockers.push('candidate_contract_invalid');
  if (candidate?.candidateOnly !== true) candidateBlockers.push('candidate_only_not_true');
  if (candidate?.auditOnly !== true) candidateBlockers.push('audit_only_not_true');
  if (candidate?.eligibleForMainScore !== false) candidateBlockers.push('eligible_for_main_score_claimed');
  if (!candidateBoundaryOk(candidate)) candidateBlockers.push('candidate_boundaries_invalid');

  const latestAgeDays = asNumber(energyTransport?.latestAgeDays);
  const sourceStatus = energyTransport?.sourceStatus?.chokepoints ?? energyTransport?.sourceStatus ?? null;
  const fresh = sourceStatus === 'live' && latestAgeDays !== null && latestAgeDays <= options.maxPortWatchAgeDays;
  const candidateElevated = candidate?.status === 'elevated_watch' || candidate?.status === 'high_watch';
  const market = marketProjectionReady(marketInput);
  const marketConnected = candidate?.marketConfirmation === 'connected' || market.ready;

  return [
    row({
      id: 'production_transport_candidate',
      labelZh: '生产运输候选',
      status: candidateBlockers.length === 0 ? 'pass' : 'blocker',
      severity: candidateBlockers.length === 0 ? 'supporting' : 'hard_blocker',
      reasonZh: candidateBlockers.length === 0
        ? '生产 payload 存在 candidate-only 运输冲击候选,且边界仍为不入分。'
        : `生产候选字段边界异常: ${candidateBlockers.join(', ')}`,
      evidence: {
        inputPath: radarInput.path,
        candidatePresent: isPlainObject(candidate),
        candidateStatus: candidate?.status ?? null,
        candidateScore: asNumber(candidate?.score),
        candidateConfidence: candidate?.confidence ?? null,
        confirmationStatus: candidate?.confirmationStatus ?? null,
        candidateOnly: candidate?.candidateOnly === true,
        auditOnly: candidate?.auditOnly === true,
        eligibleForMainScore: candidate?.eligibleForMainScore === true,
        blockers: candidateBlockers
      }
    }),
    row({
      id: 'portwatch_physical_proxy_freshness',
      labelZh: 'PortWatch 物理代理新鲜度',
      status: fresh ? 'pass' : 'blocker',
      severity: fresh ? 'supporting' : 'hard_blocker',
      reasonZh: fresh
        ? 'PortWatch chokepoint proxy 为 live 且数据龄在阈值内,可作为交叉确认观察输入。'
        : 'PortWatch chokepoint proxy 未达到今日交叉确认新鲜度要求,只能保留为展示候选背景。',
      evidence: {
        sourceStatus,
        latestDate: energyTransport?.latestDate ?? null,
        latestAgeDays,
        maxPortWatchAgeDays: options.maxPortWatchAgeDays,
        candidateElevated
      }
    }),
    row({
      id: 'route_freight_confirmation',
      labelZh: '路线级油轮运费确认',
      status: candidate?.routeFreightConfirmation === 'connected' ? 'pass' : 'blocker',
      severity: 'hard_blocker',
      reasonZh: candidate?.routeFreightConfirmation === 'connected'
        ? '路线级油轮运费确认已连接。'
        : '路线级油轮运费仍未连接,不能把 PortWatch AIS 代理当作运输冲击确认。',
      evidence: {
        routeFreightConfirmation: candidate?.routeFreightConfirmation ?? null
      }
    }),
    row({
      id: 'market_confirmation',
      labelZh: '市场价格结构确认',
      status: marketConnected ? 'pass' : 'blocker',
      severity: marketConnected ? 'supporting' : 'hard_blocker',
      reasonZh: marketConnected
        ? '市场确认已有 manual/display-only projection 支撑;production marketConfirmation 仍保持 not_connected。'
        : '市场确认仍未连接且缺少合格 manual projection,不能把运输代理直接映射为油价方向判断。',
      evidence: {
        productionMarketConfirmation: candidate?.marketConfirmation ?? null,
        manualProjectionReady: market.ready,
        manualProjection: market.evidence
      }
    })
  ];
}

function buildNewsGateRow(newsGateInput) {
  const gate = newsGateInput.data;
  const blockers = [];
  if (!newsGateInput.present) blockers.push('news_manual_gate_missing');
  if (gate?.schemaVersion !== NEWS_GATE_SCHEMA) blockers.push('news_manual_gate_schema_invalid');
  if (gate?.scoreWriteApproved === true || gate?.eligibleForMainScore === true) blockers.push('news_gate_score_approval_claimed');
  if (gate?.gateClear !== true) blockers.push('news_manual_gate_not_clear');
  return row({
    id: 'news_manual_gate',
    labelZh: '新闻人工闸门',
    status: blockers.length === 0 ? 'pass' : 'blocker',
    severity: blockers.length === 0 ? 'supporting' : 'hard_blocker',
    reasonZh: blockers.length === 0
      ? 'Oil News claim ledger 已通过人工闸门,仅允许进入交叉确认审阅。'
      : 'Oil News claim ledger 仍需人工复核,不能作为通道/供应事件确认。',
    evidence: {
      inputPath: newsGateInput.path,
      schemaVersion: gate?.schemaVersion ?? null,
      status: gate?.status ?? null,
      gateClear: gate?.gateClear === true,
      manualReviewRequired: gate?.manualReviewRequired === true,
      manualReviewBlockers: gate?.manualReviewBlockers ?? [],
      sampleCount: gate?.evidence?.sampleCount ?? null,
      claimCount: gate?.evidence?.claimCount ?? null,
      contradictionState: gate?.evidence?.contradictionState ?? null,
      lowConfidenceHighClaimCount: gate?.evidence?.lowConfidenceHighClaimCount ?? null,
      blockers
    }
  });
}

function buildHighFrequencyRow(highFrequencyInput) {
  const hf = highFrequencyInput.data;
  const blockers = [];
  if (!highFrequencyInput.present) blockers.push('high_frequency_confirmation_missing');
  if (hf?.schemaVersion !== HIGH_FREQUENCY_SCHEMA) blockers.push('high_frequency_schema_invalid');
  if (hf?.scoreWriteApproved === true || hf?.eligibleForMainScore === true) blockers.push('high_frequency_score_approval_claimed');
  if (hf?.summary?.newsManualReviewRequired === true) blockers.push('news_manual_review_required');
  if (hf?.summary?.thermalElevatedRepeatedObservation !== true) blockers.push('thermal_elevated_repeated_observation_missing');
  if (Array.isArray(hf?.blockers)) blockers.push(...hf.blockers);
  const uniqueBlockers = Array.from(new Set(blockers));
  return row({
    id: 'high_frequency_physical_confirmation',
    labelZh: '新闻/卫星高频交叉确认',
    status: uniqueBlockers.length === 0 ? 'pass' : 'blocker',
    severity: uniqueBlockers.length === 0 ? 'supporting' : 'hard_blocker',
    reasonZh: uniqueBlockers.length === 0
      ? '新闻重复升高与卫星/设施升高重复观察均通过,仍只可作为审阅输入。'
      : '高频确认未完成:新闻仍需人工复核或卫星设施未出现升高重复观察。',
    evidence: {
      inputPath: highFrequencyInput.path,
      schemaVersion: hf?.schemaVersion ?? null,
      status: hf?.status ?? null,
      recommendation: hf?.recommendation ?? null,
      newsRepeatedElevatedObservation: hf?.summary?.newsRepeatedElevatedObservation === true,
      newsManualReviewRequired: hf?.summary?.newsManualReviewRequired === true,
      thermalRepeatedObservation: hf?.summary?.thermalRepeatedObservation === true,
      thermalElevatedRepeatedObservation: hf?.summary?.thermalElevatedRepeatedObservation === true,
      readinessBlockers: hf?.summary?.readinessBlockers ?? hf?.blockers ?? [],
      blockers: uniqueBlockers
    }
  });
}

function buildOdpAnchorRow(odpInput) {
  const odp = odpInput.data;
  const blockers = [];
  if (!odpInput.present) blockers.push('odp_missing');
  if (odp?.schemaVersion !== ODP_SCHEMA) blockers.push('odp_schema_invalid');
  const anchorPresent = typeof odp?.finalBias === 'string' && odp.finalBias.length > 0;
  return row({
    id: 'odp_physical_anchor',
    labelZh: 'ODP 周度物理锚',
    status: blockers.length === 0 && anchorPresent ? 'pass' : 'watch',
    severity: blockers.length === 0 && anchorPresent ? 'supporting' : 'soft_warning',
    reasonZh: blockers.length === 0 && anchorPresent
      ? 'ODP 物理链提供周度锚,但不能替代运输冲击确认。'
      : 'ODP 物理锚缺失或 schema 异常,交叉确认解释力降低。',
    evidence: {
      inputPath: odpInput.path,
      schemaVersion: odp?.schemaVersion ?? null,
      finalBias: odp?.finalBias ?? null,
      blockers
    }
  });
}

function buildReview(inputs, options) {
  const rows = [
    ...buildCandidateRows(inputs.radar, inputs.marketProjection, options),
    buildNewsGateRow(inputs.newsGate),
    buildHighFrequencyRow(inputs.highFrequency),
    buildOdpAnchorRow(inputs.oilDirectional)
  ];
  const hardBlockers = rows.filter((item) => item.status === 'blocker' && item.severity === 'hard_blocker');
  const watchRows = rows.filter((item) => item.status === 'watch');
  const crossConfirmationReady = hardBlockers.length === 0;
  return {
    schemaVersion: SCHEMA_VERSION,
    status: crossConfirmationReady
      ? 'cross_confirmation_candidate_ready_no_score_write'
      : 'cross_confirmation_blocked_keep_display_only',
    recommendation: crossConfirmationReady
      ? 'may_enter_separate_score_design_review_keep_zero_score_write'
      : 'keep_transport_shock_candidate_display_only_until_blockers_clear',
    generatedAt: new Date().toISOString(),
    crossConfirmationReady,
    manualReviewRequired: !crossConfirmationReady,
    summary: {
      rowCount: rows.length,
      hardBlockerCount: hardBlockers.length,
      hardBlockerIds: hardBlockers.map((item) => item.id),
      watchCount: watchRows.length,
      watchIds: watchRows.map((item) => item.id)
    },
    rows,
    scoreReadinessApproved: false,
    scoreIntegrationApproved: false,
    scoreWriteApproved: false,
    productionWriteApproved: false,
    frontendDisplayApproved: false,
    eligibleForMainScore: false,
    promotionEligible: false,
    routeFreightConfirmation: 'not_connected',
    marketConfirmation: 'not_connected',
    productionImpact: falseImpactMap(),
    boundaries: boundaries(),
    boundary: BOUNDARY,
    limitationZh: '本审阅只把运输候选、新闻人工闸门、新闻/卫星高频确认和 ODP 周度锚放在同一张交叉确认表;它不确认封锁、断供、油轮流向、设施事故、制裁影响或油价方向,也不批准今日总判断打分。'
  };
}

function writeJson(outputPath, review) {
  const absoluteOutput = resolve(outputPath);
  mkdirSync(dirname(absoluteOutput), { recursive: true });
  writeFileSync(absoluteOutput, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
}

function printSummary(review) {
  console.log(`Transport Shock cross-confirmation: ${review.status}`);
  console.log(`recommendation: ${review.recommendation}`);
  console.log(`crossConfirmationReady: ${review.crossConfirmationReady}`);
  console.log(`hardBlockerCount: ${review.summary.hardBlockerCount}`);
  console.log(`hardBlockers: ${review.summary.hardBlockerIds.join(', ') || 'none'}`);
  console.log(`scoreWriteApproved: ${review.scoreWriteApproved}`);
  console.log(`boundary: ${review.boundary}`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const inputs = {
      radar: readJsonInput(options.radar),
      newsGate: readJsonInput(options.newsGate, { optional: true }),
      highFrequency: readJsonInput(options.highFrequency, { optional: true }),
      marketProjection: readJsonInput(options.marketProjection, { optional: true }),
      oilDirectional: readJsonInput(options.oilDirectional)
    };
    const review = buildReview(inputs, options);
    if (options.writeOutput) writeJson(options.output, review);
    if (options.printJson) console.log(JSON.stringify(review, null, 2));
    else printSummary(review);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
