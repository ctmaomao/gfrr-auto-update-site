const dataUrl = './data/radar-data.json';
const historyUrl = './data/radar-history.json';
const localRealtimeUrl = './realtime/market.json';
const remoteRealtimeUrl = 'https://raw.githubusercontent.com/ctmaomao/gfrr-auto-update-site/realtime-data/realtime/market.json';

const $ = (id) => document.getElementById(id);
const fmtSigned = (n) => `${n > 0 ? '+' : ''}${n}`;
const riskColor = (score) => {
  if (score >= 85) return '#ff5e72';
  if (score >= 70) return '#ff9a5d';
  if (score >= 50) return '#ffd46a';
  return '#2fd38a';
};
const trendClass = (delta) => (delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat');
const fmtDeltaSafe = (n) => Number.isFinite(n) ? `${n > 0 ? '+' : ''}${n}` : '--';
const deltaArrow = (n) => !Number.isFinite(n) || n === 0 ? '→' : n > 0 ? '↑' : '↓';
const fmtSignedArrow = (n) => `${deltaArrow(n)} ${Number.isFinite(n) ? Math.abs(n) : '--'}`;


function fmtNumSafe(n, digits = 1) {
  return Number.isFinite(n) ? n.toFixed(digits) : '--';
}

const FRESHNESS_WINDOWS = {
  fresh: 30,
  aging: 90,
  stale: 360
};

function parseTimestamp(value) {
  if (typeof value !== 'string' || !value) return null;
  const normalized = value.includes('T') ? value : `${value}T00:00:00Z`;
  const time = Date.parse(normalized);
  return Number.isFinite(time) ? time : null;
}

function computeAgeMinutes(asOf) {
  const asOfTime = parseTimestamp(asOf);
  if (asOfTime === null) return null;
  return Math.max(0, Math.round((Date.now() - asOfTime) / 60000));
}

function classifyFreshnessLevel(ageMinutes, hasRealtime) {
  if (!hasRealtime || ageMinutes === null) return 'unavailable';
  if (ageMinutes <= FRESHNESS_WINDOWS.fresh) return 'fresh';
  if (ageMinutes <= FRESHNESS_WINDOWS.aging) return 'aging';
  if (ageMinutes <= FRESHNESS_WINDOWS.stale) return 'stale';
  return 'unavailable';
}

function buildRealtimeStatusLabel(metadata) {
  if (metadata.realtimeUnavailable) {
    return 'Realtime unavailable / baseline only';
  }

  const parts = [`Realtime ${metadata.realtimeFreshnessLevel}`];
  if (Number.isFinite(metadata.realtimeAgeMinutes)) parts.push(`${metadata.realtimeAgeMinutes}m old`);
  if (metadata.realtimeDegraded) parts.push('degraded');
  if (metadata.realtimeFallbackUsed) parts.push('local fallback');
  if (metadata.realtimeCacheOnly) parts.push('cache only');
  return parts.join(' / ');
}

function shouldApplyRealtimeOverlay(metadata, realtimePayload) {
  return !!realtimePayload?.values && !metadata.realtimeUnavailable;
}

function normalizeHealthLevel(level) {
  switch (level) {
    case 'Healthy':
      return { badgeClass: 'health-level-healthy', badgeTone: 'strong' };
    case 'Watch':
      return { badgeClass: 'health-level-watch', badgeTone: 'cautious' };
    case 'Degraded':
      return { badgeClass: 'health-level-degraded', badgeTone: 'neutral' };
    case 'Stale':
      return { badgeClass: 'health-level-stale', badgeTone: 'neutral' };
    default:
      return { badgeClass: 'health-level-baseline', badgeTone: 'underweight' };
  }
}

function buildSourceSummary(sourceDetails = {}, sourceStatus = {}) {
  const entries = Object.entries(sourceDetails);
  if (!entries.length) {
    const statusEntries = Object.entries(sourceStatus);
    if (statusEntries.length) {
      const fallbackCount = statusEntries.filter(([, status]) => String(status).includes('fallback') || String(status).includes('secondary')).length;
      const failedCount = statusEntries.filter(([, status]) => String(status).includes('fallback:')).length;
      return {
        total: statusEntries.length,
        okCount: Math.max(0, statusEntries.length - failedCount),
        failedCount,
        fallbackCount,
        summaryLabel: `${Math.max(0, statusEntries.length - failedCount)} healthy / ${fallbackCount} fallback / ${failedCount} failed`,
        issueLines: statusEntries.slice(0, 4).map(([key, status]) => `${key}: ${status}`)
      };
    }

    return {
      total: 0,
      okCount: 0,
      failedCount: 0,
      fallbackCount: 0,
      summaryLabel: 'No source detail available',
      issueLines: ['Source detail unavailable.']
    };
  }

  const okCount = entries.filter(([, detail]) => detail?.ok).length;
  const failedCount = entries.filter(([, detail]) => detail?.ok === false).length;
  const fallbackCount = entries.filter(([, detail]) => detail?.fallbackUsed).length;
  const issueLines = [];

  entries
    .filter(([, detail]) => detail?.ok === false)
    .slice(0, 4)
    .forEach(([key, detail]) => {
      issueLines.push(`${key}: failed${detail?.error ? ` (${detail.error})` : ''}`);
    });

  entries
    .filter(([, detail]) => detail?.ok && detail?.fallbackUsed)
    .slice(0, Math.max(0, 4 - issueLines.length))
    .forEach(([key, detail]) => {
      issueLines.push(`${key}: fallback active via ${detail?.source || 'secondary source'}`);
    });

  if (!issueLines.length) {
    issueLines.push('All tracked realtime sources are currently healthy.');
  }

  return {
    total: entries.length,
    okCount,
    failedCount,
    fallbackCount,
    summaryLabel: `${okCount} healthy / ${fallbackCount} fallback / ${failedCount} failed`,
    issueLines
  };
}

function buildHealthDashboardModel(runtimeState) {
  const metadata = runtimeState.runtimeMetadata || {};
  const realtime = runtimeState.realtimePayload || null;
  const healthScore = Number.isFinite(realtime?.healthScore) ? Math.round(realtime.healthScore) : null;
  const criticalMissing = Number.isFinite(realtime?.criticalMissing) ? realtime.criticalMissing : 0;
  const sourceSummary = buildSourceSummary(metadata.realtimeSourceDetails, metadata.realtimeSourceStatus);
  const flags = [];
  const issues = [];

  if (metadata.realtimeUnavailable) {
    issues.push('Realtime unavailable; rendering baseline only');
  } else if (metadata.realtimeFreshnessLevel === 'stale') {
    issues.push(`Realtime is stale (${metadata.realtimeAgeMinutes ?? '--'} min old)`);
  } else if (metadata.realtimeFreshnessLevel === 'aging') {
    issues.push(`Realtime is aging (${metadata.realtimeAgeMinutes ?? '--'} min old)`);
  }

  if (metadata.realtimeFallbackUsed) {
    flags.push('local fallback');
    issues.push('Local fallback is active');
  }
  if (metadata.realtimeCacheOnly) {
    flags.push('cache-only');
    issues.push('Cache-only mode active');
  }
  if (metadata.realtimeDegraded) {
    flags.push('degraded');
  }
  if (criticalMissing > 0) {
    issues.push(`${criticalMissing} critical source${criticalMissing > 1 ? 's' : ''} missing`);
  }
  if (sourceSummary.failedCount > 0) {
    issues.push(`${sourceSummary.failedCount} source${sourceSummary.failedCount > 1 ? 's' : ''} currently failing`);
  }
  if (!flags.length) {
    flags.push('normal');
  }

  let overallLevel = 'Healthy';
  if (metadata.realtimeUnavailable) {
    overallLevel = 'Baseline Only';
  } else if (metadata.realtimeFreshnessLevel === 'stale') {
    overallLevel = 'Stale';
  } else if (
    metadata.realtimeDegraded
    || metadata.realtimeFallbackUsed
    || metadata.realtimeCacheOnly
    || criticalMissing > 0
    || sourceSummary.failedCount > 0
  ) {
    overallLevel = 'Degraded';
  } else if (
    metadata.realtimeFreshnessLevel === 'aging'
    || (healthScore !== null && healthScore < 95)
  ) {
    overallLevel = 'Watch';
  }

  const summary = overallLevel === 'Baseline Only'
    ? 'Baseline only due to unavailable realtime.'
    : overallLevel === 'Stale'
      ? 'Realtime is available but stale; use with caution.'
      : overallLevel === 'Degraded'
        ? 'Realtime is available with visible degradation.'
        : overallLevel === 'Watch'
          ? 'Realtime is aging or showing mild health drift.'
          : 'Realtime healthy and actively overlaying baseline.';

  const healthTone = normalizeHealthLevel(overallLevel);

  return {
    overallLevel,
    healthTone,
    summary,
    healthScore,
    freshness: metadata.realtimeFreshnessLevel || 'unavailable',
    ageLabel: Number.isFinite(metadata.realtimeAgeMinutes) ? `${metadata.realtimeAgeMinutes} min` : '--',
    realtimeSource: metadata.realtimeSource || 'none',
    flagsLabel: flags.join(' / '),
    criticalMissing,
    sourceSummaryLabel: sourceSummary.summaryLabel,
    issues: issues.length ? issues : ['Realtime healthy.'],
    sourceLines: sourceSummary.issueLines
  };
}

const MODULE_LABELS = {
  geopolitical: '地缘政治',
  energy: '能源',
  inflation: '通胀',
  liquidity: '流动性',
  debt: '债务',
  banking: '银行'
};

const DECISION_SCHEMA_VERSION = 'v26.0B-pr1';
const DECISION_CANONICAL_FIELDS = Object.freeze([
  'strategyState',
  'riskMode',
  'repairSignal',
  'stateLabel',
  'stateReason',
  'stateScore',
  'stateDrivers',
  'dominantDrivers',
  'stateMeta',
  'positionGuidance.totalExposureBand',
  'positionGuidance.riskAssetBias',
  'positionGuidance.defensiveBias',
  'positionGuidance.cashGuidance',
  'positionGuidance.newExposurePolicy',
  'positionGuidance.rebalancePosture',
  'positionGuidance.leveragePolicy',
  'positionGuidance.hedgePosture',
  'actionQueue.priorityActions',
  'actionQueue.watchItems',
  'actionQueue.blockedActions',
  'actionQueue.actionSummary',
  'actionQueue.escalationHint',
  'actionQueue.executionNotes',
  'triggerMonitor.upgradeTriggers',
  'triggerMonitor.activeEscalationSignals',
  'triggerMonitor.triggerSummary',
  'triggerMonitor.escalationLevel',
  'triggerMonitor.signalConfidence',
  'invalidationRules.invalidationSignals',
  'invalidationRules.resetConditions',
  'invalidationRules.invalidationSummary',
  'invalidationRules.deescalationBias',
  'invalidationRules.signalConfidence',
  'historicalRegime.regimeName',
  'historicalRegime.regimeLabel',
  'historicalRegime.matchScore',
  'historicalRegime.matchedFeatures',
  'historicalRegime.mismatchFeatures',
  'historicalRegime.regimeSummary',
  'historicalRegime.secondaryMatch',
  'historicalRegime.confidence',
  'historicalRegime.interpretationNote'
]);
const DECISION_LEGACY_COMPATIBILITY_FIELDS = Object.freeze([
  'positionGuidance.stance',
  'positionGuidance.riskBudget',
  'positionGuidance.targetGrossExposure',
  'positionGuidance.cashBufferTarget',
  'positionGuidance.adjustmentNotes',
  'positionGuidance.notes',
  'actionQueue.items',
  'actionQueue.notes'
]);
const DECISION_LEGACY_DISPLAY_DEPENDENCIES = Object.freeze([
  'data.decisionLine',
  'data.summary',
  'data.tradingSystem.executionLock',
  'data.tradingSystem.actionLayer',
  'data.tradingSystem.positioning',
  'data.tradingSystem.riskControl',
  'data.tradingSystem.signalEngine',
  'data.topRisks',
  'data.confidenceNotes'
]);
const STATE_RULES = Object.freeze({
  stateBands: [
    { min: 85, state: 'Crisis' },
    { min: 68, state: 'Defensive' },
    { min: 48, state: 'Caution' },
    { min: 28, state: 'Balanced' },
    { min: 0, state: 'Risk-On' }
  ],
  metaThresholds: {
    resonanceFloor: 70,
    severeResonanceFloor: 80,
    elevatedRiskFloor: 60,
    highRiskFloor: 70,
    totalRiskExtreme: 85,
    moduleExtreme: 90,
    severeResonanceExtremeCount: 3,
    liquidityExtreme: 75,
    highRiskExtremeStreak: 7
  },
  scoreAdjustments: {
    recent3dDelta: [
      { min: 12, delta: 18 },
      { min: 6, delta: 10 },
      { min: 3, delta: 6 },
      { max: -12, delta: -14 },
      { max: -6, delta: -8 },
      { max: -3, delta: -4 }
    ],
    resonanceCount: [
      { min: 5, delta: 18 },
      { equals: 4, delta: 12 },
      { equals: 3, delta: 8 },
      { equals: 2, delta: 4 }
    ],
    severeResonanceCount: [
      { min: 3, delta: 10 },
      { equals: 2, delta: 6 }
    ],
    extremeThresholdCount: [
      { min: 3, delta: 24 },
      { min: 1, delta: 14 }
    ],
    highRiskStreakDays: [
      { min: 7, delta: 12 },
      { min: 5, delta: 8 },
      { min: 3, delta: 5 }
    ],
    healthLevel: {
      'Baseline Only': 6,
      Stale: 8,
      Degraded: 4,
      Healthy: -2
    },
    executionLevel: {
      red: 4,
      yellow: 2,
      green: -2
    },
    realtimeFallbackDelta: 3
  },
  riskModeThresholds: {
    deteriorationDeltaFloor: 3,
    deteriorationResonanceFloor: 3,
    stressResonanceFloor: 4,
    stressSevereResonanceFloor: 2,
    stressCriticalAlertFloor: 2,
    stressExtremeThresholdFloor: 2,
    stressPressureFloor: 2,
    compressionResonanceCeil: 2,
    compressionSevereResonanceCeil: 0,
    compressionCriticalAlertCeil: 0,
    compressionExtremeThresholdCeil: 0
  },
  repairSignalThresholds: {
    strong: {
      recent3dDeltaMax: -8,
      criticalAlertMax: 0,
      severeResonanceMax: 1,
      extremeThresholdMax: 0,
      resonanceMax: 2
    },
    moderate: {
      recent3dDeltaMax: -3,
      criticalAlertMax: 1,
      severeResonanceMax: 1,
      extremeThresholdMax: 1
    },
    weak: {
      recent3dDeltaMax: 0,
      criticalAlertMax: 1,
      severeResonanceMax: 2
    }
  }
});
const POSITION_RULES = Object.freeze({
  stateBandMap: {
    'Risk-On': {
      totalExposureBand: '65%-85%',
      riskAssetBias: 'Overweight within risk budget',
      defensiveBias: 'Low',
      cashGuidance: 'Run lighter cash buffer (10%-18%)',
      newExposurePolicy: 'Normal staged adds are allowed.',
      rebalancePosture: 'Lean into target risk bands on pullbacks.',
      leveragePolicy: 'Avoid aggressive leverage; only baseline financing if already embedded.',
      hedgePosture: 'Keep only light strategic hedges.'
    },
    Balanced: {
      totalExposureBand: '50%-70%',
      riskAssetBias: 'Neutral to selective',
      defensiveBias: 'Moderate',
      cashGuidance: 'Hold balanced cash buffer (15%-25%)',
      newExposurePolicy: 'Allow selective adds, but keep pacing controlled.',
      rebalancePosture: 'Rebalance around targets without chasing.',
      leveragePolicy: 'No new leverage expansion.',
      hedgePosture: 'Maintain baseline hedges.'
    },
    Caution: {
      totalExposureBand: '35%-55%',
      riskAssetBias: 'Selective underweight',
      defensiveBias: 'Moderately high',
      cashGuidance: 'Raise cash buffer (20%-32%)',
      newExposurePolicy: 'Only allow highly selective new exposure in small clips.',
      rebalancePosture: 'Trim risk first, then rebalance.',
      leveragePolicy: 'Reduce leverage where practical; do not add new leverage.',
      hedgePosture: 'Keep hedges active and bias toward protection.'
    },
    Defensive: {
      totalExposureBand: '20%-40%',
      riskAssetBias: 'Underweight risk assets',
      defensiveBias: 'High',
      cashGuidance: 'Keep elevated cash buffer (30%-45%)',
      newExposurePolicy: 'Pause broad new risk exposure; only defensive rebalancing is allowed.',
      rebalancePosture: 'Prioritize de-risking and restoring buffers.',
      leveragePolicy: 'No leverage expansion; favor leverage reduction.',
      hedgePosture: 'Maintain defensive hedges and liquidity buffers.'
    },
    Crisis: {
      totalExposureBand: '0%-20%',
      riskAssetBias: 'Minimum risk exposure',
      defensiveBias: 'Maximum',
      cashGuidance: 'Hold maximum cash / liquidity buffer (45%-70%)',
      newExposurePolicy: 'Suspend new high-risk exposure until state normalizes.',
      rebalancePosture: 'Capital preservation first.',
      leveragePolicy: 'No leverage; actively reduce gross exposure.',
      hedgePosture: 'Keep strongest defensive posture available.'
    }
  },
  bandShiftRules: {
    stateScore: [
      { min: 90, shift: -10 },
      { min: 80, shift: -5 },
      { max: 20, shift: 8 },
      { max: 35, shift: 5 }
    ],
    extremeThresholdCount: { min: 2, shift: -5 },
    highRiskStreakDays: { min: 5, shift: -5 },
    easing3dDelta: { max: -10, shift: 5, excludeState: 'Crisis' },
    deteriorating3dDelta: { min: 8, shift: -5 },
    degradedRealtimeShift: -5,
    riskOffOverrideThreshold: -8,
    improvingOverrideThreshold: 5
  },
  bandLimits: {
    floor: 0,
    ceil: 100,
    minWidth: 15
  }
});
const REGIME_RULES = Object.freeze({
  baseMatchScore: 20,
  confidenceBands: [
    { minScore: 72, minGap: 12, confidence: 'high' },
    { minScore: 58, minGap: 6, confidence: 'medium' },
    { minScore: 0, minGap: 0, confidence: 'low' }
  ],
  candidates: Object.freeze({
    tightening2018: {
      regimeName: 'q4-2018-tightening-shock',
      regimeLabel: '2018 Q4 式紧缩冲击',
      thresholds: {
        stateScore: { min: 55, max: 82, points: 16 },
        recent3dDelta: { min: 0, max: 10, points: 10 },
        resonanceCount: { min: 2, max: 4, points: 12 },
        liquidity: { min: 50, points: 12 },
        creditPressure: { min: 42, points: 12 },
        escalationLevels: { values: ['medium', 'high'], points: 8 },
        energyGeopoliticalMismatch: { energyMin: 85, geopoliticalMin: 80, points: 18 },
        broadStressMismatch: { severeResonanceMin: 3, stateScoreMin: 88, points: 20 },
        tighteningDriversPoints: 10
      }
    },
    liquidity2020: {
      regimeName: 'early-2020-liquidity-crisis',
      regimeLabel: '2020 早期流动性危机',
      thresholds: {
        stateScore: { min: 75, points: 18 },
        recent3dDelta: { min: 8, points: 16 },
        resonanceCount: { min: 4, points: 14 },
        severeResonanceCount: { min: 2, points: 14 },
        liquidity: { min: 68, points: 18 },
        creditPressure: { min: 52, points: 10 },
        escalationLevels: { values: ['high', 'severe'], points: 10 },
        alertsOrExtreme: { extremeMin: 2, points: 8 },
        inflationLiquidityMismatch: { inflationMin: 78, liquidityMax: 64, points: 16 },
        improvingMismatchPoints: 10
      }
    },
    inflation2022: {
      regimeName: '2022-inflation-hike-squeeze',
      regimeLabel: '2022 式通胀 + 加息压制',
      thresholds: {
        energy: { min: 75, points: 18 },
        inflation: { min: 55, points: 14 },
        stateScore: { min: 55, max: 80, points: 12 },
        strategyStates: { values: ['Caution', 'Defensive'], points: 10 },
        liquidity: { min: 45, max: 70, points: 10 },
        persistence: { highRiskMin: 3, elevatedRiskMin: 5, points: 10 },
        broadStressMismatch: { severeResonanceMin: 3, criticalAlertMin: 2, points: 16 },
        acuteLiquidityMismatch: { liquidityMin: 75, recent3dDeltaMin: 8, points: 12 },
        inflationDriversPoints: 16
      }
    },
    regionalContained: {
      regimeName: 'regional-risk-contained',
      regimeLabel: '区域性风险但未系统扩散阶段',
      thresholds: {
        regionalDrivers: { geopoliticalMin: 75, energyMin: 80, points: 18 },
        resonanceCount: { max: 3, points: 16 },
        severeResonanceCount: { max: 1, points: 12 },
        stateScore: { min: 45, max: 72, points: 12 },
        criticalAlertCount: { max: 1, points: 8 },
        noSystemicSpreadPoints: 14,
        regionalDriverFocusPoints: 12,
        broadResonanceMismatch: { resonanceMin: 4, severeResonanceMin: 2, points: 20 },
        highScoreMismatch: { stateScoreMin: 85, points: 14 }
      }
    },
    elevatedOscillation: {
      regimeName: 'elevated-non-crisis-oscillation',
      regimeLabel: '高位震荡但尚未危机化阶段',
      thresholds: {
        stateScore: { min: 45, max: 68, points: 18 },
        recent3dDeltaAbsMax: { max: 5, points: 16 },
        resonanceCount: { min: 2, max: 3, points: 12 },
        severeResonanceCount: { max: 1, points: 10 },
        persistence: { highRiskMin: 3, elevatedRiskMin: 5, points: 10 },
        deescalationBias: { values: ['medium', 'improving'], points: 8 },
        escalationLevels: { values: ['medium', 'high'], points: 8 },
        extremeMismatch: { extremeMin: 3, points: 18 },
        accelerationMismatch: { recent3dDeltaMin: 10, points: 16 }
      }
    }
  })
});

function buildDecisionSchemaMeta() {
  return {
    version: DECISION_SCHEMA_VERSION,
    canonicalFields: [...DECISION_CANONICAL_FIELDS],
    legacyCompatibilityFields: [...DECISION_LEGACY_COMPATIBILITY_FIELDS],
    legacyDisplayDependencies: [...DECISION_LEGACY_DISPLAY_DEPENDENCIES]
  };
}

function clampPercent(value, fallback = '--') {
  return Number.isFinite(value) ? `${Math.max(0, Math.min(100, Math.round(value)))}%` : fallback;
}

function clampNumber(value, min = 0, max = 100) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function countConsecutiveDays(values, predicate) {
  let streak = 0;
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (!predicate(values[i])) break;
    streak += 1;
  }
  return streak;
}

