// All monetary amounts, token counts and run IDs below are synthetic test data.
import { randomUUID } from 'node:crypto';
import { POLICY, POLICY_DIGEST, LEGACY_POLICY_DIGEST, digest } from '../../scripts/lib/deepseek-budget.mjs';
import { GRANT, VERIFICATION_GRANT, validateOneShotLedger } from '../../scripts/lib/deepseek-one-shot.mjs';
import { RECEIPT_GRANT } from '../../scripts/lib/deepseek-receipt-grant.mjs';
export const NOW = Date.parse('2026-11-12T08:00:00.000Z');
const iso = n => new Date(n).toISOString();
export const key = 'SYNTHETIC_RECEIPT_KEY';
function historic(policy, index) {
  const at = Date.parse(index ? '2026-11-11T02:00:00.000Z' : '2026-11-10T02:00:00.000Z');
  const review = { policyDigest: LEGACY_POLICY_DIGEST, verifiedAt: iso(at), expiresAt: iso(at + 86400000), evidenceSha256: digest('synthetic price') };
  const usages = index ? [[300, 30], [400, 40]] : [[100, 10], [200, 20]];
  const entries = usages.flatMap(([prompt, output], i) => {
    const id = randomUUID();
    return [{ id, kind: 'reserve', time: iso(at + i * 10000 + 1000), consumer: ['bubble-editorial', 'macro-editorial'][i], mode: 'manual',
      runId: String(index * 2 + i + 1), keyId: digest(key), requestDigest: digest(`request${index}${i}`), reservedMicroCny: POLICY.reserveMicroCny, reviewDigest: digest(review) },
    { id: randomUUID(), kind: 'outcome', time: iso(at + i * 10000 + 2000), reservationId: id, status: 'complete_unreconciled',
      requestIdDigest: digest(`response${index}${i}`), usage: { prompt_tokens: prompt, completion_tokens: output, total_tokens: prompt + output }, code: null }];
  });
  const ledger = { schemaVersion: 'deepseek-one-shot-v1', grant: { policy, authorizedAt: iso(at), authorizationEvidenceSha256: digest('synthetic authorization'), initializationParentSha: 'a'.repeat(40) }, reviews: [review], entries };
  validateOneShotLedger(ledger, NOW, policy.id);
  return { selection: policy.id, head: String(index + 1).repeat(40), genesisSha: String(index + 3).repeat(40), ledgerSha256: digest(ledger), ledger };
}
export function receiptGrantFixture() {
  const snapshot = { observedAt: iso(NOW - 1000), calendarMonth: '2026-11', projectUtcOffsetMinutes: 0, exportUtcOffsetMinutes: 780,
    coveredFrom: '2026-10-31T11:00:00.000Z', coveredThrough: '2026-11-12T11:00:00.000Z', exportSha256: digest('synthetic export'),
    accountScopeEvidenceSha256: digest('synthetic all keys evidence'), accountSpendCny: '0.12345678', historicalDebitMicroCny: 2292449, keyId: digest(key),
    quiescenceEvidenceSha256: digest('synthetic all paths attestation'), unknownRequests: 0, allProjectPathsControlled: true,
    inventorySha256: digest('synthetic inventory'), earlyCompleted: [[500,50],[600,60],[700,70],null].map((u, i) => ({ runId: String(100 + i), completedAt: '2026-11-04T06:00:00.000Z', evidenceSha256: digest(`synthetic early${i}`), status: 'completed', usage: u ? { prompt_tokens:u[0], completion_tokens:u[1], total_tokens:u[0]+u[1] } : null })),
    legacy: [historic(GRANT, 0), historic(VERIFICATION_GRANT, 1)] };
  const grant = { policy: RECEIPT_GRANT, authorizedAt: iso(NOW - 500), expiresAt: iso(NOW + 3600000), authorizationEvidenceSha256: digest('synthetic one-call approval'), initializationParentSha: 'f'.repeat(40), snapshot };
  const review = { policyDigest: POLICY_DIGEST, verifiedAt: iso(NOW), expiresAt: iso(NOW + 86400000), evidenceSha256: digest('synthetic current price') };
  return { grant, review, approvedGrantDigest: digest(grant) };
}
