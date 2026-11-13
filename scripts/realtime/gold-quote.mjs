import { parseObservationDate } from '../daily/source-observation.mjs';
import { FUTURE_TIMESTAMP_TOLERANCE_MINUTES } from '../health/timestamp-policy.mjs';

// Gold API documents updatedAt as upstream acquisition time, NOT exchange time:
// https://gold-api.com/faqs and https://gold-api.com/llms.txt (2026-11-13).
export function goldQuoteRows(payload, nowMs = Date.now()) {
  const raw = payload?.price;
  const value = typeof raw === 'number' || (typeof raw === 'string' && raw.trim()) ? Number(raw) : NaN;
  if (!Number.isFinite(value) || value <= 0) throw new Error('gold_price_invalid');
  const timestamp = typeof payload?.updatedAt === 'string' ? payload.updatedAt.trim() : null;
  const reference = Number.isFinite(nowMs) ? new Date(nowMs + FUTURE_TIMESTAMP_TOLERANCE_MINUTES * 60000).toISOString() : null;
  if (!timestamp || !timestamp.includes('T') || !timestamp.endsWith('Z') || !parseObservationDate(timestamp, reference)) throw new Error('gold_acquisition_timestamp_invalid');
  // A single live quote is not two observations and cannot establish 1d change.
  return [{ date: timestamp, value }];
}

export function sourceTimestampAgeSeconds(timestamp, nowMs = Date.now()) {
  const time = typeof timestamp === 'string' && timestamp ? Date.parse(timestamp) : NaN;
  return Number.isFinite(time) && Number.isFinite(nowMs) ? Math.max(0, Math.round((nowMs - time) / 1000)) : null;
}
