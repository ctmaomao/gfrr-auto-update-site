const HOUR_MS = 60 * 60 * 1000;
const FUTURE_TOLERANCE_HOURS = 5 / 60;

export function gdeltCacheAgeHours(timestamp, nowMs = Date.now()) {
  const observedAt = Date.parse(timestamp || '');
  const currentMs = Number(nowMs);
  if (!Number.isFinite(observedAt) || !Number.isFinite(currentMs)) return null;
  const ageHours = (currentMs - observedAt) / HOUR_MS;
  if (ageHours < -FUTURE_TOLERANCE_HOURS) return null;
  return Math.max(0, ageHours);
}
