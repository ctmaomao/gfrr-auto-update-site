#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import process from 'node:process';

const errors = [];
const fail = (message) => errors.push(message);

function runProbeFixture() {
  const stdout = execFileSync(process.execPath, [
    'scripts/oil-directional/run-oil-thermal-targeted-probe.mjs',
    '--oil-news',
    'docs/fixtures/oil-thermal/oil-thermal-targeted-probe-news.example.json',
    '--facilities',
    'config/oil-thermal-watch-facilities.json',
    '--dry-run',
    '--no-output'
  ], { encoding: 'utf8' });
  return { stdout, result: JSON.parse(stdout) };
}

const { stdout, result } = runProbeFixture();

if (result.status !== 'targets_ready') fail(`status must be targets_ready, got ${result.status}`);
if (!Number.isFinite(result.matchedFacilityCount) || result.matchedFacilityCount < 3) {
  fail(`matchedFacilityCount must be >=3, got ${result.matchedFacilityCount}`);
}
const ids = new Set((result.matchedFacilities || []).map((facility) => facility.id));
for (const expectedId of [
  'me_uae_fujairah_energy_port_area',
  'me_kuwait_mina_al_ahmadi_terminal_area',
  'me_iraq_khawr_al_amaya_terminal_area'
]) {
  if (!ids.has(expectedId)) fail(`fixture must match ${expectedId}`);
}
for (const leakedText of ['Fixture headline alpha', 'Fixture headline beta', 'Fixture headline gamma']) {
  if (stdout.includes(leakedText)) fail(`targeted probe output leaked raw title: ${leakedText}`);
}
if (!result.diagnosisPlan || result.diagnosisPlan.runDiagnosis !== false) {
  fail('diagnosisPlan.runDiagnosis must stay false in dry-run/check mode');
}
if (JSON.stringify(result.diagnosisPlan?.windowsDays) !== JSON.stringify([1, 3, 5])) {
  fail('diagnosisPlan.windowsDays must be [1,3,5]');
}
if (result.outputPath !== null || result.targetFacilitiesOutputPath !== null) {
  fail('dry-run targeted probe must not write artifacts');
}
if (JSON.stringify(result).includes('firms.modaps.eosdis.nasa.gov/api/area/csv')) {
  fail('targeted probe output must not expose FIRMS request URLs');
}
if (!/artifact-only/i.test(result.boundary || '') || !/not in values, scoring/i.test(result.boundary || '')) {
  fail('boundary must declare artifact-only and scoring exclusion');
}

if (errors.length > 0) {
  console.error('Oil thermal targeted probe check FAILED:');
  for (const error of errors) console.error('  -', error);
  process.exit(1);
}

console.log(`Oil thermal targeted probe check: PASS (${result.matchedFacilityCount} targeted facilities)`);
