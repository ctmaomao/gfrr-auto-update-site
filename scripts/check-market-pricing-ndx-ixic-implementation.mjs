import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PACKAGE_PATH = 'package.json';
const CHECK_SUITE_PATH = 'scripts/check-suite.mjs';
const IMPLEMENTATION_PATH = 'scripts/market-pricing/ndx-ixic-yahoo-history-refresh.mjs';
const RENDER_PATH = 'scripts/modules/renderMacroOverview.js';
const CROSS_VALIDATION_PATH = 'scripts/modules/buildCrossValidationMatrix.js';
const HISTORY_PATH = 'data/market-pricing-history.json';
const METRICS_PATH = 'data/market-pricing-metrics.json';

const EXPECTED_PACKAGE_SCRIPTS = {
  'check:market-pricing-multi-asset': 'node --check scripts/check-market-pricing-multi-asset.mjs && node scripts/check-market-pricing-multi-asset.mjs',
  'check:market-pricing-ndx-ixic-implementation': 'node --check scripts/check-market-pricing-ndx-ixic-implementation.mjs && node scripts/check-market-pricing-ndx-ixic-implementation.mjs'
};

const REMOVED_SOURCE_REVIEW_SCRIPT = 'check:market-pricing-ndx-ixic-source-review-design';
const REMOVED_SOURCE_REVIEW_FILE = 'scripts/check-market-pricing-ndx-ixic-source-review-design.mjs';

// Ignore list is explicit per AGENTS.md Section 10. These files are allowed
// to mention NDX/IXIC because their purpose is to document or verify M-91,
// not to connect those assets to Worker/scoring/decision paths.
const SOURCE_SCAN_IGNORE_LIST = [
  {
    path: 'docs/MARKET_PRICING_NDX_IXIC_SOURCE_REVIEW_M91.md',
    reason: 'approved source-review/spec reference; intentionally documents NDX/IXIC and Worker non-goals'
  },
  {
    path: IMPLEMENTATION_PATH,
    reason: 'the approved Daily/manual Market Pricing implementation fetches and sanitizes NDX/IXIC'
  },
  {
    path: 'scripts/check-market-pricing-multi-asset.mjs',
    reason: 'contract checker must name all M-91 asset keys and statuses'
  },
  {
    path: 'scripts/check-market-pricing-ndx-ixic-implementation.mjs',
    reason: 'self-checker must name forbidden and required M-91 markers'
  },
  {
    path: 'docs/DATA_SOURCES.md',
    reason: 'authority doc records approved Yahoo source and reverse index'
  },
  {
    path: 'docs/PROJECT_BACKLOG.md',
    reason: 'project memory records implementation completion and self-audit history'
  },
  {
    path: 'docs/MILESTONE_INDEX.md',
    reason: 'milestone index records M-91 as recently merged'
  },
  {
    path: 'docs/INDEX.md',
    reason: 'documentation index reclassifies the source review as implementation reference'
  },
  {
    path: 'docs/DATA_CONTRACT.md',
    reason: 'data contract documents the multi-asset metrics schema'
  },
  {
    path: 'docs/OPERATIONS.md',
    reason: 'operations runbook documents the approved manual refresh path'
  },
  {
    path: 'data/market-pricing-history.json',
    reason: 'production history data now contains NDX/IXIC auxiliary records'
  },
  {
    path: 'data/market-pricing-metrics.json',
    reason: 'production metrics data now contains NDX/IXIC auxiliary metrics'
  }
];

const errors = [];

