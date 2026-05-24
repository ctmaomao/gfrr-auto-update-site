import { spawnSync } from 'node:child_process';

const SUITES = {
  'frontend-visual-history': [
    'check:today-summary-card-contract',
    'check:plain-summary-card-contract',
    'check:mobile-first-fold-compaction',
    'check:frontend-visual-m54',
    'check:frontend-visual-m55a',
    'check:frontend-visual-m55b',
    'check:macro-driver-date-rendering',
    'check:detail-data-dom-containment',
    'check:backend-frontend-coverage',
    'check:null-zero-display-guards'
  ],
  'external-ai': [
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
    'check:external-ai-production-data-write-script',
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
    'check:market-pricing-source-adapter-dry-run',
    'check:market-pricing-artifact-fetch-design',
    'check:market-pricing-artifact-fetch-scaffold',
    'check:market-pricing-artifact-sanitizer-scaffold',
    'check:market-pricing-real-record-contract-design',
    'check:market-pricing-real-record-sanitizer-scaffold',
    'check:market-pricing-source-selection-review',
    'check:market-pricing-proof-of-source-design',
    'check:market-pricing-source-specific-artifact-fetch-scaffold',
    'check:unified-data-pipeline-architecture',
    'check:market-pricing-network-gate-design',
    'check:market-pricing-network-gate-scaffold',
    'check:market-pricing-source-compliance-review-scaffold',
    'check:market-pricing-symbol-mapping-verification-design',
    'check:market-pricing-source-format-verification-design',
    'check:market-pricing-network-open-throttled-scaffold',
    'check:market-pricing-manual-weekly-input-sanitizer-design',
    'check:market-pricing-manual-weekly-input-sanitizer-scaffold',
    'check:market-pricing-first-real-record-write-scaffold',
    'check:market-pricing-weekly-history-buildup',
    'check:market-pricing-metrics-calculation-scaffold',
    'check:market-pricing-temperature-display-activated',
    'check:market-pricing-multi-asset',
    'check:market-pricing-ndx-ixic-implementation',
    'check:market-pricing-first-fold-integration-and-cross-validation-matrix',
    'check:market-pricing-macrodrivers-surfacing'
  ],
  'world-order-acled': [
    'check:world-order-acled-weekly',
    'check:world-order-acled-monthly'
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
