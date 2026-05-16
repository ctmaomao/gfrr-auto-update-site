import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const errors = [];
function fail(msg) { errors.push(msg); }

const matrixPath = resolve('scripts/modules/buildCrossValidationMatrix.js');
const matrixContent = readFileSync(matrixPath, 'utf8');

// Verify M-53 new evidence types are present in source code
const m53EvidenceTypes = [
  'pmi_overheat',
  'sloos_easing',
  'hyoas_complacency',
  'nfci_easing',
  'umich_improving',
  'repo_zero_stress',
  'hyOas_qqq_complacency' // new contradicting (replaces old credit_confirmation)
];

for (const type of m53EvidenceTypes) {
  if (!matrixContent.includes(`'${type}'`)) {
    fail(`M-53 evidence type '${type}' not found in buildCrossValidationMatrix.js source`);
  }
}

// Verify pre-M-53 preserved evidence
const preservedEvidence = [
  'qqq_zscore',
  'qqq_close_vs_mean',
  'qqq_stddev'
];
for (const type of preservedEvidence) {
  if (!matrixContent.includes(`'${type}'`)) {
    fail(`Pre-M-53 evidence type '${type}' not preserved`);
  }
}

// Verify old credit_confirmation is REMOVED
if (matrixContent.includes("'credit_confirmation'")) {
  fail("'credit_confirmation' evidence should be REMOVED in M-53 (replaced by 'hyOas_qqq_complacency')");
}

// Verify assessment redesign
// Old buggy pattern: assessment: metric?.zScore >= 2 ? 'strong_confirmation' : null
// New pattern: assessment: metric?.zScore >= 2 ? 'strong_confirmation' : undefined
const oldNullPattern = /assessment:\s*metric\?\.zScore\s*>=\s*2\s*\?\s*'strong_confirmation'\s*:\s*null/;
if (oldNullPattern.test(matrixContent)) {
  fail('M-53 assessment field still uses null fallback (should use undefined to allow assessEvidence)');
}

// Verify multi-level interpretation logic
if (!matrixContent.includes('supportingCount >= 5')) {
  fail('M-53 multi-level interpretation logic not found (expected: supportingCount >= 5 branch)');
}
if (!matrixContent.includes('supportingCount >= 3')) {
  fail('M-53 moderate-level interpretation logic not found (expected: supportingCount >= 3 branch)');
}
if (!matrixContent.includes('contradictingCount >= 3')) {
  fail('M-53 reverse-weakness interpretation logic not found (expected: contradictingCount >= 3 branch)');
}

// Verify bgcrSofrSpread unit conversion (M-50/M-52 pattern reuse)
if (!matrixContent.includes('bgcrSofrSpread * 100')) {
  fail('M-53 bgcrSofrSpread bp conversion not found (expected: bgcrSofrSpread * 100)');
}

// Verify finite() defensive checks for new fields
const newFields = [
  'consumer.ismManufacturingPmi',
  'consumer.threeMonthChange',
  'credit.sloosTighteningLargeFirms',
  'credit.nfci',
  'fedLiquidity.bgcrSofrSpread'
];
for (const field of newFields) {
  if (!matrixContent.includes(field)) {
    fail(`M-53 expected data field access '${field}' not found in source`);
  }
}

// Verify contradictingEvidence is now actively pushed (no longer empty)
// Count .push(evidence( inside contradictingEvidence -- should be >= 7 calls (6 macro + 1 hyOas_qqq)
const contradictingPushes = matrixContent.match(/contradictingEvidence\.push/g) || [];
if (contradictingPushes.length < 7) {
  fail(`M-53 contradictingEvidence.push() count is ${contradictingPushes.length}, expected >= 7 (6 macro + 1 hyOas_qqq_complacency)`);
}

if (errors.length > 0) {
  console.error('Overheat confirmation narrative density check FAILED:');
  errors.forEach(err => console.error('  -', err));
  process.exit(1);
}
console.log('Overheat confirmation narrative density check: PASS (M-53 evidence types present + pre-M-53 preserved + assessment redesigned + contradicting bug fixed)');
