import fs from 'node:fs';
import path from 'node:path';
import {
  buildMetricsCalculationReport,
  computeRollingMetrics
} from './market-pricing/metrics-calculation-scaffold.mjs';

const ROOT = process.cwd();
const FIXTURE_PATH = path.join(
  ROOT,
  'docs',
  'fixtures',
  'market-pricing',
  'metrics-calculation-scaffold-v28.0M-26.json'
);
const CALCULATION_SCRIPT_PATH = path.join(
  ROOT,
  'scripts',
  'market-pricing',
  'metrics-calculation-scaffold.mjs'
);
const PROTECTED_FILES = [
  'data/market-pricing-history.json',
  'data/radar-data.json',
  'data/radar-history.json',
  'data/radar-history-full.json',
  'data/market-pricing-metrics.json'
];
const FORBIDDEN_SOURCE_SUBSTRINGS = [
  ['fe', 'tch('].join(''),
  ['ht', 'tp.get'].join(''),
  ['ht', 'tps.get'].join(''),
  ['ax', 'ios'].join(''),
  ['process', 'env'].join('.'),
  '--enable-frontend',
  '--activate',
  '--cap-zscore',
  '--population-stddev',
  '--bypass-sanity-checks'
];
const REQUIRED_SOURCE_SUBSTRINGS = [
  'data/market-pricing-history.json',
  'data/market-pricing-metrics.json',
  '--commit-metrics',
  '--dry-run-calculate',
  '60'
];
const REQUIRED_BOUNDARIES = {
  noFetch: true,
  noFrontendChange: true,
  noHistoryWrite: true,
  noScoringChange: true,
  noDecisionChange: true,
  notInvestmentAdvice: true,
  noEnvironmentRead: true,
  noDependencyAdded: true,
  calculationLayerActive: true,
  displayLayerActive: false,
  affectsScoring: false,
  affectsDecisionModel: false,
  affectsExecutionLock: false,
  affectsPositionGuidance: false,
  twoStageConfirmation: true,
  atomicWriteEnforced: true,
  sanityChecksBeforeWrite: true,
  windowSizeLocked: true,
  stdDevFormulaLocked: 'sample_N_minus_1',
  zScoreNotCapped: true
};

const errors = [];

