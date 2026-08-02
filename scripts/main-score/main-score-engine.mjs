export const TRANSPORT_SHOCK_SCORING_IMPACT_CONTRACT_VERSION = 'transport-shock-scoring-impact-v1';
export const TRANSPORT_SHOCK_RUNTIME_SCORING_MAX_CONTRIBUTION_PCT = 3;
export const TRANSPORT_SHOCK_RUNTIME_SCORING_STALE_AFTER_DAYS = 7;

export function clampMainScore(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function clampRange(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundMetric(value, digits = 4) {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function normalizeCalibrationPoints(points) {
  if (!Array.isArray(points)) return [];
  return points
    .map((point) => ({
      value: Number(point?.value),
      risk: Number(point?.risk),
      label: typeof point?.label === 'string' ? point.label : null
    }))
    .filter((point) => Number.isFinite(point.value) && Number.isFinite(point.risk))
    .sort((a, b) => a.value - b.value);
}

export function interpolateRiskFromCalibration(value, calibration, fallbackBase, fallbackScale) {
  const fallbackRisk = clampMainScore((value - fallbackBase) * fallbackScale);
  const points = normalizeCalibrationPoints(calibration?.points);
  if (!Number.isFinite(value) || points.length < 2) {
    return {
      value: roundMetric(value),
      risk: fallbackRisk,
      method: 'legacy_linear_fallback',
      source: calibration?.source || null,
      fallbackUsed: true
    };
  }

  let risk = null;
  let lowerPoint = points[0];
  let upperPoint = points[points.length - 1];
  if (value <= points[0].value) {
    risk = points[0].risk;
    upperPoint = points[1];
  } else if (value >= points[points.length - 1].value) {
    risk = points[points.length - 1].risk;
    lowerPoint = points[points.length - 2];
  } else {
    for (let index = 0; index < points.length - 1; index += 1) {
      const left = points[index];
      const right = points[index + 1];
      if (value >= left.value && value <= right.value) {
        const span = right.value - left.value;
        const pct = span > 0 ? (value - left.value) / span : 0;
        risk = left.risk + (right.risk - left.risk) * pct;
        lowerPoint = left;
        upperPoint = right;
        break;
      }
    }
  }

  return {
    value: roundMetric(value),
    risk: clampMainScore(risk ?? fallbackRisk),
    method: calibration?.method || 'piecewise_historical_percentile',
    source: calibration?.source || null,
    sampleStart: calibration?.sampleStart || null,
    sampleEnd: calibration?.sampleEnd || null,
    lowerPoint,
    upperPoint,
    fallbackUsed: false
  };
}

export function buildTailRiskOverlay(inputs) {
  const reasons = [];
  let floor = null;

  const considerFloor = (candidateFloor, key, labelZh, evidence) => {
    if (!Number.isFinite(candidateFloor)) return;
    reasons.push({
      key,
      labelZh,
      floor: clampMainScore(candidateFloor),
      evidence: evidence.filter(Boolean)
    });
    floor = Math.max(floor ?? 0, candidateFloor);
  };

  if (inputs.vixRisk >= 95 && inputs.hyRisk >= 55) {
    considerFloor(82, 'systemic_liquidity_credit_shock', '波动率与信用同步冲击', [
      `VIX risk ${inputs.vixRisk}`,
      `HY risk ${inputs.hyRisk}`
    ]);
  } else if (inputs.vixRisk >= 85 && (inputs.hyRisk >= 45 || inputs.baseLiquidity >= 65 || inputs.bankingRisk >= 65)) {
    considerFloor(72, 'systemic_liquidity_credit_watch', '波动率冲击向信用/流动性传导', [
      `VIX risk ${inputs.vixRisk}`,
      `HY risk ${inputs.hyRisk}`,
      `liquidity ${inputs.baseLiquidity}`,
      `banking ${inputs.bankingRisk}`
    ]);
  }

  if (inputs.oilRisk >= 85 && inputs.inflationRisk >= 60 && (inputs.vixRisk >= 45 || inputs.rateRisk >= 40 || inputs.dollarRisk >= 65)) {
    considerFloor(68, 'energy_inflation_tail', '能源与通胀尾部冲击', [
      `oil risk ${inputs.oilRisk}`,
      `inflation risk ${inputs.inflationRisk}`,
      `VIX/rates/dollar ${Math.max(inputs.vixRisk, inputs.rateRisk, inputs.dollarRisk)}`
    ]);
  }

  if ((inputs.curveInversionRisk ?? 0) >= 60 && inputs.vixRisk >= 70 && (inputs.bankingRisk >= 35 || (inputs.nimPressureRisk ?? 0) >= 70)) {
    considerFloor(66, 'banking_curve_stress', '曲线倒挂与银行压力共振', [
      `curve inversion risk ${inputs.curveInversionRisk}`,
      `VIX risk ${inputs.vixRisk}`,
      `banking risk ${inputs.bankingRisk}`
    ]);
  }

  const baseScore = clampMainScore(inputs.baseScore);
  const overlayFloor = Number.isFinite(floor) ? clampMainScore(floor) : null;
  const adjustedScore = overlayFloor === null
    ? baseScore
    : clampMainScore(Math.max(baseScore, overlayFloor));
  return {
    method: 'conditional_tail_floor_v1',
    applied: adjustedScore > baseScore,
    baseScore,
    floor: overlayFloor,
    adjustedScore,
    scoreAdd: adjustedScore - baseScore,
    reasons
  };
}

export function buildTransportShockScoringImpact(energyTransport, scoreBeforeTransport) {
  const candidate = energyTransport?.transportShockCandidate;
  const sourceStatus = energyTransport?.sourceStatus?.chokepoints || 'missing';
  const latestAgeDays = Number.isFinite(energyTransport?.latestAgeDays) ? energyTransport.latestAgeDays : null;
  const candidateScore = Number.isFinite(candidate?.score) ? candidate.score : null;
  const pressureStatus = candidate?.status === 'watch' || candidate?.status === 'elevated_watch';
  const guards = {
    candidatePresent: Boolean(candidate && typeof candidate === 'object' && !Array.isArray(candidate)),
    sourceLive: sourceStatus === 'live',
    latestFresh: Number.isFinite(latestAgeDays)
      && latestAgeDays >= 0
      && latestAgeDays <= TRANSPORT_SHOCK_RUNTIME_SCORING_STALE_AFTER_DAYS,
    eligibleForMainScore: candidate?.eligibleForMainScore === true,
    candidateScorePositive: Number.isFinite(candidateScore) && candidateScore > 0,
    pressureStatus,
    hardCapPct: TRANSPORT_SHOCK_RUNTIME_SCORING_MAX_CONTRIBUTION_PCT,
    routeFreightConfirmationConnected: false,
    marketConfirmationConnected: false
  };
  const base = Number.isFinite(scoreBeforeTransport) ? clampMainScore(scoreBeforeTransport) : null;
  const zero = (reason) => ({
    contractVersion: TRANSPORT_SHOCK_SCORING_IMPACT_CONTRACT_VERSION,
    sourcePath: 'macroDrivers.energyTransport.transportShockCandidate',
    runtimeScoringAuthorized: true,
    applied: false,
    contributionPct: 0,
    maxContributionPct: TRANSPORT_SHOCK_RUNTIME_SCORING_MAX_CONTRIBUTION_PCT,
    direction: 'transport_shock_pressure_only',
    reason,
    scoreBeforeTransport: base,
    scoreAfterTransport: base,
    sourceStatus,
    latestAgeDays,
    candidateStatus: typeof candidate?.status === 'string' ? candidate.status : null,
    candidateScore,
    guards
  });

  if (!guards.candidatePresent) return zero('candidate_missing_zero_contribution');
  if (!guards.sourceLive) return zero('candidate_not_live_zero_contribution');
  if (!guards.latestFresh) return zero('candidate_stale_zero_contribution');
  if (!guards.eligibleForMainScore) return zero('candidate_not_eligible_zero_contribution');
  if (!guards.pressureStatus) return zero('candidate_not_pressure_status_zero_contribution');
  if (!guards.candidateScorePositive) return zero('candidate_score_not_positive_zero_contribution');
  if (!Number.isFinite(base)) return zero('base_score_missing_zero_contribution');

  const rawContribution = candidateScore >= 75 ? 3 : candidateScore >= 60 ? 2 : candidateScore >= 50 ? 1 : 0;
  const requestedContributionPct = clampRange(rawContribution, 0, TRANSPORT_SHOCK_RUNTIME_SCORING_MAX_CONTRIBUTION_PCT);
  if (requestedContributionPct <= 0) return zero('candidate_score_below_contribution_threshold_zero_contribution');
  const scoreAfterTransport = clampMainScore(base + requestedContributionPct);
  const contributionPct = scoreAfterTransport - base;
  if (contributionPct <= 0) return zero('score_ceiling_zero_contribution');

  return {
    contractVersion: TRANSPORT_SHOCK_SCORING_IMPACT_CONTRACT_VERSION,
    sourcePath: 'macroDrivers.energyTransport.transportShockCandidate',
    runtimeScoringAuthorized: true,
    applied: true,
    contributionPct,
    maxContributionPct: TRANSPORT_SHOCK_RUNTIME_SCORING_MAX_CONTRIBUTION_PCT,
    direction: 'transport_shock_pressure_only',
    reason: 'owner_approved_free_proxy_transport_pressure_low_weight_applied',
    scoreBeforeTransport: base,
    scoreAfterTransport,
    sourceStatus,
    latestAgeDays,
    candidateStatus: candidate.status,
    candidateScore,
    guards
  };
}

function weightedAvailableAverage(entries) {
  let weightSum = 0;
  let valueSum = 0;
  for (const [value, weight] of entries) {
    if (Number.isFinite(value) && Number.isFinite(weight)) {
      valueSum += value * weight;
      weightSum += weight;
    }
  }
  return weightSum > 0 ? valueSum / weightSum : null;
}

export function deriveMainScoreRisk(realtimePayload, macroDrivers, rules) {
  if (!rules || typeof rules !== 'object') throw new TypeError('rules are required');
  const rt = realtimePayload || {};
  const values = rt.values || {};
  const brent = values.brent ?? rules.defaults.brent;
  const dxy = values.dxy ?? rules.defaults.dxy;
  const vix = values.vix ?? rules.defaults.vix;
  const hy = values.hyOas ?? rules.defaults.hyOas;
  const us10y = values.us10y ?? rules.defaults.us10y;
  const real10y = values.real10y ?? rules.defaults.real10y;
  const breakeven = values.breakeven10y ?? 2.3;
  const spx = values.spx ?? 5100;
  const gold = values.gold ?? 2350;

  const baselines = rules.riskBaselines;
  const oilRisk = clampMainScore((brent - baselines.brentBase) * baselines.brentScale);
  const dxyRiskCalibration = interpolateRiskFromCalibration(
    dxy,
    rules.riskCalibrations?.dxyBroadDollar,
    baselines.dxyBase,
    baselines.dxyScale
  );
  const dollarRisk = dxyRiskCalibration.risk;
  const hyRisk = clampMainScore((hy - baselines.hyBase) * baselines.hyScale);
  const vixRisk = clampMainScore((vix - baselines.vixBase) * baselines.vixScale);
  const rateRisk = clampMainScore((us10y - baselines.us10yBase) * baselines.us10yScale);
  const realRisk = clampMainScore((real10y - baselines.real10yBase) * baselines.real10yScale);
  const inflationRisk = clampMainScore(
    (breakeven - baselines.breakevenBase) * baselines.breakevenScale
      + oilRisk * baselines.oilInflationWeight
  );
  const spxRisk = clampMainScore((5300 - spx) / 6);

  const baseLiquidity = clampMainScore(
    dollarRisk * 0.35 + hyRisk * 0.35 + vixRisk * 0.18 + rateRisk * 0.12
  );
  const baseDebt = clampMainScore(realRisk * 0.45 + rateRisk * 0.3 + hyRisk * 0.25);
  const baseBanking = clampMainScore(hyRisk * 0.55 + vixRisk * 0.2 + dollarRisk * 0.25);

  const fed = macroDrivers?.fedLiquidity || {};
  const fedStatus = fed.sourceStatus || {};
  const curve = macroDrivers?.curve || {};
  const curveStatus = curve.sourceStatus || {};
  const credit = macroDrivers?.credit || {};
  const creditStatus = credit.sourceStatus || {};

  let fedAssetRisk = null;
  if (Number.isFinite(fed.walcl4wChange) && fedStatus.walcl !== 'missing') {
    fedAssetRisk = clampMainScore((-fed.walcl4wChange) * 18);
  }
  let onRrpRisk = null;
  if (Number.isFinite(fed.onRrp) && fedStatus.onRrp !== 'missing') {
    const config = rules.macroDrivers.fedLiquidity;
    if (fed.onRrp < config.onRrpCriticalThreshold) onRrpRisk = 85;
    else if (fed.onRrp < config.onRrpTightThreshold) onRrpRisk = 55;
    else if (Number.isFinite(fed.onRrpWeekChange) && fed.onRrpWeekChange <= config.onRrpWeekRapidDropPct) onRrpRisk = 45;
    else onRrpRisk = 15;
  }

  let curveInversionRisk = null;
  let curveSteepeningRisk = null;
  if (Number.isFinite(curve.t10y2y) && curveStatus.t10y2y !== 'missing') {
    curveInversionRisk = curve.t10y2y < 0
      ? clampMainScore(Math.abs(curve.t10y2y) * 80)
      : 10;
    curveSteepeningRisk = curve.steepeningAlert
      ? 80
      : clampMainScore(Number.isFinite(curve.t10y2yWeekChange) ? curve.t10y2yWeekChange * 30 : 0);
  }

  let igOasRisk = null;
  let nimPressureRisk = null;
  let reservePressure = null;
  if (Number.isFinite(credit.igOas) && creditStatus.igOas !== 'missing') {
    const config = rules.macroDrivers.credit;
    if (credit.igOas >= config.igOasCriticalThreshold) igOasRisk = 90;
    else if (credit.igOas >= config.igOasStressThreshold) igOasRisk = 70;
    else if (credit.igOas >= config.igOasWatchThreshold) igOasRisk = 45;
    else igOasRisk = 20;
  }
  if (Number.isFinite(curve.t10y2y) && curveStatus.t10y2y !== 'missing') {
    nimPressureRisk = curve.t10y2y < -0.5 ? 75 : curve.t10y2y < 0 ? 50 : 20;
  }
  if (Number.isFinite(fed.onRrp) && fedStatus.onRrp !== 'missing') {
    const config = rules.macroDrivers.fedLiquidity;
    reservePressure = fed.onRrp < config.onRrpCriticalThreshold
      ? 85
      : fed.onRrp < config.onRrpTightThreshold ? 50 : 15;
  }

  const subWeights = rules.moduleSubWeights;
  const liquidity = clampMainScore(
    weightedAvailableAverage([
      [baseLiquidity, subWeights.liquidity.baseWeight],
      [fedAssetRisk, subWeights.liquidity.fedAssetWeight],
      [onRrpRisk, subWeights.liquidity.onRrpWeight]
    ]) ?? baseLiquidity
  );
  const debt = clampMainScore(
    weightedAvailableAverage([
      [baseDebt, subWeights.debt.baseWeight],
      [curveInversionRisk, subWeights.debt.curveInversionWeight],
      [curveSteepeningRisk, subWeights.debt.curveSteepeningWeight]
    ]) ?? baseDebt
  );
  const banking = clampMainScore(
    weightedAvailableAverage([
      [baseBanking, subWeights.banking.baseWeight],
      [igOasRisk, subWeights.banking.igOasWeight],
      [nimPressureRisk, subWeights.banking.nimPressureWeight],
      [reservePressure, subWeights.banking.reservePressureWeight]
    ]) ?? baseBanking
  );

  const modules = {
    geopolitical: clampMainScore(oilRisk * 0.72 + vixRisk * 0.28),
    energy: clampMainScore(oilRisk * 0.82 + Math.max(0, rt.changes?.brent1d || 0) * 2),
    inflation: clampMainScore(inflationRisk * 0.72 + realRisk * 0.08),
    liquidity,
    debt,
    banking
  };
  const moduleWeights = rules.moduleWeights;
  const baseScore = clampMainScore(
    modules.geopolitical * moduleWeights.geopolitical
      + modules.energy * moduleWeights.energy
      + modules.inflation * moduleWeights.inflation
      + modules.liquidity * moduleWeights.liquidity
      + modules.debt * moduleWeights.debt
      + modules.banking * moduleWeights.banking
  );
  const tailRiskOverlay = buildTailRiskOverlay({
    baseScore,
    modules,
    oilRisk,
    inflationRisk,
    vixRisk,
    hyRisk,
    rateRisk,
    dollarRisk,
    baseLiquidity,
    bankingRisk: banking,
    curveInversionRisk,
    nimPressureRisk
  });
  const transportShockScoringImpact = buildTransportShockScoringImpact(
    macroDrivers?.energyTransport,
    tailRiskOverlay.adjustedScore
  );
  const score = transportShockScoringImpact.applied
    ? transportShockScoringImpact.scoreAfterTransport
    : tailRiskOverlay.adjustedScore;

  return {
    modules,
    score,
    oilRisk,
    dollarRisk,
    hyRisk,
    vixRisk,
    rateRisk,
    realRisk,
    inflationRisk,
    spxRisk,
    brent,
    dxy,
    vix,
    hy,
    us10y,
    real10y,
    breakeven,
    spx,
    gold,
    fedAssetRisk,
    onRrpRisk,
    curveInversionRisk,
    curveSteepeningRisk,
    igOasRisk,
    nimPressureRisk,
    reservePressure,
    riskCalibration: {
      dxyBroadDollar: dxyRiskCalibration
    },
    tailRiskOverlay,
    transportShockScoringImpact
  };
}
