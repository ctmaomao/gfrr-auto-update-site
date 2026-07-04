#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

const FILES = {
  packageJson: 'package.json',
  sanitizer: 'scripts/oil-directional/sanitize-gdelt-web-ngrams-artifacts.mjs',
  diagnosis: 'scripts/oil-directional/diagnose-gdelt-web-ngrams.mjs',
  archive: 'scripts/oil-directional/archive-gdelt-web-ngrams-samples.mjs',
  review: 'scripts/oil-directional/review-gdelt-web-ngrams-samples.mjs',
  workflow: '.github/workflows/gdelt-web-ngrams-sample-collector.yml',
  policy: 'docs/GDELT_SOURCE_POLICY.md',
  sourceReview: 'docs/OIL_NEWS_EVENT_SOURCE_REVIEW.md',
  dataContract: 'docs/DATA_CONTRACT.md',
  dataSources: 'docs/DATA_SOURCES.md',
  fixtureA: 'docs/fixtures/oil-news/gdelt-web-ngrams-diagnosis-sample-a.json',
  fixtureB: 'docs/fixtures/oil-news/gdelt-web-ngrams-diagnosis-sample-b.json'
};

function absolute(relativePath) {
  return join(ROOT, relativePath);
}

function readText(relativePath) {
  return readFileSync(absolute(relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertExists() {
  for (const filePath of Object.values(FILES)) {
    assert(existsSync(absolute(filePath)), `${filePath} is missing.`);
  }
}

function assertPackage() {
  const scripts = JSON.parse(readText(FILES.packageJson)).scripts || {};
  assert(
    scripts['sanitize:gdelt-web-ngrams-artifacts']?.includes(FILES.sanitizer),
    'package.json missing sanitize:gdelt-web-ngrams-artifacts'
  );
  assert(
    scripts['check:gdelt-web-ngrams-artifact-sanitizer']?.includes(FILES.sanitizer) &&
      scripts['check:gdelt-web-ngrams-artifact-sanitizer']?.includes('scripts/check-gdelt-web-ngrams-artifact-sanitizer.mjs') &&
      scripts['check:gdelt-web-ngrams-artifact-sanitizer']?.includes('--fail-on-change'),
    'package.json missing fixture-backed check:gdelt-web-ngrams-artifact-sanitizer'
  );
  assert(
    scripts['check:all']?.includes('check:gdelt-web-ngrams-artifact-sanitizer'),
    'check:all missing check:gdelt-web-ngrams-artifact-sanitizer'
  );
}

function assertSanitizer() {
  const text = readText(FILES.sanitizer);
  for (const marker of [
    'gdelt-web-ngrams-artifact-sanitizer-p48',
    'SENSITIVE_KEY_RE',
    'selectedFile.url',
    'manual GDELT Web NGrams artifact sanitizer only',
    'rewrites ignored manual-artifacts only',
    'productionDisplayApproved: false',
    'promotionEligible: false',
    'canWritePath',
    'Refusing to rewrite outside manual-artifacts'
  ]) {
    assert(text.includes(marker), `${FILES.sanitizer} missing marker: ${marker}`);
  }
  for (const forbidden of ['writeFileSync(resolve("data/', "writeFileSync(resolve('data/", 'fetch(', 'node:https', 'node:http']) {
    assert(!text.includes(forbidden), `${FILES.sanitizer} contains forbidden marker: ${forbidden}`);
  }
}

function assertRuntimeWiring() {
  const diagnosis = readText(FILES.diagnosis);
  assert(diagnosis.includes('sanitizeSelectedFileForArtifact'), `${FILES.diagnosis} must use sanitizeSelectedFileForArtifact`);
  assert(!diagnosis.includes('url: fetched.url'), `${FILES.diagnosis} must not write selectedFile.url`);

  const archive = readText(FILES.archive);
  for (const marker of [
    'sanitizeGdeltWebNgramsArtifact',
    'GDELT_WEB_NGRAMS_ARTIFACT_SANITIZER_VERSION',
    'stringifySanitizedArtifact',
    'removedPathCount',
    '\'"url":\'',
    'writeFileSync(targetPaths.samplePath, validation.text'
  ]) {
    assert(archive.includes(marker), `${FILES.archive} missing sanitizer marker: ${marker}`);
  }
  assert(!archive.includes('copyFileSync'), `${FILES.archive} must write sanitized artifact instead of copying raw input`);

  const review = readText(FILES.review);
  for (const marker of ['\'"url":\'', "'https://'", "'http://'", 'rawProviderResponse']) {
    assert(review.includes(marker), `${FILES.review} missing raw exposure blocker: ${marker}`);
  }
}

function assertWorkflow() {
  const text = readText(FILES.workflow);
  for (const marker of [
    'Sanitize restored Web NGrams artifacts',
    'npm run sanitize:gdelt-web-ngrams-artifacts -- --input-dir manual-artifacts/oil-news/gdelt-web-ngrams-samples --allow-empty',
    'Sanitize latest Web NGrams diagnosis',
    'npm run sanitize:gdelt-web-ngrams-artifacts -- --input manual-artifacts/oil-news/gdelt-web-ngrams-diagnosis-latest.json --allow-empty'
  ]) {
    assert(text.includes(marker), `${FILES.workflow} missing sanitizer workflow marker: ${marker}`);
  }
}

function assertFixtures() {
  for (const fixture of [FILES.fixtureA, FILES.fixtureB]) {
    const text = readText(fixture);
    assert(!text.includes('"url"'), `${fixture} must not include url fields`);
    assert(!text.includes('https://'), `${fixture} must not include URL literals`);
  }
}

function assertDocs() {
  for (const docPath of [FILES.policy, FILES.sourceReview, FILES.dataContract, FILES.dataSources]) {
    const text = readText(docPath);
    for (const marker of [
      'P48',
      'gdelt-web-ngrams-artifact-sanitizer-p48',
      'sanitize:gdelt-web-ngrams-artifacts',
      'selectedFile.url'
    ]) {
      assert(text.includes(marker), `${docPath} missing marker: ${marker}`);
    }
  }
}

function main() {
  assertExists();
  assertPackage();
  assertSanitizer();
  assertRuntimeWiring();
  assertWorkflow();
  assertFixtures();
  assertDocs();
  console.log('GDELT Web NGrams artifact sanitizer: PASS');
}

main();
