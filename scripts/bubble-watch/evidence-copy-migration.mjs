import { evidenceAwareNote, indicatorSemanticLabels, semanticNarrativeText } from './evidence-wording.mjs';

const IDS = ['spy_vs_rsp_6m', 'cloud_rpo_growth', 'ai_ipo_pipeline', 'hy_oas'];

// Explicit offline, pure copy repair. The caller owns review, target hash and writing.
// Never rewrite an AI issue or its source digest. Quarantine it separately first.
export function repairCurrentBubbleEvidenceCopy(input) {
  if (input?.contractVersion !== 'bubble-watch-v3' || !Array.isArray(input.indicators)) throw new Error('current Bubble v3 snapshot required');
  if (input.summary?.weekly_editorial) throw new Error('active editorial must be independently quarantined before copy repair');
  for (const id of IDS) if (input.indicators.filter(row => row.id === id).length !== 1) throw new Error(`exactly one ${id} required`);
  const before = new Map(input.indicators.map(row => [row.id, row]));
  const spread = before.get('spy_vs_rsp_6m');
  const detail = spread.provenance?.detail;
  if (!Number.isFinite(detail?.spyRet) || !Number.isFinite(detail?.rspRet) || !Number.isFinite(detail?.spread)
    || Math.abs(detail.spyRet - detail.rspRet - detail.spread) > 1e-10
    || !/^[+−-]?\d+(?:\.\d+)?(?:%| 个百分点)$/u.test(spread.value_display)) throw new Error('auditable signed return difference required');
  const result = structuredClone(input);
  result.indicators = result.indicators.map(indicator => IDS.includes(indicator.id)
    ? { ...indicator, ...indicatorSemanticLabels(indicator), note: evidenceAwareNote(indicator) } : indicator);
  const after = new Map(result.indicators.map(row => [row.id, row]));
  const replaceCurrentLabels = text => semanticNarrativeText(text, input.indicators.filter(row => IDS.includes(row.id)));
  if (result.summary) {
    result.summary.verdict_desc = replaceCurrentLabels(result.summary.verdict_desc);
    for (const section of result.summary.narrative_plan?.sections || []) section.summaryZh = replaceCurrentLabels(section.summaryZh);
    for (const row of result.summary.narrative_plan?.evidenceHighlights || []) if (IDS.includes(row.id)) row.note_summary = after.get(row.id).note;
  }
  return result;
}
