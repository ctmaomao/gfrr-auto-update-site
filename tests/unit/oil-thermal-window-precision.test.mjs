import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { oilThermalBaselineQualityForDays, summarizeOilThermalFacilityWindows } from '../../scripts/oil-directional/oil-thermal-baseline-quality.mjs';

const DAY = 86400000;
const expected = (days) => days < 7 ? 'starter_short_window' : days < 30 ? 'starter_observation_window' : 'established_observation_window';

test('facility quality uses unrounded windows on both sides of each threshold', () => {
  for (const boundary of [7, 30]) for (const delta of [-1, 0, 1]) {
    const days = (boundary * DAY + delta) / DAY;
    const result = summarizeOilThermalFacilityWindows([{ id: 'younger', windowDays: days }, { id: 'older', windowDays: 40.123456 }]);
    assert.equal(result.minimumFacilityWindowDays, days);
    assert.equal(result.maximumFacilityWindowDays, 40.123456);
    assert.equal(result.effectiveQualityWindowDays, days);
    assert.equal(oilThermalBaselineQualityForDays(result.effectiveQualityWindowDays), expected(days));
    assert.equal(result.facilitiesMeetingTargetDays, 1 + Number(days >= 30));
    assert.equal(result.facilitiesBelowTargetDays, Number(days < 30));
  }
  assert.equal(summarizeOilThermalFacilityWindows([]).effectiveQualityWindowDays, null);
  for (const value of [null, NaN, Infinity, -1]) {
    assert.equal(summarizeOilThermalFacilityWindows([{ id: 'invalid', windowDays: value }]).complete, false);
    assert.equal(oilThermalBaselineQualityForDays(value), null);
  }
  for (const days of [0, 7, 27.74, 30, 36.2]) {
    assert.equal(summarizeOilThermalFacilityWindows([{ id: 'existing', windowDays: days }]).effectiveQualityWindowDays, days);
  }
});

function reviewWindow(milliseconds) {
  const dir = mkdtempSync(join(tmpdir(), 'thermal-window-'));
  try {
    const start = Date.parse('2026-06-01T00:00:00.000Z');
    const paths = [start, start + milliseconds].map((at, i) => {
      const path = join(dir, `sample-${i}.json`);
      writeFileSync(path, JSON.stringify({ schemaVersion: 'oil-thermal-watch-1', module: 'oil-thermal-watch',
        sources: ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT'],
        generatedAt: new Date(at).toISOString(), status: 'ok', sourceStatus: { firms: 'live' }, productionImpact: { affectsScoring: false },
        aggregate: { facilityCount: 1, requestCount: 3, requestErrorCount: 0, requestDiagnostics: { policyVersion: 'firms-request-policy-1', logicalRequestCount: 3, failedRequestCount: 0, failuresByCategory: {} } },
        facilities: [{ id: 'synthetic-only', sourceStatus: 'live', requestErrorCount: 0, rowCount: 1, maxFrp: 0, highConfidenceCount: 0, frpOver50Count: 0, frpOver100Count: 0, baselineComparison: { sourcesWithDetections: 1 } }] }));
      return path;
    });
    const run = spawnSync(process.execPath, ['scripts/oil-directional/review-oil-thermal-baseline-samples.mjs', ...paths.flatMap(path => ['--input', path]), '--min-samples', '2', '--json', '--no-output'], { encoding: 'utf8', timeout: 30000 });
    assert.equal(run.status, 0, run.stderr);
    return JSON.parse(run.stdout);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('real offline review preserves elapsed milliseconds through candidate quality metadata', () => {
  for (const boundary of [7, 30]) for (const delta of [-1, 0, 1]) {
    const duration = boundary * DAY + delta, days = duration / DAY;
    const result = reviewWindow(duration);
    assert.equal(result.summary.sampleWindowDays, days);
    assert.equal(result.facilities[0].windowDays, days);
    assert.equal(result.candidateBaseline.facilities[0].windowDays, days);
    assert.equal(result.candidateBaseline.effectiveQualityWindowDays, days);
    assert.equal(oilThermalBaselineQualityForDays(result.candidateBaseline.effectiveQualityWindowDays), expected(days));
    assert.equal(result.candidateBaseline.facilitiesMeetingQualityTarget, Number(days >= 30));
  }
});
