import calibration from '../../config/gdelt-score-calibration.json' with { type: 'json' };

export const GDELT_SCORING_MODEL = Object.freeze({
  version: 'gdelt-pressure-v2',
  calibrationId: calibration.id,
  comparableToLegacy: false
});
if (!(Number.isFinite(calibration.pressureScale) && calibration.pressureScale > 0)) {
  throw new Error('Invalid frozen GDELT pressure calibration');
}

export function gdeltRawPressure(summary = {}) {
  const count = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
  return count(summary.conflictEvents) * 1.4 + count(summary.sanctionsEvents) * 1.2
    + count(summary.blockadeOrChokepointEvents) * 1.8
    + (Array.isArray(summary.regionsCovered) ? summary.regionsCovered.length : 0) * 5;
}

export function scoreGdeltPressure(source) {
  if (!['ok', 'partial', 'stale'].includes(source?.status)) return 0;
  const pressure = gdeltRawPressure(source.summary);
  if (!Number.isFinite(pressure) || pressure <= 0) return 0;
  const multiplier = source.status === 'stale' ? 0.35 : source.status === 'partial' ? 0.75 : 1;
  // Frozen historical reference scale; not a probability or online refit.
  // Discount AFTER normalization so even extreme stale counts cannot cancel it.
  return Math.round((100 / (1 + calibration.pressureScale / pressure)) * multiplier);
}