function createScoreSeries(history = [], currentScore = null) {
  const historyScores = Array.isArray(history)
    ? history
      .map((item) => Number(item?.score))
      .filter((score) => Number.isFinite(score))
    : [];

  if (!Number.isFinite(currentScore)) return historyScores;
  if (!historyScores.length) return [currentScore];

  const lastScore = historyScores[historyScores.length - 1];
  if (lastScore === currentScore) return historyScores;

  return [...historyScores, currentScore];
}

function buildStrategyStateFallback(data = {}, metadata = {}) {
  const fallbackState = metadata.realtimeUnavailable ? 'Defensive' : 'Caution';
  const fallbackRiskMode = metadata.realtimeUnavailable ? 'Stress' : 'Deterioration';
  const fallbackRepairSignal = metadata.realtimeUnavailable ? 'None' : 'Weak';
  const fallbackMeta = {
    totalRiskScore: Number.isFinite(data.score) ? data.score : null,
    recent3dDelta: 0,
    recent3dSpeed: 0,
    resonanceCount: 0,
    severeResonanceCount: 0,
    stressPressureCount: metadata.realtimeUnavailable ? 2 : 0,
    dataQualityPressure: Boolean(metadata.realtimeUnavailable || metadata.realtimeFallbackUsed || metadata.realtimeCacheOnly),
    extremeThresholdCount: 0,
    extremeThresholds: ['fallback-mode'],
    elevatedRiskStreakDays: 0,
    highRiskStreakDays: 0,
    criticalAlertCount: 0,
    healthLevel: metadata.realtimeUnavailable ? 'Baseline Only' : 'Unknown',
    riskMode: fallbackRiskMode,
    repairSignal: fallbackRepairSignal,
    stateTransitionBias: fallbackRiskMode === 'Stress' ? 'up-bias' : 'guarded'
  };

  return {
    strategyState: fallbackState,
    riskMode: fallbackRiskMode,
    repairSignal: fallbackRepairSignal,
    stateLabel: `${fallbackState} · ${fallbackRiskMode}`,
    stateScore: fallbackState === 'Defensive' ? 72 : 55,
    stateReason: metadata.realtimeUnavailable
      ? 'Strategy state fell back to a defensive stress baseline because realtime overlay is unavailable.'
      : 'Strategy state engine fell back to a cautious deterioration baseline because state computation was unavailable.',
    stateDrivers: [{
      key: 'fallback',
      label: 'Fallback guardrail',
      impact: fallbackState,
      reason: 'Fallback mode preserves a safe, non-empty strategy state output.'
    }],
    stateMeta: fallbackMeta,
    stateTransitionBias: fallbackMeta.stateTransitionBias
  };
}

function buildPositionGuidanceFallback(data = {}, metadata = {}, strategyState = 'Caution') {
  const defensiveFallback = metadata.realtimeUnavailable || strategyState === 'Defensive' || strategyState === 'Crisis';
  return {
    totalExposureBand: defensiveFallback ? '20%-40%' : '35%-55%',
    riskAssetBias: defensiveFallback ? 'Constrained' : 'Selective',
    defensiveBias: defensiveFallback ? 'High' : 'Moderate',
    cashGuidance: defensiveFallback ? 'Keep elevated cash buffer (30%-45%)' : 'Keep reserve cash buffer (20%-30%)',
    newExposurePolicy: defensiveFallback ? 'Pause broad new risk exposure until guidance recovers.' : 'Only add exposure selectively and in small clips.',
    rebalancePosture: defensiveFallback ? 'De-risk first, rebalance second.' : 'Rebalance gradually around target bands.',
    leveragePolicy: 'No incremental leverage in fallback mode.',
    hedgePosture: defensiveFallback ? 'Maintain defensive hedges / buffers.' : 'Keep baseline hedges active.',
    adjustmentNotes: [
      'Fallback position guidance is active.',
      Number.isFinite(data?.score) ? `Reference risk score: ${data.score}.` : 'Reference risk score unavailable.'
    ]
  };
}

function flattenActionQueueItems(queue = {}) {
  return [
    ...(Array.isArray(queue.priorityActions) ? queue.priorityActions.map((text) => ({ bucket: 'priority', text })) : []),
    ...(Array.isArray(queue.watchItems) ? queue.watchItems.map((text) => ({ bucket: 'watch', text })) : []),
    ...(Array.isArray(queue.blockedActions) ? queue.blockedActions.map((text) => ({ bucket: 'blocked', text })) : [])
  ];
}

function buildActionQueueFallback(data = {}, metadata = {}, strategyState = 'Caution') {
  const defensiveFallback = metadata.realtimeUnavailable || strategyState === 'Defensive' || strategyState === 'Crisis';
  const queue = {
    priorityActions: defensiveFallback
      ? [
          'Reduce broad risk exposure incrementally.',
          'Raise cash buffer and avoid leverage expansion.',
          'Only allow defensive rebalancing.'
        ]
      : [
          'Keep new exposure selective and staged.',
          'Rebalance toward target exposure bands.',
          'Maintain base defensive buffers.'
        ],
    watchItems: defensiveFallback
      ? [
          'Watch for volatility re-acceleration.',
          'Monitor credit and liquidity stress for escalation.',
          'Track data quality before relaxing posture.'
        ]
      : [
          'Monitor regime stability before adding risk.',
          'Watch for renewed volatility or spread widening.',
          'Track driver persistence before expanding pace.'
        ],
    blockedActions: defensiveFallback
      ? [
          'Pause aggressive new risk deployment.',
          'Avoid leverage expansion.',
          'Avoid concentration increase under elevated regime.'
        ]
      : [
          'Avoid oversized single-step exposure changes.',
          'Avoid leverage expansion before confirmation.',
          'Avoid concentration increase without confirmation.'
        ],
    actionSummary: defensiveFallback ? 'Defensive fallback queue active.' : 'Cautious fallback queue active.',
    escalationHint: defensiveFallback ? 'Escalate if stress indicators worsen or data quality degrades.' : 'Escalate if state score or stress signals worsen.',
    executionNotes: [
      'Fallback action queue is active.',
      Number.isFinite(data?.score) ? `Reference risk score: ${data.score}.` : 'Reference risk score unavailable.'
    ]
  };
  queue.items = flattenActionQueueItems(queue);
  return queue;
}

function buildTriggerMonitorFallback(data = {}, metadata = {}, strategyState = 'Caution') {
  return {
    upgradeTriggers: [
      'Escalate if total risk score moves higher from the current baseline.',
      'Escalate if short-term deterioration resumes over the next 3 days.',
      'Escalate if warning intensity or data degradation increases.'
    ],
    activeEscalationSignals: [
      metadata.realtimeUnavailable ? 'Realtime unavailable / baseline only.' : 'No reliable escalation engine output; use baseline monitoring.',
      Number.isFinite(data?.score) ? `Reference risk score ${data.score}.` : 'Reference risk score unavailable.'
    ],
    triggerSummary: `${strategyState} fallback trigger monitor active.`,
    escalationLevel: metadata.realtimeUnavailable ? 'high' : 'medium',
    signalConfidence: metadata.realtimeUnavailable ? 'low' : 'medium'
  };
}

function buildInvalidationRulesFallback(data = {}, metadata = {}, strategyState = 'Caution') {
  return {
    invalidationSignals: [
      'Treat the current posture as invalid if risk deterioration accelerates materially.',
      'Treat the current posture as stale if data quality continues to degrade.',
      'Treat the current posture as review-required if warning intensity rises.'
    ],
    resetConditions: [
      'Allow de-escalation only after short-term deterioration stops.',
      'Allow de-escalation only after risk breadth narrows.',
      'Allow de-escalation only after data freshness normalizes.'
    ],
    invalidationSummary: `${strategyState} fallback invalidation rules active.`,
    deescalationBias: metadata.realtimeUnavailable ? 'low' : 'medium',
    signalConfidence: metadata.realtimeUnavailable ? 'low' : 'medium'
  };
}

function buildLegacyPositionGuidanceCompat(positionGuidance = {}, legacyPositioning = {}, notes = []) {
  return {
    stance: positionGuidance.stance || `${positionGuidance.totalExposureBand || 'Current'} legacy stance`,
    riskBudget: positionGuidance.riskBudget || legacyPositioning.riskBudget || '--',
    targetGrossExposure: positionGuidance.targetGrossExposure || legacyPositioning.targetGrossExposure || '--',
    cashBufferTarget: positionGuidance.cashBufferTarget || legacyPositioning.cashBufferTarget || '--',
    adjustmentNotes: Array.isArray(positionGuidance.adjustmentNotes) ? positionGuidance.adjustmentNotes : [],
    notes: Array.isArray(positionGuidance.notes) ? positionGuidance.notes : notes.filter(Boolean)
  };
}

function buildLegacyActionQueueCompat(actionQueue = {}, legacyNotes = []) {
  return {
    items: Array.isArray(actionQueue.items) ? actionQueue.items : flattenActionQueueItems(actionQueue),
    notes: Array.isArray(actionQueue.notes) ? actionQueue.notes : legacyNotes.filter(Boolean)
  };
}

function buildHistoricalRegimeFallback(data = {}, metadata = {}, decisionState = {}) {
  const strategyState = decisionState?.strategyState || 'Caution';
  return {
    regimeName: 'historical-regime-fallback',
    regimeLabel: 'Historical analogue unavailable',
    matchScore: 0,
    matchedFeatures: [
      `Use the current ${strategyState} state and live decision outputs as the primary guide.`
    ],
    mismatchFeatures: [
      'Historical regime matching fallback is active.',
      metadata.realtimeUnavailable ? 'Realtime is unavailable, so analogy confidence is capped.' : 'Analogy engine did not complete.'
    ],
    regimeSummary: 'Historical similarity layer is unavailable; keep using the current state, guidance, and triggers as the main decision framework.',
    secondaryMatch: null,
    confidence: metadata.realtimeUnavailable ? 'low' : 'medium',
    interpretationNote: 'This is a fallback interpretation layer only and does not change the current strategy state.'
  };
}

function createDecisionFallback(data = {}, metadata = {}) {
  const fallbackLabel = metadata.realtimeUnavailable ? 'BASELINE / FALLBACK' : 'UNAVAILABLE / FALLBACK';
  const stateFallback = buildStrategyStateFallback(data, metadata);
  const fallbackPositionGuidance = buildPositionGuidanceFallback(data, metadata, stateFallback.strategyState);
  const fallbackActionQueue = buildActionQueueFallback(data, metadata, stateFallback.strategyState);
  return {
    contractVersion: DECISION_SCHEMA_VERSION,
    schemaMeta: buildDecisionSchemaMeta(),
    strategyState: stateFallback.strategyState,
    riskMode: stateFallback.riskMode,
    repairSignal: stateFallback.repairSignal,
    stateLabel: stateFallback.stateLabel || fallbackLabel,
    stateReason: stateFallback.stateReason || (metadata.realtimeUnavailable
      ? 'Decision model generation fell back to baseline because realtime overlay is unavailable.'
      : 'Decision model generation fell back to safe defaults.'),
    stateScore: stateFallback.stateScore,
    stateDrivers: stateFallback.stateDrivers,
    stateMeta: stateFallback.stateMeta,
    stateTransitionBias: stateFallback.stateTransitionBias,
    dominantDrivers: [{
      key: 'fallback',
      label: 'Fallback baseline',
      score: Number.isFinite(data.score) ? data.score : null,
      trend: 0,
      reason: 'Use baseline risk score and existing page modules until decision generation recovers.'
    }],
    positionGuidance: {
      ...fallbackPositionGuidance,
      ...buildLegacyPositionGuidanceCompat(
        {
          ...fallbackPositionGuidance,
          stance: 'Preserve current defensive baseline'
        },
        data?.tradingSystem?.positioning || {},
        ['Fallback mode active.', 'Do not expand risk until decision model recovers.']
      )
    },
    actionQueue: {
      ...fallbackActionQueue,
      ...buildLegacyActionQueueCompat(fallbackActionQueue)
    },
    triggerMonitor: buildTriggerMonitorFallback(data, metadata, stateFallback.strategyState),
    invalidationRules: buildInvalidationRulesFallback(data, metadata, stateFallback.strategyState),
    historicalRegime: buildHistoricalRegimeFallback(data, metadata, stateFallback)
  };
}

