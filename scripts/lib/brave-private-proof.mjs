import { createHmac, timingSafeEqual, randomBytes, randomUUID } from 'node:crypto';
import { validateBraveLedger } from './brave-budget.mjs';
import { budgetFailure, SEARCH_REPOSITORY } from './free-search-ledger.mjs';

// This module never prints or persists private evidence. Only project accounting
// crosses the public store boundary. Storage/secret setup is a separate approval.
const fail = () => budgetFailure('brave_budget_private_proof_invalid');
const exact = (value, fields) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === fields.split(',').sort().join(',');
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(value);
const grantFields = ['id', 'verifiedAt', 'expiresAt', 'requestLimit'];
const publicGrant = grant => Object.fromEntries(grantFields.map(field => [field, grant[field]]));
const sameGrant = (publicValue, privateValue) => exact(publicValue, grantFields.join(','))
  && grantFields.every(field => publicValue[field] === privateValue[field]);
const topFields = 'schemaVersion,ledgerId,proofCommitment,recordingStartedAt,historyBeforeRecording,grants,entries,hold';
const rowFields = 'consumer,finishedAt,grantId,id,mode,requests,runId,state,time';

export function parseBravePrivateProof(value, now = Date.now()) {
  try {
    // Bound before parsing and cloning. Never echo parser errors or source text.
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    if (Buffer.byteLength(text) > 1024 * 1024) fail();
    const proof = JSON.parse(text);
    if (!exact(proof, 'schemaVersion,repository,branch,ledgerId,recordingStartedAt,commitmentNonce,grants') || proof.schemaVersion !== 'brave-private-proof-v1'
      || proof.repository !== SEARCH_REPOSITORY || proof.branch !== 'brave-usage-ledger'
      || !/^[a-f0-9]{64}$/u.test(proof.commitmentNonce || '') || !uuid(proof.ledgerId) || !Array.isArray(proof.grants) || !proof.grants.length || proof.grants.some(grant => !uuid(grant?.id))) fail();
    validateBraveLedger({ schemaVersion: 'brave-budget-v3', recordingStartedAt: proof.recordingStartedAt,
      historyBeforeRecording: 'unknown', grants: proof.grants, entries: [], hold: null }, now);
    return proof;
  } catch { fail(); }
}

const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
function commitment(proof) {
  const { commitmentNonce, ...payload } = proof;
  return createHmac('sha256', Buffer.from(commitmentNonce, 'hex'))
    .update('brave-private-proof-commitment-v1\n').update(JSON.stringify(canonical(payload))).digest('hex');
}
function matchesCommitment(value, proof) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value)
    && timingSafeEqual(Buffer.from(value, 'hex'), Buffer.from(commitment(proof), 'hex'));
}

// Offline preparation only. Never call with real evidence until its private
// storage and later project-only publication have been specifically approved.
export function prepareBravePrivateProof({ grant, recordingStartedAt, now = Date.now() }) {
  return parseBravePrivateProof({ schemaVersion: 'brave-private-proof-v1', repository: SEARCH_REPOSITORY,
    branch: 'brave-usage-ledger', ledgerId: randomUUID(), commitmentNonce: randomBytes(32).toString('hex'),
    recordingStartedAt, grants: [grant] }, now);
}

function hydrate(publicLedger, proof, now) {
  try {
    if (!exact(publicLedger, topFields) || publicLedger.schemaVersion !== 'brave-budget-v4'
      || !matchesCommitment(publicLedger.proofCommitment, proof) || publicLedger.ledgerId !== proof.ledgerId || publicLedger.recordingStartedAt !== proof.recordingStartedAt || !Array.isArray(publicLedger.grants)
      || publicLedger.grants.length !== proof.grants.length || !Array.isArray(publicLedger.entries)
      || publicLedger.grants.some((grant, index) => !sameGrant(grant, proof.grants[index]))) fail();
    const grants = structuredClone(proof.grants);
    const entries = publicLedger.entries.map(row => {
      if (!exact(row, rowFields)) fail();
      const grant = grants.find(value => value.id === row.grantId);
      if (!grant) fail();
      return { ...row, keyId: grant.keyId };
    });
    const ledger = { schemaVersion: 'brave-budget-v3', recordingStartedAt: publicLedger.recordingStartedAt,
      historyBeforeRecording: publicLedger.historyBeforeRecording, grants, entries, hold: structuredClone(publicLedger.hold) };
    return validateBraveLedger(ledger, now);
  } catch { fail(); }
}

function project(ledger, proof, now) {
  try {
    validateBraveLedger(ledger, now);
    if (ledger.schemaVersion !== 'brave-budget-v3' || ledger.recordingStartedAt !== proof.recordingStartedAt || ledger.grants.length !== proof.grants.length
      || ledger.grants.some((grant, index) => JSON.stringify(grant) !== JSON.stringify(proof.grants[index]))) fail();
    // Explicit allowlists, not object spreading or key deletion: new private
    // fields must never silently become public in a later schema revision.
    const publicLedger = { schemaVersion: 'brave-budget-v4', ledgerId: proof.ledgerId, proofCommitment: commitment(proof),
      recordingStartedAt: ledger.recordingStartedAt, historyBeforeRecording: ledger.historyBeforeRecording,
      grants: ledger.grants.map(publicGrant), entries: ledger.entries.map(row => Object.fromEntries(
        rowFields.split(',').map(field => [field, row[field]]))), hold: ledger.hold === null ? null
        : { code: ledger.hold.code, reservationId: ledger.hold.reservationId } };
    hydrate(publicLedger, proof, now);
    return publicLedger;
  } catch { fail(); }
}

export function createBravePublicProjection({ privateProof, now = Date.now() }) {
  const proof = parseBravePrivateProof(privateProof, now);
  return project({ schemaVersion: 'brave-budget-v3', recordingStartedAt: proof.recordingStartedAt, historyBeforeRecording: 'unknown',
    grants: proof.grants, entries: [], hold: null }, proof, now);
}

export function withBravePrivateProof(store, privateProof, now = Date.now) {
  // Own a cloned snapshot. Caller mutation cannot change an admitted identity.
  const proof = parseBravePrivateProof(privateProof, now());
  const reads = new WeakMap();
  return {
    async read() {
      const raw = await store.read();
      parseBravePrivateProof(proof, now());
      const snapshot = { head: raw.head, serverTime: raw.serverTime, ledger: hydrate(raw.ledger, proof, now()) };
      reads.set(snapshot, raw);
      return snapshot;
    },
    async write(previous, ledger) {
      const raw = reads.get(previous);
      if (!raw || previous.head !== raw.head || ledger.recordingStartedAt !== raw.ledger.recordingStartedAt) fail();
      const projected = project(ledger, proof, now());
      // Store only the public snapshot; never pass a private v3 object to it.
      return store.write(raw, projected);
    }
  };
}
