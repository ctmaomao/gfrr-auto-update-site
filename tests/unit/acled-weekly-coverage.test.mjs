import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { ACLED_WEEKLY_REGIONS, selectWeeklyFiles, weeklyCoverageFailures } from '../../scripts/world-order/acled-weekly-coverage.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const entries = ACLED_WEEKLY_REGIONS.map((region) => ({ region }));
const name = (region, date = '2026-08-28', suffix = '') => `${region}_aggregated_data_up_to_week_of-${date}${suffix}.xlsx`;

// Synthetic CLI input: do not inherit mutable operator data or rewrite only one
// date in a published common-window payload. Every valid date case is coherent.
function weeklyConfig(latestWeek) {
  const end = Date.parse(`${latestWeek}T00:00:00Z`);
  const weeks12 = Array.from({ length: 12 }, (_, i) =>
    new Date(end - (11 - i) * 7 * 86_400_000).toISOString().slice(0, 10));
  return {
    version: '1.0.0',
    source: 'acled-aggregated-manual-normalized-weekly',
    sourceName: 'ACLED synthetic CLI test fixture',
    preparedAt: `${latestWeek}T00:00:00.000Z`,
    preparedBy: 'test',
    latestWeek,
    filesIngested: ACLED_WEEKLY_REGIONS.map(region => ({
      region, filename: name(region, latestWeek), weekRange: [weeks12[0], latestWeek], rowCount: 12
    })),
    global: {
      eventsLast4Weeks: 24, eventsLast12Weeks: 72, eventsDelta4Vs12: 0,
      fatalitiesLast4Weeks: 0, fatalitiesLast12Weeks: 0, civilianTargetingShareLast4Weeks: 0
    },
    regionalLast4Weeks: ACLED_WEEKLY_REGIONS.map(region => ({
      region, events: 4, fatalities: 0, civilianTargetingEvents: 0, topCountriesByEvents: []
    })),
    hotZonesLast4Weeks: [],
    quality: {
      isRealData: true, // Exercises the required admission flag only inside the disposable fixture.
      sourceUrl: 'https://acleddata.com/conflict-data/download-data-files',
      licenseLevel: 'open',
      attribution: 'ACLED (Armed Conflict Location & Event Data) — https://acleddata.com',
      methodologyNoteZh: '此内容是仅用于临时测试目录的合成样本，不代表真实来源；六个区域使用同一连续十二周窗口，且不会写入项目生产配置。',
      confidence: 0.85,
      weeklyWindow: { version: 'common-week-grid-v1', latestWeek, weeks12, weeks4: weeks12.slice(-4), regions: [...ACLED_WEEKLY_REGIONS] }
    }
  };
}

test('six canonical regions pass regardless of order; missing, duplicate and unknown fail', () => {
  assert.deepEqual(weeklyCoverageFailures(entries.toReversed(), 'test'), []);
  for (const bad of [null, [], entries.slice(0, 4), [...entries, entries[0]], [...entries.slice(1), entries[1]], [...entries.slice(1), { region: 'Unknown' }]]) {
    assert.ok(weeklyCoverageFailures(bad, 'test').length > 0);
  }
});

test('staggered official dates and download suffixes retain all six regions', () => {
  const filenames = ACLED_WEEKLY_REGIONS.map((region, i) => name(region, i < 3 ? '2026-08-28' : '2026-08-14', ['', '_0', ' (1)', '_0 (1)', '-copy', ''][i]));
  const selected = selectWeeklyFiles(filenames);
  assert.deepEqual(weeklyCoverageFailures(selected, 'selected'), []);
  assert.deepEqual(selected.map((entry) => entry.fileWeek), ['2026-08-28', '2026-08-28', '2026-08-28', '2026-08-14', '2026-08-14', '2026-08-14']);
  assert.deepEqual(selected.map((entry) => entry.filename), filenames);
});

test('duplicates are selected deterministically and ignored names cannot satisfy coverage', () => {
  const warnings = [];
  const selected = selectWeeklyFiles([name('Africa', '2026-08-14'), name('Africa'), name('Africa', '2026-08-28', '_0'), name('Unknown'), name('../Africa')], (message) => warnings.push(message));
  const expectedName = [name('Africa'), name('Africa', '2026-08-28', '_0')].sort((a, b) => a.localeCompare(b))[0];
  assert.deepEqual(selected, [{ region: 'Africa', fileWeek: '2026-08-28', filename: expectedName }]);
  assert.equal(warnings.length, 4);
  assert.ok(weeklyCoverageFailures(selected, 'selected').length > 0);
  assert.throws(() => selectWeeklyFiles([name('Africa', '2026-02-30')]), /invalid weekly filename date/u);
  const upperExtension = ACLED_WEEKLY_REGIONS.map((region) => name(region).replace('.xlsx', '.XLSX'));
  assert.equal(selectWeeklyFiles(upperExtension).length, 0);
  assert.ok(weeklyCoverageFailures(selectWeeklyFiles(upperExtension), 'selected').length > 0);
});