function getStrategyStateLabel(strategyState, riskMode) {
  return `${strategyState} · ${riskMode || 'Deterioration'}`;
}

function deriveStrategyState(stateScore) {
  const band = STATE_RULES.stateBands.find((item) => stateScore >= item.min);
  return band?.state || 'Risk-On';
}

function resolveRuleDelta(value, rules = []) {
  const matched = rules.find((rule) => (
    (Number.isFinite(rule.min) ? value >= rule.min : true)
    && (Number.isFinite(rule.max) ? value <= rule.max : true)
    && (Number.isFinite(rule.equals) ? value === rule.equals : true)
  ));
  return matched?.delta || 0;
}

function deriveRepairSignal(stateMeta = {}, metadata = {}) {
  const thresholds = STATE_RULES.repairSignalThresholds;
  const delta = Number(stateMeta.recent3dDelta) || 0;
  const criticalAlertCount = Number(stateMeta.criticalAlertCount) || 0;
  const severeResonanceCount = Number(stateMeta.severeResonanceCount) || 0;
  const extremeThresholdCount = Number(stateMeta.extremeThresholdCount) || 0;
  const resonanceCount = Number(stateMeta.resonanceCount) || 0;

  if (!metadata.realtimeUnavailable
    && delta <= thresholds.strong.recent3dDeltaMax
    && criticalAlertCount <= thresholds.strong.criticalAlertMax
    && severeResonanceCount <= thresholds.strong.severeResonanceMax
    && extremeThresholdCount <= thresholds.strong.extremeThresholdMax
    && resonanceCount <= thresholds.strong.resonanceMax) {
    return 'Strong';
  }

  if (delta <= thresholds.moderate.recent3dDeltaMax
    && criticalAlertCount <= thresholds.moderate.criticalAlertMax
    && severeResonanceCount <= thresholds.moderate.severeResonanceMax
    && extremeThresholdCount <= thresholds.moderate.extremeThresholdMax) {
    return 'Moderate';
  }

  if (delta <= thresholds.weak.recent3dDeltaMax
    && criticalAlertCount <= thresholds.weak.criticalAlertMax
    && severeResonanceCount <= thresholds.weak.severeResonanceMax) {
    return 'Weak';
  }

  return 'None';
}

function deriveRiskMode(stateMeta = {}, metadata = {}, triggerMonitorMeta = {}) {
  const thresholds = STATE_RULES.riskModeThresholds;
  const delta = Number(stateMeta.recent3dDelta) || 0;
  const resonanceCount = Number(stateMeta.resonanceCount) || 0;
  const severeResonanceCount = Number(stateMeta.severeResonanceCount) || 0;
  const criticalAlertCount = Number(stateMeta.criticalAlertCount) || 0;
  const extremeThresholdCount = Number(stateMeta.extremeThresholdCount) || 0;
  const stressPressureCount = Number(stateMeta.stressPressureCount) || 0;
  const repairSignal = stateMeta.repairSignal || 'None';
  const deescalationBias = triggerMonitorMeta.deescalationBias || 'low';
  const escalationLevel = triggerMonitorMeta.escalationLevel || 'low';
  const dataQualityPressure = Boolean(stateMeta.dataQualityPressure || metadata.realtimeUnavailable || metadata.realtimeFallbackUsed || metadata.realtimeCacheOnly);

  if (
    severeResonanceCount >= thresholds.stressSevereResonanceFloor
    || resonanceCount >= thresholds.stressResonanceFloor
    || criticalAlertCount >= thresholds.stressCriticalAlertFloor
    || extremeThresholdCount >= thresholds.stressExtremeThresholdFloor
    || stressPressureCount >= thresholds.stressPressureFloor
    || escalationLevel === 'high'
    || escalationLevel === 'severe'
    || dataQualityPressure
  ) {
    return 'Stress';
  }

  if (
    delta <= 0
    && (repairSignal === 'Moderate' || repairSignal === 'Strong')
    && criticalAlertCount <= 1
    && severeResonanceCount <= 1
    && deescalationBias !== 'low'
  ) {
    return 'Repair';
  }

  if (
    delta > 0
    || resonanceCount >= thresholds.deteriorationResonanceFloor
    || criticalAlertCount > 0
  ) {
    return 'Deterioration';
  }

  if (
    delta <= 0
    && resonanceCount <= thresholds.compressionResonanceCeil
    && severeResonanceCount <= thresholds.compressionSevereResonanceCeil
    && criticalAlertCount <= thresholds.compressionCriticalAlertCeil
    && extremeThresholdCount <= thresholds.compressionExtremeThresholdCeil
  ) {
    return 'Compression';
  }

  return 'Deterioration';
}

function buildStrategyStateMeta(data, history, metadata, healthDashboard) {
  const totalRiskScore = Number(data?.score);
  const scoreSeries = createScoreSeries(history, totalRiskScore);
  const referenceScore = scoreSeries.length >= 4 ? scoreSeries[scoreSeries.length - 4] : scoreSeries[0];
  const recent3dDelta = Number.isFinite(referenceScore) && Number.isFinite(totalRiskScore) ? totalRiskScore - referenceScore : 0;
  const recent3dSpeed = Number.isFinite(recent3dDelta) ? Number((recent3dDelta / 3).toFixed(1)) : 0;
  const metaThresholds = STATE_RULES.metaThresholds;
  const moduleEntries = Object.entries(data?.modules || {})
    .map(([key, value]) => ({ key, value: Number(value) }))
    .filter((item) => Number.isFinite(item.value));
  const resonanceCount = moduleEntries.filter((item) => item.value >= metaThresholds.resonanceFloor).length;
  const severeResonanceCount = moduleEntries.filter((item) => item.value >= metaThresholds.severeResonanceFloor).length;
  const elevatedRiskStreakDays = countConsecutiveDays(scoreSeries, (score) => score >= metaThresholds.elevatedRiskFloor);
  const highRiskStreakDays = countConsecutiveDays(scoreSeries, (score) => score >= metaThresholds.highRiskFloor);
  const alertCriticalCount = Array.isArray(data?.warningSystem?.alerts)
    ? data.warningSystem.alerts.filter((alert) => alert?.level === '红色').length
    : 0;
  const criticalAlertCount = Math.max(
    Number.isFinite(data?.warningSystem?.criticalCount) ? data.warningSystem.criticalCount : 0,
    alertCriticalCount
  );
  const warningCount = Number.isFinite(data?.warningSystem?.warningCount) ? data.warningSystem.warningCount : 0;
  const liquidityStress = Number(data?.modules?.liquidity) >= metaThresholds.resonanceFloor;
  const creditStress = Number(data?.modules?.debt) >= metaThresholds.resonanceFloor;
  const bankingStress = Number(data?.modules?.banking) >= metaThresholds.resonanceFloor;
  const stressPressureCount = [liquidityStress, creditStress, bankingStress].filter(Boolean).length;
  const dataQualityPressure = Boolean(metadata.realtimeUnavailable || metadata.realtimeFallbackUsed || metadata.realtimeCacheOnly);
  const extremeThresholds = [];
  const pushExtreme = (condition, label) => {
    if (condition) extremeThresholds.push(label);
  };

  pushExtreme(totalRiskScore >= metaThresholds.totalRiskExtreme, 'total-risk>=85');
  pushExtreme(moduleEntries.some((item) => item.value >= metaThresholds.moduleExtreme), 'module>=90');
  pushExtreme(severeResonanceCount >= metaThresholds.severeResonanceExtremeCount, 'three-modules>=80');
  pushExtreme(data?.liquidityIndex?.score >= metaThresholds.liquidityExtreme, 'liquidity>=75');
  pushExtreme(criticalAlertCount > 0, 'critical-alert');
  pushExtreme(metadata.realtimeCacheOnly, 'cache-only');
  pushExtreme(highRiskStreakDays >= metaThresholds.highRiskExtremeStreak, 'high-risk-streak');

  const deescalationBias = recent3dDelta <= -6 && criticalAlertCount === 0 && severeResonanceCount <= 1
    ? 'high'
    : recent3dDelta <= 0 && criticalAlertCount <= 1 && severeResonanceCount <= 1
      ? 'medium'
      : 'low';

  return {
    totalRiskScore,
    recent3dDelta,
    recent3dSpeed,
    resonanceCount,
    severeResonanceCount,
    extremeThresholdCount: extremeThresholds.length,
    extremeThresholds,
    elevatedRiskStreakDays,
    highRiskStreakDays,
    criticalAlertCount,
    warningCount,
    stressPressureCount,
    liquidityStress,
    creditStress,
    bankingStress,
    dataQualityPressure,
    deescalationBias,
    healthLevel: healthDashboard.overallLevel,
    executionLevel: data?.tradingSystem?.executionLock?.level || 'unknown'
  };
}

function calculateStrategyStateEngine(data, history, metadata, healthDashboard) {
  const stateMeta = buildStrategyStateMeta(data, history, metadata, healthDashboard);
  const executionLevel = data?.tradingSystem?.executionLock?.level;
  const adjustments = STATE_RULES.scoreAdjustments;
  let stateScore = Number.isFinite(stateMeta.totalRiskScore) ? stateMeta.totalRiskScore : 55;

  stateScore += resolveRuleDelta(stateMeta.recent3dDelta, adjustments.recent3dDelta);
  stateScore += resolveRuleDelta(stateMeta.resonanceCount, adjustments.resonanceCount);
  stateScore += resolveRuleDelta(stateMeta.severeResonanceCount, adjustments.severeResonanceCount);
  stateScore += resolveRuleDelta(stateMeta.extremeThresholdCount, adjustments.extremeThresholdCount);
  stateScore += resolveRuleDelta(stateMeta.highRiskStreakDays, adjustments.highRiskStreakDays);
  stateScore += adjustments.healthLevel[stateMeta.healthLevel] || 0;
  stateScore += adjustments.executionLevel[executionLevel] || 0;
  if (metadata.realtimeFallbackUsed) stateScore += adjustments.realtimeFallbackDelta;

  stateScore = clampNumber(Math.round(stateScore), 0, 100);
  const strategyState = deriveStrategyState(stateScore);
  const repairSignal = deriveRepairSignal(stateMeta, metadata);
  const escalationLevel = stateScore >= 85 || (stateMeta.extremeThresholdCount || 0) >= 2 || (stateMeta.criticalAlertCount || 0) >= 2
    ? 'high'
    : stateScore >= 68 || (stateMeta.severeResonanceCount || 0) >= 2
      ? 'medium'
      : 'low';
  stateMeta.repairSignal = repairSignal;
  stateMeta.escalationLevel = escalationLevel;
  const riskMode = deriveRiskMode(stateMeta, metadata, {
    escalationLevel,
    deescalationBias: stateMeta.deescalationBias
  });
  const stateTransitionBias = riskMode === 'Stress' || riskMode === 'Deterioration'
    ? 'up-bias'
    : riskMode === 'Repair'
      ? 'down-bias'
      : 'stable';
  stateMeta.riskMode = riskMode;
  stateMeta.stateTransitionBias = stateTransitionBias;
  const stateDrivers = [
    {
      key: 'total-risk',
      label: 'Total risk score',
      impact: strategyState,
      reason: `Current total risk score is ${stateMeta.totalRiskScore ?? '--'}.`
    },
    {
      key: 'three-day-speed',
      label: '3-day speed',
      impact: riskMode === 'Repair'
        ? 'repairing'
        : stateMeta.recent3dDelta > 0
          ? 'deteriorating'
          : stateMeta.recent3dDelta < 0
            ? 'easing'
            : 'flat',
      reason: `Recent 3-day change is ${stateMeta.recent3dDelta >= 0 ? '+' : ''}${stateMeta.recent3dDelta} (${stateMeta.recent3dSpeed}/day).`
    },
    {
      key: 'module-resonance',
      label: 'Module resonance',
      impact: riskMode === 'Stress' ? 'stress' : stateMeta.resonanceCount >= 3 ? 'broad' : stateMeta.resonanceCount >= 2 ? 'narrow' : 'contained',
      reason: `${stateMeta.resonanceCount} modules are at or above 70, with ${stateMeta.severeResonanceCount} at or above 80; stress pressure count ${stateMeta.stressPressureCount || 0}.`
    },
    {
      key: 'extreme-thresholds',
      label: 'Extreme thresholds',
      impact: stateMeta.extremeThresholdCount > 0 ? 'triggered' : 'clear',
      reason: stateMeta.extremeThresholdCount
        ? `Triggered: ${stateMeta.extremeThresholds.join(', ')}.`
        : 'No extreme thresholds are currently triggered.'
    },
    {
      key: 'high-risk-streak',
      label: 'High-risk persistence',
      impact: stateMeta.highRiskStreakDays >= 3 ? 'persistent' : 'not-persistent',
      reason: `High-risk streak: ${stateMeta.highRiskStreakDays} day(s); elevated-risk streak: ${stateMeta.elevatedRiskStreakDays} day(s).`
    },
    {
      key: 'mode-layer',
      label: 'Risk mode',
      impact: riskMode,
      reason: `Mode resolved as ${riskMode} with repair signal ${repairSignal} and de-escalation bias ${stateMeta.deescalationBias}.`
    }
  ];

  const stateReason = [
    `Strategy state resolved to ${strategyState} in ${riskMode} mode with state score ${stateScore}.`,
    `Total risk ${stateMeta.totalRiskScore ?? '--'}, 3-day delta ${stateMeta.recent3dDelta >= 0 ? '+' : ''}${stateMeta.recent3dDelta}, resonance ${stateMeta.resonanceCount}, repair signal ${repairSignal}.`,
    stateMeta.extremeThresholdCount
      ? `Extreme thresholds active: ${stateMeta.extremeThresholds.join(', ')}.`
      : 'No extreme thresholds are active.',
    `Transition bias remains ${stateTransitionBias}.`
  ].join(' ');

  return {
    strategyState,
    riskMode,
    repairSignal,
    stateLabel: getStrategyStateLabel(strategyState, riskMode),
    stateScore,
    stateReason,
    stateDrivers,
    stateMeta,
    stateTransitionBias
  };
}

function deriveDecisionState(data, history, metadata, healthDashboard) {
  try {
    return calculateStrategyStateEngine(data, history, metadata, healthDashboard);
  } catch (error) {
    console.warn('Strategy state engine failed, using fallback.', error);
    return buildStrategyStateFallback(data, metadata);
  }
}

function buildDominantDrivers(data, metadata) {
  const moduleEntries = Object.entries(data?.modules || {})
    .map(([key, score]) => ({
      key,
      label: MODULE_LABELS[key] || key,
      score: Number.isFinite(score) ? score : null,
      trend: Number.isFinite(data?.moduleTrends?.[key]) ? data.moduleTrends[key] : 0
    }))
    .filter((item) => item.score !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => ({
      ...item,
      reason: `${item.label} score ${item.score} with ${item.trend > 0 ? 'rising' : item.trend < 0 ? 'easing' : 'stable'} trend.`
    }));

  if (metadata.realtimeFallbackUsed) {
    moduleEntries.push({
      key: 'realtime-fallback',
      label: 'Realtime fallback',
      score: metadata.realtimeHealthScore ?? null,
      trend: 0,
      reason: 'Realtime fallback/local mode is active and should cap decision confidence.'
    });
  }

  return moduleEntries.slice(0, 4);
}

function buildPositionGuidanceEngine(data, metadata, decisionState, dominantDrivers) {
  try {
    const strategyState = decisionState?.strategyState || 'Caution';
    const stateScore = Number.isFinite(decisionState?.stateScore) ? decisionState.stateScore : 55;
    const stateMeta = decisionState?.stateMeta || {};
    const positioning = data?.tradingSystem?.positioning || {};
    const driverLabels = Array.isArray(dominantDrivers)
      ? dominantDrivers.slice(0, 2).map((item) => item.label).filter(Boolean)
      : [];
    const bandShiftRules = POSITION_RULES.bandShiftRules;
    const guidance = { ...(POSITION_RULES.stateBandMap[strategyState] || POSITION_RULES.stateBandMap.Caution) };
    let bandShift = 0;

    bandShift += resolveRuleDelta(stateScore, bandShiftRules.stateScore);
    if ((stateMeta.extremeThresholdCount || 0) >= bandShiftRules.extremeThresholdCount.min) bandShift += bandShiftRules.extremeThresholdCount.shift;
    if ((stateMeta.highRiskStreakDays || 0) >= bandShiftRules.highRiskStreakDays.min) bandShift += bandShiftRules.highRiskStreakDays.shift;
    if ((stateMeta.recent3dDelta || 0) <= bandShiftRules.easing3dDelta.max && strategyState !== bandShiftRules.easing3dDelta.excludeState) {
      bandShift += bandShiftRules.easing3dDelta.shift;
    }
    if ((stateMeta.recent3dDelta || 0) >= bandShiftRules.deteriorating3dDelta.min) bandShift += bandShiftRules.deteriorating3dDelta.shift;
    if (metadata.realtimeFallbackUsed || metadata.realtimeCacheOnly) bandShift += bandShiftRules.degradedRealtimeShift;

    const parseBand = (band) => {
      const match = String(band).match(/(\d+)%-(\d+)%/);
      if (!match) return null;
      return { min: Number(match[1]), max: Number(match[2]) };
    };
    const formatBand = (range) => `${range.min}%-${range.max}%`;
    const shiftBand = (band, shift, floor = POSITION_RULES.bandLimits.floor, ceil = POSITION_RULES.bandLimits.ceil, minWidth = POSITION_RULES.bandLimits.minWidth) => {
      const range = parseBand(band);
      if (!range) return band;
      let next = {
        min: clampNumber(range.min + shift, floor, ceil),
        max: clampNumber(range.max + shift, floor, ceil)
      };
      if (next.max - next.min < minWidth) {
        next.max = clampNumber(next.min + minWidth, floor, ceil);
        next.min = clampNumber(next.max - minWidth, floor, ceil);
      }
      return formatBand(next);
    };

    guidance.totalExposureBand = shiftBand(guidance.totalExposureBand, bandShift);

    if (bandShift <= bandShiftRules.riskOffOverrideThreshold) {
      guidance.riskAssetBias = strategyState === 'Crisis' ? 'Minimum risk exposure' : 'Further reduce risk asset exposure';
      guidance.defensiveBias = strategyState === 'Risk-On' ? 'Moderate' : 'Very high';
    } else if (bandShift >= bandShiftRules.improvingOverrideThreshold) {
      guidance.riskAssetBias = strategyState === 'Risk-On' ? 'Constructive within risk budget' : 'Selective but improving';
      guidance.defensiveBias = strategyState === 'Defensive' ? 'High but stabilizing' : 'Moderate';
    }

    const existingRiskBudget = positioning.riskBudget || '--';
    const existingExposureTarget = positioning.targetGrossExposure || '--';
    const existingCashTarget = positioning.cashBufferTarget || '--';

    return {
      ...guidance,
      stance: `${strategyState} position guidance`,
      riskBudget: existingRiskBudget,
      targetGrossExposure: existingExposureTarget,
      cashBufferTarget: existingCashTarget,
      adjustmentNotes: [
        `Strategy state: ${strategyState} (${decisionState?.stateLabel || 'unlabeled'}).`,
        `State score: ${stateScore}.`,
        `3-day delta: ${stateMeta.recent3dDelta >= 0 ? '+' : ''}${stateMeta.recent3dDelta || 0}; resonance: ${stateMeta.resonanceCount || 0}.`,
        driverLabels.length ? `Dominant drivers: ${driverLabels.join(', ')}.` : 'Dominant drivers unavailable.'
      ]
    };
  } catch (error) {
    console.warn('Position guidance engine failed, using fallback.', error);
    return buildPositionGuidanceFallback(data, metadata, decisionState?.strategyState);
  }
}

