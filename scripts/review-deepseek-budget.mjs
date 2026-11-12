import fs from 'node:fs';
import { verifyPrivateClaimStatus, privateClaimRuntimeConfig } from './lib/deepseek-private-claim.mjs';
import { RECEIPT_GRANT, prepareReceiptLedger } from './lib/deepseek-receipt-grant.mjs';
import { GRANT, oneShotSelection, prepareOneShotLedger, verifyOneShotStatus, oneShotRuntimeConfig } from './lib/deepseek-one-shot.mjs';
import { createGithubLedger, POLICY, POLICY_DIGEST, prepareBootstrapLedger, verifyBudgetStatus } from './lib/deepseek-budget.mjs';

function reportPreflight(disposition, reason) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT,
    `budget_eligible=${disposition === 'eligible'}\nbudget_disposition=${disposition}\nbudget_reason=${reason}\n`);
  const message = `DeepSeek budget preflight: ${disposition}; reason=${reason}; no provider call and no ledger write.`;
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n`);
  console.log(message);
}

// Read-only by default. This CLI never initializes a ledger, changes a price
// review, reads a provider key, calls DeepSeek, or sends a generation request.
async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--prepare-receipt-grant' && process.env.GITHUB_ACTIONS === 'true') throw new Error('deepseek_budget_private_snapshot_unproven');
  if (args.length === 4 && args[0] === '--prepare-receipt-grant' && args[2] === '--approved-grant-digest') {
    const prepared = JSON.parse(fs.readFileSync(args[1], 'utf8'));
    const ledger = prepareReceiptLedger({ ...prepared, approvedGrantDigest: args[3] });
    console.log(JSON.stringify({ operation: 'offline_receipt_grant_plan', providerCalls: 0, writes: 0, ledger }, null, 2));
    return;
  }
  if ([1, 2].includes(args.length) && args[0] === '--one-shot-plan') {
    const { grant, branch } = oneShotSelection(args[1] || GRANT.id);
    console.log(JSON.stringify({ operation: 'offline_plan', providerCalls: 0, writes: 0,
      grant, branch, requires: ['independently approved grant digest',
        'create-only pinned genesis with no existing ledger', 'current independently reviewed exact price digest',
        'explicit first-attempt workflow_dispatch on main', 'unchanged free-search and production gates'] }, null, 2));
    return;
  }
  if ([4, 6].includes(args.length) && args[0] === '--prepare-one-shot' && args[2] === '--approved-grant-digest'
    && (args.length === 4 || args[4] === '--selection')) {
    const prepared = JSON.parse(fs.readFileSync(args[1], 'utf8'));
    const ledger = prepareOneShotLedger({ ...prepared, approvedGrantDigest: args[3], selection: args[5] || GRANT.id });
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
  const allowPausedMonthly = args.length === 2 && args[0] === '--require-eligible'
    && args[1] === '--allow-uninitialized-monthly-skip';
  const requireEligible = (args.length === 1 && args[0] === '--require-eligible') || allowPausedMonthly;
  if (args.length && !requireEligible) throw new Error('unsupported_budget_argument');
  // ADR-0109: only this explicitly opted-in automatic Macro path can report the
  // known intentional pause. Do not catch budget errors and relabel them skips:
  // missing credentials, partial/malformed config, manual/one-shot runs and every
  // failure after a ledger read retain the existing nonzero exit status.
  const env = process.env;
  if (allowPausedMonthly && env.GITHUB_ACTIONS === 'true'
    && env.GITHUB_REPOSITORY === 'ctmaomao/gfrr-auto-update-site'
    && env.GITHUB_EVENT_NAME === 'workflow_run' && env.GITHUB_REF === 'refs/heads/main'
    && env.GITHUB_WORKFLOW_REF === 'ctmaomao/gfrr-auto-update-site/.github/workflows/macro-risk-editorial-refresh.yml@refs/heads/main'
    && env.DEEPSEEK_BUDGET_SELECTION === 'monthly'
    && env.DEEPSEEK_BUDGET_CONSUMER === 'macro-editorial'
    && env.DEEPSEEK_BUDGET_GITHUB_TOKEN
    && !env.DEEPSEEK_BUDGET_GENESIS_SHA && !env.DEEPSEEK_BUDGET_PRICE_REVIEW_SHA256) {
    reportPreflight('expected_skip', 'deepseek_budget_uninitialized');
    return;
  }
  if (env.DEEPSEEK_BUDGET_SELECTION === RECEIPT_GRANT.id) {
    const result = await verifyPrivateClaimStatus(privateClaimRuntimeConfig());
    console.log(JSON.stringify(result, null, 2));
    reportPreflight('eligible', result.admission);
    return;
  }
  if (process.env.DEEPSEEK_BUDGET_SELECTION && process.env.DEEPSEEK_BUDGET_SELECTION !== 'monthly') {
    const result = await verifyOneShotStatus(oneShotRuntimeConfig());
    console.log(JSON.stringify(result, null, 2));
    reportPreflight('eligible', result.admission);
    return;
  }
  const result = await verifyBudgetStatus({
    store: createGithubLedger({ token: process.env.DEEPSEEK_BUDGET_GITHUB_TOKEN, genesisSha: process.env.DEEPSEEK_BUDGET_GENESIS_SHA }),
    approvedReviewDigest: process.env.DEEPSEEK_BUDGET_PRICE_REVIEW_SHA256
  });
  console.log(JSON.stringify(result, null, 2));
  if (requireEligible && result.admission !== 'eligible_snapshot_only') throw new Error(result.admission);
  reportPreflight(result.admission === 'eligible_snapshot_only' ? 'eligible' : 'hold', result.admission);
}

main().catch(error => {
  const safeCode = /^deepseek_budget_[a-z_]+$/u.test(error?.budgetCode || error?.message || '')
    ? error.budgetCode || error.message : 'deepseek_budget_status_unavailable';
  reportPreflight('failure', safeCode);
  console.error(`DeepSeek budget HOLD: ${safeCode}; no provider call and no ledger write.`);
  process.exitCode = 1;
});
