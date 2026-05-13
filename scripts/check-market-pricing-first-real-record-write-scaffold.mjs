import fs from 'node:fs';
import path from 'node:path';
import { buildFirstRealRecordWriteReport } from './market-pricing/first-real-record-write-scaffold.mjs';

const ROOT = process.cwd();
const FIXTURE_PATH = path.join(
  ROOT,
  'docs',
  'fixtures',
  'market-pricing',
  'first-real-record-write-scaffold-v28.0M-24.json'
);
const COMMIT_SCRIPT_PATH = path.join(
  ROOT,
  'scripts',
  'market-pricing',
  'first-real-record-write-scaffold.mjs'
);
const PROTECTED_FILES = [
  'data/market-pricing-history.json',
  'data/radar-data.json',
  'scripts/market-pricing/manual-weekly-input-sanitizer-scaffold.mjs'
];
const FORBIDDEN_SOURCE_SUBSTRINGS = [
  'fetch(',
  'http.get',
  'https.get',
  'axios',
  'process.env',
  '--enable-temperature',
  '--activate',
  '--calculate-zscore',
  '--bypass-sanity-checks',
  'renderMacroOverview',
  'decision.js',
  'config.js'
];
const REQUIRED_SOURCE_SUBSTRINGS = [
  'data/market-pricing-history.json',
  '--commit-to-history',
  '--dry-run-commit'
];

const errors = [];

function assert(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

function readText(relativeOrAbsolutePath) {
  return fs.readFileSync(relativeOrAbsolutePath, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function snapshotProtectedFiles() {
  return new Map(
    PROTECTED_FILES.map((relativePath) => {
      const absolutePath = path.join(ROOT, relativePath);
      return [relativePath, fs.existsSync(absolutePath) ? readText(absolutePath) : null];
    })
  );
}

function assertProtectedFilesUnchanged(snapshot, label) {
  for (const [relativePath, before] of snapshot.entries()) {
    const absolutePath = path.join(ROOT, relativePath);
    const after = fs.existsSync(absolutePath) ? readText(absolutePath) : null;
    assert(after === before, `${label}: protected file changed: ${relativePath}`);
  }
}

function assertCommitScriptSource() {
  const source = readText(COMMIT_SCRIPT_PATH);

  for (const pattern of FORBIDDEN_SOURCE_SUBSTRINGS) {
    assert(!source.includes(pattern), `commit script must not contain ${pattern}`);
  }

  for (const pattern of REQUIRED_SOURCE_SUBSTRINGS) {
    assert(source.includes(pattern), `commit script must contain ${pattern}`);
  }

  assert(
    source.includes('renameSync') || source.includes('rename('),
    'commit script must contain renameSync or rename('
  );

  const sanityMentionCount = (source.match(/sanity/gi) || []).length;
  assert(sanityMentionCount >= 5, 'commit script must mention sanity at least 5 times');
}

function assertFixture(fixture) {
  assert(
    fixture.status === 'first_real_record_write_scaffold_two_stage_manual_commit',
    'fixture status mismatch'
  );
  assert(fixture.firstRealRecordWriteApproved === true, 'firstRealRecordWriteApproved must be true');
  assert(fixture.firstRealRecordWriteScaffoldExists === true, 'firstRealRecordWriteScaffoldExists must be true');
  assert(fixture.commitScriptExecutable === true, 'commitScriptExecutable must be true');
  assert(fixture.commitRequiresExplicitFlag === true, 'commitRequiresExplicitFlag must be true');
  assert(fixture.commitFlagName === '--commit-to-history', 'commitFlagName mismatch');
  assert(fixture.twoStageConfirmationEnforced === true, 'twoStageConfirmationEnforced must be true');
  assert(fixture.historyFileMayBeWritten === true, 'historyFileMayBeWritten must be true');
  assert(fixture.historyFileWillBeWrittenAtomically === true, 'historyFileWillBeWrittenAtomically must be true');
  assert(fixture.sanityChecksRunBeforeWrite === true, 'sanityChecksRunBeforeWrite must be true');
  assert(fixture.sanityCheckCount === 5, 'sanityCheckCount must be 5');
  assert(Array.isArray(fixture.sanityCheckCatalog), 'sanityCheckCatalog must be an array');
  assert(fixture.sanityCheckCatalog.length === 5, 'sanityCheckCatalog length must be 5');
  assert(fixture.writeAtomicity?.method === 'tmp_file_plus_rename', 'writeAtomicity method mismatch');
  assert(fixture.marketTemperatureCalculationApproved === false, 'marketTemperatureCalculationApproved must remain false');
  assert(fixture.readyForFrontendDisplay === false, 'readyForFrontendDisplay must remain false');
  assert(fixture.ma60CalculationImplemented === false, 'ma60CalculationImplemented must remain false');
  assert(fixture.stdDevCalculationImplemented === false, 'stdDevCalculationImplemented must remain false');
  assert(fixture.zScoreCalculationImplemented === false, 'zScoreCalculationImplemented must remain false');
  assert(fixture.sourceApproved === false, 'sourceApproved must remain false');
  assert(fixture.liveFetchApproved === false, 'liveFetchApproved must remain false');
  assert(fixture.networkAllowed === false, 'networkAllowed must remain false');
  assert(fixture.sourceComplianceReviewed === false, 'sourceComplianceReviewed must remain false');
  assert(fixture.networkOpenedThisRun === false, 'networkOpenedThisRun must remain false');
  assert(Array.isArray(fixture.records), 'fixture records must be an array');
  assert(fixture.records.length === 0, 'fixture records must remain empty');

  assert(fixture.boundaries && typeof fixture.boundaries === 'object', 'fixture boundaries must be an object');
  for (const [key, value] of Object.entries(fixture.boundaries || {})) {
    assert(value === true, `fixture boundaries.${key} must be true`);
  }
}

function assertPureReport() {
  const report = buildFirstRealRecordWriteReport({ dryRun: true });
  assert(report && typeof report === 'object', 'buildFirstRealRecordWriteReport must return an object');
  assert(report.dryRun === true, 'buildFirstRealRecordWriteReport must preserve dryRun true');
  assert(report.writePerformed === false, 'buildFirstRealRecordWriteReport must not write');
}

function main() {
  const snapshot = snapshotProtectedFiles();

  assert(fs.existsSync(FIXTURE_PATH), 'M-24 fixture is missing');
  assert(fs.existsSync(COMMIT_SCRIPT_PATH), 'M-24 commit script is missing');
  assertCommitScriptSource();
  assertFixture(readJson(FIXTURE_PATH));
  assertPureReport();
  assertProtectedFilesUnchanged(snapshot, 'first real record write scaffold check');

  if (errors.length > 0) {
    console.error('Market pricing first real record write scaffold: FAIL');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('Market pricing first real record write scaffold: PASS');
}

main();