function uniqTexts(items = []) {
  return [...new Set(items.filter(Boolean).map((item) => String(item).trim()).filter(Boolean))];
}

function buildActionQueueEngine(data, metadata, decisionState, positionGuidance, dominantDrivers) {
  try {
    const strategyState = decisionState?.strategyState || 'Caution';
    const stateScore = Number.isFinite(decisionState?.stateScore) ? decisionState.stateScore : 55;
    const stateMeta = decisionState?.stateMeta || {};
    const riskControl = data?.tradingSystem?.riskControl || {};
    const warningAlerts = Array.isArray(data?.warningSystem?.alerts) ? data.warningSystem.alerts : [];
    const triggerPanel = data?.triggerPanel || {};
    const healthLevel = stateMeta.healthLevel || 'Unknown';
    const topDrivers = Array.isArray(dominantDrivers) ? dominantDrivers.slice(0, 2).map((item) => item.label).filter(Boolean) : [];
    const criticalAlerts = warningAlerts.filter((alert) => alert?.level === '红色');
    const yellowAlerts = warningAlerts.filter((alert) => alert?.level !== '红色');

    const priorityActions = [];
    const watchItems = [];
    const blockedActions = [];

    const byState = {
      'Risk-On': {
        priority: [
          'Add new risk exposure only in staged increments.',
          'Keep total exposure inside the current target band.',
          'Rebalance without chasing short-term moves.'
        ],
        blocked: [
          'Avoid leverage expansion beyond baseline.',
          'Avoid concentration increase without confirmation.'
        ]
      },
      Balanced: {
        priority: [
          'Keep exposure pacing controlled and selective.',
          'Rebalance toward the middle of the target band.',
          'Maintain baseline defensive buffers.'
        ],
        blocked: [
          'Avoid oversized single-step exposure changes.',
          'Avoid leverage expansion before confirmation.'
        ]
      },
      Caution: {
        priority: [
          'Reduce broad risk exposure incrementally.',
          'Keep new exposure highly selective and small.',
          'Raise cash buffer toward the guidance band.'
        ],
        blocked: [
          'Pause aggressive new risk deployment.',
          'Avoid leverage expansion.',
          'Avoid concentration increase under elevated regime.'
        ]
      },
      Defensive: {
        priority: [
          'Reduce broad risk exposure incrementally.',
          'Raise cash buffer and keep exposure inside the lower band.',
          'Only allow defensive rebalancing.'
        ],
        blocked: [
          'Pause aggressive new risk deployment.',
          'Avoid leverage expansion.',
          'Avoid concentration increase under elevated regime.'
        ]
      },
      Crisis: {
        priority: [
          'Prioritize capital preservation and liquidity restoration.',
          'Cut broad risk exposure toward minimum levels.',
          'Keep only defensive rebalancing and hedge maintenance.'
        ],
        blocked: [
          'Suspend new high-risk exposure.',
          'Avoid leverage use or expansion.',
          'Avoid concentration increase under crisis regime.'
        ]
      }
    };

    priorityActions.push(...(byState[strategyState]?.priority || byState.Caution.priority));
    blockedActions.push(...(byState[strategyState]?.blocked || byState.Caution.blocked));

    if ((stateMeta.extremeThresholdCount || 0) >= 2) {
      priorityActions.push('Tighten execution pace until extreme thresholds clear.');
      blockedActions.push('Avoid discretionary risk expansion while extreme thresholds remain active.');
    }
    if ((stateMeta.recent3dDelta || 0) >= 8) {
      priorityActions.push('Accelerate de-risking cadence while short-term stress is rising.');
      watchItems.push('Watch for further 3-day risk acceleration.');
    } else if ((stateMeta.recent3dDelta || 0) <= -8) {
      watchItems.push('Watch whether recent easing persists before relaxing posture.');
    }
    if ((stateMeta.highRiskStreakDays || 0) >= 5) {
      priorityActions.push('Maintain defensive buffers until the high-risk streak breaks.');
    }
    if (metadata.realtimeFallbackUsed || metadata.realtimeCacheOnly || healthLevel === 'Baseline Only' || healthLevel === 'Stale') {
      watchItems.push('Monitor data quality and freshness before easing controls.');
      blockedActions.push('Avoid expanding risk using degraded or fallback data only.');
    }
    if ((positionGuidance?.newExposurePolicy || '').toLowerCase().includes('pause') || strategyState === 'Crisis') {
      blockedActions.push('Pause broad new risk deployment.');
    }
    if ((positionGuidance?.leveragePolicy || '').toLowerCase().includes('no leverage')) {
      blockedActions.push('Avoid leverage expansion.');
    }

    topDrivers.forEach((driver) => {
      watchItems.push(`Monitor ${driver} stress for escalation or relief.`);
    });

    criticalAlerts.slice(0, 2).forEach((alert) => {
      priorityActions.push(`Respond to ${alert.title || 'critical alert'} immediately.`);
    });
    yellowAlerts.slice(0, 2).forEach((alert) => {
      watchItems.push(`Watch ${alert.title || 'warning signal'} for deterioration.`);
    });

    (Array.isArray(triggerPanel.watchlist) ? triggerPanel.watchlist : []).slice(0, 3).forEach((item) => {
      watchItems.push(`Watch ${item}.`);
    });
    (Array.isArray(triggerPanel.critical) ? triggerPanel.critical : []).slice(0, 2).forEach((item) => {
      watchItems.push(`Track critical trigger ${item}.`);
    });

    if (Array.isArray(riskControl.hardThresholds) && riskControl.hardThresholds.length) {
      watchItems.push('Monitor hard thresholds for escalation.');
    }

    const queue = {
      priorityActions: uniqTexts(priorityActions).slice(0, 6),
      watchItems: uniqTexts(watchItems).slice(0, 6),
      blockedActions: uniqTexts(blockedActions).slice(0, 6),
      actionSummary: `${strategyState} queue aligned with ${positionGuidance?.totalExposureBand || 'current'} exposure guidance.`,
      escalationHint: (stateMeta.extremeThresholdCount || 0) > 0
        ? 'Escalate immediately if extreme thresholds widen or critical alerts increase.'
        : 'Escalate if volatility, spread stress, or data quality worsens.',
      executionNotes: uniqTexts([
        `State score ${stateScore}; exposure band ${positionGuidance?.totalExposureBand || '--'}.`,
        `Cash guidance: ${positionGuidance?.cashGuidance || '--'}.`,
        topDrivers.length ? `Driver focus: ${topDrivers.join(', ')}.` : '',
        healthLevel ? `Health: ${healthLevel}.` : ''
      ]).slice(0, 4)
    };
    queue.items = flattenActionQueueItems(queue);
    return queue;
  } catch (error) {
    console.warn('Action queue engine failed, using fallback.', error);
    return buildActionQueueFallback(data, metadata, decisionState?.strategyState);
  }
}

function buildTriggerMonitorEngine(data, metadata, decisionState, positionGuidance, actionQueue, dominantDrivers) {
  try {
    const strategyState = decisionState?.strategyState || 'Caution';
    const stateScore = Number.isFinite(decisionState?.stateScore) ? decisionState.stateScore : 55;
    const stateMeta = decisionState?.stateMeta || {};
    const warningAlerts = Array.isArray(data?.warningSystem?.alerts) ? data.warningSystem.alerts : [];
    const triggerPanel = data?.triggerPanel || {};
    const moduleEntries = Object.entries(data?.modules || {})
      .map(([key, value]) => ({ key, value: Number(value) }))
      .filter((item) => Number.isFinite(item.value));
    const dominantLabels = Array.isArray(dominantDrivers) ? dominantDrivers.slice(0, 2).map((item) => item.label).filter(Boolean) : [];
    const criticalAlerts = warningAlerts.filter((alert) => alert?.level === '红色').length;

    const upgradeTriggers = uniqTexts([
      'Upgrade if state score rises by 8 points or more from the current regime.',
      'Upgrade if the 3-day change turns positive and exceeds +6.',
      'Upgrade if resonance expands to 4 or more modules above 70.',
      'Upgrade if severe resonance rises to 3 or more modules above 80.',
      'Upgrade if red alerts increase or new critical alerts appear.',
      'Upgrade if liquidity / volatility / funding stress re-accelerates.',
      metadata.realtimeCacheOnly ? 'Upgrade if cache-only mode persists into the next cycle.' : '',
      metadata.realtimeFreshnessLevel === 'stale' || metadata.realtimeUnavailable ? 'Upgrade if stale / baseline-only data persists without recovery.' : ''
    ]).slice(0, 7);

    const activeEscalationSignals = uniqTexts([
      stateScore >= 85 ? `State score ${stateScore} is already near crisis escalation.` : '',
      (stateMeta.recent3dDelta || 0) >= 6 ? `3-day deterioration is active at +${stateMeta.recent3dDelta}.` : '',
      (stateMeta.resonanceCount || 0) >= 4 ? `Broad resonance active: ${stateMeta.resonanceCount} modules above 70.` : '',
      (stateMeta.severeResonanceCount || 0) >= 2 ? `Severe resonance active: ${stateMeta.severeResonanceCount} modules above 80.` : '',
      criticalAlerts > 0 ? `${criticalAlerts} red alert(s) active.` : '',
      metadata.realtimeCacheOnly ? 'Cache-only mode is active.' : '',
      metadata.realtimeUnavailable ? 'Realtime unavailable / baseline only.' : '',
      metadata.realtimeFreshnessLevel === 'stale' ? 'Realtime freshness is stale.' : '',
      dominantLabels.length ? `Dominant stress drivers: ${dominantLabels.join(', ')}.` : '',
      Array.isArray(triggerPanel.critical) && triggerPanel.critical.length ? `Critical trigger panel active: ${triggerPanel.critical.slice(0, 2).join(', ')}.` : ''
    ]).slice(0, 6);

    let escalationLevel = 'medium';
    if (stateScore >= 85 || (stateMeta.extremeThresholdCount || 0) >= 3 || criticalAlerts >= 2) escalationLevel = 'severe';
    else if (stateScore >= 68 || (stateMeta.extremeThresholdCount || 0) >= 1 || criticalAlerts >= 1) escalationLevel = 'high';

    return {
      upgradeTriggers,
      activeEscalationSignals,
      triggerSummary: `${strategyState} trigger monitor watching score, resonance, alerts, and data-quality escalation paths.`,
      escalationLevel,
      signalConfidence: metadata.realtimeUnavailable ? 'medium' : metadata.realtimeCacheOnly ? 'medium' : 'high'
    };
  } catch (error) {
    console.warn('Trigger monitor engine failed, using fallback.', error);
    return buildTriggerMonitorFallback(data, metadata, decisionState?.strategyState);
  }
}

function buildInvalidationRulesEngine(data, metadata, decisionState, positionGuidance, actionQueue, dominantDrivers) {
  try {
    const strategyState = decisionState?.strategyState || 'Caution';
    const stateScore = Number.isFinite(decisionState?.stateScore) ? decisionState.stateScore : 55;
    const stateMeta = decisionState?.stateMeta || {};
    const riskControl = data?.tradingSystem?.riskControl || {};
    const dominantLabels = Array.isArray(dominantDrivers) ? dominantDrivers.slice(0, 2).map((item) => item.label).filter(Boolean) : [];

    const invalidationSignals = uniqTexts([
      'Invalidate the current defensive read if total risk score rises another 8 points from here.',
      'Invalidate the current read if the 3-day trend stops easing and turns back above +3.',
      'Invalidate the current read if resonance breadth expands again.',
      'Invalidate the current read if red alerts increase.',
      metadata.realtimeCacheOnly ? 'Invalidate the current read if cache-only mode persists and stress signals stay elevated.' : '',
      metadata.realtimeUnavailable ? 'Invalidate the current read if baseline-only mode persists while alerts worsen.' : ''
    ]).slice(0, 6);

    const resetConditions = uniqTexts([
      'Allow de-escalation after total risk score falls and holds lower.',
      'Allow de-escalation after the 3-day trend turns flat or negative.',
      'Allow de-escalation after resonance count drops below 3.',
      'Allow de-escalation after severe resonance eases below 2.',
      'Allow de-escalation after red alerts clear and data freshness normalizes.',
      ...(Array.isArray(riskControl.resetThresholds) ? riskControl.resetThresholds.slice(0, 3).map((rule) => `Reset reference: ${rule}`) : [])
    ]).slice(0, 6);

    let deescalationBias = 'medium';
    if ((stateMeta.recent3dDelta || 0) <= -8 && (stateMeta.resonanceCount || 0) <= 2 && (stateMeta.criticalAlertCount || 0) === 0) {
      deescalationBias = 'improving';
    } else if (metadata.realtimeUnavailable || metadata.realtimeCacheOnly || (stateMeta.extremeThresholdCount || 0) > 0) {
      deescalationBias = 'low';
    }

    return {
      invalidationSignals,
      resetConditions,
      invalidationSummary: `${strategyState} invalidation rules require lower score pressure, narrower resonance, cleaner alerts, and better data quality before easing.`,
      deescalationBias,
      signalConfidence: metadata.realtimeUnavailable ? 'medium' : metadata.realtimeCacheOnly ? 'medium' : 'high'
    };
  } catch (error) {
    console.warn('Invalidation rules engine failed, using fallback.', error);
    return buildInvalidationRulesFallback(data, metadata, decisionState?.strategyState);
  }
}

