import { timestampAgeMinutes, isFutureTimestampAge } from '../health/timestamp-policy.mjs';
// V2 migration is opt-in and no production caller enables it yet.
export const WORLD_ORDER_HISTORY_V2 = 'world-order-stress-history-v2';
const V2_INPUT = 'world-order-stress-v2';
const finiteNumberOrNull = value => Number.isFinite(Number(value)) ? Number(value) : null;
const textOrNull = value => value == null ? null : String(value).trim() || null;
const time = value => typeof value === 'string' && value.trim() && Number.isFinite(Date.parse(value));

function normalizeV1HistorySnapshot(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const score = finiteNumberOrNull(payload.score);
  const confidence = finiteNumberOrNull(payload.confidence);
  const observedAt = textOrNull(payload.updatedAt);
  const state = textOrNull(payload.state);
  const labelZh = textOrNull(payload.labelZh);
  const freshness = textOrNull(payload.freshness);
  if (score === null || score < 0 || score > 100) return null;
  if (confidence === null || confidence < 0 || confidence > 1) return null;
  if (!observedAt || Number.isNaN(Date.parse(observedAt))) return null;
  if (!state || !labelZh || !freshness) return null;
  return {
    score,
    state,
    labelZh,
    observedAt,
    confidence,
    freshness
  };
}


export function validateV2HistorySnapshot(snapshot, { nowMs = Date.now() } = {}) {
  const age = timestampAgeMinutes(snapshot?.observedAt, nowMs);
  if (!snapshot || snapshot.contractVersion !== WORLD_ORDER_HISTORY_V2
    || snapshot.status !== 'incomplete' || snapshot.score !== null || snapshot.confidence !== null
    || snapshot.state !== 'incomplete' || snapshot.labelZh !== '证据不足，暂不分档'
    || age === null || isFutureTimestampAge(age) || !time(snapshot.observedAt) || snapshot.freshness !== 'unverified'
    || !snapshot.scoreRange || !Number.isFinite(snapshot.scoreRange.lower) || !Number.isFinite(snapshot.scoreRange.upper)
    || snapshot.scoreRange.lower < 0 || snapshot.scoreRange.upper > 100
    || snapshot.scoreRange.lower > snapshot.scoreRange.upper
    || snapshot.scoreRange.kind !== 'conditional_v1_formula_outer_bound'
    || !Array.isArray(snapshot.missingReasons) || !snapshot.missingReasons.length
    || snapshot.missingReasons.some(reason => typeof reason !== 'string' || !reason.trim())
    || Object.hasOwn(snapshot, 'decisionModifier')) throw new Error('world_order_v2_history_invalid');
  if (snapshot.lastKnown !== undefined) {
    const old = snapshot.lastKnown;
    if (!old || !Number.isFinite(old.score) || old.score < 0 || old.score > 100 || !time(old.observedAt)
      || Date.parse(old.observedAt) > Date.parse(snapshot.observedAt)
      || typeof old.state !== 'string' || !old.state.trim() || old.state === 'incomplete') throw new Error('world_order_v2_last_known_invalid');
  }
  return snapshot;
}

export function normalizeWorldOrderStressHistorySnapshot(payload, { allowV2 = false, nowMs = Date.now() } = {}) {
  if (payload?.contractVersion === V2_INPUT) {
    if (!allowV2) throw new Error('world_order_v2_history_not_activated');
    // Do not let null reach the legacy Number(value) coercion or inherit state.
    const snapshot = {
      contractVersion: WORLD_ORDER_HISTORY_V2,
      status: payload.status,
      score: payload.score,
      confidence: payload.confidence,
      state: payload.state,
      labelZh: payload.labelZh,
      observedAt: payload.updatedAt,
      freshness: payload.freshness,
      scoreRange: payload.scoreRange && { ...payload.scoreRange },
      missingReasons: Array.isArray(payload.missingReasons) ? [...payload.missingReasons] : payload.missingReasons,
      ...(payload.lastKnown === undefined ? {} : { lastKnown: { ...payload.lastKnown } })
    };
    if (Object.hasOwn(payload, 'decisionModifier')) throw new Error('world_order_v2_history_invalid');
    return validateV2HistorySnapshot(snapshot, { nowMs });
  }
  if (payload && typeof payload === 'object' && Object.hasOwn(payload, 'contractVersion')) throw new Error('world_order_history_version_unknown');
  return normalizeV1HistorySnapshot(payload);
}

export function mergeWorldOrderStress(entry, worldOrderStress, previousEntry = null) {
  if (worldOrderStress) return { ...entry, worldOrderStress };
  if (previousEntry?.worldOrderStress) return { ...entry, worldOrderStress: previousEntry.worldOrderStress };
  return entry;
}
