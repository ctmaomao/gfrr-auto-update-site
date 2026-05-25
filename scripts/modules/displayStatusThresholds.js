export const THRESHOLDS = Object.freeze({
  brent: Object.freeze({ red: 100, yellow: 80 }),
  hyOas: Object.freeze({ red: 5, yellow: 3.5 }),
  igOas: Object.freeze({ red: 1.5, yellow: 1 }),
  vix: Object.freeze({ red: 30, yellow: 20 }),
  nfci: Object.freeze({ red: 0.5, yellow: 0 }),
  dxy: Object.freeze({ red: 115, yellow: 105 }),
  us10y: Object.freeze({ red: 5, yellow: 4.25 }),
  crackSpread: Object.freeze({ red: 40, yellow: 25 }),
  creDelinquencyRate: Object.freeze({ red: 1.5, yellow: 1 }),
  initialClaims: Object.freeze({ red: 280000, yellow: 240000 }),
  geopoliticalScore: Object.freeze({ red: 70, yellow: 55 }),
  worldOrderScore: Object.freeze({ red: 80, yellow: 65, orange: 70 }),
  dimensionScore: Object.freeze({ red: 75, yellow: 55 }),
  fedPathSpreadBp: Object.freeze({ red: 50, yellow: 25, absolute: true }),
  ismManufacturingPmi: Object.freeze({ red: 45, yellow: 50, lowerIsRisk: true }),
  cartsRealYoY: Object.freeze({ red: 0, yellow: 1, lowerIsRisk: true })
});

export const STATUS_LABELS = Object.freeze({
  red: "RED",
  yellow: "YELLOW",
  green: "GREEN",
  orange: "OVERLAY",
  pending: "PENDING"
});

export function finite(value) {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function classifyByThreshold(value, key) {
  const threshold = THRESHOLDS[key];
  const numeric = finite(value);
  if (!threshold || numeric === null) return "pending";

  const comparable = threshold.absolute ? Math.abs(numeric) : numeric;
  if (threshold.lowerIsRisk) {
    if (comparable < threshold.red) return "red";
    if (comparable < threshold.yellow) return "yellow";
    return "green";
  }

  if (typeof threshold.orange === "number" && comparable >= threshold.orange) return "orange";
  if (comparable > threshold.red) return "red";
  if (comparable > threshold.yellow) return "yellow";
  return "green";
}

export function normalizeStatus(status) {
  const value = String(status || "").toLowerCase();
  if (["red", "high", "stress", "tight", "tightening"].includes(value)) return "red";
  if (["yellow", "watch", "mixed", "caution", "elevated"].includes(value)) return "yellow";
  if (["green", "normal", "stable", "low"].includes(value)) return "green";
  if (["orange", "overlay", "multi_theater_stress", "bloc_fragmentation"].includes(value)) return "orange";
  return "pending";
}

export function statusLabel(status) {
  return STATUS_LABELS[normalizeStatus(status)] || STATUS_LABELS.pending;
}
