import { readFileSync } from 'node:fs';
import { keyFingerprint } from './lib/free-search-ledger.mjs';
import { BRAVE_POLICY, BRAVE_PROJECT_COUNTER_DISCLOSURE, BRAVE_DISPATCH_DEADLINE_MS, createBraveLedger, summarizeBraveLedger, activateBraveGrant } from './lib/brave-budget.mjs';

const args = process.argv.slice(2);
try {
  if (args.length === 1 && args[0] === '--key-fingerprints') {
    const variables = {}, combined = new Set();
    for (const name of ['BRAVE_API_KEYS', 'BRAVE_API_KEY']) {
      const keys = [...new Set(String(process.env[name] || '').split(/[\n,;]+/u).map(value => value.trim()).filter(Boolean))];
      // The CEO consumer also splits internal whitespace. Refuse ambiguous
      // configuration rather than attest a different production key set.
      if (keys.some(value => /\s/u.test(value))) throw new Error('brave_budget_key_parsing_ambiguous');
      const fingerprints = keys.map(keyFingerprint);
      variables[name] = { fingerprints, count: fingerprints.length, missing: fingerprints.length === 0 };
      for (const fingerprint of fingerprints) combined.add(fingerprint);
    }
    console.log(JSON.stringify({ operation: 'offline_key_fingerprints', variables,
      combined: { fingerprints: [...combined], count: combined.size, missing: combined.size === 0 }, searches: 0, ledgerReads: 0, writes: 0 }));
  } else if (args.length === 1 && args[0] === '--plan') {
    console.log(JSON.stringify({ policy: BRAVE_POLICY, ...BRAVE_PROJECT_COUNTER_DISCLOSURE, dispatchDeadlineMs: BRAVE_DISPATCH_DEADLINE_MS, searches: 0, writes: 0, requiresInitialization: true,
      requires: ['owner_dashboard_evidence', 'verified_request_limit_and_existing_usage', 'expiry', 'exclusive_repository_key_fingerprint'],
      sharedFreeOnly: { schemaVersion: 'brave-budget-v2', requires: ['reviewed_free_only_hard_stop_evidence_sha256', 'account_plan_key_binding', 'protection_boundary', 'dated_account_observation'], providerRemainingRequests: 'unknown', historyBeforeRecording: 'unknown' },
      unknownQuota: 'hold_except_reviewed_provider_enforced_free_only_v2', automaticRenewal: false, monetaryBalanceApi: false }));
  } else if (args.length === 3 && args[0] === '--initialize-shared' && args[1] === '--grant-file') {
    const grant = JSON.parse(readFileSync(args[2], 'utf8'));
    if (grant?.scope !== 'provider_enforced_free_only') throw new Error('brave_budget_grant_invalid');
    const store = createBraveLedger({ grant, sharedFreeOnly: true });
    if (!await store.initialize()) throw new Error('brave_budget_initialization_conflict');
    console.log(JSON.stringify({ status: 'initialized_shared_free_only', historyBeforeRecording: 'unknown', searches: 0 }));
  } else if (args[0] === '--initialize' && (args.length === 1 || (args.length === 3 && args[1] === '--grant-file'))) {
    const grant = args[2] ? JSON.parse(readFileSync(args[2], 'utf8')) : null;
    const store = createBraveLedger({ grant });
    if (!await store.initialize()) throw new Error('brave_budget_initialization_conflict');
    console.log(JSON.stringify({ status: grant ? 'initialized_with_verified_grant' : 'initialized_quota_unknown', searches: 0 }));
  } else if (args.length === 3 && args[0] === '--activate' && args[1] === '--grant-file') {
    await activateBraveGrant({ store: createBraveLedger(), grant: JSON.parse(readFileSync(args[2], 'utf8')) });
    console.log(JSON.stringify({ status: 'activated_verified_grant', searches: 0 }));
  } else if (args.length === 0) {
    const { head, ledger } = await createBraveLedger().read();
    console.log(JSON.stringify({ operation: 'read_only_verification', searches: 0, writes: 0, head, ...summarizeBraveLedger(ledger) }));
  } else throw new Error('brave_budget_arguments_invalid');
} catch (error) {
  console.error(/^brave_budget_[a-z_]+$/u.test(error?.message || '') ? error.message : 'brave_budget_review_failed');
  process.exitCode = 1;
}
