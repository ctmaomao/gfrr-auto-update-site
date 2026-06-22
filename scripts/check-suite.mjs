import { spawnSync } from 'node:child_process';

const SUITES = {
  'frontend-live-contracts': [
    'check:frontend-loading-state',
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
    'check:macro-drivers-expanded-auto-ingestion'
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
    'check:oil-directional-global-overlay',
    'check:oil-directional-zh-copy',
    'check:firms-facilities-review',
    'check:firms-thermal-review'
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
