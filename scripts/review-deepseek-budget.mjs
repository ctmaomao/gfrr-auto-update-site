import fs from 'node:fs';
import { GRANT, ONE_SHOT_BRANCH, prepareOneShotLedger, verifyOneShotStatus, oneShotRuntimeConfig } from './lib/deepseek-one-shot.mjs';
import { createGithubLedger, POLICY, POLICY_DIGEST, prepareBootstrapLedger, verifyBudgetStatus } from './lib/deepseek-budget.mjs';

// Read-only by default. This CLI never initializes a ledger, changes a price
// review, reads a provider key, calls DeepSeek, or sends a generation request.
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--one-shot-plan') {
    console.log(JSON.stringify({ operation: 'offline_plan', providerCalls: 0, writes: 0,
      grant: GRANT, branch: ONE_SHOT_BRANCH, requires: ['independently approved grant digest',
        'create-only pinned genesis with no existing ledger', 'current independently reviewed exact price digest',
        'explicit first-attempt workflow_dispatch on main', 'unchanged free-search and production gates'] }, null, 2));
    return;
  }
  if (args.length === 4 && args[0] === '--prepare-one-shot' && args[2] === '--approved-grant-digest') {
    const prepared = JSON.parse(fs.readFileSync(args[1], 'utf8'));
    const ledger = prepareOneShotLedger({ ...prepared, approvedGrantDigest: args[3] });
    console.log(JSON.stringify({ operation: 'offline_one_shot_plan', providerCalls: 0, writes: 0, ledger }, null, 2));
    return;
  }
  if (args.length === 1 && args[0] === '--plan') {
    console.log(JSON.stringify({ operation: 'offline_plan', providerCalls: 0, writes: 0,
      policy: POLICY, policyDigest: POLICY_DIGEST,
      requires: ['reviewed historical bootstrap', 'pinned genesis SHA', 'current reviewed price digest', 'CNY account verified at paid admission'],
      limitation: 'A snapshot is not a reservation; runtime reserves atomically before every paid request.' }, null, 2));
    return;
  }
  if (args.length === 4 && args[0] === '--prepare-bootstrap' && args[2] === '--approved-record-digest') {
    const prepared = JSON.parse(fs.readFileSync(args[1], 'utf8'));
    const ledger = prepareBootstrapLedger({ ...prepared, approvedRecordDigest: args[3] });
    console.log(JSON.stringify({ operation: 'offline_bootstrap_plan', providerCalls: 0, writes: 0, ledger }, null, 2));
    return;
  }
  const requireEligible = args.length === 1 && args[0] === '--require-eligible';
  if (args.length && !requireEligible) throw new Error('unsupported_budget_argument');
  if (process.env.DEEPSEEK_BUDGET_SELECTION && process.env.DEEPSEEK_BUDGET_SELECTION !== 'monthly') {
    const result = await verifyOneShotStatus(oneShotRuntimeConfig());
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const result = await verifyBudgetStatus({
    store: createGithubLedger({ token: process.env.DEEPSEEK_BUDGET_GITHUB_TOKEN, genesisSha: process.env.DEEPSEEK_BUDGET_GENESIS_SHA }),
    approvedReviewDigest: process.env.DEEPSEEK_BUDGET_PRICE_REVIEW_SHA256
  });
  console.log(JSON.stringify(result, null, 2));
  if (requireEligible && result.admission !== 'eligible_snapshot_only') throw new Error(result.admission);
}

main().catch(error => {
  const safeCode = /^deepseek_budget_[a-z_]+$/u.test(error?.budgetCode || error?.message || '')
    ? error.budgetCode || error.message : 'deepseek_budget_status_unavailable';
  console.error(`DeepSeek budget HOLD: ${safeCode}; no provider call and no ledger write.`);
  process.exitCode = 1;
});