function assert(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

function assertEqual(actual, expected, message) {
  assert(
    Object.is(actual, expected),
    `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );
}

function readText(relativeOrAbsolutePath) {
  return fs.readFileSync(relativeOrAbsolutePath, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function round4(value) {
  return Math.round(value * 10000) / 10000;
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

function syntheticRecords(count, closeForIndex) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(2020, 0, 3 + (index * 7))).toISOString().slice(0, 10);
    return {
      date,
      isoWeek: `2020-W${String((index % 52) + 1).padStart(2, '0')}`,
      close: closeForIndex(index)
    };
  });
}

function independentSampleStdDev(values) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const squaredDeviationSum = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0);
  return Math.sqrt(squaredDeviationSum / (values.length - 1));
}

function assertComputeRollingMetrics() {
  const constant = syntheticRecords(60, () => 100);
  const constantOutput = computeRollingMetrics(constant);
  assertEqual(constantOutput.length, 1, 'constant output length');
  assertEqual(constantOutput[0]?.ma60, 100, 'constant ma60');
  assertEqual(constantOutput[0]?.stdDev60, 0, 'constant stdDev60');
  assertEqual(constantOutput[0]?.zScore, 0, 'constant zScore');

  const linear60 = syntheticRecords(60, (index) => index + 1);
  const linear60Output = computeRollingMetrics(linear60);
  const linearValues = linear60.map((record) => record.close);
  assertEqual(linear60Output.length, 1, 'linear60 output length');
  assertEqual(linear60Output[0]?.ma60, 30.5, 'linear60 ma60');
  assertEqual(linear60Output[0]?.stdDev60, round4(independentSampleStdDev(linearValues)), 'linear60 stdDev60');
  assertEqual(linear60Output[0]?.stdDev60, round4(Math.sqrt(305)), 'linear60 stdDev60 closed form');

  const linear61 = syntheticRecords(61, (index) => index + 1);
  const linear61Output = computeRollingMetrics(linear61);
  assertEqual(linear61Output.length, 2, 'linear61 output length');
  assertEqual(linear61Output[1]?.ma60, 31.5, 'linear61 second window ma60');

  const spike = syntheticRecords(60, (index) => (index === 59 ? 200 : 100));
  const spikeOutput = computeRollingMetrics(spike);
  assert(spikeOutput[0]?.zScore > 0, 'spike zScore must be positive');

  const seventy = syntheticRecords(70, (index) => index + 10);
  assertEqual(computeRollingMetrics(seventy).length, 11, 'seventy output length');
}

function assertPureReport() {
  const snapshot = snapshotProtectedFiles();
  const report = buildMetricsCalculationReport({ dryRun: true });

  assert(report && typeof report === 'object', 'buildMetricsCalculationReport must return an object');
  assertEqual(report.status, 'dry_run', 'report status');
  assertEqual(report.writePerformed, false, 'report writePerformed');
  assert(Array.isArray(report.records) && report.records.length > 0, 'report records preview must be non-empty');

  // Lower bound: history must have at least WINDOW_SIZE records to produce any metrics.
  // 60 is a known-good floor from M-26's design; the previous hard-coded 523 was
  // brittle and would have broken on every weekly refresh.
  assert(
    report.sourceRecordsCount >= 60,
    `report sourceRecordsCount >= 60: expected at least 60, got ${JSON.stringify(report.sourceRecordsCount)}`
  );

  // Invariant: M-26 emits exactly (source - WINDOW_SIZE + 1) metrics records.
  // This is the rolling window's mathematical guarantee, independent of absolute count.
  const expectedMetricsCount = report.sourceRecordsCount - 60 + 1;
  assertEqual(
    report.metricsRecordsCount,
    expectedMetricsCount,
    'report metricsRecordsCount === sourceRecordsCount - WINDOW_SIZE + 1'
  );

  // Upper bound: 10 years of weekly records ~= 520. Set ceiling at 1500 (~30 years)
  // to catch obvious corruption while never blocking legitimate growth in this
  // project's lifetime.
  assert(
    report.sourceRecordsCount < 1500,
    `report sourceRecordsCount < 1500 (corruption guard): expected below 1500, got ${JSON.stringify(report.sourceRecordsCount)}`
  );

  assertEqual(report.windowSize, 60, 'report windowSize');
  assertEqual(report.asset, 'qqq', 'report asset');
  assertEqual(report.boundaries?.noFetch, true, 'report boundaries.noFetch');
  assertEqual(report.boundaries?.noHistoryWrite, true, 'report boundaries.noHistoryWrite');
  assertEqual(report.boundaries?.noFrontendChange, true, 'report boundaries.noFrontendChange');
  assertEqual(report.boundaries?.calculationLayerActive, true, 'report boundaries.calculationLayerActive');
  assertEqual(report.boundaries?.displayLayerActive, true, 'report boundaries.displayLayerActive');
  assertProtectedFilesUnchanged(snapshot, 'buildMetricsCalculationReport dry-run');
}

function assertCalculationScriptSource() {
  const source = readText(CALCULATION_SCRIPT_PATH);

  for (const pattern of FORBIDDEN_SOURCE_SUBSTRINGS) {
    assert(!source.includes(pattern), `calculation script must not contain ${pattern}`);
  }

  for (const pattern of REQUIRED_SOURCE_SUBSTRINGS) {
    assert(source.includes(pattern), `calculation script must contain ${pattern}`);
  }

  assert(
    source.includes('renameSync') || source.includes('rename('),
    'calculation script must contain renameSync or rename('
  );
  assert(source.includes('sample') || source.includes('N-1'), 'calculation script must document sample stdDev formula');
}

function assertFixture(fixture) {
  assertEqual(fixture.contractVersion, 'v28.0M-26-metrics-calculation-scaffold-1', 'fixture contractVersion');
  assertEqual(fixture.kind, 'market_pricing_metrics_calculation_scaffold', 'fixture kind');
  assertEqual(fixture.firstCalculationApproved, true, 'fixture firstCalculationApproved');
  assertEqual(fixture.calculationLayerActive, true, 'fixture calculationLayerActive');
  assertEqual(fixture.displayLayerActive, false, 'fixture displayLayerActive');
  assertEqual(fixture.windowSize, 60, 'fixture windowSize');
  assertEqual(fixture.stdDevFormula, 'sample', 'fixture stdDevFormula');
  assertEqual(fixture.stdDevDivisor, 'N-1', 'fixture stdDevDivisor');
  assertEqual(fixture.zScoreCapped, false, 'fixture zScoreCapped');
  assertEqual(fixture.targetAsset, 'qqq', 'fixture targetAsset');
  assertEqual(fixture.outputFileTarget, 'data/market-pricing-metrics.json', 'fixture outputFileTarget');
  assertEqual(fixture.sourceFileTarget, 'data/market-pricing-history.json', 'fixture sourceFileTarget');
  assertEqual(fixture.commitFlagName, '--commit-metrics', 'fixture commitFlagName');
  assertEqual(fixture.dryRunFlagName, '--dry-run-calculate', 'fixture dryRunFlagName');
  assertEqual(fixture.sanityCheckCount, 6, 'fixture sanityCheckCount');
  assert(Array.isArray(fixture.sanityCheckCatalog), 'fixture sanityCheckCatalog must be an array');
  assertEqual(fixture.sanityCheckCatalog?.length, 6, 'fixture sanityCheckCatalog length');
  assertEqual(fixture.writeAtomicity?.method, 'tmp_file_plus_rename', 'fixture writeAtomicity.method');

  for (const [key, expected] of Object.entries(REQUIRED_BOUNDARIES)) {
    assertEqual(fixture.boundaries?.[key], expected, `fixture boundaries.${key}`);
  }
}

function main() {
  const snapshot = snapshotProtectedFiles();

  assert(fs.existsSync(FIXTURE_PATH), 'M-26 fixture is missing');
  assert(fs.existsSync(CALCULATION_SCRIPT_PATH), 'M-26 calculation script is missing');
  assertComputeRollingMetrics();
  assertPureReport();
  assertCalculationScriptSource();
  assertFixture(readJson(FIXTURE_PATH));
  assertProtectedFilesUnchanged(snapshot, 'metrics calculation scaffold check');

  if (errors.length > 0) {
    console.error('Market pricing metrics calculation scaffold: FAIL');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('Market pricing metrics calculation scaffold: PASS');
}

main();
