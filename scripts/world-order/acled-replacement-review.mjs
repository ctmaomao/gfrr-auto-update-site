import { inspectPilotSnapshot } from './acled-pilot.mjs';
import { completeMonthlyWindows } from './acled-monthly-trend.mjs';
import { inspectAnnualSnapshot } from './acled-annual-collector.mjs';

// Offline artifact_sanitizer_layer. Equality is an observation, never permission
// to publish, proof of matching source definitions, or global completeness.
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).sort().join('|') === [...keys].sort().join('|');
const invalid = () => { throw new Error('reference_invalid'); };
function referenceRows(reference) {
  if (!exact(reference, ['asOfDate', 'rows'])) invalid();
  completeMonthlyWindows(reference.asOfDate);
  if (!Array.isArray(reference.rows) || !reference.rows.length || reference.rows.length > 50000) invalid();
  const rows = new Map();
  for (const row of reference.rows) {
    if (!exact(row, ['countryCode', 'month', 'events']) || typeof row.countryCode !== 'string' || !/^[A-Z]{3}$/u.test(row.countryCode)
      || typeof row.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/u.test(row.month)
      || row.month < '1997-01' || row.month >= reference.asOfDate.slice(0, 7)
      || (row.events !== null && (!Number.isSafeInteger(row.events) || row.events < 0))) invalid();
    const key = `${row.countryCode}:${row.month}`;
    if (rows.has(key)) invalid(); // Even equal duplicates require explicit upstream resolution.
    rows.set(key, row.events);
  }
  return rows;
}

export function comparePilotToReference(snapshot, reference, now) {
  const checked = inspectPilotSnapshot(snapshot, now);
  if (reference === null) return { status: 'reference_missing', matchedRows: 0 };
  const right = referenceRows(reference);
  if (reference.asOfDate !== checked.meta.asOf) return { status: 'source_date_mismatch', matchedRows: 0 };
  const months = new Set(checked.meta.months);
  // Compare the union of country keys in the selected months. Do not silently
  // discard reference-only countries or cancel opposite signed differences.
  const selected = new Map([...right].filter(([key]) => months.has(key.slice(4))));
  let missingReference = 0, missingCandidate = 0, nullRows = 0, changedRows = 0, matchedRows = 0;
  for (const [key, encoded] of checked.rows) {
    if (!selected.has(key)) { missingReference++; continue; }
    const left = JSON.parse(encoded).events, value = selected.get(key);
    if (left === null || value === null) { nullRows++; continue; }
    matchedRows++; if (left !== value) changedRows++;
  }
  for (const key of selected.keys()) if (!checked.rows.has(key)) missingCandidate++;
  return { status: missingReference || missingCandidate || nullRows || !checked.summary.observedCoverageComplete
    ? 'coverage_indeterminate' : changedRows ? 'values_differ_revision_unproven' : 'values_equal_revision_unproven',
  matchedRows, changedRows, missingReference, missingCandidate, nullRows };
}

export function reviewAcledReplacement(snapshot, reference = null, now = new Date().toISOString(), annualSnapshot = null) {
  const checked = inspectPilotSnapshot(snapshot, now);
  const latestYear = Number(checked.meta.asOf.slice(0, 4)) - 1;
  const requiredYears = Array.from({ length: 4 }, (_, i) => latestYear - 3 + i);
  const pilotCompleteYears = requiredYears.filter(year => Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
    .every(month => checked.meta.months.includes(month) && checked.countries.every(country => {
      const encoded = checked.rows.get(`${country}:${month}`);
      return encoded !== undefined && JSON.parse(encoded).events !== null;
    })));
  // Revalidate raw annual input; never trust a caller-supplied coverage receipt.
  // Keep its clock/scope separate: the historical archive cannot refresh pilot.
  const annualCoverage = annualSnapshot === null ? null : inspectAnnualSnapshot(annualSnapshot, now);
  const annualAligned = annualCoverage !== null && annualCoverage.sourceAsOf === checked.meta.asOf;
  const completeYears = annualAligned ? requiredYears.filter(y => annualCoverage.completeYears.includes(y)) : pilotCompleteYears;
  const comparison = comparePilotToReference(snapshot, reference, now);
  const metrics = ['politicalViolenceMonthly', 'politicalViolence', 'demonstrations', 'civilianTargeting', 'civilianFatalities', 'fatalities']
    .map(metric => ({ metric,
      definition: metric === 'fatalities' ? 'no_proven_mapping' : metric === 'civilianFatalities' ? 'fatality_semantics_unproven' : 'equivalence_unproven',
      temporalCoverage: metric === 'politicalViolenceMonthly' ? (checked.summary.observedCoverageComplete ? 'returned_scope_24_months' : 'incomplete')
        : metric === 'politicalViolence' ? (completeYears.length === 4 && (annualAligned || checked.summary.observedCoverageComplete) ? 'returned_scope_four_years' : 'four_year_baseline_missing') : 'category_not_collected',
      geography: 'global_scope_unproven',
      numericalComparison: metric === 'politicalViolenceMonthly' ? comparison.status : 'not_compared',
      production: 'not_connected' }));
  return { schemaVersion: 'acled-replacement-review-v1', status: 'not_ready_for_replacement', networkRequests: 0,
    productionEligible: false, sourceAsOf: checked.meta.asOf, dataFetchedAt: snapshot.fetchedAt,
    requiredYears, completeYearsInCandidate: completeYears, missingYears: requiredYears.filter(y => !completeYears.includes(y)),
    coverage: checked.summary, comparison, metrics,
    ...(annualCoverage === null ? {} : { annualCandidate: {
      status: annualAligned ? 'returned_scope_temporal_coverage_only' : 'source_date_mismatch',
      coverage: annualCoverage, numericalComparison: 'reference_missing', production: 'not_connected'
    } }),
    weekly: { status: 'not_replaceable_by_monthly_data', required: 'regional_weekly_admin_4_and_12_week_windows' } };
}
