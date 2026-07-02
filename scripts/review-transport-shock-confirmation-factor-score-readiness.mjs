#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';

const SCHEMA_VERSION = 'transport-shock-confirmation-factor-score-readiness-v1';
const CANDIDATE_VERSION = 'transport-shock-candidate-v1';
const HISTORY_REVIEW_VERSION = 'transport-shock-confirmation-factor-history-samples-review-v1';
const SCORE_INTEGRATION_PREFLIGHT_VERSION = 'transport-shock-confirmation-factor-score-integration-preflight-v1';
const DEFAULT_RADAR = 'data/radar-data.json';
const DEFAULT_OIL_NEWS = 'data/oil-news-event-watch.json';
const DEFAULT_OIL_THERMAL = 'data/oil-thermal-watch.json';
const DEFAULT_OIL_DIRECTIONAL = 'data/oil-directional-pressure.json';
const DEFAULT_HISTORY_REVIEW = 'manual-artifacts/transport-shock-confirmation-factor/history-samples-review-latest.json';
const DEFAULT_SCORE_INTEGRATION_PREFLIGHT =
  'manual-artifacts/transport-shock-confirmation-factor/score-integration-preflight-latest.json';
const DEFAULT_OUTPUT = 'manual-artifacts/transport-shock-confirmation-factor/score-readiness-latest.json';
const BOUNDARY =
  'artifact-only Transport Shock Confirmation Factor score-readiness matrix; read-only production/manual review inputs; not production data; no scoring write; not in values, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

function usage() {
  console.log(`Usage:
  npm run review:transport-shock-confirmation-factor-score-readiness -- [options]

Options:
  --radar <path>            Radar data JSON. Default: ${DEFAULT_RADAR}
  --oil-news <path>         Oil news event watch JSON. Default: ${DEFAULT_OIL_NEWS}
  --oil-thermal <path>      Oil thermal watch JSON. Default: ${DEFAULT_OIL_THERMAL}
  --oil-directional <path>  ODP JSON. Default: ${DEFAULT_OIL_DIRECTIONAL}
  --history-review <path>   P-score-11 history samples review JSON. Default: ${DEFAULT_HISTORY_REVIEW}
  --score-integration-preflight <path>
                            Optional P-score score-integration preflight JSON. Default: ${DEFAULT_SCORE_INTEGRATION_PREFLIGHT}
  --output <path>           Ignored readiness matrix path. Default: ${DEFAULT_OUTPUT}
  --json                    Print full JSON matrix to stdout.
  --no-output               Do not write ignored artifact.
  --strict                  Exit non-zero if the matrix unexpectedly becomes score-ready.
  --help                    Show this help.

Boundary:
  Reads only data/*.json, docs/fixtures/transport-shock-confirmation-factor/, or manual-artifacts/transport-shock-confirmation-factor/.
  Writes only manual-artifacts/transport-shock-confirmation-factor/.
  No network, env, production write, workflow, Worker, ODP finalBias, or main judgment scoring.`);
}

function parseArgs(argv) {
  const options = {
    radar: DEFAULT_RADAR,
    oilNews: DEFAULT_OIL_NEWS,
    oilThermal: DEFAULT_OIL_THERMAL,
    oilDirectional: DEFAULT_OIL_DIRECTIONAL,
    historyReview: DEFAULT_HISTORY_REVIEW,
    scoreIntegrationPreflight: DEFAULT_SCORE_INTEGRATION_PREFLIGHT,
    output: DEFAULT_OUTPUT,
    printJson: false,
    writeOutput: true,
    strict: false
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
    if (arg === '--strict') {
      options.strict = true;
      continue;
    }

    const nextValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      index += 1;
      return value;
    };

    if (arg === '--radar') options.radar = nextValue();
    else if (arg === '--oil-news') options.oilNews = nextValue();
    else if (arg === '--oil-thermal') options.oilThermal = nextValue();
    else if (arg === '--oil-directional') options.oilDirectional = nextValue();
    else if (arg === '--history-review') options.historyReview = nextValue();
    else if (arg === '--score-integration-preflight') options.scoreIntegrationPreflight = nextValue();
    else if (arg === '--output') options.output = nextValue();
    else throw new Error(`Unknown argument: ${arg}`);
  }

  for (const [label, filePath] of Object.entries({
    radar: options.radar,
    oilNews: options.oilNews,
    oilThermal: options.oilThermal,
    oilDirectional: options.oilDirectional,
    historyReview: options.historyReview,
    scoreIntegrationPreflight: options.scoreIntegrationPreflight
  })) {
    if (!isAllowedInputPath(filePath)) throw new Error(`Refusing to read ${label} outside allowed paths: ${filePath}`);
  }
  if (options.writeOutput && !isManualArtifactPath(options.output)) {
    throw new Error(`Refusing to write readiness outside manual-artifacts/transport-shock-confirmation-factor/: ${options.output}`);
  }
  return options;
}

