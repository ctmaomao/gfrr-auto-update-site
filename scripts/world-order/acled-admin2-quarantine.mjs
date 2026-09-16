import { SCOPE, inspectScopeRows } from './acled-admin2-scope-collector.mjs';
import { pilotMetadata, pilotTime } from './acled-pilot.mjs';

// Diagnostic only. No deduplicated rows, totals, country list or promotion API.
export function reviewScopeQuarantine(value, now = new Date().toISOString()) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join('|') !== 'fetchedAt|metadataAfter|metadataBefore|sampleJson') throw new Error('quarantine_schema');
  if (pilotTime(value.fetchedAt) > pilotTime(now)) throw new Error('quarantine_clock');
  if (typeof value.metadataBefore !== 'string' || typeof value.sampleJson !== 'string'
    || (value.metadataAfter !== null && typeof value.metadataAfter !== 'string')
    || Buffer.byteLength(value.metadataBefore) + Buffer.byteLength(value.sampleJson) + Buffer.byteLength(value.metadataAfter ?? '') > SCOPE.bytes) throw new Error('quarantine_size');
  const before = pilotMetadata(value.metadataBefore, value.fetchedAt);
  let metadataFence = 'not_completed';
  if (value.metadataAfter !== null) {
    try { metadataFence = JSON.stringify(before.version) === JSON.stringify(pilotMetadata(value.metadataAfter, value.fetchedAt).version)
      ? 'matched_visible_metadata' : 'mismatch'; } catch { metadataFence = 'invalid_after'; }
  }
  const body = JSON.parse(value.sampleJson);
  if (!body || Object.keys(body).join('|') !== 'data' || !Array.isArray(body.data)
    || body.data.length > SCOPE.sampleRows) throw new Error('quarantine_rows');
  const groups = new Map(), nameGroups = new Map(); let invalidRows = 0;
  const identityPatterns = { countryConnector: 0, admin1Connector: 0, other: 0 };
  const conflictingPatterns = { countryConnector: 0, admin1Connector: 0, other: 0 };
  for (const row of body.data) {
    // Reuse unchanged strict single-row rules; invalid rows are counted, not
    // normalized into valid evidence or silently dropped from accepted data.
    try { inspectScopeRows(JSON.stringify({ data: [row] })); } catch { invalidRows++; continue; }
    const key = JSON.stringify([row.location_code, row.admin1_code, row.admin2_code]);
    const canonical = JSON.stringify(Object.fromEntries(Object.keys(row).sort().map(field => [field,
      field.startsWith('reference_period_') ? row[field].slice(0, 19) : row[field]])));
    // Exact pinned upstream connector patterns, not proof of deployed mapping.
    // All other codes stay unverified; 999/000 are not placeholder heuristics.
    const pattern = row.admin1_code === `${row.location_code}-XXX` && row.admin2_code === `${row.location_code}-XXX-XXX`
      ? 'countryConnector' : row.admin2_code === `${row.admin1_code}-XXX` ? 'admin1Connector' : 'other';
    identityPatterns[pattern]++;
    if (!groups.has(key)) groups.set(key, { count: 0, variants: new Set(), pattern });
    const group = groups.get(key); group.count++; group.variants.add(canonical);
    // Projection diagnostic only: names are not a new primary key, and cannot
    // reconstruct hidden provider names or establish disjoint event populations.
    const nameKey = JSON.stringify([key, row.admin1_name, row.admin2_name]);
    if (!nameGroups.has(nameKey)) nameGroups.set(nameKey, { count: 0, variants: new Set() });
    const named = nameGroups.get(nameKey); named.count++; named.variants.add(canonical);
  }
  let identicalDuplicateKeys = 0, conflictingDuplicateKeys = 0, duplicateRows = 0;
  for (const group of groups.values()) if (group.count > 1) {
    duplicateRows += group.count - 1;
    if (group.variants.size === 1) identicalDuplicateKeys++;
    else { conflictingDuplicateKeys++; conflictingPatterns[group.pattern]++; }
  }
  let nameKeyConflictingGroups = 0, nameKeyExtraRows = 0;
  for (const group of nameGroups.values()) {
    nameKeyExtraRows += group.count - 1;
    if (group.variants.size > 1) nameKeyConflictingGroups++;
  }
  return { schemaVersion: 'acled-admin2-quarantine-review-v1', status: 'quarantined_not_candidate',
    rawRows: body.data.length, limitHit: body.data.length === SCOPE.sampleRows, individuallyValidRows: body.data.length - invalidRows, invalidRows,
    uniqueValidKeys: groups.size, duplicateRows, identicalDuplicateKeys, conflictingDuplicateKeys,
    identityDiagnostic: { schemaVersion: 'acled-admin2-identity-diagnostic-v1', rowPatterns: identityPatterns,
      conflictingGroupPatterns: conflictingPatterns, nameKeyConflictingGroups, nameKeyExtraRows,
      deployedMappingVerified: false, databaseIdentityReconstructed: false, eventDisjointness: 'not_proven',
      deduplicationAllowed: false, aggregationAllowed: false },
    classificationScope: 'individually_valid_rows_only', crossRowIdentityConsistency: 'not_assessed',
    metadataFence, atomicSnapshotProven: false, globalCoverage: 'not_proven', productionEligible: false,
    sourceCutoverApproved: false, networkRequests: 0 };
}
