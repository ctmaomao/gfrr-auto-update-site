function quantile(sortedValues, probability) {
  if (!sortedValues.length || !Number.isFinite(probability)) return null;
  const bounded = Math.max(0, Math.min(1, probability));
  const position = (sortedValues.length - 1) * bounded;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sortedValues[lowerIndex];
  const upper = sortedValues[upperIndex];
  return lower + (upper - lower) * (position - lowerIndex);
}

export function buildCausalDxyCalibration(rows, asOfDate, config) {
  const eligible = (Array.isArray(rows) ? rows : [])
    .filter((row) => row?.date <= asOfDate && Number.isFinite(Number(row?.value)))
    .map((row) => ({ date: row.date, value: Number(row.value) }));
  const minimumObservations = Number(config?.minimumObservations) || 252;
  const sampleStart = eligible[0]?.date ?? null;
  const sampleEnd = eligible[eligible.length - 1]?.date ?? null;
  if (eligible.length < minimumObservations) {
    return {
      calibration: {
        source: 'FRED:DTWEXBGS',
        method: config?.insufficientHistoryMode || 'legacy_linear_fallback',
        sampleStart,
        sampleEnd,
        points: []
      },
      audit: {
        asOfDate,
        observations: eligible.length,
        minimumObservations,
        sufficientHistory: false,
        futureRowsUsed: 0
      }
    };
  }

  const sortedValues = eligible.map((row) => row.value).sort((left, right) => left - right);
  const points = [config?.legacyFloor, ...(config?.quantileRiskMap || []).map((item) => ({
    value: quantile(sortedValues, Number(item.quantile)),
    risk: Number(item.risk),
    label: item.label
  }))]
    .filter((point) => Number.isFinite(Number(point?.value)) && Number.isFinite(Number(point?.risk)))
    .map((point) => ({ value: Number(point.value), risk: Number(point.risk), label: point.label }));
  return {
    calibration: {
      source: 'FRED:DTWEXBGS',
      method: config?.method || 'expanding_percentile_as_of_each_observation_v1',
      sampleStart,
      sampleEnd,
      points
    },
    audit: {
      asOfDate,
      observations: eligible.length,
      minimumObservations,
      sufficientHistory: true,
      futureRowsUsed: 0
    }
  };
}
