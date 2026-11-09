import { fetchOfrSnapshot, strictOfrDate } from './ofr-pressure-readout.mjs';
import { buildPublishedOfrComponent, retireLegacyAdvice, validatePublishedOfrComponent } from './ofr-publication-contract.mjs';

// Invoked only after the existing Daily input/continuity gates pass. A provider
// failure can withhold OFR; it cannot reactivate old allocation instructions.
export async function prepareOfrPublication(data, { previous = null, fetchSnapshot = fetchOfrSnapshot, clock = () => new Date().toISOString() } = {}) {
  let result = null;
  try { result = await fetchSnapshot(); } catch { /* isolate the single source */ }
  const now = clock();
  let previousComponent = previous?.mainPressureReadout ?? null;
  if (previousComponent) {
    try { validatePublishedOfrComponent(previousComponent); } catch { previousComponent = null; }
  }
  let component;
  try {
    component = buildPublishedOfrComponent({ readout: result?.readout ?? null, rows: result?.rows ?? [], previous: previousComponent, now, retrievalError: result?.readout ? null : 'ofr_source_unavailable' });
    // A newly fetched but truncated/older file is not a new current observation.
    // Keep the last published observation with its original receipt and hash,
    // while withholding current eligibility. Same-date official revisions and
    // newer missing observations remain valid inputs to the existing contract.
    if (result?.readout && previousComponent?.index?.observedDate
      && component.index.observedDate < previousComponent.index.observedDate) {
      component = buildPublishedOfrComponent({ previous: previousComponent, now, retrievalError: 'ofr_observation_date_regressed' });
    }
  } catch {
    // Invalid new receipt/history also fails closed. No retry or new source.
    try { component = buildPublishedOfrComponent({ previous: previousComponent, now, retrievalError: 'ofr_source_contract_invalid' }); }
    catch { component = buildPublishedOfrComponent({ now, retrievalError: 'ofr_source_contract_invalid' }); }
  }
  const oldRetiredAt = previous?.advicePolicy?.mode === 'retired' ? previous.advicePolicy.retiredAt : null;
  const retiredAt = typeof oldRetiredAt === 'string' && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/.test(oldRetiredAt) && strictOfrDate(oldRetiredAt.slice(0, 10)) && Date.parse(oldRetiredAt) <= Date.parse(now) ? oldRetiredAt : now;
  return retireLegacyAdvice(data, component, { retiredAt });
}
