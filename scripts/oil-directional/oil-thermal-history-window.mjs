export const OIL_THERMAL_HISTORY_OPTION_MAX = 500;
export const OIL_THERMAL_BASELINE_DEFAULT_MAX_COMMITS = 240;
export const OIL_THERMAL_BASELINE_DEFAULT_MAX_SAMPLES = 240;
export const OIL_THERMAL_BASELINE_TARGET_DAYS = 30;

export const OIL_THERMAL_HISTORY_WINDOW_BOUNDARY =
  'history-window capacity only; preserves health gates and manual promotion; does not change production data, values, scoring, decision, execution, position, Brent promotion, ODP finalBias, Global Risk Heatmap, or cross-validation';

export function validateOilThermalHistoryWindow(maxCommits, maxSamples) {
  if (
    !Number.isInteger(maxCommits) ||
    maxCommits < 1 ||
    maxCommits > OIL_THERMAL_HISTORY_OPTION_MAX
  ) {
    throw new Error(
      `Invalid --max-commits. Expected integer 1..${OIL_THERMAL_HISTORY_OPTION_MAX}.`
    );
  }
  if (
    !Number.isInteger(maxSamples) ||
    maxSamples < 1 ||
    maxSamples > OIL_THERMAL_HISTORY_OPTION_MAX
  ) {
    throw new Error(
      `Invalid --max-samples. Expected integer 1..${OIL_THERMAL_HISTORY_OPTION_MAX}.`
    );
  }
}