function buildHistoricalRegimeEngine(data, history, metadata, decisionState, dominantDrivers, triggerMonitor, invalidationRules) {
  try {
    const regimeConfig = REGIME_RULES.candidates;
    const stateMeta = decisionState?.stateMeta || {};
    const stateScore = Number.isFinite(decisionState?.stateScore)
      ? decisionState.stateScore
      : Number.isFinite(data?.score)
        ? data.score
        : 55;
    const modules = data?.modules || {};
    const moduleScore = (key) => Number.isFinite(Number(modules?.[key])) ? Number(modules[key]) : 0;
    const dominantKeys = Array.isArray(dominantDrivers) ? dominantDrivers.map((item) => item?.key).filter(Boolean) : [];
    const hasDriver = (...keys) => dominantKeys.some((key) => keys.includes(key));
    const resonanceCount = Number(stateMeta.resonanceCount) || 0;
    const severeResonanceCount = Number(stateMeta.severeResonanceCount) || 0;
    const recent3dDelta = Number(stateMeta.recent3dDelta) || 0;
    const criticalAlertCount = Number(stateMeta.criticalAlertCount) || 0;
    const extremeThresholdCount = Number(stateMeta.extremeThresholdCount) || 0;
    const highRiskStreakDays = Number(stateMeta.highRiskStreakDays) || 0;
    const elevatedRiskStreakDays = Number(stateMeta.elevatedRiskStreakDays) || 0;
    const escalationLevel = triggerMonitor?.escalationLevel || 'medium';
    const deescalationBias = invalidationRules?.deescalationBias || 'medium';
    const geopolitical = moduleScore('geopolitical');
    const energy = moduleScore('energy');
    const inflation = moduleScore('inflation');
    const liquidity = moduleScore('liquidity');
    const debt = moduleScore('debt');
    const banking = moduleScore('banking');
    const inflationPressure = Math.max(inflation, energy);
    const creditPressure = Math.max(debt, banking);
    const systemicSpread = resonanceCount >= 4 || severeResonanceCount >= 2 || criticalAlertCount >= 2;

    const evaluateCandidate = (config) => {
      let matchScore = REGIME_RULES.baseMatchScore;
      const matchedFeatures = [];
      const mismatchFeatures = [];
      const addMatch = (condition, points, text) => {
        if (!condition) return;
        matchScore += points;
        matchedFeatures.push(text);
      };
      const addMismatch = (condition, points, text) => {
        if (!condition) return;
        matchScore -= points;
        mismatchFeatures.push(text);
      };

      config.evaluate({ addMatch, addMismatch });
      matchScore = clampNumber(Math.round(matchScore), 0, 100);

      return {
        regimeName: config.regimeName,
        regimeLabel: config.regimeLabel,
        matchScore,
        matchedFeatures: matchedFeatures.slice(0, 5),
        mismatchFeatures: mismatchFeatures.slice(0, 4),
        regimeSummary: config.summary({ matchScore, matchedFeatures, mismatchFeatures })
      };
    };

    const candidates = [
      evaluateCandidate({
        regimeName: regimeConfig.tightening2018.regimeName,
        regimeLabel: regimeConfig.tightening2018.regimeLabel,
        evaluate: ({ addMatch, addMismatch }) => {
          const t = regimeConfig.tightening2018.thresholds;
          addMatch(stateScore >= t.stateScore.min && stateScore <= t.stateScore.max, t.stateScore.points, `State score ${stateScore} sits in a tightening-shock range rather than a full panic range.`);
          addMatch(recent3dDelta >= t.recent3dDelta.min && recent3dDelta <= t.recent3dDelta.max, t.recent3dDelta.points, `3-day change of ${recent3dDelta >= 0 ? '+' : ''}${recent3dDelta} points is consistent with a tightening-led stress build.`);
          addMatch(resonanceCount >= t.resonanceCount.min && resonanceCount <= t.resonanceCount.max, t.resonanceCount.points, `Resonance is elevated but not yet fully systemic at ${resonanceCount} modules above 70.`);
          addMatch(liquidity >= t.liquidity.min, t.liquidity.points, `Liquidity pressure is elevated at ${liquidity}.`);
          addMatch(creditPressure >= t.creditPressure.min, t.creditPressure.points, `Credit / balance-sheet pressure is visible at ${creditPressure}.`);
          addMatch(hasDriver('liquidity', 'debt', 'banking'), t.tighteningDriversPoints, 'Dominant drivers include tightening-sensitive channels.');
          addMatch(t.escalationLevels.values.includes(escalationLevel), t.escalationLevels.points, `Escalation level ${escalationLevel} fits a tightening shock better than a collapse.`);
          addMismatch(energy >= t.energyGeopoliticalMismatch.energyMin && geopolitical >= t.energyGeopoliticalMismatch.geopoliticalMin, t.energyGeopoliticalMismatch.points, 'Energy and geopolitical stress are too dominant for a clean tightening-only analogue.');
          addMismatch(severeResonanceCount >= t.broadStressMismatch.severeResonanceMin || stateScore >= t.broadStressMismatch.stateScoreMin, t.broadStressMismatch.points, 'Current stress is broader than a typical 2018 Q4 tightening shock.');
        },
        summary: ({ matchScore, matchedFeatures, mismatchFeatures }) => {
          const lead = matchedFeatures[0] || 'Tightening-style stress features are present.';
          const caveat = mismatchFeatures[0] || 'This still looks more like a drawdown regime than a disorderly seizure.';
          return `Closest to a tightening-led drawdown analogue (${matchScore}/100). ${lead} Difference: ${caveat}`;
        }
      }),
      evaluateCandidate({
        regimeName: regimeConfig.liquidity2020.regimeName,
        regimeLabel: regimeConfig.liquidity2020.regimeLabel,
        evaluate: ({ addMatch, addMismatch }) => {
          const t = regimeConfig.liquidity2020.thresholds;
          addMatch(stateScore >= t.stateScore.min, t.stateScore.points, `State score ${stateScore} is in a crisis-adjacent range.`);
          addMatch(recent3dDelta >= t.recent3dDelta.min, t.recent3dDelta.points, `3-day deterioration of +${recent3dDelta} is fast enough to resemble a liquidity break.`);
          addMatch(resonanceCount >= t.resonanceCount.min, t.resonanceCount.points, `Stress is broad across ${resonanceCount} modules.`);
          addMatch(severeResonanceCount >= t.severeResonanceCount.min, t.severeResonanceCount.points, `Severe resonance at ${severeResonanceCount} modules resembles systemic spread.`);
          addMatch(liquidity >= t.liquidity.min, t.liquidity.points, `Liquidity pressure is elevated at ${liquidity}.`);
          addMatch(creditPressure >= t.creditPressure.min, t.creditPressure.points, `Credit / banking pressure is elevated at ${creditPressure}.`);
          addMatch(t.escalationLevels.values.includes(escalationLevel), t.escalationLevels.points, `Escalation level ${escalationLevel} fits crisis spillover.`);
          addMatch(criticalAlertCount > 0 || extremeThresholdCount >= t.alertsOrExtreme.extremeMin, t.alertsOrExtreme.points, 'Alerts or extreme thresholds are already active.');
          addMismatch(inflationPressure >= t.inflationLiquidityMismatch.inflationMin && liquidity <= t.inflationLiquidityMismatch.liquidityMax, t.inflationLiquidityMismatch.points, 'Inflation / energy pressure is more dominant than a pure liquidity seizure.');
          addMismatch(deescalationBias === 'improving', t.improvingMismatchPoints, 'The current backdrop is easing faster than an early-2020 style break.');
        },
        summary: ({ matchScore, matchedFeatures, mismatchFeatures }) => {
          const lead = matchedFeatures[0] || 'Liquidity crisis features are partially present.';
          const caveat = mismatchFeatures[0] || 'Current conditions still stop short of a full seizure template.';
          return `Closest to an early liquidity-crisis analogue (${matchScore}/100). ${lead} Difference: ${caveat}`;
        }
      }),
      evaluateCandidate({
        regimeName: regimeConfig.inflation2022.regimeName,
        regimeLabel: regimeConfig.inflation2022.regimeLabel,
        evaluate: ({ addMatch, addMismatch }) => {
          const t = regimeConfig.inflation2022.thresholds;
          addMatch(energy >= t.energy.min, t.energy.points, `Energy stress is elevated at ${energy}.`);
          addMatch(inflation >= t.inflation.min, t.inflation.points, `Inflation pressure remains elevated at ${inflation}.`);
          addMatch(stateScore >= t.stateScore.min && stateScore <= t.stateScore.max, t.stateScore.points, `State score ${stateScore} fits a persistent but non-panic suppression regime.`);
          addMatch(t.strategyStates.values.includes(decisionState?.strategyState), t.strategyStates.points, `Strategy state ${decisionState?.strategyState || 'Caution'} fits a prolonged suppression regime.`);
          addMatch(liquidity >= t.liquidity.min && liquidity <= t.liquidity.max, t.liquidity.points, `Liquidity is restrictive but not in full crisis territory at ${liquidity}.`);
          addMatch(hasDriver('energy', 'inflation'), t.inflationDriversPoints, 'Dominant drivers are inflation / energy led.');
          addMatch(highRiskStreakDays >= t.persistence.highRiskMin || elevatedRiskStreakDays >= t.persistence.elevatedRiskMin, t.persistence.points, 'Stress persistence resembles a grind rather than a one-day break.');
          addMismatch(severeResonanceCount >= t.broadStressMismatch.severeResonanceMin || criticalAlertCount >= t.broadStressMismatch.criticalAlertMin, t.broadStressMismatch.points, 'Current stress is broader than a typical inflation-hike suppression regime.');
          addMismatch(liquidity >= t.acuteLiquidityMismatch.liquidityMin && recent3dDelta >= t.acuteLiquidityMismatch.recent3dDeltaMin, t.acuteLiquidityMismatch.points, 'Liquidity deterioration is too acute for a clean 2022-style analogue.');
        },
        summary: ({ matchScore, matchedFeatures, mismatchFeatures }) => {
          const lead = matchedFeatures[0] || 'Inflation-led suppression features are visible.';
          const caveat = mismatchFeatures[0] || 'The backdrop still carries more episodic stress than a pure 2022-style grind.';
          return `Closest to an inflation-and-hikes suppression analogue (${matchScore}/100). ${lead} Difference: ${caveat}`;
        }
      }),
      evaluateCandidate({
        regimeName: regimeConfig.regionalContained.regimeName,
        regimeLabel: regimeConfig.regionalContained.regimeLabel,
        evaluate: ({ addMatch, addMismatch }) => {
          const t = regimeConfig.regionalContained.thresholds;
          addMatch(geopolitical >= t.regionalDrivers.geopoliticalMin || energy >= t.regionalDrivers.energyMin, t.regionalDrivers.points, `Regional shock drivers remain dominant with geopolitical ${geopolitical} and energy ${energy}.`);
          addMatch(resonanceCount <= t.resonanceCount.max, t.resonanceCount.points, `Resonance remains contained at ${resonanceCount} modules.`);
          addMatch(severeResonanceCount <= t.severeResonanceCount.max, t.severeResonanceCount.points, `Severe resonance is limited at ${severeResonanceCount}.`);
          addMatch(stateScore >= t.stateScore.min && stateScore <= t.stateScore.max, t.stateScore.points, `State score ${stateScore} is elevated but not full-systemic.`);
          addMatch(criticalAlertCount <= t.criticalAlertCount.max, t.criticalAlertCount.points, `Critical alert count remains limited at ${criticalAlertCount}.`);
          addMatch(!systemicSpread, t.noSystemicSpreadPoints, 'Stress is not yet diffusing across the full system.');
          addMatch(hasDriver('geopolitical', 'energy'), t.regionalDriverFocusPoints, 'Dominant drivers are regional / commodity sensitive.');
          addMismatch(resonanceCount >= t.broadResonanceMismatch.resonanceMin || severeResonanceCount >= t.broadResonanceMismatch.severeResonanceMin, t.broadResonanceMismatch.points, 'Stress breadth is too wide for a contained regional analogue.');
          addMismatch(stateScore >= t.highScoreMismatch.stateScoreMin, t.highScoreMismatch.points, 'State score is too high for a merely regional shock template.');
        },
        summary: ({ matchScore, matchedFeatures, mismatchFeatures }) => {
          const lead = matchedFeatures[0] || 'Regional stress is visible without broad systemic spread.';
          const caveat = mismatchFeatures[0] || 'Systemic diffusion still looks limited for now.';
          return `Closest to a contained regional-risk analogue (${matchScore}/100). ${lead} Difference: ${caveat}`;
        }
      }),
      evaluateCandidate({
        regimeName: regimeConfig.elevatedOscillation.regimeName,
        regimeLabel: regimeConfig.elevatedOscillation.regimeLabel,
        evaluate: ({ addMatch, addMismatch }) => {
          const t = regimeConfig.elevatedOscillation.thresholds;
          addMatch(stateScore >= t.stateScore.min && stateScore <= t.stateScore.max, t.stateScore.points, `State score ${stateScore} sits in an elevated but not crisis-level range.`);
          addMatch(Math.abs(recent3dDelta) <= t.recent3dDeltaAbsMax.max, t.recent3dDeltaAbsMax.points, `3-day change of ${recent3dDelta >= 0 ? '+' : ''}${recent3dDelta} points suggests oscillation rather than a break.`);
          addMatch(resonanceCount >= t.resonanceCount.min && resonanceCount <= t.resonanceCount.max, t.resonanceCount.points, `Resonance is elevated but still moderate at ${resonanceCount} modules.`);
          addMatch(severeResonanceCount <= t.severeResonanceCount.max, t.severeResonanceCount.points, `Severe resonance remains limited at ${severeResonanceCount}.`);
          addMatch(highRiskStreakDays >= t.persistence.highRiskMin || elevatedRiskStreakDays >= t.persistence.elevatedRiskMin, t.persistence.points, 'Stress persistence resembles an elevated plateau.');
          addMatch(t.deescalationBias.values.includes(deescalationBias), t.deescalationBias.points, `De-escalation bias is ${deescalationBias}, consistent with a choppy plateau.`);
          addMatch(t.escalationLevels.values.includes(escalationLevel), t.escalationLevels.points, `Escalation level ${escalationLevel} is elevated but not necessarily disorderly.`);
          addMismatch(extremeThresholdCount >= t.extremeMismatch.extremeMin, t.extremeMismatch.points, 'Too many extreme thresholds are active for a benign oscillation analogue.');
          addMismatch(recent3dDelta >= t.accelerationMismatch.recent3dDeltaMin, t.accelerationMismatch.points, 'Short-term deterioration is too fast for a plateau regime.');
        },
        summary: ({ matchScore, matchedFeatures, mismatchFeatures }) => {
          const lead = matchedFeatures[0] || 'Elevated-but-choppy features are present.';
          const caveat = mismatchFeatures[0] || 'The backdrop still falls short of a crisis analogue.';
          return `Closest to an elevated-but-not-crisis analogue (${matchScore}/100). ${lead} Difference: ${caveat}`;
        }
      })
    ].sort((a, b) => b.matchScore - a.matchScore);

    const primary = candidates[0] || buildHistoricalRegimeFallback(data, metadata, decisionState);
    const secondary = candidates[1] || null;
    const scoreGap = secondary ? primary.matchScore - secondary.matchScore : primary.matchScore;
    const confidence = (REGIME_RULES.confidenceBands.find((band) => primary.matchScore >= band.minScore && scoreGap >= band.minGap) || REGIME_RULES.confidenceBands[REGIME_RULES.confidenceBands.length - 1]).confidence;

    return {
      ...primary,
      secondaryMatch: secondary
        ? {
            regimeName: secondary.regimeName,
            regimeLabel: secondary.regimeLabel,
            matchScore: secondary.matchScore
          }
        : null,
      confidence,
      interpretationNote: 'This is a rule-based historical similarity layer for interpretation only; it does not change the current strategy state, position guidance, or action queue.'
    };
  } catch (error) {
    console.warn('Historical regime matcher failed, using fallback.', error);
    return buildHistoricalRegimeFallback(data, metadata, decisionState);
  }
}

function buildDecisionModel(data, history, metadata, healthDashboard) {
  try {
    const state = deriveDecisionState(data, history, metadata, healthDashboard);
    const dominantDrivers = buildDominantDrivers(data, metadata);
    const position = data?.tradingSystem?.positioning || {};
    const actionLayer = data?.tradingSystem?.actionLayer || {};
    const riskControl = data?.tradingSystem?.riskControl || {};
    const executionLock = data?.tradingSystem?.executionLock || {};
    const warningAlerts = Array.isArray(data?.warningSystem?.alerts) ? data.warningSystem.alerts : [];
    const criticalAlerts = warningAlerts.filter((alert) => alert?.level === '红色').slice(0, 3);
    const watchlist = Array.isArray(data?.triggerPanel?.watchlist) ? data.triggerPanel.watchlist.slice(0, 3) : [];
    const driverLabels = dominantDrivers.map((item) => item.label).join(', ') || 'baseline drivers';
    const positionGuidance = buildPositionGuidanceEngine(data, metadata, state, dominantDrivers);
    const actionQueue = buildActionQueueEngine(data, metadata, state, positionGuidance, dominantDrivers);
    const triggerMonitor = buildTriggerMonitorEngine(data, metadata, state, positionGuidance, actionQueue, dominantDrivers);
    const invalidationRules = buildInvalidationRulesEngine(data, metadata, state, positionGuidance, actionQueue, dominantDrivers);
    const historicalRegime = buildHistoricalRegimeEngine(data, history, metadata, state, dominantDrivers, triggerMonitor, invalidationRules);
    const schemaMeta = buildDecisionSchemaMeta();

    return {
      contractVersion: DECISION_SCHEMA_VERSION,
      schemaMeta,
      strategyState: state.strategyState,
      riskMode: state.riskMode,
      repairSignal: state.repairSignal,
      stateLabel: state.stateLabel,
      stateReason: state.stateReason || `${executionLock.title || 'Existing trading system state'}; health ${healthDashboard.overallLevel}; dominant drivers: ${driverLabels}.`,
      stateScore: state.stateScore,
      stateDrivers: state.stateDrivers || [],
      stateMeta: state.stateMeta || {},
      stateTransitionBias: state.stateTransitionBias,
      dominantDrivers: dominantDrivers.length ? dominantDrivers : createDecisionFallback(data, metadata).dominantDrivers,
      positionGuidance: {
        ...positionGuidance,
        ...buildLegacyPositionGuidanceCompat(positionGuidance, position, [
          executionLock.description || 'Follow current execution lock.',
          `Health: ${healthDashboard.overallLevel}.`,
          `Realtime: ${metadata.realtimeStatusLabel || 'unknown'}.`
        ])
      },
      actionQueue: {
        ...actionQueue,
        ...buildLegacyActionQueueCompat(actionQueue, [
          executionLock.description || 'Follow current execution lock.',
          actionLayer.todayAction || 'Use the queue as the primary execution guide.'
        ])
      },
      triggerMonitor,
      invalidationRules,
      historicalRegime
    };
  } catch (error) {
    console.warn('Decision model generation failed, using fallback.', error);
    return createDecisionFallback(data, metadata);
  }
}

async function fetchBaselineData() {
  return fetch(dataUrl).then((r) => r.json());
}

async function fetchHistoryData() {
  return fetch(historyUrl).then((r) => r.json());
}

