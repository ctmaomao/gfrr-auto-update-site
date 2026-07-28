const ARR_UNDERLYING_STALE_PATTERN =
  /arr_underlying_observation_stale: latest milestone \d{4}-\d{2}-\d{2} is \d+d old \(max \d+d\)/u;

function isFreshFallbackSnapshot(row) {
  const ageDays = Number(row?.provenance?.ageDays);
  const maxAgeDays = Number(row?.provenance?.maxAgeDays);

  return row?.stale !== true &&
    typeof row?.provenance?.asOfDate === 'string' &&
    row.provenance.asOfDate.length > 0 &&
    Number.isFinite(ageDays) &&
    ageDays >= 0 &&
    Number.isFinite(maxAgeDays) &&
    maxAgeDays > 0 &&
    ageDays <= maxAgeDays;
}

export function isExpectedPolicyFallback(row) {
  return row?.id === 'arr_2nd_deriv' &&
    row?.provenance?.mode === 'auto_fallback' &&
    isFreshFallbackSnapshot(row) &&
    ARR_UNDERLYING_STALE_PATTERN.test(String(row?.provenance?.reason || ''));
}

export function isExpectedPolicyFetchFailure(failure, fallbackRow) {
  return isExpectedPolicyFallback(fallbackRow) &&
    failure?.id === fallbackRow.id &&
    ARR_UNDERLYING_STALE_PATTERN.test(String(failure?.reason || ''));
}
