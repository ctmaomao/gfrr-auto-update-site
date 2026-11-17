import { parseObservationDate } from './source-observation.mjs';

const missing = () => ({ targetLower: null, targetUpper: null, targetMid: null,
  targetUpdatedAt: null, targetRangeObservedAt: null });
const difference = (rate, target) => {
  const value = Number.isFinite(rate) && Number.isFinite(target) ? +(rate - target).toFixed(3) : null;
  return Number.isFinite(value) ? value : null;
};

function endpoint(rows, nowIso) {
  if (!Array.isArray(rows) || !rows.length) return null;
  let prior = '';
  for (const row of rows) {
    if (typeof row?.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)
      || parseObservationDate(row.date, nowIso) !== row.date || row.date <= prior
      || !Number.isFinite(row.value)) return null;
    prior = row.date;
  }
  return rows.at(-1);
}

// FRED target limits are daily 7-day series. Combine only the same observation
// day, never a newly fetched limit with the other side of an earlier decision.
export function policyTargetRange(lowerRows, upperRows, nowIso) {
  const lower = endpoint(lowerRows, nowIso);
  const upper = endpoint(upperRows, nowIso);
  if (!lower || !upper || lower.date !== upper.date || lower.value > upper.value) return missing();
  const targetMid = +((lower.value + upper.value) / 2).toFixed(3);
  if (!Number.isFinite(targetMid)) return missing();
  return { targetLower: lower.value, targetUpper: upper.value, targetMid,
    targetUpdatedAt: `${lower.date}T00:00:00Z`,
    targetRangeObservedAt: { lower: lower.date, upper: upper.date } };
}

export function cachedPolicyTargetRange(previous, nowIso) {
  if (!['live', 'fallback'].includes(previous?.sourceStatus?.targetRange)) return missing();
  const result = policyTargetRange(
    [{ date: previous.targetRangeObservedAt?.lower, value: previous.targetLower }],
    [{ date: previous.targetRangeObservedAt?.upper, value: previous.targetUpper }], nowIso);
  return result.targetMid !== null && result.targetMid === previous.targetMid
    && result.targetUpdatedAt === previous.targetUpdatedAt ? result : missing();
}

// Re-reference only derived target comparisons. Keep market quotations, original
// clocks/status, curve slopes and all non-target evidence unchanged.
export function alignPolicyTargetComparisons(policy) {
  const align = curve => ({ ...curve, contracts: (curve?.contracts || []).map(contract => ({
    ...contract, impliedMinusTargetMid: difference(contract.impliedRate, policy.targetMid),
  })) });
  return { ...policy,
    futureMinusTargetMid: difference(policy.fedFundsFutureImpliedRate, policy.targetMid),
    fedFundsFuturesCurve: align(policy.fedFundsFuturesCurve),
    sofrFuturesCurve: align(policy.sofrFuturesCurve),
    oisForwardCurve: { ...policy.oisForwardCurve,
      twoMinusTargetMid: difference(policy.oisForwardCurve?.twoYearRate, policy.targetMid) },
  };
}
