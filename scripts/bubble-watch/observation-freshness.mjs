const DAY_MS = 24 * 60 * 60 * 1000;

function parseIsoDate(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new Error(`${label} must be an ISO date`);
  }
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} is invalid`);
  }
  return timestamp;
}

export function assessUnderlyingObservationFreshness({ observationDate, asOfDate, maxAgeDays }) {
  const observationTimestamp = parseIsoDate(observationDate, 'observationDate');
  const asOfTimestamp = parseIsoDate(asOfDate, 'asOfDate');
  if (!Number.isFinite(maxAgeDays) || maxAgeDays < 0) {
    throw new Error('maxAgeDays must be a non-negative number');
  }
  const ageDays = Math.floor((asOfTimestamp - observationTimestamp) / DAY_MS);
  if (ageDays < 0) throw new Error('observationDate cannot be later than asOfDate');
  return {
    observationDate,
    asOfDate,
    ageDays,
    maxAgeDays,
    status: ageDays > maxAgeDays ? 'stale' : 'fresh'
  };
}

export function requireFreshUnderlyingObservation(input) {
  const assessment = assessUnderlyingObservationFreshness(input);
  if (assessment.status === 'stale') {
    throw new Error(
      `arr_underlying_observation_stale: latest milestone ${assessment.observationDate} is ${assessment.ageDays}d old (max ${assessment.maxAgeDays}d)`
    );
  }
  return assessment;
}