function normalizeRealtimePayload(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const values = payload.values && typeof payload.values === 'object' ? payload.values : null;
  if (!values) return null;

  const asOf = typeof payload.asOf === 'string'
    ? payload.asOf
    : typeof payload.lastSuccessAt === 'string'
      ? payload.lastSuccessAt
      : typeof payload.updatedAt === 'string'
        ? payload.updatedAt
        : null;

  return {
    values,
    changes: payload.changes && typeof payload.changes === 'object' ? payload.changes : {},
    updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : null,
    asOf,
    ageMinutes: Number.isFinite(payload.ageMinutes) ? payload.ageMinutes : null,
    freshnessLevel: typeof payload.freshnessLevel === 'string' ? payload.freshnessLevel : null,
    unavailable: !!payload.unavailable,
    sourceMode: typeof payload.sourceMode === 'string' ? payload.sourceMode : null,
    degradedMode: !!payload.degradedMode,
    cacheOnly: !!payload.cacheOnly,
    healthScore: payload.healthScore ?? null,
    criticalMissing: payload.criticalMissing ?? null,
    fallbackCount: payload.fallbackCount ?? null,
    lastSuccessAt: typeof payload.lastSuccessAt === 'string' ? payload.lastSuccessAt : null,
    sourceStatus: payload.sourceStatus && typeof payload.sourceStatus === 'object' ? payload.sourceStatus : {},
    sourceDetails: payload.sourceDetails && typeof payload.sourceDetails === 'object' ? payload.sourceDetails : {},
    notes: Array.isArray(payload.notes) ? payload.notes : []
  };
}

async function fetchRealtimePayload() {
  const attempts = [
    { url: `${remoteRealtimeUrl}?ts=${Date.now()}`, source: 'remote', fallbackUsed: false },
    { url: localRealtimeUrl, source: 'local-fallback', fallbackUsed: true }
  ];

  let lastError = null;

  for (const attempt of attempts) {
    try {
      const response = await fetch(attempt.url, { cache: 'no-store' });
      if (!response.ok) {
        lastError = `${attempt.source}:${response.status}`;
        continue;
      }

      const payload = normalizeRealtimePayload(await response.json());
      if (!payload) {
        lastError = `${attempt.source}:invalid-payload`;
        continue;
      }

      return {
        payload,
        realtimeSource: attempt.source,
        realtimeAvailable: true,
        realtimeFetchFailed: false,
        realtimeFallbackUsed: attempt.fallbackUsed,
        realtimeUpdatedAt: payload.updatedAt,
        realtimeError: lastError
      };
    } catch (error) {
      lastError = `${attempt.source}:${error.message}`;
    }
  }

  return {
    payload: null,
    realtimeSource: 'none',
    realtimeAvailable: false,
    realtimeFetchFailed: true,
    realtimeFallbackUsed: false,
    realtimeUpdatedAt: null,
    realtimeError: lastError
  };
}

function buildRuntimeState(baseline, history, realtimeResult) {
  const realtimePayload = realtimeResult.payload;
  const realtimeAsOf = realtimePayload?.asOf || realtimePayload?.lastSuccessAt || realtimePayload?.updatedAt || null;
  const realtimeAgeMinutes = computeAgeMinutes(realtimeAsOf);
  const realtimeFreshnessLevel = classifyFreshnessLevel(realtimeAgeMinutes, !!realtimePayload?.values);
  const realtimeDegraded = !!(realtimePayload?.degradedMode || realtimePayload?.cacheOnly || realtimeResult.realtimeFallbackUsed);
  const realtimeUnavailable = realtimeFreshnessLevel === 'unavailable' || !realtimePayload?.values;

  const runtimeMetadata = {
    realtimeSource: realtimeResult.realtimeSource,
    realtimeAvailable: realtimeResult.realtimeAvailable,
    realtimeFetchFailed: realtimeResult.realtimeFetchFailed,
    realtimeFallbackUsed: realtimeResult.realtimeFallbackUsed,
    realtimeUpdatedAt: realtimeResult.realtimeUpdatedAt,
    realtimeError: realtimeResult.realtimeError,
    realtimeAsOf,
    realtimeFreshnessLevel,
    realtimeAgeMinutes,
    realtimeDegraded,
    realtimeUnavailable,
    realtimeCacheOnly: !!realtimePayload?.cacheOnly,
    realtimeHealthScore: realtimePayload?.healthScore ?? null,
    realtimeCriticalMissing: realtimePayload?.criticalMissing ?? null,
    realtimeSourceMode: realtimePayload?.sourceMode || null,
    realtimeSourceStatus: realtimePayload?.sourceStatus || {},
    realtimeSourceDetails: realtimePayload?.sourceDetails || {}
  };
  runtimeMetadata.realtimeStatusLabel = buildRealtimeStatusLabel(runtimeMetadata);
  runtimeMetadata.realtimeOverlayEnabled = shouldApplyRealtimeOverlay(runtimeMetadata, realtimePayload);

  const data = runtimeMetadata.realtimeOverlayEnabled ? applyRealtimeOverlay(baseline, realtimePayload) : baseline;
  const healthDashboard = buildHealthDashboardModel({
    baseline,
    history,
    realtimePayload,
    runtimeMetadata,
    data
  });
  data.decisionModel = buildDecisionModel(data, history, runtimeMetadata, healthDashboard);

  return {
    baseline,
    history,
    realtimePayload,
    runtimeMetadata,
    healthDashboard,
    data
  };
}

function getRealtimeNumber(values, key) {
  const value = Number(values?.[key]);
  return Number.isFinite(value) ? value : null;
}

function applyRealtimeOverlay(base, realtimePayload) {
  if (!realtimePayload?.values) return base;

  const next = structuredClone(base);
  const brent = getRealtimeNumber(realtimePayload.values, 'brent');
  const dxy = getRealtimeNumber(realtimePayload.values, 'dxy');
  const vix = getRealtimeNumber(realtimePayload.values, 'vix');
  const hy = getRealtimeNumber(realtimePayload.values, 'hyOas');
  const us10y = getRealtimeNumber(realtimePayload.values, 'us10y');
  const real10y = getRealtimeNumber(realtimePayload.values, 'real10y');
  const gold = getRealtimeNumber(realtimePayload.values, 'gold');
  const spx = getRealtimeNumber(realtimePayload.values, 'spx');
  const breakeven10y = getRealtimeNumber(realtimePayload.values, 'breakeven10y');

  const oilRisk = brent === null ? null : Math.max(0, Math.min(100, Math.round((brent - 60) * 2)));
  const dollarRisk = dxy === null ? null : Math.max(0, Math.min(100, Math.round((dxy - 95) * 8)));
  const hyRisk = hy === null ? null : Math.max(0, Math.min(100, Math.round((hy - 2.5) * 35)));
  const vixRisk = vix === null ? null : Math.max(0, Math.min(100, Math.round((vix - 12) * 7)));
  const rateRisk = us10y === null ? null : Math.max(0, Math.min(100, Math.round((us10y - 2.5) * 22)));
  const realRisk = real10y === null ? null : Math.max(0, Math.min(100, Math.round((real10y - 0.5) * 33)));
  const inflationRisk = breakeven10y === null || oilRisk === null
    ? null
    : Math.max(0, Math.min(100, Math.round((breakeven10y - 1.5) * 45 + oilRisk * 0.35)));

  if (oilRisk !== null && vixRisk !== null) {
    next.modules.geopolitical = Math.max(0, Math.min(100, Math.round((next.modules.geopolitical * 0.4) + (oilRisk * 0.45) + (vixRisk * 0.15))));
  }
  if (oilRisk !== null) {
    next.modules.energy = Math.max(0, Math.min(100, Math.round((next.modules.energy * 0.25) + oilRisk * 0.75)));
  }
  if (inflationRisk !== null) {
    next.modules.inflation = Math.max(0, Math.min(100, Math.round((next.modules.inflation * 0.25) + inflationRisk * 0.75)));
  }
  if (dollarRisk !== null && hyRisk !== null && vixRisk !== null && rateRisk !== null) {
    next.modules.liquidity = Math.max(0, Math.min(100, Math.round((next.modules.liquidity * 0.2) + dollarRisk * 0.3 + hyRisk * 0.3 + vixRisk * 0.12 + rateRisk * 0.08)));
  }
  if (realRisk !== null && rateRisk !== null && hyRisk !== null) {
    next.modules.debt = Math.max(0, Math.min(100, Math.round((next.modules.debt * 0.25) + realRisk * 0.45 + rateRisk * 0.25 + hyRisk * 0.05)));
  }
  if (hyRisk !== null && vixRisk !== null && dollarRisk !== null) {
    next.modules.banking = Math.max(0, Math.min(100, Math.round((next.modules.banking * 0.2) + hyRisk * 0.55 + vixRisk * 0.2 + dollarRisk * 0.05)));
  }

  const totalScore = Math.round(
    next.modules.geopolitical * 0.15 +
    next.modules.energy * 0.16 +
    next.modules.inflation * 0.18 +
    next.modules.liquidity * 0.20 +
    next.modules.debt * 0.17 +
    next.modules.banking * 0.14
  );
  next.score = totalScore;
  next.liquidityIndex.score = next.modules.liquidity;
  next.liquidityIndex.regime = next.modules.liquidity >= 70 ? '限制性偏紧' : next.modules.liquidity >= 55 ? '偏紧缓解' : '流动性修复';
  next.liquidityIndex.directionLabel = realtimePayload.cacheOnly ? '快变量缓存模式' : realtimePayload.degradedMode ? '快变量带回退' : '快变量已实时覆盖';
  next.liquidityIndex.notes = [
    `实时快变量：布伦特 ${fmtNumSafe(brent,1)} / 美元 ${fmtNumSafe(dxy,2)} / VIX ${fmtNumSafe(vix,2)} / HY OAS ${fmtNumSafe(hy,2)}。`,
    `10Y ${fmtNumSafe(us10y,2)} / 实际利率 ${fmtNumSafe(real10y,2)} / 黄金 ${fmtNumSafe(gold,1)} / 标普500 ${fmtNumSafe(spx,0)}。`,
    `数据模式：${realtimePayload.sourceMode || 'unknown'} / 健康分数：${realtimePayload.healthScore ?? '--'} / 关键缺失：${realtimePayload.criticalMissing ?? 0}。`,
    ...(realtimePayload.notes || [])
  ];

  const hardStop = realtimePayload.cacheOnly
    || next.modules.liquidity >= 75
    || (brent !== null && brent >= 110)
    || (hy !== null && hy >= 4.5)
    || (vix !== null && vix >= 28)
    || totalScore >= 82;
  const caution = !hardStop && (
    realtimePayload.degradedMode
    || next.modules.liquidity >= 60
    || (brent !== null && brent >= 90)
    || (hy !== null && hy >= 3.7)
    || (vix !== null && vix >= 20)
    || totalScore >= 65
  );

  let level = 'green';
  let levelLabel = 'GREEN / 允许分批进攻';
  let title = '今天允许小幅加仓，但必须按纪律分批执行';
  let desc = '流动性、信用和波动率均回到相对稳定区，系统允许提高风险暴露，但必须按分批规则执行。';
  let allow = ['允许分三笔以内提高总仓位。', '允许增加质量权益和部分成长观察仓。', '允许适度降低美元/短票仓位。'];
  let block = ['禁止一次性打满仓位。', '禁止单日大涨后追高。', '禁止取消全部对冲。'];
  let mandatory = ['单日净加仓不得超过总资产 5%。', '若状态灯重新转黄，次日停止加仓。', '若周回撤 > -3%，立即回到 YELLOW。'];
  let target = '58%';
  let cash = '20%';
  let riskBudget = '50%';
  let status = '风险可控，仍需阈值约束';

  if (hardStop) {
    level = 'red';
    levelLabel = 'RED / 禁止新增';
    title = '今天禁止主动加仓，只允许减仓与恢复防御层';
    desc = realtimePayload.cacheOnly
      ? '关键快变量不足，系统进入缓存模式。为避免误判，执行引擎直接锁为 RED：禁止新增，只允许风险收缩。'
      : '高压风险组合已触发。执行引擎直接锁为 RED：任何新增风险动作都被禁止，只允许减仓、补现金和恢复防御仓。';
    allow = ['允许减仓风险资产。', '允许补充美元/短票与现金。', '允许把黄金对冲恢复到上限。'];
    block = ['禁止新增股票与高Beta仓位。', '禁止盘中追涨。', '禁止主观覆盖系统阈值。'];
    mandatory = ['若总仓位高于 42%，必须先减回 38%-42%。', '若科技/高Beta > 2%，立即降回 2% 以下。', '若现金缓冲 < 30%，立即补回。'];
    target = '38%';
    cash = '35%';
    riskBudget = '30%';
    status = '硬阈值全面生效';
  } else if (caution) {
    level = 'yellow';
    levelLabel = 'YELLOW / 仅允许微调';
    title = '今天不能主动加风险，只允许对齐目标仓位与防守再平衡';
    desc = '风险尚未解除，执行引擎只允许微调。允许围绕目标仓位做再平衡，但禁止新增进攻性仓位。';
    allow = ['允许把总仓位向 48% 靠拢。', '允许维持能源、美元/短票、黄金对冲层。', '允许保留防御型股票观察仓。'];
    block = ['禁止新增高Beta与久期进攻仓位。', '禁止因为单日反弹而加仓。', '禁止无视执行状态灯。'];
    mandatory = ['若总仓位高于 53%，先减仓。', '若科技/高Beta > 3%，降回上限以内。', '若现金缓冲 < 25%，恢复到安全区间。'];
    target = '48%';
    cash = '27%';
    riskBudget = '40%';
    status = '硬阈值生效中';
  }

  next.tradingSystem.executionLock = {
    tag: realtimePayload.cacheOnly ? '缓存模式 · 主观不得覆盖' : realtimePayload.degradedMode ? '带回退实时模式 · 主观不得覆盖' : '实时模式 · 主观不得覆盖',
    level,
    levelLabel,
    title,
    description: desc,
    allow,
    block,
    mandatory
  };

  const actionText = level === 'red'
    ? '执行引擎锁定：禁止新增，只允许减仓与防守恢复。'
    : level === 'yellow'
      ? '执行引擎锁定：只允许微调，不允许扩大风险暴露。'
      : '执行引擎开放：允许分批进攻，但不得破坏现金缓冲与止损纪律。';

  next.tradingSystem.actionLayer = {
    tag: '今日执行清单（交易引擎版）',
    priorityLine: `先看执行状态灯（${levelLabel}）→ 再执行强制动作 → 再对齐目标仓位；不满足条件时禁止交易。`,
    todayAction: actionText,
    checklist: mandatory,
    blocked: block,
    checkpoints: [
      `Brent 当前 ${fmtNumSafe(brent,1)}`,
      `DXY 当前 ${fmtNumSafe(dxy,2)}`,
      `VIX 当前 ${fmtNumSafe(vix,2)}`,
      `HY OAS 当前 ${fmtNumSafe(hy,2)}%`
    ]
  };

  next.tradingSystem.positioning.regime = level === 'red' ? '强防守执行框架' : level === 'yellow' ? '防守型执行框架' : '可控进攻框架';
  next.tradingSystem.positioning.riskBudget = riskBudget;
  next.tradingSystem.positioning.targetGrossExposure = target;
  next.tradingSystem.positioning.cashBufferTarget = cash;
  next.tradingSystem.positioning.coreAllocations = level === 'red'
    ? [
        { asset: '美元 / 短票', target: '核心1', weight: '24%', reason: '融资与信用压力阶段的首要防御层。' },
        { asset: '现金', target: '缓冲层', weight: '35%', reason: '执行引擎 RED，现金缓冲必须充足。' },
        { asset: '黄金', target: '对冲', weight: '12%', reason: '用于对冲尾部风险与政策不确定性。' },
        { asset: '原油 / 能源', target: '防守受益', weight: '12%', reason: '油价偏高时继续保留。' }
      ]
    : level === 'yellow'
      ? [
          { asset: '原油 / 能源', target: '核心1', weight: '20%', reason: '主链条仍偏向能源与通胀输入。' },
          { asset: '美元 / 短票', target: '核心2', weight: '18%', reason: '流动性偏紧阶段的稳定防御层。' },
          { asset: '黄金', target: '对冲', weight: '10%', reason: '对冲政策与通胀不确定性。' },
          { asset: '股票（防御板块）', target: '观察仓', weight: '8%', reason: '只保留低波动、现金流型权益。' }
        ]
      : [
          { asset: '股票（质量+防御）', target: '核心1', weight: '24%', reason: '风险回到可控区后恢复权益暴露。' },
          { asset: '原油 / 能源', target: '核心2', weight: '16%', reason: '保留主链条防守属性。' },
          { asset: '黄金', target: '对冲', weight: '8%', reason: '保留尾部对冲。' },
          { asset: '美元 / 短票', target: '缓冲层', weight: '12%', reason: '保留机动空间。' }
        ];
  next.tradingSystem.positioning.executionRestrictions = level === 'green'
    ? ['任何新增仓位必须分批执行。','单日净加仓不超过总资产的 5%。','若状态灯转黄，次日停止加仓。']
    : ['总仓位偏离目标值超过 ±5% 前，不得做方向性大调整。','科技与高Beta资产合计不得超过 3%。','任何新增进攻仓位都必须由减仓腾出空间。'];

  next.tradingSystem.riskControl.status = status;
  next.tradingSystem.riskControl.systemState = title;
  next.tradingSystem.riskControl.maxDrawdown = level === 'red' ? '-6%' : '-8%';
  next.tradingSystem.riskControl.hardThresholds = [
    '流动性 ≥ 75：总仓位降至 42%。',
    'Brent ≥ 110：能源上调，股票下调。',
    'HY OAS ≥ 4.5%：暂停新增风险仓位。',
    'VIX ≥ 28：进入 RED。'
  ];
  next.tradingSystem.riskControl.resetThresholds = [
    'VIX < 18 且 HY OAS < 3.7：才允许回到 GREEN。',
    'Brent < 95 且 DXY 走弱：才允许提高成长仓。',
    'criticalMissing < 2：解除数据回退约束。'
  ];

  next.tradingSystem.signalEngine = {
    strength: totalScore,
    direction: level === 'red' ? '只允许减仓/防守' : level === 'yellow' ? '防御偏多能源 / 美元，限制久期与高Beta' : '允许质量权益分批进攻',
    consistency: realtimePayload.cacheOnly ? '低一致性（缓存）' : realtimePayload.degradedMode ? '中一致性（回退）' : '高一致性',
    macroSignal: totalScore >= 70 ? '滞胀冲击' : totalScore >= 55 ? '流动性偏紧' : '通胀回落增长',
    liquiditySignal: `${next.liquidityIndex.regime}（实时）`,
    chainSignal: next.modules.energy >= next.modules.liquidity ? '油价→通胀→利率→股票' : '美元→信用→流动性→股票',
    notes: [
      `执行引擎状态：${levelLabel}。`,
      `关键快变量：Brent ${fmtNumSafe(brent,1)} / DXY ${fmtNumSafe(dxy,2)} / VIX ${fmtNumSafe(vix,2)} / HY ${fmtNumSafe(hy,2)}。`,
      `健康度 ${realtimePayload.healthScore ?? '--'}，关键缺失 ${realtimePayload.criticalMissing ?? 0}。`
    ]
  };

  next.topRisks = [
    `盘中快变量：布伦特 ${fmtNumSafe(brent,1)} / 美元 ${fmtNumSafe(dxy,2)} / VIX ${fmtNumSafe(vix,2)} / HY OAS ${fmtNumSafe(hy,2)}。`,
    `执行状态灯：${levelLabel}。`,
    realtimePayload.cacheOnly ? '当前为缓存模式，系统自动提升防守等级。' : realtimePayload.degradedMode ? '当前为带回退实时模式，少量数据已回退但系统继续运行。' : '当前为实时模式，快变量直接驱动信号与仓位。',
    `10Y ${fmtNumSafe(us10y,2)} / 实际利率 ${fmtNumSafe(real10y,2)} / 黄金 ${fmtNumSafe(gold,1)} / 标普500 ${fmtNumSafe(spx,0)}。`
  ];

  next.decisionLine = `当前已进入 v26.0A-rc1 交易引擎模式：实时快变量 ${realtimePayload.sourceMode || '--'}，执行状态灯为 ${levelLabel}。先看状态灯，再决定能不能动。`;
  next.summary = `v26.0A-rc1 正根据混合实时架构输出交易引擎结论。最新快变量：布伦特 ${fmtNumSafe(brent,1)}、美元 ${fmtNumSafe(dxy,2)}、VIX ${fmtNumSafe(vix,2)}、HY OAS ${fmtNumSafe(hy,2)}%。`;
  next.recovery = {
    degradedMode: !!realtimePayload.degradedMode,
    safeOutput: true,
    lastRun: realtimePayload.updatedAt || next.updatedAt,
    notes: realtimePayload.notes || ['v26.0A-rc1 快变量正常。']
  };

  return next;
}


