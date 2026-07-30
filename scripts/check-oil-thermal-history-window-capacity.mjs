#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import {
  OIL_THERMAL_BASELINE_DEFAULT_MAX_COMMITS,
  OIL_THERMAL_BASELINE_DEFAULT_MAX_SAMPLES,
  OIL_THERMAL_BASELINE_TARGET_DAYS,
  OIL_THERMAL_HISTORY_OPTION_MAX,
  validateOilThermalHistoryWindow
} from './oil-directional/oil-thermal-history-window.mjs';

const SCRIPT_PATHS = [
  'scripts/oil-directional/archive-oil-thermal-watch-history-samples.mjs',
  'scripts/oil-directional/prepare-oil-thermal-baseline-review.mjs',
  'scripts/oil-directional/refresh-oil-thermal-baseline-candidate.mjs',
  'scripts/oil-directional/monitor-oil-thermal-baseline-quality.mjs'
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function expectValidationFailure(maxCommits, maxSamples) {
  let failed = false;
  try {
    validateOilThermalHistoryWindow(maxCommits, maxSamples);
  } catch {
    failed = true;
  }
  assert(failed, `expected history-window validation failure for ${maxCommits}/${maxSamples}`);
}

function runSmoke(scriptPath, args) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${scriptPath} smoke failed with exit ${result.status}: ${String(
        result.stderr || result.stdout
      ).trim()}`
    );
  }
}

assert(OIL_THERMAL_HISTORY_OPTION_MAX === 500, 'shared option maximum must remain 500');
assert(
  OIL_THERMAL_BASELINE_DEFAULT_MAX_COMMITS === 240,
  'baseline default max commits must cover the observed collection cadence'
);
assert(
  OIL_THERMAL_BASELINE_DEFAULT_MAX_SAMPLES === 240,
  'baseline default max samples must cover the observed collection cadence'
);
assert(
  OIL_THERMAL_BASELINE_DEFAULT_MAX_SAMPLES > 100,
  'baseline sample capacity must exceed the former unreachable cap'
);
assert(OIL_THERMAL_BASELINE_TARGET_DAYS === 30, 'established target must remain 30 days');

validateOilThermalHistoryWindow(
  OIL_THERMAL_BASELINE_DEFAULT_MAX_COMMITS,
  OIL_THERMAL_BASELINE_DEFAULT_MAX_SAMPLES
);
validateOilThermalHistoryWindow(3, 1);
expectValidationFailure(0, 1);
expectValidationFailure(1, 0);
expectValidationFailure(OIL_THERMAL_HISTORY_OPTION_MAX + 1, 1);
expectValidationFailure(1, OIL_THERMAL_HISTORY_OPTION_MAX + 1);

for (const scriptPath of SCRIPT_PATHS) {
  const source = readFileSync(resolve(scriptPath), 'utf8');
  assert(
    source.includes('validateOilThermalHistoryWindow'),
    `${scriptPath} must use shared history-window validation`
  );
}

runSmoke(SCRIPT_PATHS[0], [
  '--max-commits',
  '3',
  '--max-samples',
  '3',
  '--dry-run',
  '--allow-empty'
]);
runSmoke(SCRIPT_PATHS[1], [
  '--max-commits',
  '3',
  '--max-samples',
  '3',
  '--dry-run',
  '--no-output'
]);
runSmoke(SCRIPT_PATHS[2], [
  '--max-commits',
  '3',
  '--max-samples',
  '3',
  '--dry-run'
]);
runSmoke(SCRIPT_PATHS[3], [
  '--max-commits',
  '3',
  '--max-samples',
  '3',
  '--dry-run',
  '--no-output'
]);

console.log(
  `PASS: oil thermal history-window capacity supports ${OIL_THERMAL_BASELINE_DEFAULT_MAX_SAMPLES} samples for the ${OIL_THERMAL_BASELINE_TARGET_DAYS}-day gate.`
);
