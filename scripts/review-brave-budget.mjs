import { readFileSync } from 'node:fs';
import { BRAVE_POLICY, BRAVE_PROJECT_COUNTER_DISCLOSURE, BRAVE_DISPATCH_DEADLINE_MS, createBraveLedger, summarizeBraveLedger, activateBraveGrant } from './lib/brave-budget.mjs';

const args = process.argv.slice(2);
try {
  if (args.length === 1 && args[0] === '--plan') {
    console.log(JSON.stringify({ policy: BRAVE_POLICY, ...BRAVE_PROJECT_COUNTER_DISCLOSURE, dispatchDeadlineMs: BRAVE_DISPATCH_DEADLINE_MS, searches: 0, writes: 0, requiresInitialization: true,
      requires: ['owner_dashboard_evidence', 'verified_request_limit_and_existing_usage', 'expiry', 'exclusive_repository_key_fingerprint'],
      unknownQuota: 'hold', automaticRenewal: false, monetaryBalanceApi: false }));
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