function safeRelativePath(filePath) {
  const absolutePath = resolve(filePath);
  const relativePath = relative(process.cwd(), absolutePath);
  if (relativePath === '' || relativePath.startsWith('..')) return null;
  return relativePath.replace(/\\/g, '/');
}

function isDataPath(filePath) {
  return [
    DEFAULT_RADAR,
    DEFAULT_OIL_NEWS,
    DEFAULT_OIL_THERMAL,
    DEFAULT_OIL_DIRECTIONAL
  ].includes(safeRelativePath(filePath));
}

function isFixturePath(filePath) {
  return safeRelativePath(filePath)?.startsWith('docs/fixtures/transport-shock-confirmation-factor/') === true;
}

function isManualArtifactPath(filePath) {
  return safeRelativePath(filePath)?.startsWith('manual-artifacts/transport-shock-confirmation-factor/') === true;
}

function isAllowedInputPath(filePath) {
  return isDataPath(filePath) || isFixturePath(filePath) || isManualArtifactPath(filePath);
}

function readJson(filePath, { optional = false } = {}) {
  const absolutePath = resolve(filePath);
  if (!existsSync(absolutePath)) {
    if (optional) return null;
    throw new Error(`Input file does not exist: ${filePath}`);
  }
  return JSON.parse(readFileSync(absolutePath, 'utf8'));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asNumber(value) {
  return Number.isFinite(value) ? value : null;
}

function falseCandidateBoundaries(candidate) {
  const boundaries = candidate?.boundaries;
  if (!isPlainObject(boundaries)) return false;
  return [
    'affectsValues',
    'affectsDisplayInputsBaseline',
    'affectsEffectiveDisplayInputs',
    'affectsScoring',
    'affectsDecisionModel',
    'affectsExecutionLock',
    'affectsPositionGuidance',
    'affectsBrentPromotion',
    'affectsWorldOrderWeights',
    'affectsGlobalRiskHeatmap',
    'affectsCrossValidation'
  ].every((key) => boundaries[key] === false);
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

function row({ id, labelZh, status, severity, reasonZh, evidence = {} }) {
  return { id, labelZh, status, severity, reasonZh, evidence };
}

function productionCandidateRow(radar) {
  const energyTransport = radar?.macroDrivers?.energyTransport;
  const candidate = energyTransport?.transportShockCandidate;
  const blockers = [];
  if (!isPlainObject(candidate)) blockers.push('candidate_missing');
  if (candidate?.contractVersion !== CANDIDATE_VERSION) blockers.push('contract_version_invalid');
  if (candidate?.candidateOnly !== true) blockers.push('candidate_only_not_true');
  if (candidate?.auditOnly !== true) blockers.push('audit_only_not_true');
  if (candidate?.eligibleForMainScore !== false) blockers.push('main_score_eligible_claimed');
  if (candidate?.routeFreightConfirmation !== 'not_connected') blockers.push('route_gate_unexpectedly_connected');
  if (candidate?.marketConfirmation !== 'not_connected') blockers.push('market_gate_unexpectedly_connected');
  if (!falseCandidateBoundaries(candidate)) blockers.push('candidate_boundary_flags_invalid');
  return row({
    id: 'production_transport_candidate',
    labelZh: '生产候选字段',
    status: blockers.length === 0 ? 'pass' : 'blocker',
    severity: blockers.length === 0 ? 'supporting' : 'hard_blocker',
    reasonZh: blockers.length === 0
      ? '生产 payload 已包含 candidate-only 运输冲击候选字段,但仍明确不入主判断打分。'
      : `生产候选字段不满足边界: ${blockers.join(', ')}`,
    evidence: {
      candidatePresent: isPlainObject(candidate),
      candidateStatus: candidate?.status ?? null,
      candidateScore: asNumber(candidate?.score),
      candidateConfidence: candidate?.confidence ?? null,
      candidateOnly: candidate?.candidateOnly === true,
      auditOnly: candidate?.auditOnly === true,
      eligibleForMainScore: candidate?.eligibleForMainScore === true,
      routeFreightConfirmation: candidate?.routeFreightConfirmation ?? null,
      marketConfirmation: candidate?.marketConfirmation ?? null,
      blockers
    }
  });
}

function sourceFreshnessRow(radar) {
  const energyTransport = radar?.macroDrivers?.energyTransport;
  const latestAgeDays = asNumber(energyTransport?.latestAgeDays);
  const sourceStatus = energyTransport?.sourceStatus?.chokepoints ?? energyTransport?.sourceStatus ?? null;
  const stale = latestAgeDays !== null && latestAgeDays > 7;
  const live = sourceStatus === 'live';
  return row({
    id: 'portwatch_source_freshness',
    labelZh: 'PortWatch 数据龄',
    status: live && !stale ? 'pass' : 'blocker',
    severity: live && !stale ? 'supporting' : 'hard_blocker',
    reasonZh: live && !stale
      ? 'PortWatch chokepoint proxy 为 live 且数据龄在 7 天以内。'
      : stale
        ? 'PortWatch 底层 latestDate 超过 7 天,不适合作为今日入分输入。'
        : 'PortWatch chokepoint proxy 不是 live 状态。',
    evidence: {
      sourceStatus,
      latestDate: energyTransport?.latestDate ?? null,
      latestAgeDays
    }
  });
}

function historyReviewRow(historyReview) {
  if (!historyReview) {
    return row({
      id: 'history_sample_quality',
      labelZh: '历史样本质量',
      status: 'blocker',
      severity: 'hard_blocker',
      reasonZh: '未找到 P-score-11 history samples review artifact;入分前需要足够 production history 样本。',
      evidence: { reviewPresent: false }
    });
  }
  const ok = historyReview.schemaVersion === HISTORY_REVIEW_VERSION
    && historyReview.status === 'pass'
    && Number(historyReview.usableSampleCount || 0) >= Number(historyReview.minSamples || 2)
    && historyReview.eligibleForMainScore === false;
  return row({
    id: 'history_sample_quality',
    labelZh: '历史样本质量',
    status: ok ? 'pass' : 'blocker',
    severity: ok ? 'supporting' : 'hard_blocker',
    reasonZh: ok
      ? 'P-score-11 已有足够 production history 样本用于 display-only 稳定性审阅。'
      : 'P-score-11 history samples review 未达到可用样本门槛或边界异常。',
    evidence: {
      reviewPresent: true,
      schemaVersion: historyReview.schemaVersion ?? null,
      status: historyReview.status ?? null,
      usableSampleCount: historyReview.usableSampleCount ?? null,
      minSamples: historyReview.minSamples ?? null,
      warningCount: historyReview.warningCount ?? null,
      eligibleForMainScore: historyReview.eligibleForMainScore === true
    }
  });
}

function routeFreightRow(radar) {
  const candidate = radar?.macroDrivers?.energyTransport?.transportShockCandidate;
  const gate = candidate?.routeFreightConfirmation ?? 'not_connected';
  const confirmed = ['confirmed', 'connected', 'live_confirmed'].includes(String(gate).toLowerCase());
  return row({
    id: 'route_level_tanker_freight_confirmation',
    labelZh: '路线级油轮运费确认',
    status: confirmed ? 'pass' : 'blocker',
    severity: confirmed ? 'core_required' : 'hard_blocker',
    reasonZh: confirmed
      ? '路线级油轮运费确认已连接。'
      : '路线级油轮运费仍未接入;StockQ BDTI/BCTI 只能作 broad freight context,不能替代 TD/TC route confirmation。',
    evidence: {
      routeFreightConfirmation: gate,
      broadFreightContext: radar?.macroDrivers?.shippingFreight?.sourceStatus ?? null,
      tankerFreightRegime: radar?.macroDrivers?.shippingFreight?.tankerFreightRegime ?? null,
      cleanTankerFreightRegime: radar?.macroDrivers?.shippingFreight?.cleanTankerFreightRegime ?? null
    }
  });
}

function marketConfirmationRow(radar) {
  const candidate = radar?.macroDrivers?.energyTransport?.transportShockCandidate;
  const gate = candidate?.marketConfirmation ?? 'not_connected';
  const confirmed = ['confirmed', 'connected', 'live_confirmed'].includes(String(gate).toLowerCase());
  const curve = radar?.brentPricingLayer?.futuresPriceCurve;
  return row({
    id: 'market_confirmation',
    labelZh: '市场价格结构确认',
    status: confirmed ? 'pass' : 'blocker',
    severity: confirmed ? 'core_required' : 'hard_blocker',
    reasonZh: confirmed
      ? '市场确认已连接。'
      : 'Brent curve/price proxy 可作背景,但当前 marketConfirmation 仍未接入,不能进入主判断打分。',
    evidence: {
      marketConfirmation: gate,
      brentCurveStatus: curve?.curveStatus ?? null,
      brentSlopeRegime: curve?.slopeRegime ?? null,
      frontMinusBack: asNumber(curve?.frontMinusBack)
    }
  });
}

function newsRow(oilNews) {
  const liveSources = Number(oilNews?.aggregate?.liveSourceCount || 0);
  const confidence = oilNews?.aggregate?.confidence ?? null;
  const manual = String(oilNews?.signalState || '').includes('manual');
  const enoughSources = liveSources >= 2 && ['medium', 'high'].includes(confidence);
  return row({
    id: 'oil_news_cross_confirmation',
    labelZh: '新闻事件交叉确认',
    status: enoughSources && !manual ? 'pass' : 'blocker',
    severity: enoughSources && !manual ? 'supporting' : 'hard_blocker',
    reasonZh: enoughSources && manual
      ? '新闻层已有多源事件信号,但仍处于人工复核状态,不能作为入分确认。'
      : enoughSources
        ? '新闻层多源事件信号可用。'
        : '新闻层来源或置信度不足。',
    evidence: {
      status: oilNews?.status ?? null,
      signalState: oilNews?.signalState ?? null,
      confidence,
      liveSourceCount: liveSources,
      uniqueArticleCount: oilNews?.aggregate?.uniqueArticleCount ?? null
    }
  });
}

function thermalRow(oilThermal) {
  const aggregate = oilThermal?.aggregate || {};
  const baseline = oilThermal?.baseline || {};
  const repeated = Number(aggregate.elevatedRepeatedObservationCount || 0);
  const baselineEstablished = baseline.status === 'established';
  return row({
    id: 'oil_thermal_facility_confirmation',
    labelZh: '卫星/设施热异常确认',
    status: baselineEstablished && repeated > 0 ? 'pass' : 'blocker',
    severity: baselineEstablished && repeated > 0 ? 'supporting' : 'hard_blocker',
    reasonZh: baselineEstablished && repeated > 0
      ? '卫星设施层出现 elevated repeated observation。'
      : baselineEstablished
        ? '卫星设施层已有基线,但当前没有 elevated repeated observation;不能确认设施冲击。'
        : '卫星设施基线尚未建立。',
    evidence: {
      status: oilThermal?.status ?? null,
      signalState: oilThermal?.signalState ?? null,
      baselineStatus: baseline.status ?? null,
      baselineQuality: baseline.sourceReview?.baselineQuality ?? null,
      facilityCount: aggregate.facilityCount ?? null,
      elevatedRepeatedObservationCount: repeated,
      facilitiesWithDetections: aggregate.facilitiesWithDetections ?? null
    }
  });
}

function odpAnchorRow(oilDirectional) {
  const ok = oilDirectional?.schemaVersion === 'odp-1' && typeof oilDirectional?.finalBias === 'string';
  return row({
    id: 'odp_physical_anchor',
    labelZh: 'ODP/EIA 物理锚',
    status: ok ? 'pass' : 'blocker',
    severity: ok ? 'supporting' : 'hard_blocker',
    reasonZh: ok
      ? 'ODP 物理链可作为 display-only 背景锚,但 Transport Shock 仍需独立路线/市场确认。'
      : 'ODP 物理锚不可用。',
    evidence: {
      schemaVersion: oilDirectional?.schemaVersion ?? null,
      finalBias: oilDirectional?.finalBias ?? null,
      evidenceCount: Array.isArray(oilDirectional?.evidence) ? oilDirectional.evidence.length : null
    }
  });
}

function sourceRightsRow(radar) {
  const gate = radar?.macroDrivers?.energyTransport?.transportShockCandidate?.routeFreightConfirmation ?? 'not_connected';
  const approved = ['confirmed', 'connected', 'live_confirmed'].includes(String(gate).toLowerCase());
  return row({
    id: 'route_freight_source_rights',
    labelZh: '路线级运费来源权利',
    status: approved ? 'pass' : 'blocker',
    severity: approved ? 'core_required' : 'hard_blocker',
    reasonZh: approved
      ? '路线级运费来源权利已由生产字段体现为已连接。'
      : '路线级油轮运费来源权利仍未批准;不能自动抓取、缓存或入分。',
    evidence: {
      inferredFromRouteFreightConfirmation: gate,
      productionWriteApproved: false
    }
  });
}

function evaluateScoreIntegrationPreflight(preflight) {
  if (!preflight) {
    return {
      present: false,
      passed: false,
      reclassifiedCrossConfirmationHardBlockerIds: [],
      remainingCrossConfirmationHardBlockerIds: [],
      blockers: ['score_integration_preflight_missing']
    };
  }
  const reclassified = Array.isArray(preflight?.summary?.reclassifiedCrossConfirmationHardBlockerIds)
    ? preflight.summary.reclassifiedCrossConfirmationHardBlockerIds
    : [];
  const remaining = Array.isArray(preflight?.summary?.remainingCrossConfirmationHardBlockerIds)
    ? preflight.summary.remainingCrossConfirmationHardBlockerIds
    : [];
  const blockers = [];
  if (preflight.schemaVersion !== SCORE_INTEGRATION_PREFLIGHT_VERSION) blockers.push('score_integration_preflight_schema_invalid');
  if (preflight.scoreIntegrationPreflightPassed !== true) blockers.push('score_integration_preflight_not_passed');
  if (preflight.scoreWriteApproved === true || preflight.eligibleForMainScore === true || preflight.productionWriteApproved === true) {
    blockers.push('score_integration_preflight_approval_claimed');
  }
  if (remaining.length > 0) blockers.push('score_integration_preflight_remaining_blockers');
  return {
    present: true,
    passed: blockers.length === 0,
    schemaVersion: preflight.schemaVersion ?? null,
    status: preflight.status ?? null,
    recommendation: preflight.recommendation ?? null,
    reclassifiedCrossConfirmationHardBlockerIds: reclassified,
    remainingCrossConfirmationHardBlockerIds: remaining,
    blockers
  };
}

function applyScoreIntegrationPreflightRows(rows, preflightCheck) {
  if (!preflightCheck.passed) return rows;
  const reclassifiable = new Set([
    'route_level_tanker_freight_confirmation',
    'market_confirmation',
    'route_freight_source_rights',
    'oil_news_cross_confirmation',
    'oil_thermal_facility_confirmation'
  ]);
  return rows.map((item) => {
    if (!reclassifiable.has(item.id) || item.status !== 'blocker') return item;
    return {
      ...item,
      status: 'preflight_reclassified',
      severity: 'design_review_required',
      reasonZh: `${item.reasonZh} 已由 score-integration preflight 作为低权重免费代理路径的设计审查前置条件重分类;这不是入分批准。`,
      evidence: {
        ...item.evidence,
        scoreIntegrationPreflightApplied: true,
        scoreIntegrationPreflightStatus: preflightCheck.status,
        reclassifiedBy: 'transport-shock-confirmation-factor-score-integration-preflight-v1'
      }
    };
  });
}

function buildReadiness(inputs, options) {
  const preflightCheck = evaluateScoreIntegrationPreflight(inputs.scoreIntegrationPreflight);
  const rows = applyScoreIntegrationPreflightRows([
    productionCandidateRow(inputs.radar),
    sourceFreshnessRow(inputs.radar),
    historyReviewRow(inputs.historyReview),
    routeFreightRow(inputs.radar),
    marketConfirmationRow(inputs.radar),
    sourceRightsRow(inputs.radar),
    newsRow(inputs.oilNews),
    thermalRow(inputs.oilThermal),
    odpAnchorRow(inputs.oilDirectional)
  ], preflightCheck);
  const hardBlockers = rows.filter((item) => item.status === 'blocker' && item.severity === 'hard_blocker');
  const supportingPasses = rows.filter((item) => item.status === 'pass');
  const legacyScoreReady = hardBlockers.length === 0
    && rows.some((item) => item.id === 'route_level_tanker_freight_confirmation' && item.status === 'pass')
    && rows.some((item) => item.id === 'market_confirmation' && item.status === 'pass');
  const preflightDesignReady = hardBlockers.length === 0 && preflightCheck.passed;
  const scoreReady = legacyScoreReady || preflightDesignReady;
  const status = preflightDesignReady
    ? 'ready_for_score_design_review_no_score_write'
    : scoreReady
      ? 'ready_for_separate_reviewed_score_design'
      : 'not_ready_for_score';
  const recommendation = scoreReady
    ? 'open_separate_reviewed_score_design_pr_do_not_auto_wire'
    : 'keep_display_only_collect_route_market_cross_confirmation';

  return {
    schemaVersion: SCHEMA_VERSION,
    status,
    recommendation,
    generatedAt: new Date().toISOString(),
    inputPaths: {
      radar: safeRelativePath(options.radar),
      oilNews: safeRelativePath(options.oilNews),
      oilThermal: safeRelativePath(options.oilThermal),
      oilDirectional: safeRelativePath(options.oilDirectional),
      historyReview: safeRelativePath(options.historyReview),
      scoreIntegrationPreflight: safeRelativePath(options.scoreIntegrationPreflight)
    },
    scoreReady,
    scoreReadyReason: preflightDesignReady
      ? 'score_integration_preflight_passed_for_design_review_no_score_write'
      : legacyScoreReady
        ? 'legacy_route_and_market_confirmation_connected'
        : 'hard_blockers_remaining',
    eligibleForMainScore: false,
    promotionEligible: false,
    productionWriteApproved: false,
    scoreWriteApproved: false,
    frontendDisplayApproved: false,
    routeFreightConfirmation: inputs.radar?.macroDrivers?.energyTransport?.transportShockCandidate?.routeFreightConfirmation ?? 'not_connected',
    marketConfirmation: inputs.radar?.macroDrivers?.energyTransport?.transportShockCandidate?.marketConfirmation ?? 'not_connected',
    summary: {
      rowCount: rows.length,
      passCount: supportingPasses.length,
      reclassifiedCount: rows.filter((item) => item.status === 'preflight_reclassified').length,
      hardBlockerCount: hardBlockers.length,
      hardBlockerIds: hardBlockers.map((item) => item.id)
    },
    scoreIntegrationPreflight: preflightCheck,
    rows,
    missingForScore: hardBlockers.map((item) => ({
      id: item.id,
      labelZh: item.labelZh,
      reasonZh: item.reasonZh
    })),
    productionImpact: falseImpactMap(),
    boundaries: {
      outputOnlyToManualArtifacts: true,
      noNetworkCall: true,
      noEnvironmentRead: true,
      noProductionWrite: true,
      noRealtimeWrite: true,
      noWorkflowChange: true,
      noFrontendChange: true,
      noWorkerRuntimeChange: true,
      noScoreWrite: true,
      noMainJudgmentEligibility: true
    },
    boundary: BOUNDARY
  };
}

function writeJson(outputPath, value) {
  const absoluteOutput = resolve(outputPath);
  mkdirSync(dirname(absoluteOutput), { recursive: true });
  writeFileSync(absoluteOutput, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function printSummary(readiness) {
  console.log(`Transport Shock score-readiness matrix: ${readiness.status}`);
  console.log(`recommendation: ${readiness.recommendation}`);
  console.log(`scoreReady: ${readiness.scoreReady}`);
  console.log(`hardBlockerCount: ${readiness.summary.hardBlockerCount}`);
  console.log(`hardBlockerIds: ${readiness.summary.hardBlockerIds.join(', ') || 'none'}`);
  console.log(`eligibleForMainScore: ${readiness.eligibleForMainScore}`);
  console.log(`boundary: ${readiness.boundary}`);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const inputs = {
      radar: readJson(options.radar),
      oilNews: readJson(options.oilNews),
      oilThermal: readJson(options.oilThermal),
      oilDirectional: readJson(options.oilDirectional),
      historyReview: readJson(options.historyReview, { optional: true }),
      scoreIntegrationPreflight: readJson(options.scoreIntegrationPreflight, { optional: true })
    };
    const readiness = buildReadiness(inputs, options);
    if (options.writeOutput) writeJson(options.output, readiness);
    if (options.printJson) console.log(JSON.stringify(readiness, null, 2));
    else printSummary(readiness);
    if (options.strict && readiness.scoreReady) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

main();