function fail(message) {
  errors.push(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function assertEqual(actual, expected, message) {
  assert(
    Object.is(actual, expected),
    `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );
}

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function isIgnored(relativePath) {
  return SOURCE_SCAN_IGNORE_LIST.some((entry) => entry.path === relativePath);
}

function walkFiles(dir) {
  if (!fs.existsSync(path.join(ROOT, dir))) return [];
  const output = [];
  const stack = [path.join(ROOT, dir)];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolute);
      } else if (entry.isFile()) {
        output.push(path.relative(ROOT, absolute).replace(/\\/g, '/'));
      }
    }
  }
  return output;
}

function assertNoMarkersInFiles(files, markers, label) {
  for (const file of files) {
    const text = readText(file);
    for (const marker of markers) {
      assert(!text.includes(marker), `${label}: ${file} must not contain ${marker}`);
    }
  }
}

function assertPackageScripts() {
  const pkg = readJson(PACKAGE_PATH);
  for (const [scriptName, expected] of Object.entries(EXPECTED_PACKAGE_SCRIPTS)) {
    assertEqual(pkg.scripts?.[scriptName], expected, `package.json scripts.${scriptName}`);
  }
  assert(!pkg.scripts?.[REMOVED_SOURCE_REVIEW_SCRIPT], `package.json must remove ${REMOVED_SOURCE_REVIEW_SCRIPT}`);
  assert(!pkg.dependencies || Object.keys(pkg.dependencies).length === 0, 'package.json must not add runtime dependencies');
  assertEqual(Object.keys(pkg.devDependencies || {}).join(','), 'xlsx', 'package.json devDependencies remain unchanged');
}

function assertSuiteWiring() {
  const suiteText = readText(CHECK_SUITE_PATH);
  assert(suiteText.includes('check:market-pricing-multi-asset'), 'check-suite market-pricing suite must include multi-asset checker');
  assert(suiteText.includes('check:market-pricing-ndx-ixic-implementation'), 'check-suite market-pricing suite must include implementation checker');
  assert(!suiteText.includes(REMOVED_SOURCE_REVIEW_SCRIPT), 'check-suite must remove source-review design checker');
}

function assertImplementationSource() {
  const source = readText(IMPLEMENTATION_PATH);
  for (const marker of [
    'query1.finance.yahoo.com/v8/finance/chart',
    '%5ENDX',
    '%5EIXIC',
    'marketPricingDailyOnly',
    'history_active_display_only',
    'fallback_candidate_only'
  ]) {
    assert(source.includes(marker), `${IMPLEMENTATION_PATH} must contain ${marker}`);
  }
  for (const marker of ['process.env', 'wrangler', 'KV', '.github/workflows']) {
    assert(!source.includes(marker), `${IMPLEMENTATION_PATH} must not contain ${marker}`);
  }
}

function assertWorkerBoundary() {
  assertNoMarkersInFiles(walkFiles('workers'), ['^NDX', '%5ENDX', '^IXIC', '%5EIXIC', 'YAHOO_NDX', 'YAHOO_IXIC'], 'Worker boundary');
}

function assertNoScoringBoundaryChange() {
  assertNoMarkersInFiles(
    [
      'scripts/modules/buildCrossValidationMatrix.js',
      'scripts/modules/decision.js',
      'scripts/modules/render.js',
      'scripts/run-daily-pipeline.mjs',
      'scripts/validate-data.mjs',
      'data/radar-data.json'
    ],
    ['assets.ndx', 'assets.ixic', 'marketPricingMetricsData.assets.ndx', 'marketPricingMetricsData.assets.ixic'],
    'Scoring/decision boundary'
  );

  const crossValidation = readText(CROSS_VALIDATION_PATH);
  assert(crossValidation.includes("evidence('qqq_zscore'"), 'cross-validation must still use QQQ z-score evidence');
  assert(!crossValidation.includes('ndx_zscore'), 'cross-validation must not add ndx_zscore');
  assert(!crossValidation.includes('ixic_zscore'), 'cross-validation must not add ixic_zscore');
}

function assertFrontendLabels() {
  const render = readText(RENDER_PATH);
  assert(render.includes('纳斯达克 100 — 横向对照'), 'frontend must render NDX auxiliary label');
  assert(render.includes('纳斯达克综合指数 — 广度参照'), 'frontend must render IXIC auxiliary label');
  assert(render.includes('AUXILIARY · DISPLAY ONLY'), 'frontend must mark auxiliary display-only status');
}

function assertDataBoundary() {
  const history = readJson(HISTORY_PATH);
  const metrics = readJson(METRICS_PATH);
  assertEqual(history.assets?.spx?.status, 'fallback_candidate_only', 'history.assets.spx.status');
  assert(!metrics.assets?.spx, 'metrics.assets.spx must remain absent');
  assertEqual(metrics.asset, 'qqq', 'metrics top-level asset');
  assertEqual(metrics.assets?.qqq?.role, 'primary', 'metrics.assets.qqq.role');
  assertEqual(metrics.assets?.ndx?.role, 'auxiliary_comparison', 'metrics.assets.ndx.role');
  assertEqual(metrics.assets?.ixic?.role, 'auxiliary_breadth_reference', 'metrics.assets.ixic.role');
}

for (const entry of SOURCE_SCAN_IGNORE_LIST) {
  assert(typeof entry.reason === 'string' && entry.reason.length > 20, `ignore list entry ${entry.path} must include reason`);
}
assert(isIgnored(IMPLEMENTATION_PATH), 'implementation path must be explicitly ignored in broad source scans');
assert(!fs.existsSync(path.join(ROOT, REMOVED_SOURCE_REVIEW_FILE)), 'source-review design checker file must be deleted');
assertPackageScripts();
assertSuiteWiring();
assertImplementationSource();
assertWorkerBoundary();
assertNoScoringBoundaryChange();
assertFrontendLabels();
assertDataBoundary();

if (errors.length) {
  console.error('M-91 NDX/IXIC implementation check: FAIL');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('M-91 NDX/IXIC implementation check: PASS');
