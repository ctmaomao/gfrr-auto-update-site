// ADR-0101. Pure, bounded repair of a same-day r5 publication; no network or I/O.
import { createHash } from 'node:crypto';
import { buildArrGap, publishedArrRejectionEvidence } from './arr-evidence.mjs';
import { buildEnterpriseObservationProjection, validateEnterpriseObservationRecord, syncUpstreamObservation } from './source-observation.mjs';
import { summarizeEvidence, evidenceHistoryFields } from './evidence-publication.mjs';
import { computeEvidenceSimilarity } from './evidence-similarity.mjs';
import { validateEvidenceScoreFields } from './evidence-score-contract.mjs';

export const OBSERVATION_MIGRATION_IDS = Object.freeze(['arr_2nd_deriv', 'vc_ai_share', 'enterprise_deploy']);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function migrateObservationEvidence({ before, history, config, checkedAt }) {
  const today = before?.as_of_date;
  if (!Number.isFinite(Date.parse(checkedAt)) || new Date(checkedAt).toISOString().slice(0, 10) !== today
    || hash(history) !== '57a2693711ef44848c58cd8bd6e65238b3c2b69ff2b0b944e085bbcc4c15432b'
    || hash(before) !== 'd46ee9366eac41057704a188f988308a70a62ddd70281747b623a8160dcb1589'
    || before?.scoring?.model_version !== 'bubble-watch-v3-core23-shadow4-r5'
    || validateEvidenceScoreFields(before).length || before.summary?.weekly_editorial || before.summary?.previous_weekly_editorial
    || before.meta?.qualified_refresh || !Array.isArray(history?.entries)
    || history.entries.at(-1)?.scoring_model_version !== before.scoring.model_version
    || history.entries.at(-1)?.date !== today) throw new Error('observation_migration_baseline_invalid');
  const after = structuredClone(before);
  after.generated_at = checkedAt;
  after.indicators = before.indicators.map(item => {
    if (!OBSERVATION_MIGRATION_IDS.includes(item.id)) return structuredClone(item);
    const entry = config.curated[item.id];
    if (item.id === 'arr_2nd_deriv') {
      return buildArrGap(item, entry, today, item.provenance.reason, checkedAt, publishedArrRejectionEvidence());
    }
    if (item.id === 'enterprise_deploy') {
      const p = buildEnterpriseObservationProjection(entry, today);
      if (!p.ok) throw new Error(`enterprise_migration_${p.reason}`);
      const card = { ...item, name_en: p.name_en, name_zh: p.name_zh, threshold_text: p.threshold_text,
        source_name: p.source_name, status: p.status, value_display: p.value_display, note: p.note,
        as_of: p.asOfDate, stale: false, provenance: { mode: 'curated', asOfDate: p.asOfDate,
          ageDays: p.ageDays, maxAgeDays: p.maxAgeDays, reviewAsOfDate: entry.reviewAsOfDate,
          reportAsOfDate: entry.reportAsOfDate, detail: p.detail } };
      if (!validateEnterpriseObservationRecord(card, today)) throw new Error('enterprise_migration_proof_invalid');
      return card;
    }
    const e = entry.sourceObservation;
    const evaluated = syncUpstreamObservation({ id: item.id, entry,
      upstreamIndicator: { id: item.id, as_of: entry.asOfDate, basis: e.basis, source_url: e.sourceUrl,
        value: Math.round(e.aiFundingUsdB / e.totalFundingUsdB * 1000) / 10 },
      reportDate: entry.reportAsOfDate, today });
    if (!evaluated.accepted || evaluated.ageDays > entry.maxAgeDays) throw new Error('vc_migration_proof_invalid');
    return { ...item, status: evaluated.entry.status, value_display: evaluated.entry.value_display,
      note: evaluated.entry.note, as_of: entry.asOfDate, stale: false,
      provenance: { ...item.provenance, asOfDate: entry.asOfDate, ageDays: evaluated.ageDays,
        reviewAsOfDate: entry.reviewAsOfDate, reportAsOfDate: entry.reportAsOfDate,
        detail: { sourceObservation: structuredClone(e) } } };
  });
  const result = summarizeEvidence(after.indicators, today, null, { revision: 6,
    promotionPolicy: before.scoring.shadow_promotion_policy,
    similarity: computeEvidenceSimilarity(after.indicators, 6) });
  after.summary = result.summary;
  after.scoring = result.scoring;
  after.history_seed = [];
  after.wow_changes = [{ type: 'flat', note: '本期修正观测日期与调查口径，ARR 过期后退出当前灯色；区间下界变化不代表市场风险改善，不作跨模型周差比较。' }];
  // Preserve original collection timestamps and failures. checkedAt is an audit
  // of existing evidence, never a claim that unchanged sources were fetched again.
  const meta = after.meta;
  meta.observation_migration = { contractVersion: 'bubble-observation-migration-r6', checkedAt,
    sourceModelVersion: before.scoring.model_version, sourceGeneratedAt: before.generated_at,
    sourceSnapshotDigest: hash(before), changedIndicatorIds: [...OBSERVATION_MIGRATION_IDS],
    preservedObservationCount: 24, networkCalls: 0, paidCalls: 0 };
  for (const [mode, field] of [['auto', 'auto_count'], ['curated', 'curated_count'], ['auto_fallback', 'fallback_count']]) {
    meta[field] = after.indicators.filter(item => item.provenance.mode === mode).length;
  }
  for (const prefix of ['proxy_confidence', 'template_compatibility']) {
    meta[`${prefix}_calibrations`] = meta[`${prefix}_calibrations`].filter(row => row.id !== 'enterprise_deploy');
    meta[`${prefix}_calibration_count`] = meta[`${prefix}_calibrations`].length;
  }
  meta.source_candidates.hybrid_live_ids = meta.source_candidates.hybrid_live_ids.filter(id => id !== 'enterprise_deploy');
  meta.source_candidates.reviewed_curated_ids = ['enterprise_deploy'];
  const s = after.summary;
  const row = { date: today, week: today.slice(5), issue_number: before.issue_number,
    red_pct: s.red_pct, risk_score: s.weighted_risk_score, scoring_model_version: after.scoring.model_version,
    core_red_pct: s.red_pct, core_risk_score: s.weighted_risk_score,
    display_red_pct: s.display_red_pct, display_risk_score: s.display_weighted_risk_score,
    stage_score: s.stage_score, trigger_score: s.trigger_score,
    statuses: Object.fromEntries(after.indicators.map(item => [item.id, item.status])),
    ...evidenceHistoryFields(after.indicators, result.replay) };
  const nextHistory = { ...structuredClone(history), entries: [...structuredClone(history.entries), row] };
  if (validateEvidenceScoreFields(after).length
    || before.indicators.filter(item => !OBSERVATION_MIGRATION_IDS.includes(item.id))
      .some(item => !same(item, after.indicators.find(next => next.id === item.id)))
    || !same(nextHistory.entries.slice(0, -1), history.entries)) throw new Error('observation_migration_integrity_failure');
  return { after, history: nextHistory };
}