function renderRealtimeStrip(realtime, metadata = null) {
  if (!realtime || !realtime.values) return;
  $('realtime-updated-at').textContent = realtime.asOf || realtime.updatedAt || '--';
  $('rt-brent').textContent = fmtNumSafe(realtime.values.brent, 1);
  $('rt-dxy').textContent = fmtNumSafe(realtime.values.dxy, 2);
  $('rt-vix').textContent = fmtNumSafe(realtime.values.vix, 2);
  $('rt-hy').textContent = fmtNumSafe(realtime.values.hyOas, 2);
  $('rt-us10y').textContent = fmtNumSafe(realtime.values.us10y, 2);
  $('rt-gold').textContent = fmtNumSafe(realtime.values.gold, 1);
  $('rt-spx').textContent = fmtNumSafe(realtime.values.spx, 0);
  $('rt-source-mode').textContent = realtime.degradedMode ? '部分回退' : '实时覆盖';
  if (metadata?.realtimeUnavailable) {
    $('rt-source-mode').textContent = 'baseline only';
  } else if (metadata) {
    const modeParts = [metadata.realtimeFreshnessLevel || realtime.freshnessLevel || 'fresh'];
    if (metadata.realtimeDegraded) modeParts.push('degraded');
    if (metadata.realtimeFallbackUsed) modeParts.push('local fallback');
    if (metadata.realtimeCacheOnly) modeParts.push('cache only');
    $('rt-source-mode').textContent = modeParts.join(' / ');
  }
  $('rt-brent-delta').textContent = fmtSigned(realtime.changes?.brent1d || 0);
  $('rt-dxy-delta').textContent = fmtSigned(realtime.changes?.dxy1d || 0);
  $('rt-vix-delta').textContent = fmtSigned(realtime.changes?.vix1d || 0);
  $('rt-hy-delta').textContent = fmtSigned(realtime.changes?.hyOas1d || 0);
  renderList('realtime-notes', realtime.notes || []);
}

function renderHealthDashboard(model) {
  const badge = $('health-level-badge');
  badge.textContent = model.overallLevel;
  badge.className = `badge ${model.healthTone.badgeTone} ${model.healthTone.badgeClass}`;

  $('health-overall-level').textContent = model.overallLevel;
  $('health-score').textContent = model.healthScore ?? '--';
  $('health-freshness').textContent = model.freshness;
  $('health-age').textContent = model.ageLabel;
  $('health-source').textContent = model.realtimeSource;
  $('health-flags').textContent = model.flagsLabel;
  $('health-critical-missing').textContent = model.criticalMissing;
  $('health-source-summary').textContent = model.sourceSummaryLabel;
  $('health-summary-text').textContent = model.summary;
  renderList('health-issues', model.issues);
  renderList('health-source-list', model.sourceLines);
}

function getDecisionHeaderBadgeClass(strategyState) {
  switch (strategyState) {
    case 'Risk-On':
      return 'decision-badge-risk-on';
    case 'Balanced':
      return 'decision-badge-balanced';
    case 'Caution':
      return 'decision-badge-caution';
    case 'Defensive':
      return 'decision-badge-defensive';
    case 'Crisis':
      return 'decision-badge-crisis';
    default:
      return 'neutral';
  }
}

function describeStateChange(stateMeta = {}) {
  const delta = Number(stateMeta.recent3dDelta);
  const extremeCount = Number(stateMeta.extremeThresholdCount) || 0;
  const highRiskStreakDays = Number(stateMeta.highRiskStreakDays) || 0;

  if (delta >= 8) return 'Rising over last 3 days';
  if (delta >= 3) return 'Firming over last 3 days';
  if (delta <= -8) return extremeCount > 0 || highRiskStreakDays >= 3 ? 'Elevated but easing' : 'Easing over last 3 days';
  if (delta <= -3) return 'Stabilizing';
  if (extremeCount > 0) return 'Holding at elevated levels';
  return 'Stable near current regime';
}

function buildDecisionHeaderModel(decisionModel = {}, data = {}) {
  // Decision Header is intentionally decision-model-first. It should consume the
  // v26 canonical fields above and only fall back to legacy display fields when
  // a canonical value is missing during safe rendering.
  const strategyState = decisionModel.strategyState || 'Caution';
  const stateLabel = decisionModel.stateLabel || strategyState;
  const stateScore = Number.isFinite(decisionModel.stateScore)
    ? decisionModel.stateScore
    : Number.isFinite(data?.score)
      ? data.score
      : '--';
  const exposureBand = decisionModel?.positionGuidance?.totalExposureBand || '--';
  const coreAction = decisionModel?.actionQueue?.priorityActions?.[0]
    || decisionModel?.positionGuidance?.newExposurePolicy
    || 'Keep risk changes paced and selective.';
  const dominantRiskSources = Array.isArray(decisionModel?.dominantDrivers) && decisionModel.dominantDrivers.length
    ? decisionModel.dominantDrivers.slice(0, 3).map((item) => item.label || item.key).filter(Boolean)
    : Array.isArray(decisionModel?.stateDrivers)
      ? decisionModel.stateDrivers.slice(0, 3).map((item) => item.label || item.key).filter(Boolean)
      : ['Risk drivers unavailable'];
  const historicalRegimeLabel = decisionModel?.historicalRegime?.regimeLabel
    ? `${decisionModel.historicalRegime.regimeLabel} / ${decisionModel.historicalRegime.matchScore ?? '--'}`
    : 'Historical analogue unavailable';
  const historicalRegimeSummary = decisionModel?.historicalRegime?.regimeSummary
    || 'Historical similarity layer unavailable; use current state and triggers as the primary guide.';

  return {
    stateBadge: strategyState,
    stateLabel,
    scoreLabel: stateScore,
    exposureBand,
    coreAction,
    stateChange: describeStateChange(decisionModel.stateMeta || {}),
    title: `${stateLabel} Decision Header`,
    reason: decisionModel.stateReason || data?.decisionLine || 'Current regime is being summarized from the v26 decision model.',
    escalationLabel: decisionModel?.triggerMonitor?.escalationLevel
      ? `Escalation ${decisionModel.triggerMonitor.escalationLevel}`
      : 'Escalation watch active',
    cashGuidance: decisionModel?.positionGuidance?.cashGuidance || 'Keep baseline cash discipline.',
    newExposurePolicy: decisionModel?.positionGuidance?.newExposurePolicy || 'Use staged exposure changes only.',
    historicalRegimeLabel,
    historicalRegimeSummary,
    dominantRiskSources
  };
}

function renderDecisionHeader(model) {
  const badge = $('decision-header-state-badge');
  badge.textContent = model.stateBadge;
  badge.className = `badge ${getDecisionHeaderBadgeClass(model.stateBadge)}`;

  $('decision-header-escalation').textContent = model.escalationLabel;
  $('decision-header-title').textContent = model.title;
  $('decision-header-reason').textContent = model.reason;
  $('decision-header-action').textContent = model.coreAction;
  $('decision-header-state-label').textContent = model.stateLabel;
  $('decision-header-score').textContent = model.scoreLabel;
  $('decision-header-exposure').textContent = model.exposureBand;
  $('decision-header-change').textContent = model.stateChange;
  $('decision-header-cash').textContent = model.cashGuidance;
  $('decision-header-policy').textContent = model.newExposurePolicy;
  $('decision-header-regime-label').textContent = model.historicalRegimeLabel;
  $('decision-header-regime-summary').textContent = model.historicalRegimeSummary;

  const drivers = $('decision-header-drivers');
  drivers.innerHTML = '';
  (model.dominantRiskSources || ['Risk drivers unavailable']).forEach((driver) => {
    const chip = document.createElement('span');
    chip.className = 'decision-driver-chip';
    chip.textContent = driver;
    drivers.appendChild(chip);
  });
}


function renderBars(containerId, items, isTrend = false) {
  const root = $(containerId);
  root.innerHTML = '';
  root.className = 'progress-group';
  items.forEach((item) => {
    const wrap = document.createElement('div');
    wrap.className = 'progress-row';
    const trendNote = isTrend ? `<div class="progress-note">较上次 ${fmtSignedArrow(item.delta)}</div>` : '';
    wrap.innerHTML = `
      <div class="progress-top"><span>${item.label}</span><span>${item.value}%</span></div>
      <div class="progress-track"><div class="progress-fill ${item.mode || ''}" style="width:${item.value}%"></div></div>
      ${trendNote}
    `;
    root.appendChild(wrap);
  });
}


function renderExecutionLock(lock) {
  $('execution-lock-tag').textContent = lock.tag;
  $('execution-status-level').textContent = lock.levelLabel;
  $('execution-status-title').textContent = lock.title;
  $('execution-status-desc').textContent = lock.description;
  const pill = $('execution-status-level');
  pill.classList.remove('green', 'yellow', 'red');
  if (lock.level === 'green') pill.classList.add('green');
  else if (lock.level === 'yellow') pill.classList.add('yellow');
  else pill.classList.add('red');
  const allow = $('execution-allow');
  const block = $('execution-block');
  const mandatory = $('execution-mandatory');
  allow.className = 'bullet-list lock-allow';
  block.className = 'bullet-list lock-block';
  mandatory.className = 'bullet-list lock-mandatory';
  renderList('execution-allow', lock.allow || []);
  renderList('execution-block', lock.block || []);
  renderList('execution-mandatory', lock.mandatory || []);
}

function renderAssetTable(rows) {
  const body = $('asset-table-body');
  body.innerHTML = '';
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    const biasClass = row.bias.includes('强')
      ? 'strong'
      : row.bias.includes('谨慎')
        ? 'cautious'
        : row.bias.includes('低配')
          ? 'underweight'
          : 'neutral';
    tr.innerHTML = `
      <td>${row.asset}</td>
      <td>${row.score}</td>
      <td><span class="badge ${biasClass}">${row.bias}</span></td>
      <td>${row.reason}</td>
    `;
    body.appendChild(tr);
  });
}

function renderAssetReturnMap(mapData) {
  $('return-map-horizon').textContent = mapData.horizon;
  const body = $('asset-return-body');
  body.innerHTML = '';
  const convictionRank = { '高': 4, '中高': 3, '中': 2, '中低': 1, '低': 0 };
  const biasRank = (bias) => {
    if ((bias || '').includes('偏多') || (bias || '') === '偏多') return 3;
    if ((bias || '').includes('中性偏多')) return 2.5;
    if ((bias || '').includes('中性')) return 2;
    if ((bias || '').includes('中性偏空')) return 1.5;
    if ((bias || '').includes('偏空')) return 1;
    return 0;
  };
  [...mapData.rows].sort((a, b) => {
    const pa = Number.isFinite(a.priority) ? a.priority : (convictionRank[a.conviction] || 0) * 10 + biasRank(a.bias);
    const pb = Number.isFinite(b.priority) ? b.priority : (convictionRank[b.conviction] || 0) * 10 + biasRank(b.bias);
    return pb - pa;
  }).forEach((row) => {
    const tr = document.createElement('tr');
    const biasClass = row.bias.includes('偏多') || row.bias.includes('多')
      ? 'strong'
      : row.bias.includes('偏空') || row.bias.includes('空')
        ? 'underweight'
        : 'neutral';
    const drivers = (row.drivers || []).map((d) => `<span class="asset-driver-chip">${d}</span>`).join('');
    tr.innerHTML = `
      <td>${row.asset}</td>
      <td><span class="badge ${biasClass}">${row.bias}</span></td>
      <td>${row.expected}</td>
      <td>${row.drawdown}</td>
      <td>${row.conviction}</td>
      <td class="return-driver-cell">${drivers || '—'}</td>
      <td>${row.note}</td>
    `;
    body.appendChild(tr);
  });
}

function renderList(id, items) {
  const root = $(id);
  root.innerHTML = '';
  items.forEach((text) => {
    const li = document.createElement('li');
    li.textContent = text;
    root.appendChild(li);
  });
}

function renderScenarioTree(items) {
  const root = $('scenario-list');
  root.innerHTML = '';
  items.forEach((item) => {
    const node = document.createElement('div');
    node.className = 'scenario-card';
    node.innerHTML = `
      <div class="scenario-title">${item.name} · ${item.probability}%</div>
      <div class="scenario-meta">${item.description}</div>
      <div><strong>触发条件：</strong>${item.triggers}</div>
      <div style="margin-top:8px;"><strong>资产表现：</strong>${item.assets}</div>
    `;
    root.appendChild(node);
  });
}

