#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const REVIEW_SCRIPT = 'scripts/review-fomc-minutes-tone-quality.mjs';
const DEFAULT_INPUT = 'data/radar-data.json';

function runNodeCheck() {
  const result = spawnSync(process.execPath, ['--check', REVIEW_SCRIPT], {
    encoding: 'utf8',
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    throw new Error('Syntax check for review script failed.');
  }
}

function runReview() {
  const result = spawnSync(
    process.execPath,
    [REVIEW_SCRIPT, '--input', DEFAULT_INPUT, '--output', 'manual-artifacts/policy-review/fomc-minutes-tone-quality-check.json', '--no-output'],
    {
      encoding: 'utf8',
      stdio: 'inherit'
    }
  );
  if (result.status !== 0) throw new Error('FOMC minutes tone quality review failed.');
}

function main() {
  runNodeCheck();
  runReview();
  console.log('FOMC minutes tone quality check: PASS');
}

main();
