import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const errors = [];
function fail(msg) {
  errors.push(msg);
}

const matrixPath = resolve('scripts/modules/buildCrossValidationMatrix.js');
const matrixContent = readFileSync(matrixPath, 'utf8');

const m52EvidenceTypes = [
  'nfci_hy_mismatch',
  'curve_qqq_mismatch',
  'dxy_qqq_mismatch',
  'ighy_vix_mismatch',
  'repo_vix_mismatch',
];

for (const type of m52EvidenceTypes) {
  if (!matrixContent.includes(`'${type}'`)) {
    fail(`M-52 evidence type '${type}' not found in buildCrossValidationMatrix.js source`);
  }
}

const preservedEvidence = [
  'risk_complacency_watch',
  'qqq_zscore',
];

for (const type of preservedEvidence) {
  if (!matrixContent.includes(`'${type}'`)) {
    fail(`Pre-M-52 evidence type '${type}' not preserved`);
  }
}

if (matrixContent.includes("'vix_hy_oas'")) {
  fail("'vix_hy_oas' evidence should be REMOVED in M-52 (replaced by 'ighy_vix_mismatch')");
}

if (!matrixContent.includes('supportingCount >= 4')) {
  fail('M-52 multi-level interpretation logic not found (expected: supportingCount >= 4 branch)');
}
if (!matrixContent.includes('supportingCount >= 2')) {
  fail('M-52 moderate-level interpretation logic not found (expected: supportingCount >= 2 branch)');
}

if (!matrixContent.includes('bgcrSofrSpread * 100')) {
  fail('M-52 bgcrSofrSpread bp conversion not found (expected: bgcrSofrSpread * 100)');
}

const buggyPattern = /metric\.zScore >= 1\.5\) \{[^}]+\} else \{[^}]+missing/s;
if (buggyPattern.test(matrixContent)) {
  fail('M-52 qqq_zscore missing logic bug still present (else branch fires on neutral zScore)');
}

const newFields = ['credit.nfci', 'credit.igHyRatio', 'curve.t10y2y', 'fedLiquidity.bgcrSofrSpread'];
for (const field of newFields) {
  if (!matrixContent.includes(field)) {
    fail(`M-52 expected data field access '${field}' not found in source`);
  }
}

if (errors.length > 0) {
  console.error('Risk asset mismatch narrative density check FAILED:');
  errors.forEach((err) => console.error('  -', err));
  process.exit(1);
}

console.log('Risk asset mismatch narrative density check: PASS (M-52 evidence types present + pre-M-52 preserved + bug fixes verified)');
