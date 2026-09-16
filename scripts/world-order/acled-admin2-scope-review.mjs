import { inspectAnnualSnapshot } from './acled-annual-collector.mjs';
import { inspectAdmin2Snapshot } from './acled-admin2-collector.mjs';
import { inspectScopeSnapshot } from './acled-admin2-scope-collector.mjs';
import { pilotMetadata } from './acled-pilot.mjs';
import { REFERENCE_LOCATIONS } from './acled-geography-review.mjs';

export function validateScopeBaselines(baselines, now) {
  inspectAnnualSnapshot(baselines?.annual, now);
  inspectAdmin2Snapshot(baselines?.afg, now);
}
const version = snapshot => JSON.stringify(pilotMetadata(snapshot.metadataBefore, snapshot.fetchedAt).version);
const rowKey = row => JSON.stringify([row.location_code, row.admin1_code, row.admin2_code]);
const rowValue = row => JSON.stringify(Object.fromEntries(Object.keys(row).sort().map(key => [key,
  key.startsWith('reference_period_') ? row[key].slice(0, 19) : row[key]])));

export function compareScopeBaselines(snapshot, baselines, now) {
  validateScopeBaselines(baselines, now);
  const coverage = inspectScopeSnapshot(snapshot, now), current = JSON.parse(snapshot.sampleJson).data;
  const countries = coverage.returnedCountryCodes;
  const sameAnnual = version(snapshot) === version(baselines.annual);
  const sameAfg = version(snapshot) === version(baselines.afg);
  const admin0 = new Set(baselines.annual.partitions.flatMap(part => JSON.parse(part).data)
    .filter(row => row.reference_period_start.slice(0, 7) === '2025-01').map(row => row.location_code));
  const old = new Map(JSON.parse(baselines.afg.sampleJson).data.map(row => [rowKey(row), rowValue(row)]));
  const fresh = new Map(current.filter(row => row.location_code === 'AFG').map(row => [rowKey(row), rowValue(row)]));
  const added = [...fresh.keys()].filter(key => !old.has(key)).length;
  const removed = [...old.keys()].filter(key => !fresh.has(key)).length;
  const changed = [...old.keys()].filter(key => fresh.has(key) && old.get(key) !== fresh.get(key)).length;
  return { referenceLocations: { scope: 'bounded_reference_subset_not_global_universe',
    returned: REFERENCE_LOCATIONS.filter(code => countries.includes(code)),
    notReturned: REFERENCE_LOCATIONS.filter(code => !countries.includes(code)), absenceMeaning: 'not_proven' },
  crossLayer: { status: sameAnnual ? 'same_version_country_month_keys_compared' : 'indeterminate_version_mismatch',
    ...(sameAnnual ? { commonCountryCodes: countries.filter(code => admin0.has(code)) } : {}),
    eventDuplication: 'not_tested', mutualExclusivity: 'not_proven', aggregation: 'not_authorized' },
  afg: { status: !sameAfg ? 'indeterminate_version_mismatch' : added || removed || changed ? 'same_version_conflict' : 'same_version_rows_equal',
    ...(sameAfg ? { added, removed, changed } : {}) },
  globalCoverage: 'not_proven', productionEligible: false };
}
