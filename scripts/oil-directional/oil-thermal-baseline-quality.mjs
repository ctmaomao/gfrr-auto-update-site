import { OIL_THERMAL_BASELINE_TARGET_DAYS } from './oil-thermal-history-window.mjs';

export const OIL_THERMAL_BASELINE_QUALITY_ORDER = [
  'starter_short_window',
  'starter_observation_window',
  'established_observation_window'
];

export const OIL_THERMAL_BASELINE_QUALITY_POLICY = {
  starterShortWindowMaxDays: 7,
  starterObservationWindowMaxDays: OIL_THERMAL_BASELINE_TARGET_DAYS,
  qualityOrder: OIL_THERMAL_BASELINE_QUALITY_ORDER
};

export function oilThermalBaselineQualityForDays(windowDays) {
  if (!Number.isFinite(windowDays) || windowDays < 0) return null;
  if (windowDays < OIL_THERMAL_BASELINE_QUALITY_POLICY.starterShortWindowMaxDays) {
    return 'starter_short_window';
  }
  if (windowDays < OIL_THERMAL_BASELINE_QUALITY_POLICY.starterObservationWindowMaxDays) {
    return 'starter_observation_window';
  }
  return 'established_observation_window';
}

export function summarizeOilThermalFacilityWindows(facilities) {
  const rows = Array.isArray(facilities) ? facilities : [];
  const validRows = rows.filter((row) => Number.isFinite(row?.windowDays) && row.windowDays >= 0);
  const invalidFacilityIds = rows
    .filter((row) => !Number.isFinite(row?.windowDays) || row.windowDays < 0)
    .map((row) => row?.id ?? 'unknown');
  const windowDays = validRows.map((row) => row.windowDays);
  // Quality thresholds consume these numbers. Round only when displaying them,
  // never before comparing a facility window with the 7/30-day boundaries.
  const minimumFacilityWindowDays = windowDays.length > 0 ? Math.min(...windowDays) : null;
  const maximumFacilityWindowDays = windowDays.length > 0 ? Math.max(...windowDays) : null;
  const facilityIdsBelowTargetDays = validRows
    .filter((row) => row.windowDays < OIL_THERMAL_BASELINE_TARGET_DAYS)
    .map((row) => row.id);

  return {
    targetDays: OIL_THERMAL_BASELINE_TARGET_DAYS,
    facilityCount: rows.length,
    validFacilityWindowCount: validRows.length,
    complete: rows.length > 0 && validRows.length === rows.length,
    minimumFacilityWindowDays,
    maximumFacilityWindowDays,
    effectiveQualityWindowDays: minimumFacilityWindowDays,
    facilitiesMeetingTargetDays: validRows.length - facilityIdsBelowTargetDays.length,
    facilitiesBelowTargetDays: facilityIdsBelowTargetDays.length,
    facilityIdsBelowTargetDays,
    invalidFacilityIds
  };
}
