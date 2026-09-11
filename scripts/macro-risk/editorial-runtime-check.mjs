import { validateEditorialProduction } from './editorial-production.mjs';
import { isMacroRiskEditorialVisible } from '../modules/renderMacroRiskEditorial.js';
import { timestampAgeMinutes } from '../health/timestamp-policy.mjs';

// Read-only retained-snapshot inspection. Never use this for a new production
// write: applyEditorialProjection and the strict live CLI retain their gates.
export function inspectRetainedEditorial(radarData, now = new Date()) {
  const layer = radarData?.macroRiskEditorialLayer;
  if (layer === undefined || layer === null) return { ok: true, status: 'missing', errors: [] };
  const live = validateEditorialProduction(layer, radarData, now);
  if (live.ok) return { ...live, status: 'valid' };

  // Both clocks must be expired against the real inspection time. Invalid,
  // future, mixed fresh/expired clocks and all non-time defects remain errors.
  const ages = [layer?.generatedAt, layer?.output?.generatedAt]
    .map(value => timestampAgeMinutes(value, now.getTime()));
  if (!ages.every(age => age !== null && age > 30 * 60)) return { ...live, status: 'invalid' };
  const referenceTime = new Date(Math.max(Date.parse(layer.generatedAt), Date.parse(layer.output.generatedAt)));
  // Re-run every existing assertion on unchanged bytes at the later recorded
  // generation time. This is structural/history validation, not freshness proof.
  const historical = validateEditorialProduction(layer, radarData, referenceTime);
  if (!historical.ok) return { ...historical, status: 'invalid' };
  if (isMacroRiskEditorialVisible(layer, radarData, now)) {
    return { ok: false, status: 'invalid', errors: ['expired editorial must be hidden by the production frontend gate'] };
  }
  return { ok: true, status: 'expired_hidden', ageHours: Math.min(...ages) / 60, errors: [] };
}
