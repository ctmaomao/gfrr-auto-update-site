// Health evaluation: cleanup watermark and follow-up scheduling are judged SEPARATELY.
//
// They are independent failure modes. A run can clean successfully while failing to schedule its
// successor, so "the watermark advanced" must never be used as evidence that scheduling is healthy.
import { HEALTH, LIMITS, bucketFor, retentionThreshold } from './constants.js';

/** Expected cleanup instant for a UTC day, in milliseconds. */
export function expectedCleanupAt(timestampMs, minuteOfDay = 10) {
  const day = bucketFor(timestampMs);
  return Date.parse(`${day}T00:00:00.000Z`) + minuteOfDay * 60 * 1000;
}

/**
 * Evaluates health from observables only.
 *
 * @param {object} input
 * @param {number} input.now                     current time in ms
 * @param {string|null} input.lastCleanedBucket  watermark, `YYYY-MM-DD`
 * @param {number|null} input.cleanupStartedAt    start marker of an in-flight run, ms
 * @param {number|null} input.alarmAt             `getAlarm()` result, ms or null
 * @param {boolean} input.readFailed              true when any observable could not be read
 */
export function evaluateHealth({
  now,
  lastCleanedBucket = null,
  cleanupStartedAt = null,
  alarmAt = null,
  readFailed = false,
  retentionDays = LIMITS.RETENTION_DAYS,
  minuteOfDay = 10,
}) {
  // A read failure is never health: it means "cannot confirm".
  if (readFailed) return { status: 'unknown', alerts: ['cannot-confirm'] };

  const alerts = [];
  const expectedAt = expectedCleanupAt(now, minuteOfDay);
  const today = bucketFor(now);
  const expectedWatermark = retentionThreshold(today, retentionDays);
  const inFlight = cleanupStartedAt !== null && cleanupStartedAt !== undefined
    && now - cleanupStartedAt <= HEALTH.IN_FLIGHT_WINDOW_MS;

  // --- Judgement 1: cleanup watermark (data expiry only) ---
  if (lastCleanedBucket === null || lastCleanedBucket === undefined) {
    alerts.push('cleanup-never-ran');
  } else {
    const ageMs = now - Date.parse(`${lastCleanedBucket}T00:00:00.000Z`);
    if (ageMs > 24 * 60 * 60 * 1000 + HEALTH.ALLOWED_DELAY_MS) {
      if (inFlight) alerts.push('cleanup-possibly-in-flight');
      else alerts.push('cleanup-watermark-stale');
    }
  }

  // --- Judgement 2: follow-up scheduling (no watermark input at all) ---
  const rescheduleDeadline = expectedAt + HEALTH.RESCHEDULE_WINDOW_MS;
  const alarmMissing = alarmAt === null || alarmAt === undefined;
  const alarmOverdue = !alarmMissing && alarmAt < now;
  if (now > rescheduleDeadline && (alarmMissing || alarmOverdue)) {
    // Distinguish "possibly still running" from "nothing is going to run it".
    if (inFlight) alerts.push('schedule-possibly-in-flight');
    else alerts.push(alarmMissing ? 'schedule-missing' : 'schedule-overdue');
  }

  // A stale start marker with no progress means the run is stuck rather than in flight.
  if (cleanupStartedAt !== null && cleanupStartedAt !== undefined
      && now - cleanupStartedAt > HEALTH.IN_FLIGHT_WINDOW_MS && !alarmMissing) {
    alerts.push('cleanup-stuck');
  }

  return { status: alerts.length === 0 ? 'healthy' : 'alert', alerts, expectedWatermark };
}
