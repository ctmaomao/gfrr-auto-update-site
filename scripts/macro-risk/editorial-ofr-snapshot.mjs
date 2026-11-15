import { validateOfrPublicationIfPresent, validatePublishedOfrComponent } from '../daily/ofr-publication-contract.mjs';
import { inspectPublishedOfr } from '../lib/published-ofr-snapshots.mjs';

export function hasOfrEditorialMarkers(data) {
  return data?.mainPressureReadout !== undefined || data?.advicePolicy !== undefined || data?.scoreRole === 'legacy_model_audit_only' || data?.legacyModelAudit !== undefined;
}

export function assessOfrEditorialPublication(data, now = data?.mainPressureReadout?.asOf) {
  try {
    if (!hasOfrEditorialMarkers(data) || !validateOfrPublicationIfPresent(data)) return { ready: false, reason: 'model_contract_transition' };
    if (!Number.isFinite(Date.parse(now))) return { ready: false, reason: 'ofr_clock_invalid' };
    const inspection = inspectPublishedOfr(data, Date.parse(now));
    if (inspection.errors.length) return { ready: false, reason: inspection.errors[0] };
    return { ready: true, reason: 'ofr_publication_valid', freshness: inspection.sources[0] };
  } catch { return { ready: false, reason: 'model_contract_transition' }; }
}

const pick = (object, fields) => Object.fromEntries(fields.filter(key => Object.hasOwn(object || {}, key)).map(key => [key, object[key]]));
export function buildOfrEditorialSnapshot(data, now = data?.mainPressureReadout?.asOf) {
  const assessment = assessOfrEditorialPublication(data, now);
  if (!assessment.ready) throw new Error(`OFR editorial input: ${assessment.reason}`);
  return projectOfrEditorialSnapshot(data.mainPressureReadout);
}

export function projectOfrEditorialSnapshot(p) {
  validatePublishedOfrComponent(p);
  const snapshot = {
    ...pick(p, ['contractVersion', 'modelId', 'asOf', 'status', 'currentEligible', 'contributionsPublished']),
    source: pick(p.source, ['provider', 'sourceUrl', 'observedDate', 'retrievedAt', 'snapshotSha256', 'firstReleaseHistory', 'publicationLagNote']),
    retrieval: { ...pick(p.retrieval, ['attemptedAt', 'status', 'fallbackUsed']), error: p.retrieval.error === null ? null : 'source_retrieval_failed' },
    index: pick(p.index, ['value', 'observedDate', 'ageDays', 'freshnessMaxCalendarDays']),
    lastKnown: p.lastKnown === null ? null : pick(p.lastKnown, ['value', 'observedDate']),
    weeklyChange: pick(p.weeklyChange, ['value', 'fromDate', 'toDate', 'targetDate', 'meaning']),
    percentile: pick(p.percentile, ['value', 'method', 'years', 'minimumRows', 'startDate', 'endDateExclusive', 'historyRows', 'firstObservation', 'lastObservation', 'maxGapDays', 'lower', 'equal', 'reasons', 'meaning']),
    history: p.history.slice(-12).map(row => pick(row, ['date', 'value'])),
    boundaries: pick(p.boundaries, ['calibratedProbability', 'crisisStateAssigned', 'oldThresholdsApplied', 'tailFloorAdded', 'worldOrderAdded', 'decisionMapping', 'positionMapping', 'notInvestmentAdvice'])
  };
  validatePublishedOfrComponent(snapshot);
  return structuredClone(snapshot);
}
