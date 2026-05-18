import fs from 'node:fs';
import path from 'node:path';
import {
  buildCommittedHistory,
  buildFirstRealRecordWriteReport,
  mergeByIsoWeek
} from './market-pricing/first-real-record-write-scaffold.mjs';

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
  'assets.qqq',
  'ndx',
  '--commit-to-history',
  '--dry-run-commit',
  'merge',
  'isoWeek',
  'addedRecordsCount',
  'updatedRecordsCount'
];
const FORBIDDEN_ASSET_WRITE_SUBSTRINGS = [
  'assets.ndx =',
  'assets.ixic =',
  'assets.spx =',
  "assets['ndx'] =",
  "assets['ixic'] =",
  "assets['spx'] ="
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

  for (const pattern of FORBIDDEN_ASSET_WRITE_SUBSTRINGS) {
    assert(!source.includes(pattern), `commit script must not write preserved asset via ${pattern}`);
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
  assert(fixture.sanityCheckCount === 8, 'sanityCheckCount must be 8');
  assert(Array.isArray(fixture.sanityCheckCatalog), 'sanityCheckCatalog must be an array');
  assert(fixture.sanityCheckCatalog.length === 8, 'sanityCheckCatalog length must be 8');
  const expectedSanityCheckNames = [
    'sanitized_input_valid_json',
    'incoming_record_count_minimum',
    'required_fields_present',
    'strict_ascending_unique_per_week',
    'plausibility_bounds_and_no_future',
    'existing_history_schema_integrity',
    'cross_seam_monotonicity',
    'merged_record_count_minimum'
  ];
  for (const [index, expectedName] of expectedSanityCheckNames.entries()) {
    assert(
      fixture.sanityCheckCatalog[index]?.name === expectedName,
      `sanityCheckCatalog[${index}].name must be ${expectedName}`
    );
  }
  assert(fixture.historyWriteTarget === 'assets.qqq.records', 'historyWriteTarget must be assets.qqq.records');
  assert(fixture.otherAssetsPreservedUnchanged === true, 'otherAssetsPreservedUnchanged must be true');
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

function dateFromIndex(index) {
  const base = Date.parse('2025-01-03T00:00:00.000Z');
  return new Date(base + index * 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function isoWeekFromIndex(index) {
  const year = index < 52 ? 2025 : 2026;
  const week = index < 52 ? index + 1 : index - 51;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function makeSyntheticRecord(index, close, sourceFile = 'existing.csv') {
  return {
    date: dateFromIndex(index),
    isoWeek: isoWeekFromIndex(index),
    close,
    sourceFile,
    sourceVendor: 'nasdaq_official_manual_download'
  };
}

function makeSyntheticHistory(records) {
  return {
    schemaVersion: 'v28.0M-market-pricing-history-1',
    status: 'has_history',
    assets: {
      qqq: {
        status: 'active',
        source: {},
        records,
        coverage: {}
      },
      ndx: { records: [] },
      ixic: { records: [] },
      spx: { records: [] }
    },
    boundaries: {}
  };
}

function assertSyntheticMergeReport() {
  const directMerge = mergeByIsoWeek(
    [makeSyntheticRecord(0, 100), makeSyntheticRecord(1, 101), makeSyntheticRecord(2, 102)],
    [makeSyntheticRecord(2, 202, 'revision.csv'), makeSyntheticRecord(3, 103, 'latest.csv')]
  );
  assert(directMerge.merged.length === 4, 'mergeByIsoWeek must merge by isoWeek');
  assert(directMerge.addedIsoWeeks.length === 1, 'mergeByIsoWeek addedIsoWeeks mismatch');
  assert(directMerge.updatedIsoWeeks.length === 1, 'mergeByIsoWeek updatedIsoWeeks mismatch');
  assert(directMerge.merged.find((record) => record.isoWeek === '2025-W03')?.sourceFile === 'revision.csv', 'mergeByIsoWeek must let incoming sourceFile win');

  const existing = Array.from({ length: 50 }, (_, index) => makeSyntheticRecord(index, 100 + index));
  const incoming = [
    makeSyntheticRecord(49, 249, 'revision.csv'),
    makeSyntheticRecord(50, 150, 'latest.csv'),
    makeSyntheticRecord(51, 151, 'latest.csv'),
    makeSyntheticRecord(52, 152, 'latest.csv')
  ];
  const report = buildFirstRealRecordWriteReport({
    dryRun: true,
    currentHistory: makeSyntheticHistory(existing),
    records: incoming,
    todayIso: '2026-12-31'
  });

  assert(report.ok === true, 'synthetic merge report must pass');
  assert(report.existingRecordsCount === 50, 'synthetic existingRecordsCount mismatch');
  assert(report.incomingRecordsCount === 4, 'synthetic incomingRecordsCount mismatch');
  assert(report.addedRecordsCount === 3, 'synthetic addedRecordsCount mismatch');
  assert(report.updatedRecordsCount === 1, 'synthetic updatedRecordsCount mismatch');
  assert(report.mergedRecordsCount === 53, 'synthetic mergedRecordsCount mismatch');
  assert(report.recordsCount === 53, 'synthetic recordsCount must use merged count');
  assert(report.qqqRecordsCount === 53, 'synthetic qqqRecordsCount must use merged count');
  assert(report.updatedIsoWeeks.includes('2025-W50'), 'synthetic updatedIsoWeeks must include revised seam week');
  assert(report.addedIsoWeeks.includes('2025-W51'), 'synthetic addedIsoWeeks must include first new week');
  assert(report.records.find((record) => record.isoWeek === '2025-W50')?.sourceFile === 'revision.csv', 'synthetic updated record sourceFile must be overwritten');

  const overlappingIncoming = [
    makeSyntheticRecord(46, 246, 'overlap.csv'),
    makeSyntheticRecord(47, 247, 'overlap.csv'),
    makeSyntheticRecord(48, 248, 'overlap.csv'),
    makeSyntheticRecord(49, 249, 'overlap.csv'),
    makeSyntheticRecord(50, 150, 'overlap.csv')
  ];
  const overlapReport = buildFirstRealRecordWriteReport({
    dryRun: true,
    currentHistory: makeSyntheticHistory(existing),
    records: overlappingIncoming,
    todayIso: '2026-12-31'
  });

  assert(overlapReport.ok === true, 'overlapping batch with same-isoWeek same-date records must pass');
  assert(overlapReport.existingRecordsCount === 50, 'overlap existingRecordsCount mismatch');
  assert(overlapReport.incomingRecordsCount === 5, 'overlap incomingRecordsCount mismatch');
  assert(overlapReport.addedRecordsCount === 1, 'overlap addedRecordsCount mismatch');
  assert(overlapReport.updatedRecordsCount === 4, 'overlap updatedRecordsCount mismatch');
  assert(overlapReport.mergedRecordsCount === 51, 'overlap mergedRecordsCount mismatch');
  assert(overlapReport.addedIsoWeeks.includes('2025-W51'), 'overlap addedIsoWeeks must include new week');
  assert(overlapReport.updatedIsoWeeks.includes('2025-W47'), 'overlap updatedIsoWeeks must include first overlap week');
  assert(overlapReport.updatedIsoWeeks.includes('2025-W50'), 'overlap updatedIsoWeeks must include latest existing week');
}

function assertPureReport() {
  const report = buildFirstRealRecordWriteReport({ dryRun: true });
  assert(report && typeof report === 'object', 'buildFirstRealRecordWriteReport must return an object');
  assert(report.dryRun === true, 'buildFirstRealRecordWriteReport must preserve dryRun true');
  assert(report.writePerformed === false, 'buildFirstRealRecordWriteReport must not write');

  if (report.ok) {
    assert(report.targetAssetPath === 'assets.qqq.records', 'report targetAssetPath must be assets.qqq.records');
    assert(report.sanityCheckCount === 8, 'report sanityCheckCount must be 8');

    const fixedTimestamp = '2099-01-01T00:00:00.000Z';
    const committed = buildCommittedHistory(report, fixedTimestamp);
    assert(Array.isArray(committed.assets.qqq.records), 'committed qqq records must be an array');
    assert(committed.assets.qqq.records.length === report.mergedRecordsCount, 'committed qqq records count mismatch');
    assert(committed.assets.qqq.status === 'active', 'committed qqq status must be active');
    assert(committed.assets.qqq.source?.lastCommittedAt === fixedTimestamp, 'committed qqq timestamp mismatch');

    for (const assetKey of ['ndx', 'ixic', 'spx']) {
      assert(
        JSON.stringify(committed.assets[assetKey]) === JSON.stringify(report.currentHistory.assets[assetKey]),
        `committed assets.${assetKey} must be preserved unchanged`
      );
    }
  }
}

function main() {
  const snapshot = snapshotProtectedFiles();

  assert(fs.existsSync(FIXTURE_PATH), 'M-24 fixture is missing');
  assert(fs.existsSync(COMMIT_SCRIPT_PATH), 'M-24 commit script is missing');
  assertCommitScriptSource();
  assertFixture(readJson(FIXTURE_PATH));
  assertSyntheticMergeReport();
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
