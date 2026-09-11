// Operational freshness limits, not predictive-model parameters: two weekly
// releases for WALCL; one calendar week for daily structural observations.
export const STRUCTURAL_MAX_AGE_DAYS = Object.freeze({ walcl: 14, onRrp: 7, t10y2y: 7, igOas: 7 });

export const structuralValueUsable = (value, key) => Number.isFinite(value)
  && (key === 'walcl' ? value > 0 : key === 'onRrp' || key === 'igOas' ? value >= 0 : true);

export function structuralObservationUsable(date, key, now = Date.now()) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const time = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== date) return false;
  const age = (now - time) / 86400000;
  return Number.isFinite(age) && age >= 0 && age <= STRUCTURAL_MAX_AGE_DAYS[key];
}

export function requireStructuralObservation(rows, key, now = Date.now()) {
  const row = rows?.at(-1);
  if (!structuralValueUsable(row?.value, key) || !structuralObservationUsable(row?.date, key, now)) {
    throw new Error(`structural_observation_unavailable:${key}`);
  }
  return row.date;
}

// Missing evidence must not publish an apparent improvement. Abort before the
// score/source-arbitration/writer path, keeping the last snapshot and its age.
export function requireStructuralContinuity(previous, current) {
  const paths = [['fedLiquidity', 'walcl'], ['fedLiquidity', 'onRrp'],
    ['curve', 't10y2y'], ['credit', 'igOas'], ['rateVol', 'move']];
  const usable = (data, group, key) => ['live', 'fallback'].includes(data?.[group]?.sourceStatus?.[key])
    && Number.isFinite(data?.[group]?.[key]);
  const lost = paths.filter(([group, key]) => usable(previous, group, key) && !usable(current, group, key));
  for (const [group, key, derived] of [['fedLiquidity', 'walcl', 'walcl4wChange'],
    ['fedLiquidity', 'onRrp', 'onRrpWeekChange'], ['curve', 't10y2y', 't10y2yWeekChange']]) {
    // A real zero denominator is an undefined percentage, not a missing source.
    const zeroBaseline = derived === 'onRrpWeekChange' && current?.[group]?.onRrpWeekChangeStatus === 'undefined_zero_baseline'
      && current?.[group]?.onRrp >= 0;
    if (usable(previous, group, key) && Number.isFinite(previous?.[group]?.[derived])
      && usable(current, group, key) && !Number.isFinite(current?.[group]?.[derived]) && !zeroBaseline) lost.push([group, derived]);
  }
  if (lost.length || !paths.some(([group, key]) => usable(current, group, key))) {
    throw new Error(`structural_input_publication_hold:${lost.length ? lost.map(([, key]) => key).join(',') : 'all_unavailable'}`);
  }
}

export function structuralLagValue(rows, days, maxGapDays) {
  const latest = rows?.at(-1);
  const target = Date.parse(`${latest?.date}T00:00:00Z`) - days * 86400000;
  let value = null, bestGap = Infinity;
  for (const row of Array.isArray(rows) ? rows : []) {
    const gap = Math.abs(Date.parse(`${row?.date}T00:00:00Z`) - target) / 86400000;
    if (Number.isFinite(row?.value) && gap <= maxGapDays && gap < bestGap) {
      value = row.value; bestGap = gap;
    }
  }
  return value;
}
