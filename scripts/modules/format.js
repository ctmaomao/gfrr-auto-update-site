export function formatFiniteNumber(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : '--';
}

export function formatOnRrpYiUsd(value) {
  return Number.isFinite(value) ? `${(value * 10).toFixed(2)} 亿美元` : '--';
}
