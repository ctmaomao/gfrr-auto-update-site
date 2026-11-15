import { validatePublishedOfrComponent } from '../daily/ofr-publication-contract.mjs';

// Delivery diagnostics only. No source fetch and no changes to publication eligibility.
export function inspectPublishedOfr(data, now) {
  const component = data.mainPressureReadout;
  const result = { errors: [], sources: [] };
  // Old-model snapshots remain supported; migration markers must not hide a missing main readout.
  if (component === undefined && data.advicePolicy === undefined && data.scoreRole !== 'legacy_model_audit_only' && data.legacyModelAudit === undefined) return result;
  if (component === undefined) { result.errors.push('ofr_readout_missing'); return result; }
  try { validatePublishedOfrComponent(component); }
  catch { result.errors.push('ofr_contract_invalid'); return result; }
  const observedAt = component.index.observedDate;
  const today = Date.parse(new Date(now).toISOString().slice(0, 10));
  const ageDays = observedAt === null ? null : (today - Date.parse(observedAt)) / 86400000;
  result.sources.push({ id: 'ofr_fsi', status: component.status, observedAt,
    clockKind: 'source_observation', ageHours: ageDays === null ? null : ageDays * 24,
    ageExceeded: ageDays === null ? null : ageDays > 7,
    retrievedAt: component.source.retrievedAt, publishedAsOf: component.asOf,
    currentEligibleAtCheck: component.currentEligible && ageDays !== null && ageDays >= 0 && ageDays <= 7 });
  if (Date.parse(component.asOf) > now + 300000 || (ageDays !== null && ageDays < 0)) result.errors.push('ofr_time_future');
  const week = component.weeklyChange;
  if (week.value !== null) {
    const from = component.history.find(row => row.date === week.fromDate);
    const to = component.history.find(row => row.date === week.toDate);
    const target = new Date(Date.parse(week.toDate) - 7 * 86400000).toISOString().slice(0, 10);
    // The writer trims history using publication day, not the monitor's later clock.
    // Outside its 63-day retention window absence is unverifiable, not a contradiction.
    const publicationDay = Date.parse(component.asOf.slice(0, 10));
    const outsideRetention = date => (publicationDay - Date.parse(date)) / 86400000 > 63;
    const missingRetained = (!from && !outsideRetention(week.fromDate)) || (!to && !outsideRetention(week.toDate));
    // Even if one endpoint was trimmed, check every numeric identity still available.
    const contradiction = (to && to.value !== component.index.value) ||
      (from && (!Number.isFinite(component.index.value) || Math.abs((component.index.value - from.value) - week.value) > 1e-9));
    if (missingRetained || contradiction || week.targetDate !== target) {
      result.errors.push('ofr_weekly_history_mismatch');
      result.sources[0].weeklyHistoryStatus = 'inconsistent';
    } else {
      result.sources[0].weeklyHistoryStatus = from && to ? 'verified_internal' : 'unverifiable_retention';
    }
  }
  return result;
}
