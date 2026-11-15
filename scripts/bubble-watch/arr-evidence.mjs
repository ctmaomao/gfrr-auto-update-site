import { validateHistoricalArrObservation } from './source-observation.mjs';
import { assessUnderlyingObservationFreshness } from './observation-freshness.mjs';

// ADR-0101: a review date cannot qualify an expired revenue observation.
export const ARR_EVIDENCE_CONTRACT = 'arr-observation-eligibility-v1';
export const ARR_GAP_REASON = 'arr_current_comparable_series_unavailable';
export const ARR_MAX_AGE_DAYS = 45;
export const ARR_REJECTED_PUBLICATION_SHA256 = 'd91021987cf40ef049fc9f8abf1d00aa728586780279db13c7e01badee9c7ff9';
const LEGACY_REJECTION = 'hybrid_live source failed: arr_underlying_observation_stale: latest milestone 2026-05-28 is 166d old (max 45d)';
export function publishedArrRejectionEvidence() {
  return { kind: 'published_rejection', sourceIssueDate: '2026-11-10', sourceSnapshotSha256: ARR_REJECTED_PUBLICATION_SHA256, reason: LEGACY_REJECTION };
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const age = (date, today) => assessUnderlyingObservationFreshness({ observationDate: date, asOfDate: today, maxAgeDays: ARR_MAX_AGE_DAYS });
const STALE = /^(?:hybrid_live(?: source failed:|_source_failed:) )?arr_underlying_observation_stale: latest milestone (\d{4}-\d{2}-\d{2}) is (\d+)d old \(max (\d+)d\)$/u;

export function parseArrStaleFailure(reason, today) {
  const match = typeof reason === 'string' && reason.match(STALE);
  if (!match || Number(match[3]) !== ARR_MAX_AGE_DAYS) return null;
  try {
    const freshness = age(match[1], today);
    return freshness.status === 'stale' && freshness.ageDays === Number(match[2]) ? freshness : null;
  } catch { return null; }
}

export function buildArrGap(base, entry, today, reason, checkedAt = new Date().toISOString(), rejectionEvidence) {
  const historical = age(entry.asOfDate, today);
  const rejected = parseArrStaleFailure(reason, today);
  if (!validateHistoricalArrObservation(entry, today) || !validateRejectionEvidence(rejectionEvidence, rejected, today)
    || entry.maxAgeDays !== ARR_MAX_AGE_DAYS || historical.status !== 'stale' || !rejected
    || !Number.isFinite(Date.parse(checkedAt)) || new Date(checkedAt).toISOString().slice(0, 10) !== today) {
    throw new Error('arr_gap_evidence_invalid');
  }
  return { ...base, status: 'unknown', value_display: '待确认 · ARR 观测过期', as_of: null, stale: false,
    source_name: '公开 ARR 披露序列（合格近期观测暂缺）',
    note: `历史披露序列最新观测为 ${historical.observationDate}，距本期 ${historical.ageDays} 天，超过 ${ARR_MAX_AGE_DAYS} 天门槛，原红灯退出当前计分。自动候选最新里程碑 ${rejected.observationDate} 也已过期（${rejected.ageDays} 天）。复核或报告日期不续期；季度实际收入、预测及单个新金额不能替代同口径可重放 ARR 序列。主分下界降低源于证据退出，不代表风险改善。`,
    evidence_gap: { policy: ARR_EVIDENCE_CONTRACT, reasonCode: ARR_GAP_REASON, checkedDate: today },
    provenance: { mode: 'auto', checkedAt, detail: { contractVersion: ARR_EVIDENCE_CONTRACT,
      qualificationStatus: 'unavailable', currentEligible: false, reason: 'historical_and_live_observations_stale',
      historicalObservation: historical, historicalSourceObservation: structuredClone(entry.sourceObservation),
      rejectedLiveObservation: rejected, rejectionEvidence: structuredClone(rejectionEvidence) } } };
}

export function validateArrGap(item, today) {
  try {
    const d = item?.provenance?.detail, g = item?.evidence_gap;
    const stamp = Date.parse(item?.provenance?.checkedAt);
    return item?.id === 'arr_2nd_deriv' && item.score_role === 'core' && item.status === 'unknown'
      && item.as_of === null && item.stale === false && item.provenance.mode === 'auto'
      && Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === today
      && g?.policy === ARR_EVIDENCE_CONTRACT && g.reasonCode === ARR_GAP_REASON && g.checkedDate === today
      && d?.contractVersion === ARR_EVIDENCE_CONTRACT && d.qualificationStatus === 'unavailable'
      && d.currentEligible === false && d.reason === 'historical_and_live_observations_stale'
      && validateHistoricalArrObservation({ asOfDate: d.historicalObservation?.observationDate, maxAgeDays: ARR_MAX_AGE_DAYS, sourceObservation: d.historicalSourceObservation }, today)
      && validateRejectionEvidence(d.rejectionEvidence, d.rejectedLiveObservation, today)
      && [d.historicalObservation, d.rejectedLiveObservation].every(proof => proof?.status === 'stale'
        && same(proof, age(proof.observationDate, today)));
  } catch { return false; }
}

// Existing SaaStr four-post proxy only. Publication dates remain explicit proxy
// observation dates; new providers, forecasts and quarterly-revenue conversion are excluded.
export function replayArrLiveSeries(rows, today) {
  if (!Array.isArray(rows) || rows.length !== 4
    || !same([...rows.map(row => row.sourceId)].sort(), [315823, 322211, 323715, 325206])) throw new Error('ARR series identity is unqualified');
  const slopes = [];
  rows.forEach((row, index) => {
    age(row.date, today);
    if (!Number.isFinite(row.arrB) || row.arrB < 1 || row.arrB > 80) throw new Error('invalid ARR amount');
    if (index) {
      const prev = rows[index - 1];
      const months = (Date.parse(row.date) - Date.parse(prev.date)) / (30.4375 * 86400000);
      if (!(months > 0.5) || row.arrB <= prev.arrB) throw new Error('invalid ARR interval');
      slopes.push((row.arrB - prev.arrB) / months);
    }
  });
  return { slopeRatio: slopes.at(-1) / slopes.at(-2), freshness: age(rows.at(-1).date, today) };
}
function validateRejectionEvidence(evidence, rejected, today) {
  if (!rejected) return false;
  if (evidence?.kind === 'published_rejection') {
    // A one-time audit of the immutable quarantined r5 publication, not a newly
    // fetched or reconstructed series. It cannot be carried to a later issue.
    return today === '2026-11-10' && same(evidence, publishedArrRejectionEvidence())
      && same(rejected, parseArrStaleFailure(LEGACY_REJECTION, today));
  }
  try {
    return evidence?.kind === 'saastr_four_post_series' && evidence.source === 'SaaStr WordPress public API'
      && same(replayArrLiveSeries(evidence.milestones, today).freshness, rejected);
  } catch { return false; }
}
export function validateArrEvidenceRecord(item, today) {
  if (item?.status === 'unknown') return validateArrGap(item, today) ? [] : ['ARR gap proof does not replay'];
  try {
    const d = item?.provenance?.detail;
    if (item?.provenance?.mode !== 'auto' || d?.source !== 'SaaStr WordPress public API') return ['ARR series identity is unqualified'];
    const replay = replayArrLiveSeries(d.milestones, today), latest = d.milestones.at(-1).date;
    const proof = d.underlyingObservationFreshness;
    if (!proof || !same(proof, age(latest, proof.asOfDate)) || proof.asOfDate > today
      || proof.status !== 'fresh' || replay.freshness.status !== 'fresh' || item.as_of !== latest || item.stale !== false
      || Math.abs(replay.slopeRatio - d.slopeRatio) > 1e-9 || !Number.isFinite(d.slopeRatio)
      || item.status !== (replay.slopeRatio < 0.5 ? 'red' : replay.slopeRatio < 0.85 ? 'yellow' : 'green')) return ['ARR series/date/score does not replay'];
    return [];
  } catch { return ['ARR series evidence is malformed']; }
}

export function isExpectedArrGapFailure(failure, item, today) {
  const rejected = parseArrStaleFailure(failure?.reason, today);
  return failure?.id === 'arr_2nd_deriv' && validateArrGap(item, today) && rejected !== null
    && same(rejected, item.provenance.detail.rejectedLiveObservation);
}
