import { validateEditorialProduction } from './editorial-production.mjs';
import { isMacroRiskEditorialPreviousIssueVisible } from '../modules/renderMacroRiskEditorial.js';

// ADR-0046: history validation is never freshness proof or a new AI projection.
// Replay all envelope assertions against the immutable issue's original clocks.
export function validateEditorialPreviousIssue(layer, radarData, now = new Date()) {
  if (!isMacroRiskEditorialPreviousIssueVisible(layer, radarData, now)) {
    return { ok: false, errors: ['previous editorial issue has invalid origin, clocks or display boundaries'] };
  }
  const recordedTime = new Date(Math.max(Date.parse(layer.generatedAt), Date.parse(layer.output.generatedAt)));
  return validateEditorialProduction(layer, { updatedAt: layer.sourceDataUpdatedAt }, recordedTime);
}

// Called only with the previous production radar snapshot, never a manual
// artifact. Keep one latest qualified issue; skipped/failed refreshes do not
// erase it or refresh its dates. No scoring fields or current-layer writes.
export function preserveEditorialPreviousIssue(next, previous, now = new Date()) {
  const candidates = [previous?.macroRiskEditorialPreviousIssue];
  if (previous?.macroRiskEditorialLayer?.sourceDataUpdatedAt === previous?.updatedAt) {
    candidates.push(previous?.macroRiskEditorialLayer);
  }
  const qualified = candidates.filter(layer => validateEditorialPreviousIssue(layer, next, now).ok);
  qualified.sort((a, b) => Date.parse(b.sourceDataUpdatedAt) - Date.parse(a.sourceDataUpdatedAt)
    || Date.parse(b.generatedAt) - Date.parse(a.generatedAt));
  if (qualified.length) next.macroRiskEditorialPreviousIssue = structuredClone(qualified[0]);
  else delete next.macroRiskEditorialPreviousIssue;
  return { preserved: qualified.length > 0, generatedAt: qualified[0]?.generatedAt ?? null };
}
