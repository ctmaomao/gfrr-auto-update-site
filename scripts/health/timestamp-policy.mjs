export const FUTURE_TIMESTAMP_TOLERANCE_MINUTES = 5;

export function timestampAgeMinutes(value, nowMs = Date.now()) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const timestampMs = Date.parse(value);
  if (!Number.isFinite(timestampMs) || !Number.isFinite(nowMs)) return null;
  return (nowMs - timestampMs) / 60000;
}

export function isFutureTimestampAge(
  ageMinutes,
  toleranceMinutes = FUTURE_TIMESTAMP_TOLERANCE_MINUTES
) {
  return Number.isFinite(ageMinutes) && ageMinutes < -toleranceMinutes;
}
