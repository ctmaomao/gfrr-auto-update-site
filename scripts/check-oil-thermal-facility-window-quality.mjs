#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  oilThermalBaselineQualityForDays,
  summarizeOilThermalFacilityWindows
} from './oil-directional/oil-thermal-baseline-quality.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readSource(path) {
  return readFileSync(resolve(path), 'utf8');
}

const mixedWindow = summarizeOilThermalFacilityWindows([
  { id: 'usgc-established', windowDays: 36.2 },
  { id: 'middle-east-near-target', windowDays: 28.81 },
  { id: 'middle-east-latest', windowDays: 27.74 }
]);
assert(mixedWindow.complete, 'mixed facility-window summary must be complete');
assert(mixedWindow.minimumFacilityWindowDays === 27.74, 'minimum facility window must be conservative');
assert(mixedWindow.maximumFacilityWindowDays === 36.2, 'maximum facility window must retain audit horizon');
assert(mixedWindow.effectiveQualityWindowDays === 27.74, 'effective quality window must use the facility floor');
assert(mixedWindow.facilitiesMeetingTargetDays === 1, 'only one mixed-window facility should meet 30 days');
assert(mixedWindow.facilitiesBelowTargetDays === 2, 'two mixed-window facilities should remain below 30 days');
assert(
  oilThermalBaselineQualityForDays(mixedWindow.effectiveQualityWindowDays) === 'starter_observation_window',
  'mixed-vintage baseline must not be labelled established from the global horizon'
);

const establishedWindow = summarizeOilThermalFacilityWindows([
  { id: 'facility-a', windowDays: 30 },
  { id: 'facility-b', windowDays: 31.25 }
]);
assert(
  oilThermalBaselineQualityForDays(establishedWindow.effectiveQualityWindowDays)
    === 'established_observation_window',
  'all promoted facilities at 30+ days must be eligible for established quality'
);

const incompleteWindow = summarizeOilThermalFacilityWindows([
  { id: 'facility-a', windowDays: 30 },
  { id: 'facility-missing', windowDays: null }
]);
assert(!incompleteWindow.complete, 'missing facility windows must fail closed');
assert(
  incompleteWindow.invalidFacilityIds.includes('facility-missing'),
  'missing facility id must remain auditable'
);

const sourceRequirements = [
  [
    'scripts/oil-directional/review-oil-thermal-baseline-samples.mjs',
    ['summarizeOilThermalFacilityWindows', 'facilityWindowSummary.minimumFacilityWindowDays']
  ],
  [
    'scripts/oil-directional/promote-oil-thermal-baseline-candidate.mjs',
    ['oil-thermal-baseline-promotion-p68', 'minimum_facility_window_days']
  ],
  [
    'scripts/oil-directional/monitor-oil-thermal-baseline-quality.mjs',
    ['candidateEffectiveQualityWindowDays', 'effectiveQualityWindowDays']
  ],
  [
    'scripts/check-oil-thermal-baseline-config.mjs',
    ['oil-thermal-baseline-promotion-p68', 'minimumFacilityWindowDays']
  ],
  [
    'scripts/oil-directional/build-oil-thermal-watch.mjs',
    ['baselineQualityBasis', 'global_sample_window_days_legacy']
  ],
  [
    'scripts/modules/renderOilDirectional.js',
    ['effectiveQualityWindowDays', '最短设施窗']
  ]
];

for (const [path, markers] of sourceRequirements) {
  const source = readSource(path);
  for (const marker of markers) {
    assert(source.includes(marker), `${path} must retain facility-window quality marker: ${marker}`);
  }
}

console.log(
  'PASS: oil thermal baseline quality uses the minimum promoted-facility window and preserves the global history horizon for audit.'
);
