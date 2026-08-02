const DAY_MS = 24 * 60 * 60 * 1000;

function round(value, digits = 4) {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function safeDivide(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
}

function validPairs(observations) {
  return observations
    .map((observation) => ({
      score: Number(observation?.score),
      label: observation?.label === true || observation?.label === 1 ? 1 : 0,
      date: typeof observation?.date === 'string' ? observation.date : null
    }))
    .filter((observation) => Number.isFinite(observation.score));
}

export function computeAuRoc(observations) {
  const pairs = validPairs(observations).sort((left, right) => left.score - right.score);
  const positives = pairs.filter((pair) => pair.label === 1).length;
  const negatives = pairs.length - positives;
  if (!positives || !negatives) return null;

  let positiveRankSum = 0;
  let index = 0;
  while (index < pairs.length) {
    let end = index + 1;
    while (end < pairs.length && pairs[end].score === pairs[index].score) end += 1;
    const averageRank = ((index + 1) + end) / 2;
    for (let cursor = index; cursor < end; cursor += 1) {
      if (pairs[cursor].label === 1) positiveRankSum += averageRank;
    }
    index = end;
  }
  return round((positiveRankSum - positives * (positives + 1) / 2) / (positives * negatives), 6);
}

export function computeAveragePrecision(observations) {
  const pairs = validPairs(observations).sort((left, right) => right.score - left.score);
  const positives = pairs.filter((pair) => pair.label === 1).length;
  if (!positives) return null;

  let truePositives = 0;
  let falsePositives = 0;
  let priorRecall = 0;
  let area = 0;
  let index = 0;
  while (index < pairs.length) {
    let end = index + 1;
    while (end < pairs.length && pairs[end].score === pairs[index].score) end += 1;
    for (let cursor = index; cursor < end; cursor += 1) {
      if (pairs[cursor].label === 1) truePositives += 1;
      else falsePositives += 1;
    }
    const recall = truePositives / positives;
    const precision = truePositives / (truePositives + falsePositives);
    area += (recall - priorRecall) * precision;
    priorRecall = recall;
    index = end;
  }
  return round(area, 6);
}

export function evaluateThreshold(observations, threshold) {
  const pairs = validPairs(observations);
  let truePositive = 0;
  let trueNegative = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  for (const pair of pairs) {
    const predicted = pair.score >= threshold;
    if (predicted && pair.label) truePositive += 1;
    else if (predicted) falsePositive += 1;
    else if (pair.label) falseNegative += 1;
    else trueNegative += 1;
  }

  const dated = pairs.filter((pair) => pair.date && Number.isFinite(Date.parse(pair.date)));
  const spanYears = dated.length >= 2
    ? Math.max(1 / 52.1775, (Date.parse(dated[dated.length - 1].date) - Date.parse(dated[0].date)) / (365.25 * DAY_MS))
    : null;
  return {
    threshold,
    observations: pairs.length,
    confusion: { truePositive, trueNegative, falsePositive, falseNegative },
    recall: round(safeDivide(truePositive, truePositive + falseNegative), 6),
    specificity: round(safeDivide(trueNegative, trueNegative + falsePositive), 6),
    precision: round(safeDivide(truePositive, truePositive + falsePositive), 6),
    falsePositiveRate: round(safeDivide(falsePositive, falsePositive + trueNegative), 6),
    falseAlarmsPerYear: round(spanYears ? falsePositive / spanYears : null, 4)
  };
}

export function computeCalibrationDiagnostics(observations, binCount = 10) {
  const pairs = validPairs(observations).map((pair) => ({
    ...pair,
    probabilityDiagnostic: Math.max(0, Math.min(1, pair.score / 100))
  }));
  if (!pairs.length) return { brier: null, expectedCalibrationError: null, bins: [] };

  const bins = Array.from({ length: binCount }, (_, index) => ({
    lowerInclusive: index / binCount,
    upperInclusive: (index + 1) / binCount,
    observations: 0,
    predictionSum: 0,
    positiveCount: 0
  }));
  let squaredError = 0;
  for (const pair of pairs) {
    const binIndex = Math.min(binCount - 1, Math.floor(pair.probabilityDiagnostic * binCount));
    const bin = bins[binIndex];
    bin.observations += 1;
    bin.predictionSum += pair.probabilityDiagnostic;
    bin.positiveCount += pair.label;
    squaredError += (pair.probabilityDiagnostic - pair.label) ** 2;
  }

  let expectedCalibrationError = 0;
  const summarizedBins = bins.map((bin) => {
    const averagePrediction = safeDivide(bin.predictionSum, bin.observations);
    const observedRate = safeDivide(bin.positiveCount, bin.observations);
    if (bin.observations) {
      expectedCalibrationError += (bin.observations / pairs.length) * Math.abs(averagePrediction - observedRate);
    }
    return {
      lowerInclusive: round(bin.lowerInclusive, 2),
      upperInclusive: round(bin.upperInclusive, 2),
      observations: bin.observations,
      averagePrediction: round(averagePrediction, 6),
      observedRate: round(observedRate, 6)
    };
  });
  return {
    scoreIsProbability: false,
    interpretation: 'diagnostic_only_score_divided_by_100',
    brier: round(squaredError / pairs.length, 6),
    expectedCalibrationError: round(expectedCalibrationError, 6),
    bins: summarizedBins
  };
}

export function summarizeBinaryTask(observations, thresholds) {
  const pairs = validPairs(observations);
  const positives = pairs.filter((pair) => pair.label === 1).length;
  return {
    observations: pairs.length,
    positives,
    negatives: pairs.length - positives,
    prevalence: round(safeDivide(positives, pairs.length), 6),
    auroc: computeAuRoc(pairs),
    averagePrecision: computeAveragePrecision(pairs),
    calibrationDiagnostic: computeCalibrationDiagnostics(pairs),
    thresholds: thresholds.map((threshold) => evaluateThreshold(pairs, threshold))
  };
}

export function buildBinaryEpisodes(seriesRows) {
  const rows = seriesRows
    .map((row) => ({ date: row?.date, value: Number(row?.value) }))
    .filter((row) => typeof row.date === 'string' && Number.isFinite(Date.parse(row.date)) && Number.isFinite(row.value))
    .sort((left, right) => left.date.localeCompare(right.date));
  const episodes = [];
  let active = null;
  for (const row of rows) {
    if (row.value >= 0.5 && !active) active = { start: row.date, end: row.date };
    else if (row.value >= 0.5) active.end = row.date;
    else if (active) {
      active.end = new Date(Date.parse(row.date) - DAY_MS).toISOString().slice(0, 10);
      episodes.push(active);
      active = null;
    }
  }
  if (active) episodes.push(active);
  return episodes;
}

export function daysBetween(earlierDate, laterDate) {
  return Math.round((Date.parse(laterDate) - Date.parse(earlierDate)) / DAY_MS);
}
