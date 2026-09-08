import { createHash } from 'node:crypto';
import { sanitizeEpochArrCsv, EPOCH_ARR_LIMITS } from './epoch-arr-candidate.mjs';

const SCHEMA = 'epoch-arr-revision-snapshot-v1';
const SOURCE = 'epoch_ai_company_revenue_candidate';
const FIELDS = ['scope', 'metric', 'periodType', 'amounts', 'observation', 'reportDate', 'confidence', 'sourceRoles', 'sourceRefHashes'];
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const isHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const fail = () => { throw new Error('snapshot_invalid'); };
const exactKeys = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
const boundedInt = value => Number.isInteger(value) && value >= 0 && value <= EPOCH_ARR_LIMITS.rows;

// Construct only from the existing sanitizer, never by interpreting caller JSON
// as qualified revenue. The snapshot contains no raw text, URLs or amounts.
export function buildEpochArrSnapshot(csv, { asOfDate } = {}) {
  const report = sanitizeEpochArrCsv(csv, { asOfDate });
  const snapshot = {
    schemaVersion: SCHEMA, sourceKey: SOURCE, sourceAuthenticity: 'unverified', productionEligible: false,
    fileHash: report.input.sha256, totalRows: report.input.rows, excludedRows: report.input.excludedCompanyRows,
    rows: report.candidates.map(candidate => ({
      rowHash: candidate.rowHash, keyHash: candidate.sourceKeyHash, occurrences: candidate.csvRows.length,
      fields: Object.fromEntries(FIELDS.map(field => [field, hash(candidate[field])]))
    })).sort((a, b) => a.rowHash.localeCompare(b.rowHash))
  };
  return { report, snapshot };
}

// A well-formed imported receipt is still not authenticated. Strict projection
// and bounded hashes prevent it from injecting prose, URLs or production flags.
export function validateEpochArrSnapshot(input) {
  if (!exactKeys(input, ['schemaVersion', 'sourceKey', 'sourceAuthenticity', 'productionEligible', 'fileHash', 'totalRows', 'excludedRows', 'rows'])
    || input.schemaVersion !== SCHEMA || input.sourceKey !== SOURCE || input.sourceAuthenticity !== 'unverified'
    || input.productionEligible !== false || !isHash(input.fileHash) || !boundedInt(input.totalRows)
    || !boundedInt(input.excludedRows) || !Array.isArray(input.rows) || input.rows.length > EPOCH_ARR_LIMITS.rows) fail();
  const seen = new Set();
  let represented = input.excludedRows;
  for (const row of input.rows) {
    if (!exactKeys(row, ['rowHash', 'keyHash', 'occurrences', 'fields']) || !isHash(row.rowHash)
      || (row.keyHash !== null && !isHash(row.keyHash)) || !boundedInt(row.occurrences) || row.occurrences < 1
      || !exactKeys(row.fields, FIELDS) || FIELDS.some(field => !isHash(row.fields[field])) || seen.has(row.rowHash)) fail();
    seen.add(row.rowHash); represented += row.occurrences;
  }
  if (represented !== input.totalRows) fail();
  return structuredClone(input);
}

export function compareEpochArrSnapshots(previousInput, currentInput) {
  const current = validateEpochArrSnapshot(currentInput);
  const previous = previousInput === null ? null : validateEpochArrSnapshot(previousInput);
  const boundaries = { productionEligible: false, baselineUpdated: false, observationDatesRefreshed: false, snapshotAuthenticity: 'unverified' };
  if (!previous) return { status: 'baseline_required', previousFileHash: null, currentFileHash: current.fileHash, changes: [], boundaries };
  const fingerprint = snapshot => hash({ totalRows: snapshot.totalRows, excludedRows: snapshot.excludedRows,
    rows: [...snapshot.rows].sort((a, b) => a.rowHash.localeCompare(b.rowHash)).map(row => [row.rowHash, row.keyHash, row.occurrences, FIELDS.map(field => row.fields[field])]) });
  if (previous.fileHash === current.fileHash && fingerprint(previous) !== fingerprint(current)) throw new Error('snapshot_identity_conflict');
  const before = new Map(previous.rows.map(row => [row.rowHash, row]));
  const after = new Map(current.rows.map(row => [row.rowHash, row]));
  const changes = [];
  for (const [id, row] of before) {
    const next = after.get(id);
    if (!next) continue;
    // Same raw row cannot have different normalized values under this schema.
    if (row.keyHash !== next.keyHash || FIELDS.some(field => row.fields[field] !== next.fields[field])) throw new Error('snapshot_identity_conflict');
    if (row.occurrences !== next.occurrences) changes.push({ kind: 'duplicate_count_changed', beforeRowHashes: [id], afterRowHashes: [id],
      beforeOccurrences: row.occurrences, afterOccurrences: next.occurrences, fieldsChanged: [] });
  }
  const group = rows => {
    const result = new Map();
    for (const row of rows) {
      const key = row.keyHash ?? `missing:${row.rowHash}`;
      result.set(key, [...(result.get(key) || []), row]);
    }
    return result;
  };
  const oldKeys = group(previous.rows), newKeys = group(current.rows);
  for (const key of [...new Set([...oldKeys.keys(), ...newKeys.keys()])].sort()) {
    const oldGroup = oldKeys.get(key) || [], newGroup = newKeys.get(key) || [];
    const removed = oldGroup.filter(row => !after.has(row.rowHash));
    const added = newGroup.filter(row => !before.has(row.rowHash));
    if (!removed.length && !added.length) continue;
    const kind = oldGroup.length > 1 || newGroup.length > 1 ? 'ambiguous_key'
      : removed.length && added.length ? 'revision' : removed.length ? 'removed' : 'added';
    const fieldsChanged = kind === 'revision' ? FIELDS.filter(field => removed[0].fields[field] !== added[0].fields[field]) : [];
    changes.push({ kind, beforeRowHashes: removed.map(row => row.rowHash).sort(), afterRowHashes: added.map(row => row.rowHash).sort(),
      fieldsChanged, unprojectedEvidenceChanged: kind === 'revision' && fieldsChanged.length === 0 });
  }
  return {
    status: previous.fileHash === current.fileHash ? 'unchanged_file' : 'changed_review_required',
    previousFileHash: previous.fileHash, currentFileHash: current.fileHash, changes,
    unprojectedFileChange: previous.fileHash !== current.fileHash && changes.length === 0,
    identityLimit: 'descriptive_keys_unverified_rekeys_may_appear_as_added_and_removed', boundaries
  };
}
