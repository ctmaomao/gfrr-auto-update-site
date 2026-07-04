#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const WORKFLOW = '.github/workflows/gdelt-web-ngrams-sample-collector.yml';
const PACKAGE_JSON = 'package.json';

function absolute(relativePath) {
  return join(ROOT, relativePath);
}

function readText(relativePath) {
  return readFileSync(absolute(relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertWorkflow() {
  assert(existsSync(absolute(WORKFLOW)), `${WORKFLOW} is missing.`);
  const text = readText(WORKFLOW);
  for (const marker of [
    'name: GDELT Web NGrams Sample Collector',
    'workflow_dispatch:',
    "cron: '23 */3 * * *'",
    'FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true',
    'contents: read',
    'actions: read',
    'concurrency:',
    'gdelt-web-ngrams-sample-collector-${{ github.ref }}',
    'cancel-in-progress: false',
    'actions/checkout@v6',
    'actions/setup-node@v6',
    'node-version: 24',
    'package-manager-cache: false',
    'npm ci',
    'gh run list --workflow "gdelt-web-ngrams-sample-collector.yml"',
    'gh run download "$run_id" --name gdelt-web-ngrams-samples',
    'npm run diagnose:gdelt-web-ngrams -- --allow-network --max-probes 96',
    'npm run archive:gdelt-web-ngrams-samples',
    '--min-review-samples 8',
    'npm run review:gdelt-web-ngrams-samples',
    '--min-samples 8',
    '--allow-empty',
    'actions/upload-artifact@v7',
    'name: gdelt-web-ngrams-samples',
    'retention-days: 14',
    'artifact-only sample collection and gate review'
  ]) {
    assert(text.includes(marker), `${WORKFLOW} missing marker: ${marker}`);
  }

  for (const forbidden of [
    'contents: write',
    'git push',
    'git commit',
    'npm run build:data',
    'scripts/run-daily-pipeline.mjs',
    'npm run build:oil-news-event-watch',
    'npm run build:oil-directional',
    'data/radar-data.json',
    'data/oil-news-event-watch.json',
    'data/oil-directional-pressure.json',
    'realtime/market.json',
    'TAVILY_API_KEYS',
    'BRAVE_API_KEYS',
    'GDELT_CLOUD_API_KEY',
    'FIRMS_MAP_KEY',
    'productionWriteApproved=true',
    'scoreApproved=true'
  ]) {
    assert(!text.includes(forbidden), `${WORKFLOW} contains forbidden marker: ${forbidden}`);
  }
}

function assertPackage() {
  const packageJson = JSON.parse(readText(PACKAGE_JSON));
  const scripts = packageJson.scripts || {};
  assert(
    scripts['check:gdelt-web-ngrams-sample-collector-workflow']?.includes('scripts/check-gdelt-web-ngrams-sample-collector-workflow.mjs'),
    'package.json missing check:gdelt-web-ngrams-sample-collector-workflow'
  );
  assert(
    scripts['check:all']?.includes('check:gdelt-web-ngrams-sample-collector-workflow'),
    'check:all missing check:gdelt-web-ngrams-sample-collector-workflow'
  );
}

function assertDocs() {
  const requiredDocs = [
    'docs/GDELT_SOURCE_POLICY.md',
    'docs/OIL_NEWS_EVENT_SOURCE_REVIEW.md',
    'docs/DATA_CONTRACT.md',
    'docs/DATA_SOURCES.md'
  ];
  for (const docPath of requiredDocs) {
    const text = readText(docPath);
    for (const marker of [
      'GDELT Web NGrams Sample Collector',
      'gdelt-web-ngrams-sample-collector.yml',
      'artifact-only sample collection',
      'does not write production data'
    ]) {
      assert(text.includes(marker), `${docPath} missing marker: ${marker}`);
    }
  }
}

function main() {
  assertWorkflow();
  assertPackage();
  assertDocs();
  console.log('GDELT Web NGrams sample collector workflow: PASS');
}

main();