// Exercise real CLIs in a disposable repo-shaped directory, never production configs.
// These admission tests must not depend on installed parser packages (Pages has none).
test('CLI rejects partial batches before parsing and preserves config byte-for-byte', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'gfrr-acled-coverage-test-'));
  try {
    const parserStub = path.join(fixture, 'node_modules/xlsx');
    fs.mkdirSync(parserStub, { recursive: true });
    fs.writeFileSync(path.join(parserStub, 'package.json'), JSON.stringify({ type: 'module', exports: './index.mjs' }));
    // No workbook is parsed in this test. Any accidental parser call must fail.
    fs.writeFileSync(path.join(parserStub, 'index.mjs'), "export function set_fs() {}\nexport function readFile() { throw new Error('UNEXPECTED_WORKBOOK_PARSE'); }\n");
    for (const relative of ['scripts/world-order/acled-weekly-window.mjs', 'scripts/world-order/acled-freshness.mjs', 'scripts/world-order/sanitize-acled-weekly.mjs', 'scripts/world-order/sanitize-acled-monthly.mjs', 'scripts/world-order/xlsx-input-guard.mjs', 'scripts/world-order/acled-weekly-coverage.mjs', 'scripts/check-world-order-acled-weekly.mjs']) {
      const dest = path.join(fixture, relative);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(root, relative), dest);
    }
    const config = weeklyConfig(new Date().toISOString().slice(0, 10));
    const output = path.join(fixture, 'config/world-order-acled-regional-weekly.json');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const original = JSON.stringify(config);
    fs.writeFileSync(output, original);
    const run = (script, args = []) => spawnSync(process.execPath, [path.join(fixture, script), ...args], { encoding: 'utf8', timeout: 20_000 });
    const checker = 'scripts/check-world-order-acled-weekly.mjs';
    const initialCheck = run(checker);
    assert.equal(initialCheck.status, 0, initialCheck.stderr);
    fs.writeFileSync(output, JSON.stringify(weeklyConfig('2020-01-03')));
    const expired = run(checker);
    assert.equal(expired.status, 1, expired.stderr);
    assert.match(expired.stderr, /expired/);
    const retained = run(checker, ['--runtime-history']);
    assert.equal(retained.status, 0, retained.stderr);
    fs.writeFileSync(output, JSON.stringify(weeklyConfig('2999-01-01')));
    for (const args of [[], ['--runtime-history']]) {
      const future = run(checker, args);
      assert.equal(future.status, 1, future.stderr);
      assert.match(future.stderr, /in the future/);
    }
    fs.writeFileSync(output, JSON.stringify({...config,latestWeek:'2026-02-30'}));
    for(const args of [[],['--runtime-history']]) {
      const result=run(checker,args);assert.equal(result.status,1);assert.match(result.stderr,/parseable/);
    }
    const mismatch = structuredClone(config);
    mismatch.quality.weeklyWindow.latestWeek = '2020-01-03';
    fs.writeFileSync(output, JSON.stringify(mismatch));
    for (const args of [[], ['--runtime-history']]) {
      const result = run(checker, args);
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /window version\/date mismatch/);
    }
    const legacy = structuredClone(config);
    delete legacy.quality.weeklyWindow;
    fs.writeFileSync(output, JSON.stringify(legacy));
    const legacyCheck = run(checker);
    assert.equal(legacyCheck.status, 0, legacyCheck.stderr);
    assert.match(legacyCheck.stderr, /legacy weekly windows unverified/);
    for (const field of ['filesIngested', 'regionalLast4Weeks']) {
      for (const kind of ['missing', 'duplicate', 'unknown']) {
        const bad = structuredClone(config);
        if (kind === 'missing') bad[field].splice(0, 2);
        if (kind === 'duplicate') bad[field][0] = bad[field][1];
        if (kind === 'unknown') bad[field][0].region = 'Unknown';
        fs.writeFileSync(output, JSON.stringify(bad));
        const result = run(checker);
        assert.equal(result.status, 1, `${field}/${kind}: ${result.stderr}`);
        assert.match(result.stderr, /exactly (?:once|six)|unknown region/u);
        assert.equal(run(checker,['--runtime-history']).status,1);
      }
    }
    fs.writeFileSync(output, original);
    const sanitizer = 'scripts/world-order/sanitize-acled-weekly.mjs';
    const noInput = run(sanitizer);
    assert.equal(noInput.status, 0, noInput.stderr); // No input remains a no-op.
    assert.equal(fs.readFileSync(output, 'utf8'), original);
    const input = path.join(fixture, 'manual-artifacts/world-order/acled-input/weekly');
    fs.mkdirSync(input, { recursive: true });
    for (const region of ACLED_WEEKLY_REGIONS.slice(0, 4)) fs.writeFileSync(path.join(input, name(region)), 'not a workbook');
    const result = run(sanitizer);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /exactly six regions.*existing config preserved/u);
    assert.doesNotMatch(result.stderr, /UNEXPECTED_WORKBOOK_PARSE/u);
    assert.equal(fs.readFileSync(output, 'utf8'), original);
  } finally {
    // Only the exact mkdtemp-created fixture is removed; no user data is inside it.
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
