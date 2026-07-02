import { spawnSync } from 'node:child_process';

const SUITES = {
  'frontend-live-contracts': [
    'check:frontend-loading-state',
    'check:frontend-safe-dom-rendering',
    'check:observation-reaction-layer',
    'check:thematic-card-ia',
    'check:null-zero-display-guards',
    'check:dom',
    'check:macro-overview-narrative',
    'check:macro-overview-display-helpers',
    'check:macro-coherence-display-only'
  ],
  'external-ai': [
    'check:external-ai-manual-workflow',
    'check:external-ai-provider-workflow',
    'check:external-ai-production-refresh-workflow',
    'check:external-ai-workflow-artifacts',
    'check:external-ai-output',
    'check:external-ai-production-contract',
    'check:external-ai-provenance-completeness',
    'check:external-ai-production-write-guard',
    'check:external-ai-frontend-hidden-scaffold',
    'check:external-ai-production-provider-path'
  ],
  'external-ai-with-artifacts': [
    'check:external-ai-manual-workflow',
    'check:external-ai-provider-workflow',
    'check:external-ai-production-refresh-workflow',
    'check:external-ai-workflow-artifacts',
    'check:external-ai-output',
    'check:external-ai-production-contract',
    'check:external-ai-provenance-completeness',
    'check:external-ai-production-projection',
    'check:external-ai-production-write-guard',
    'check:external-ai-frontend-hidden-scaffold',
    'check:external-ai-manual-scaffold',
    'check:external-ai-production-provider-path'
  ],
  brent: [
    'check:brent-promotion-audit-fields',
    'check:brent-crack-spread',
    'check:brent-public-proxy-source-review'
  ],
  'macro-drivers': [
    'check:macro-drivers-fed-liquidity-extended',
    'check:fed-liquidity-repo-spread',
    'check:macro-drivers-credit-sloos',
    'check:macro-drivers-credit-nfci',
    'check:consumer-pmi',
    'check:macro-drivers-employment',
    'check:macro-drivers-consumer-retail',
    'check:macro-drivers-commercial-real-estate',
    'check:macro-drivers-expanded-auto-ingestion',
    'check:route-level-tanker-freight-source-review',
    'check:route-level-tanker-freight-proof-of-source-design',
    'check:route-level-tanker-freight-manual-artifact-scaffold',
    'check:route-level-tanker-freight-manual-samples-review',
    'check:route-level-tanker-freight-display-contract',
    'check:route-level-tanker-freight-production-display-projection',
    'check:route-level-tanker-freight-production-display-projection-review',
    'check:route-level-tanker-freight-frontend-display-brief',
    'check:route-level-tanker-freight-production-write-readiness',
    'check:route-level-tanker-freight-thematic-card-brief',
    'check:route-level-tanker-freight-production-writer-contract-design',
    'check:route-level-tanker-freight-source-rights-approval-gate',
    'check:route-level-tanker-freight-baltic-context-policy',
    'check:route-level-tanker-freight-disabled-writer-scaffold',
    'check:route-level-tanker-freight-source-rights-approval-template',
    'check:route-level-tanker-freight-source-rights-input-prep',
    'check:route-level-tanker-freight-source-rights-input-guide',
    'check:route-level-tanker-freight-source-rights-artifact-review',
    'check:route-level-tanker-freight-source-rights-gate-update-proposal',
    'check:route-level-tanker-freight-source-rights-gate-update-proposal-review'
  ],
  'narrative-density': [
    'check:world-order-narrative-density',
    'check:risk-asset-mismatch-narrative-density',
    'check:overheat-confirmation-narrative-density'
  ],
  'market-pricing': [
    'check:market-pricing-history',
    'check:market-pricing-manual-weekly-input-sanitizer-scaffold',
    'check:market-pricing-first-real-record-write-scaffold',
    'check:market-pricing-weekly-history-buildup',
    'check:market-pricing-metrics-calculation-scaffold',
    'check:market-pricing-metrics-schema',
    'check:market-pricing-multi-asset',
    'check:market-pricing-ndx-ixic-implementation'
  ],
  'world-order-acled': [
    'check:world-order-acled-weekly',
    'check:world-order-acled-monthly'
  ],
  'oil-directional': [
    'check:oil-directional-contract',
    'check:oil-directional-freshness',
    'check:oil-directional-seasonality',
    'check:oil-directional-degradation',
    'check:oil-directional-boundary',
    'check:oil-directional-backtest',
    'check:oil-directional-score',
    'check:oil-directional-attribution',
    'check:oil-directional-evidence-timing',
    'check:oil-directional-narrative-consistency',
    'check:oil-directional-reading-structure',
    'check:oil-directional-responsive-readability',
    'check:oil-directional-global-overlay',
    'check:transport-shock-confirmation-factor-source-to-score-contract',
    'check:transport-shock-confirmation-factor-source-review',
    'check:transport-shock-confirmation-factor-manual-sample-scaffold',
    'check:transport-shock-confirmation-factor-manual-samples-review',
    'check:transport-shock-confirmation-factor-shadow-score',
    'check:transport-shock-confirmation-factor-display-projection',
    'check:transport-shock-confirmation-factor-frontend-card',
    'check:transport-shock-confirmation-factor-production-refresh',
    'check:transport-shock-confirmation-factor-production-refresh-monitor',
    'check:transport-shock-confirmation-factor-history-sample-archive',
    'check:transport-shock-confirmation-factor-history-samples-review',
    'check:transport-shock-confirmation-factor-score-readiness',
    'check:transport-shock-confirmation-factor-high-frequency-confirmation',
    'check:transport-shock-confirmation-factor-news-operator-review',
    'check:transport-shock-confirmation-factor-news-operator-review-monitor',
    'check:transport-shock-confirmation-factor-news-manual-gate',
    'check:transport-shock-confirmation-factor-cross-confirmation',
    'check:transport-shock-confirmation-factor-score-integration-preflight',
    'check:transport-shock-confirmation-factor-score-integration-preflight-monitor',
    'check:transport-shock-confirmation-factor-portwatch-freshness',
    'check:transport-shock-confirmation-factor-score-readiness-monitor',
    'check:transport-shock-confirmation-factor-market-confirmation-source-review',
    'check:transport-shock-market-confirmation-manual-sample-scaffold',
    'check:transport-shock-market-confirmation-display-projection',
    'check:transport-shock-confirmation-factor-free-proxy-score-design',
    'check:transport-shock-confirmation-factor-free-proxy-score-candidate',
    'check:transport-shock-confirmation-factor-free-proxy-score-replay',
    'check:transport-shock-confirmation-factor-free-proxy-historical-replay-design',
    'check:transport-shock-confirmation-factor-free-proxy-historical-replay-sample-scaffold',
    'check:transport-shock-confirmation-factor-free-proxy-historical-replay-samples-review',
    'check:transport-shock-confirmation-factor-free-proxy-historical-replay-runner-design',
    'check:transport-shock-confirmation-factor-free-proxy-historical-replay-runner',
    'check:transport-shock-confirmation-factor-free-proxy-historical-replay-runner-review',
    'check:transport-shock-confirmation-factor-free-proxy-historical-replay-sample-expansion',
    'check:transport-shock-confirmation-factor-free-proxy-historical-replay-real-event-sample-intake',
    'check:transport-shock-confirmation-factor-free-proxy-historical-replay-real-event-samples-review',
    'check:transport-shock-confirmation-factor-free-proxy-score-readiness-gate',
    'check:transport-shock-confirmation-factor-free-proxy-score-readiness-gate-monitor',
    'check:transport-shock-confirmation-factor-free-proxy-real-event-sample-input-prep',
    'check:transport-shock-free-freight-alternative-source-review',
    'check:transport-shock-satellite-handling-policy',
    'check:oil-news-events-diagnosis',
    'check:oil-news-event-watch',
    'check:oil-news-event-watch-samples-review',
    'check:oil-news-source-health-samples-review',
    'check:oil-news-claim-ledger-review',
    'check:oil-thermal-watch',
    'check:oil-directional-zh-copy',
    'check:firms-facilities-review',
    'check:firms-thermal-review',
    'check:firms-thermal-baseline-review',
    'check:oil-thermal-watch-sample-archive',
    'check:oil-thermal-watch-history-sample-archive',
    'check:oil-thermal-baseline-samples-review',
    'check:oil-thermal-baseline-readiness-prep',
    'check:oil-thermal-baseline-rolling-refresh',
    'check:oil-thermal-baseline-quality-monitor',
    'check:oil-thermal-baseline-config',
    'check:firms-thermal-watch-review'
  ]
};

const suiteName = process.argv[2];
const suite = SUITES[suiteName];

if (!suite) {
  console.error(`Unknown check suite: ${suiteName || '(missing)'}`);
  console.error(`Available suites: ${Object.keys(SUITES).join(', ')}`);
  process.exit(1);
}

const npmExecPath = process.env.npm_execpath;
const npmCommand = npmExecPath
  ? { command: process.execPath, argsPrefix: [npmExecPath] }
  : { command: process.platform === 'win32' ? 'npm.cmd' : 'npm', argsPrefix: [] };

for (const scriptName of suite) {
  console.log(`\n[check-suite:${suiteName}] npm run ${scriptName}`);
  const result = spawnSync(npmCommand.command, [...npmCommand.argsPrefix, 'run', scriptName], {
    stdio: 'inherit'
  });

  if (result.error) {
    console.error(`Failed to run npm script ${scriptName}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.signal) {
    console.error(`npm script ${scriptName} terminated by signal ${result.signal}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`\nCheck suite '${suiteName}': PASS (${suite.length} checks)`);
