import {
  INSIDER_BASKET_SIZE,
  INSIDER_MIN_LIVE_SYMBOLS,
  INSIDER_PARTIAL_MIN_RATIO,
  INSIDER_PARTIAL_COVERAGE_POLICY
} from './insider-source-policy.mjs';

const ARR_UNDERLYING_STALE_PATTERN =
  /arr_underlying_observation_stale: latest milestone \d{4}-\d{2}-\d{2} is \d+d old \(max \d+d\)/u;

function uniqueSymbols(values) {
  const normalized = Array.isArray(values)
    ? values.map((value) => String(value || '').trim().toUpperCase()).filter(Boolean)
    : [];
  return normalized.length === new Set(normalized).size ? normalized : [];
}

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

export function isExpectedPolicyDegradedLiveRow(row) {
  const detail = row?.provenance?.detail || {};
  const requestedSymbols = uniqueSymbols(detail.requestedSymbols);
  const successfulSymbols = uniqueSymbols(detail.successfulSymbols);
  const missingSymbols = uniqueSymbols(detail.missingSymbols);
  const sourceSymbols = uniqueSymbols((detail.sources || []).map((source) => source?.symbol));
  const failedSymbols = uniqueSymbols((detail.sourceFailures || []).map((failure) => failure?.symbol));
  const sourceRows = Array.isArray(detail.sources) ? detail.sources : [];
  const sourceFailures = Array.isArray(detail.sourceFailures) ? detail.sourceFailures : [];
  const requestedSet = new Set(requestedSymbols);
  const coveredSet = new Set([...successfulSymbols, ...missingSymbols]);
  const buyUsd = Number(detail.buyUsd);
  const sellUsd = Number(detail.sellUsd);
  const ratio = Number(detail.ratio);
  const replayRatio = sellUsd / Math.max(buyUsd, 1e6);
  const sourceTotalsValid = sourceRows.every((source) => (
    typeof source?.buyUsd === 'number' && Number.isFinite(source.buyUsd) && source.buyUsd >= 0 &&
    typeof source?.sellUsd === 'number' && Number.isFinite(source.sellUsd) && source.sellUsd >= 0 &&
    source.buyUsd + source.sellUsd > 0
  ));
  const sourceBuyUsd = sourceRows.reduce((sum, source) => sum + Number(source?.buyUsd || 0), 0);
  const sourceSellUsd = sourceRows.reduce((sum, source) => sum + Number(source?.sellUsd || 0), 0);

  return row?.id === 'insider_sell_buy' &&
    row?.status === 'yellow' &&
    row?.value_display === '高卖压·覆盖受限' &&
    row?.stale !== true &&
    row?.provenance?.mode === 'auto' &&
    detail.coverageStatus === 'partial' &&
    detail.coverageReasonCode === 'insider_partial_live_coverage_direction_confirmed' &&
    detail.partialCoveragePolicy === INSIDER_PARTIAL_COVERAGE_POLICY &&
    Number(detail.minimumSuccessfulSymbols) === INSIDER_MIN_LIVE_SYMBOLS &&
    Number(detail.minimumPartialRatio) === INSIDER_PARTIAL_MIN_RATIO &&
    requestedSymbols.length === INSIDER_BASKET_SIZE &&
    successfulSymbols.length === INSIDER_MIN_LIVE_SYMBOLS &&
    missingSymbols.length === 1 &&
    coveredSet.size === requestedSet.size &&
    [...coveredSet].every((symbol) => requestedSet.has(symbol)) &&
    sourceSymbols.length === successfulSymbols.length &&
    sourceSymbols.every((symbol) => successfulSymbols.includes(symbol)) &&
    sourceTotalsValid &&
    Math.abs(sourceBuyUsd - buyUsd) <= 1e-6 &&
    Math.abs(sourceSellUsd - sellUsd) <= 1e-6 &&
    failedSymbols.length === missingSymbols.length &&
    failedSymbols.every((symbol) => missingSymbols.includes(symbol)) &&
    sourceFailures.every((failure) => typeof failure?.reason === 'string' && failure.reason.length > 0) &&
    Number.isFinite(buyUsd) && buyUsd >= 0 &&
    Number.isFinite(sellUsd) && sellUsd > 0 &&
    Number.isFinite(ratio) && ratio >= INSIDER_PARTIAL_MIN_RATIO &&
    Math.abs(ratio - replayRatio) <= 1e-9;
}
