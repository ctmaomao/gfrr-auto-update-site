export const INSIDER_BASKET_SIZE = 3;
export const INSIDER_MIN_LIVE_SYMBOLS = 2;
export const INSIDER_PARTIAL_MIN_RATIO = 5;
export const INSIDER_PARTIAL_COVERAGE_POLICY = 'insider-form4-partial-live-coverage-v1';

function normalizedSymbols(values) {
  return Array.isArray(values)
    ? values.map((value) => String(value || '').trim().toUpperCase()).filter(Boolean)
    : [];
}

function unusable(reasonCode, requestedSymbols, successfulSymbols = []) {
  return {
    usable: false,
    reasonCode,
    coverageStatus: 'insufficient',
    requestedSymbols,
    successfulSymbols,
    missingSymbols: requestedSymbols.filter((symbol) => !successfulSymbols.includes(symbol)),
    minimumSuccessfulSymbols: INSIDER_MIN_LIVE_SYMBOLS,
    policy: INSIDER_PARTIAL_COVERAGE_POLICY
  };
}

export function evaluateInsiderLiveCoverage({ requestedSymbols, liveRows } = {}) {
  const requested = normalizedSymbols(requestedSymbols);
  if (requested.length !== INSIDER_BASKET_SIZE || new Set(requested).size !== requested.length) {
    return unusable('insider_basket_contract_mismatch', requested);
  }

  const rows = Array.isArray(liveRows) ? liveRows : [];
  const bySymbol = new Map();
  for (const row of rows) {
    const symbol = String(row?.symbol || '').trim().toUpperCase();
    const buyUsd = Number(row?.buyUsd);
    const sellUsd = Number(row?.sellUsd);
    if (!requested.includes(symbol) || bySymbol.has(symbol)) {
      return unusable('insider_live_coverage_symbols_invalid', requested, [...bySymbol.keys()]);
    }
    if (typeof row?.buyUsd !== 'number' || !Number.isFinite(buyUsd) || buyUsd < 0 ||
      typeof row?.sellUsd !== 'number' || !Number.isFinite(sellUsd) || sellUsd < 0 ||
      buyUsd + sellUsd <= 0) {
      return unusable('insider_live_coverage_totals_invalid', requested, [...bySymbol.keys()]);
    }
    bySymbol.set(symbol, { buyUsd, sellUsd });
  }

  const successfulSymbols = requested.filter((symbol) => bySymbol.has(symbol));
  if (successfulSymbols.length < INSIDER_MIN_LIVE_SYMBOLS) {
    return unusable('insider_live_coverage_insufficient', requested, successfulSymbols);
  }

  const buyUsd = successfulSymbols.reduce((sum, symbol) => sum + bySymbol.get(symbol).buyUsd, 0);
  const sellUsd = successfulSymbols.reduce((sum, symbol) => sum + bySymbol.get(symbol).sellUsd, 0);
  const ratio = sellUsd / Math.max(buyUsd, 1e6);
  const missingSymbols = requested.filter((symbol) => !bySymbol.has(symbol));
  if (missingSymbols.length > 0 && ratio < INSIDER_PARTIAL_MIN_RATIO) {
    return {
      ...unusable('insider_partial_coverage_direction_unconfirmed', requested, successfulSymbols),
      buyUsd,
      sellUsd,
      ratio
    };
  }

  return {
    usable: true,
    reasonCode: missingSymbols.length
      ? 'insider_partial_live_coverage_direction_confirmed'
      : 'insider_full_live_coverage',
    coverageStatus: missingSymbols.length ? 'partial' : 'full',
    requestedSymbols: requested,
    successfulSymbols,
    missingSymbols,
    minimumSuccessfulSymbols: INSIDER_MIN_LIVE_SYMBOLS,
    minimumPartialRatio: INSIDER_PARTIAL_MIN_RATIO,
    policy: INSIDER_PARTIAL_COVERAGE_POLICY,
    buyUsd,
    sellUsd,
    ratio,
    publishedStatusOverride: missingSymbols.length ? 'yellow' : null,
    publishedValueOverride: missingSymbols.length ? '高卖压·覆盖受限' : null
  };
}