function renderLineChart(svgId, history, opts = {}) {
  const svg = $(svgId);
  const width = opts.width || 760;
  const height = opts.height || 220;
  const pad = opts.pad || { top: 18, right: 18, bottom: 34, left: 46 };
  const values = history.map((d) => d.score);
  const dates = history.map((d) => d.date.slice(5));
  const min = Math.min(...values) - 3;
  const max = Math.max(...values) + 3;
  const x = (i) => pad.left + (i * (width - pad.left - pad.right)) / Math.max(1, history.length - 1);
  const y = (v) => height - pad.bottom - ((v - min) / (max - min || 1)) * (height - pad.top - pad.bottom);
  const line = history.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.score)}`).join(' ');
  const area = `${line} L ${x(history.length - 1)} ${height - pad.bottom} L ${x(0)} ${height - pad.bottom} Z`;

  const gridValues = [min, Math.round((min + max) / 2), max];
  const grid = gridValues.map((g) => `
    <line class="gridline" x1="${pad.left}" y1="${y(g)}" x2="${width - pad.right}" y2="${y(g)}"></line>
    <text x="${pad.left - 10}" y="${y(g) + 4}" text-anchor="end">${g}</text>
  `).join('');

  const labelEvery = history.length > 10 ? 3 : 1;
  const labels = dates.map((d, i) => i % labelEvery === 0 || i === history.length - 1
    ? `<text x="${x(i)}" y="${height - 12}" text-anchor="middle">${d}</text>`
    : '').join('');
  const points = history.map((d, i) => `<circle class="point" cx="${x(i)}" cy="${y(d.score)}" r="${history.length > 10 ? 3.5 : 5}"></circle>`).join('');

  svg.innerHTML = `
    <defs>
      <linearGradient id="${svgId}-gradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#6ebeff"></stop>
        <stop offset="100%" stop-color="#6ebeff" stop-opacity="0"></stop>
      </linearGradient>
    </defs>
    <line class="axis" x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}"></line>
    ${grid}
    <path class="area" d="${area}" fill="url(#${svgId}-gradient)" opacity="0.24"></path>
    <path class="series" d="${line}"></path>
    ${points}
    ${labels}
  `;
}

function wrapSvgText(text, maxChars = 10) {
  const safe = String(text || '');
  const chunks = [];
  for (let i = 0; i < safe.length; i += maxChars) chunks.push(safe.slice(i, i + maxChars));
  return chunks;
}

function renderHeatmap(regions) {
  const svg = $('world-heatmap');
  const list = $('heatmap-list');
  list.innerHTML = '';

  const layout = {
    us: { x: 34, y: 108, w: 182, h: 90 },
    latam: { x: 118, y: 228, w: 118, h: 104 },
    europe: { x: 292, y: 78, w: 130, h: 78 },
    middleEast: { x: 430, y: 140, w: 136, h: 88 },
    china: { x: 592, y: 104, w: 132, h: 92 },
    japan: { x: 672, y: 206, w: 86, h: 70 },
    emAsia: { x: 548, y: 232, w: 126, h: 84 }
  };

  svg.innerHTML = `
    <rect x="12" y="20" width="756" height="330" rx="24" fill="rgba(8, 20, 39, 0.65)" stroke="rgba(133,164,229,0.14)"></rect>
    <text class="heat-label" x="44" y="48">区域风险集中度</text>
  `;

  regions.forEach((region) => {
    const spec = layout[region.key];
    if (!spec) return;
    const color = riskColor(region.risk);
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.innerHTML = `
      <rect class="heat-region" x="${spec.x}" y="${spec.y}" width="${spec.w}" height="${spec.h}" rx="20" fill="${color}" fill-opacity="0.82"></rect>
      <text class="heat-label" x="${spec.x + 12}" y="${spec.y + 32}">${region.shortLabel}</text>
      <text class="heat-score" x="${spec.x + 12}" y="${spec.y + 58}">风险 ${region.risk}</text>
    `;
    svg.appendChild(g);

    const item = document.createElement('div');
    item.className = 'heatmap-item';
    item.innerHTML = `
      <span class="swatch" style="background:${color}"></span>
      <div class="swatch-label"><strong>${region.label}</strong><span>${region.note}</span></div>
      <strong>${region.risk}</strong>
    `;
    list.appendChild(item);
  });
}

function renderTransmission(chain) {
  $('chain-regime-tag').textContent = chain.regimeTag;
  $('chain-stress-score').textContent = chain.stressScore;
  $('chain-lead-shock').textContent = chain.leadShock;
  $('chain-confidence').textContent = `${chain.pathConfidence}%`;
  $('chain-dominant-impact').textContent = chain.dominantImpact;

  const flow = $('chain-flow');
  flow.innerHTML = '';
  chain.nodes.forEach((node) => {
    const color = riskColor(node.score);
    const card = document.createElement('div');
    card.className = 'chain-node';
    const deltaClass = node.delta > 0 ? 'up' : node.delta < 0 ? 'down' : 'flat';
    const deltaText = `${Number.isFinite(node.delta) ? `${node.delta > 0 ? '+' : ''}${node.delta}` : '--'}`;
    card.innerHTML = `
      <div class="chain-node-top">
        <div class="chain-node-title">${node.label}</div>
        <div class="chain-node-score">${node.score}</div>
      </div>
      <div class="chain-node-meta">
        <div class="chain-node-direction">${node.directionLabel}</div>
        <div class="chain-delta ${deltaClass}">Δ ${deltaText}</div>
      </div>
      <div class="chain-node-bar"><div class="chain-node-fill" style="width:${node.score}%; background:${color}"></div></div>
      <div class="chain-node-note">${node.note}</div>
    `;
    flow.appendChild(card);
  });

  const layers = $('chain-layers');
  layers.innerHTML = '';
  chain.layers.forEach((layer) => {
    const div = document.createElement('div');
    div.className = 'chain-layer-card';
    div.innerHTML = `
      <div class="chain-layer-title"><span>${layer.name}</span><span>${layer.score}</span></div>
      <div class="chain-layer-tags">${layer.items.map((item) => `<span class="chain-tag">${item}</span>`).join('')}</div>
    `;
    layers.appendChild(div);
  });

  const decomp = $('chain-decomposition');
  decomp.innerHTML = '';
  chain.decomposition.forEach((asset) => {
    const card = document.createElement('div');
    card.className = 'decomp-card';
    card.innerHTML = `<div class="decomp-title"><span>${asset.asset}</span><span>${asset.total}</span></div>`;
    asset.drivers.forEach((driver) => {
      const row = document.createElement('div');
      row.className = 'decomp-row';
      row.innerHTML = `
        <span>${driver.label}</span>
        <div class="decomp-bar"><div class="decomp-fill" style="width:${driver.value}%"></div></div>
        <strong>${driver.value}</strong>
      `;
      card.appendChild(row);
    });
    decomp.appendChild(card);
  });

  renderList('chain-summary', chain.summary);

  const impacts = $('chain-asset-impacts');
  impacts.innerHTML = '';
  chain.assetImpacts.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'chain-impact-item';
    div.innerHTML = `
      <strong>${item.asset}</strong>
      <span class="chain-impact-direction ${item.directionClass}">${item.directionLabel}</span>
      <span class="chain-impact-score">${item.score}</span>
    `;
    impacts.appendChild(div);
  });
}


function renderSignalEngine(signal) {
  $('signal-strength').textContent = signal.strength;
  $('signal-direction').textContent = signal.direction;
  $('signal-consistency').textContent = signal.consistency;
  $('signal-macro').textContent = signal.macroSignal;
  $('signal-liquidity-chain').textContent = `${signal.liquiditySignal} / ${signal.chainSignal}`;
  renderList('signal-notes', signal.notes || []);
}

function renderActionLayer(action) {
  $('action-tag').textContent = action.tag;
  $('today-action').textContent = action.todayAction;
  $('action-priority').textContent = action.priorityLine || '执行优先级：先减风险，再做微调，最后观察确认。';
  const allow = $('action-allow');
  const avoid = $('action-avoid');
  const watch = $('action-watch');
  allow.className = 'bullet-list action-checklist';
  avoid.className = 'bullet-list action-blocklist';
  watch.className = 'bullet-list threshold-list';
  renderList('action-allow', action.checklist || []);
  renderList('action-avoid', action.blocked || []);
  renderList('action-watch', action.checkpoints || []);
}

function renderPositioning(position) {
  $('position-regime').textContent = position.regime;
  $('position-risk-budget').textContent = position.riskBudget;
  $('position-gross-exposure').textContent = position.targetGrossExposure;
  $('position-cash-buffer').textContent = position.cashBufferTarget;
  const body = $('position-core-body');
  body.innerHTML = '';
  (position.coreAllocations || []).forEach((item) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.asset}${item.target ? `<span class="position-target-chip">${item.target}</span>` : ''}</td>
      <td>${item.weight}</td>
      <td>${item.reason}</td>
    `;
    body.appendChild(tr);
  });
  renderList('position-restrictions', position.executionRestrictions || []);
}

function renderRiskControl(risk) {
  $('risk-status').textContent = risk.status;
  $('risk-max-drawdown').textContent = risk.maxDrawdown;
  $('risk-single-asset-max').textContent = risk.singleAssetMax;
  $('risk-system-state').textContent = risk.systemState;
  const deRisk = $('risk-de-risk-triggers');
  const stopRules = $('risk-stop-rules');
  deRisk.className = 'bullet-list threshold-list';
  stopRules.className = 'bullet-list threshold-list';
  renderList('risk-de-risk-triggers', risk.hardThresholds || []);
  renderList('risk-stop-rules', risk.resetThresholds || []);
}

function renderDiscipline(discipline) {
  $('discipline-tag').textContent = discipline.tag;
  renderList('discipline-entry', discipline.entryConditions || []);
  renderList('discipline-prohibited', discipline.prohibitedBehaviors || []);
  renderList('discipline-mandatory', discipline.mandatoryRules || []);
}

function renderWarningSystem(warning) {
  $('warning-status').textContent = warning.status;
  $('warning-critical-count').textContent = warning.criticalCount;
  $('warning-warning-count').textContent = warning.warningCount;
  $('warning-watch-count').textContent = warning.watchCount;
  const root = $('warning-alert-list');
  root.innerHTML = '';
  const order = { '红色': 0, '橙色': 1, '黄色': 2 };
  [...warning.alerts].sort((a, b) => order[a.level] - order[b.level]).forEach((alert, idx) => {
    const levelClass = alert.level === '红色' ? 'danger' : alert.level === '橙色' ? 'warning' : 'watch';
    const div = document.createElement('div');
    div.className = `warning-card ${levelClass}`;
    div.innerHTML = `
      <div class="warning-card-top">
        <span class="badge ${levelClass === 'danger' ? 'underweight' : levelClass === 'warning' ? 'cautious' : 'neutral'}">${alert.level}</span>
        <strong>${alert.title}</strong>
        <span class="warning-time">${alert.triggeredAgo || '触发时间待补充'}</span>
        <span class="warning-level-order">优先级 ${idx + 1}</span>
      </div>
      <div class="warning-driver">主导驱动：${alert.driver || '综合风险条件'}</div>
      <div class="warning-line"><span>条件</span><span>${alert.condition}</span></div>
      <div class="warning-line"><span>动作</span><span>${alert.action}</span></div>
    `;
    root.appendChild(div);
  });
  const rules = $('warning-rules');
  rules.innerHTML = '';
  warning.rules.forEach((rule) => {
    const div = document.createElement('div');
    div.className = 'rule-item';
    div.textContent = rule;
    rules.appendChild(div);
  });
}

async function main() {
  const [baseline, history, realtimeResult] = await Promise.all([
    fetchBaselineData(),
    fetchHistoryData(),
    fetchRealtimePayload()
  ]);

  const runtimeState = buildRuntimeState(baseline, history, realtimeResult);
  const data = runtimeState.data;
  const realtime = runtimeState.realtimePayload;
  const metadata = runtimeState.runtimeMetadata;
  const healthDashboard = runtimeState.healthDashboard || buildHealthDashboardModel(runtimeState);
  window.__GFRR_RUNTIME__ = runtimeState;
  window.__GFRR_DECISION_MODEL__ = data.decisionModel || createDecisionFallback(data, metadata);
  window.__GFRR_DECISION_SCHEMA__ = window.__GFRR_DECISION_MODEL__?.schemaMeta || buildDecisionSchemaMeta();
  window.__GFRR_STRATEGY_STATE__ = window.__GFRR_DECISION_MODEL__?.strategyState || 'Caution';
  window.__GFRR_RISK_MODE__ = window.__GFRR_DECISION_MODEL__?.riskMode || 'Deterioration';
  window.__GFRR_REPAIR_SIGNAL__ = window.__GFRR_DECISION_MODEL__?.repairSignal || 'None';
  window.__GFRR_POSITION_GUIDANCE__ = window.__GFRR_DECISION_MODEL__?.positionGuidance || buildPositionGuidanceFallback(data, metadata, window.__GFRR_STRATEGY_STATE__);
  window.__GFRR_ACTION_QUEUE__ = window.__GFRR_DECISION_MODEL__?.actionQueue || buildActionQueueFallback(data, metadata, window.__GFRR_STRATEGY_STATE__);
  window.__GFRR_TRIGGER_MONITOR__ = window.__GFRR_DECISION_MODEL__?.triggerMonitor || buildTriggerMonitorFallback(data, metadata, window.__GFRR_STRATEGY_STATE__);
  window.__GFRR_INVALIDATION_RULES__ = window.__GFRR_DECISION_MODEL__?.invalidationRules || buildInvalidationRulesFallback(data, metadata, window.__GFRR_STRATEGY_STATE__);
  window.__GFRR_HISTORICAL_REGIME__ = window.__GFRR_DECISION_MODEL__?.historicalRegime || buildHistoricalRegimeFallback(data, metadata, window.__GFRR_DECISION_MODEL__);
  window.__GFRR_DECISION_HEADER__ = buildDecisionHeaderModel(window.__GFRR_DECISION_MODEL__, data);
  console.info('GFRR decision model ready', window.__GFRR_DECISION_MODEL__);

  if (metadata.realtimeOverlayEnabled && realtime?.values) {
    renderRealtimeStrip(realtime, metadata);
    $('runtime-badge').textContent = metadata.realtimeFallbackUsed
      ? '快变量来自本地 fallback'
      : realtime.degradedMode
        ? '快变量部分降级 / 慢变量正常'
        : '快变量已实时覆盖';
  } else {
    $('runtime-badge').textContent = metadata.realtimeFetchFailed ? '当前处于基线模式 / realtime 不可用' : '当前处于基线模式';
  }
  if (!metadata.realtimeOverlayEnabled) {
    $('rt-source-mode').textContent = 'baseline only';
  }
  $('runtime-badge').textContent = metadata.realtimeStatusLabel;
  renderDecisionHeader(window.__GFRR_DECISION_HEADER__);
  renderHealthDashboard(healthDashboard);
  // Legacy display dependencies: these older overview fields remain for the
  // current page layout, but they are not part of the v26 canonical contract.
  $('overview-date').textContent = data.updatedAt.slice(0, 10);
  $('decision-line').textContent = data.decisionLine || '当前以防守型决策为主，等待更明确的宽松与增长信号。';
  $('summary-text').textContent = data.summary;
  $('global-score').textContent = data.score;
  $('macro-regime').textContent = data.currentMacroRegime;
  $('crisis-phase').textContent = data.currentCrisisPhase;
  $('confidence-level').textContent = data.confidenceLevel;
  $('trend-label').textContent = data.trendLabel;
  $('score-change-1d').textContent = fmtSignedArrow(data.scoreChange1d);
  $('score-change-7d').textContent = fmtSignedArrow(data.scoreChange7d);
  $('phase-current').textContent = data.currentCrisisPhase;
  $('phase-next').textContent = data.nextCrisisPhase;
  $('phase-transition').textContent = `${data.transitionRisk}%`;
  $('confidence-score').textContent = data.confidenceScore;
  $('confidence-level-bottom').textContent = data.confidenceLevel;
  $('degraded-mode').textContent = data.recovery.degradedMode ? '是' : '否';
  $('safe-output').textContent = data.recovery.safeOutput ? '是' : '否';
  $('last-run').textContent = data.recovery.lastRun;
  $('liquidity-score').textContent = data.liquidityIndex.score;
  $('liquidity-regime').textContent = data.liquidityIndex.regime;
  $('liquidity-change').textContent = fmtSignedArrow(data.liquidityIndex.change1d);
  $('liquidity-direction').textContent = data.liquidityIndex.directionLabel;

  $('score-change-30d').textContent = fmtSignedArrow(data.timeDimension.scoreChange30d);
  $('avg-30d').textContent = data.timeDimension.avg30d;
  $('range-30d').textContent = `${data.timeDimension.peak30d} / ${data.timeDimension.trough30d}`;
  $('draw-from-peak').textContent = fmtSignedArrow(data.timeDimension.drawFromPeak);
  $('transmission-speed').textContent = data.timeDimension.transmissionSpeed;
  $('transmission-acceleration').textContent = data.timeDimension.transmissionAcceleration;
  $('time-dominant-path').textContent = data.timeDimension.dominantPath;
  $('trend-explanation').textContent = data.timeDimension.trendExplanation;

  renderList('top-risks', data.topRisks);
  renderList('phase-signals', data.phaseSignals);
  renderList('trigger-critical', data.triggerPanel.critical);
  renderList('trigger-drivers', data.triggerPanel.drivers);
  renderList('trigger-watchlist', data.triggerPanel.watchlist);
  renderList('confidence-notes', data.confidenceNotes);
  renderList('recovery-notes', data.recovery.notes);
  renderList('liquidity-notes', data.liquidityIndex.notes);
  renderList('time-notes', data.timeDimension.notes);

  const moduleLabelMap = {
    geopolitical: '地缘政治', energy: '能源', inflation: '通胀', liquidity: '流动性', debt: '债务', banking: '银行'
  };
  renderBars('module-bars', Object.entries(data.modules).map(([key, value]) => ({
    label: moduleLabelMap[key] || key,
    value,
    delta: data.moduleTrends[key],
    mode: trendClass(data.moduleTrends[key])
  })), true);

  renderBars('regime-bars', [
    ['通缩增长', data.regimeProbabilities.disinflationaryGrowth],
    ['流动性多头', data.regimeProbabilities.liquidityBull],
    ['滞胀冲击', data.regimeProbabilities.stagflationShock],
    ['危机式流动性挤压', data.regimeProbabilities.crisisLiquiditySqueeze],
    ['货币贬值', data.regimeProbabilities.monetaryDebasement],
    ['通缩衰退', data.regimeProbabilities.deflationaryBust]
  ].map(([label, value]) => ({ label, value })));

  renderBars('liquidity-pillars', data.liquidityIndex.pillars.map((item) => ({
    label: item.label,
    value: item.value,
    delta: item.delta,
    mode: trendClass(item.delta)
  })), true);

  renderBars('path-change-bars', data.timeDimension.pathChanges.map((item) => ({
    label: item.label,
    value: item.value,
    delta: item.delta,
    mode: trendClass(item.delta)
  })), true);

  renderLineChart('trend-chart', history.slice(-7), { width: 760, height: 220, pad: { top: 18, right: 18, bottom: 34, left: 46 } });
  renderLineChart('trend-chart-30d', history, { width: 980, height: 260, pad: { top: 18, right: 18, bottom: 34, left: 46 } });
  renderHeatmap(data.heatmap);
  renderTransmission(data.transmissionChain);
  renderExecutionLock(data.tradingSystem.executionLock);
  renderSignalEngine(data.tradingSystem.signalEngine);
  renderActionLayer(data.tradingSystem.actionLayer);
  renderPositioning(data.tradingSystem.positioning);
  renderRiskControl(data.tradingSystem.riskControl);
  renderDiscipline(data.tradingSystem.discipline);
  renderWarningSystem(data.warningSystem);
  renderAssetReturnMap(data.assetReturnMap);
  renderAssetTable(data.assetMatrix);
  renderScenarioTree(data.scenarioTree);
}

main().catch((error) => {
  console.error(error);
  $('runtime-badge').textContent = '加载失败';
  renderDecisionHeader(buildDecisionHeaderModel({}, {}));
  $('summary-text').textContent = `风险数据加载失败：${error.message}`;
});
