import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_PATH = resolve(ROOT_DIR, 'package.json');

const SUITES = {
  'frontend-visual-regression': [
    'check:frontend-visual-m54',
    'check:frontend-visual-m55a',
    'check:frontend-visual-m55b',
  ],
  'market-pricing-regression': [
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
    'check:market-pricing-first-fold-integration-and-cross-validation-matrix',
    'check:market-pricing-macrodrivers-surfacing',
    'check:cross-validation-education-appendix',
  ],
};

function loadScripts() {
  const packageJson = JSON.parse(readFileSync(PACKAGE_PATH, 'utf8'));
  if (!packageJson.scripts || typeof packageJson.scripts !== 'object') {
    throw new Error('package.json must define scripts');
  }
  return packageJson.scripts;
}

function main() {
  const suiteName = process.argv[2];
  const checks = SUITES[suiteName];
  if (!checks) {
    console.error(`Unknown check suite: ${suiteName || '(missing)'}`);
    console.error(`Available suites: ${Object.keys(SUITES).join(', ')}`);
    process.exit(1);
  }

  const scripts = loadScripts();
  console.log(`Check suite ${suiteName}: running ${checks.length} checks`);

  checks.forEach((checkName, index) => {
    const command = scripts[checkName];
    if (typeof command !== 'string' || command.trim().length === 0) {
      console.error(`Check suite ${suiteName}: missing package.json script ${checkName}`);
      process.exit(1);
    }

    console.log(`\n[${index + 1}/${checks.length}] ${checkName}`);
    const result = spawnSync(command, {
      cwd: ROOT_DIR,
      env: process.env,
      shell: true,
      stdio: 'inherit',
    });

    if (result.error) {
      console.error(`Check suite ${suiteName}: ${checkName} failed to start: ${result.error.message}`);
      process.exit(1);
    }
    if (result.signal) {
      console.error(`Check suite ${suiteName}: ${checkName} terminated by signal ${result.signal}`);
      process.exit(1);
    }
    if (result.status !== 0) {
      console.error(`Check suite ${suiteName}: ${checkName} failed with exit code ${result.status}`);
      process.exit(result.status || 1);
    }
  });

  console.log(`\nCheck suite ${suiteName}: PASS (${checks.length} checks)`);
}

main();
