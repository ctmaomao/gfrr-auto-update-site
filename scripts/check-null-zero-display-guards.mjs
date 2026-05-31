import fs from 'node:fs';
import path from 'node:path';

import { buildCrossValidationMatrix } from './modules/buildCrossValidationMatrix.js';

const ROOT = process.cwd();

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function fail(message) {
  console.error(`Null-zero display guard failed: ${message}`);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function flattenEvidence(matrix) {
  const rows = [];
  for (const narrative of matrix.narratives || []) {
    for (const bucket of ['supportingEvidence', 'contradictingEvidence', 'missingEvidence']) {
      for (const item of narrative[bucket] || []) {
        rows.push({
          narrative: narrative.id,
          bucket,
          source: item.source,
          value: item.value,
          detail: item.detail,
        });
      }
    }
  }
  return rows;
}

function assertRepoMissingStaysMissing() {
  const syntheticRadarData = {
    displayInputsBaseline: {},
    macroDrivers: {
      fedLiquidity: {
        sourceStatus: {
          bgcr: 'missing',
          tgcr: 'missing'
        },
        bgcrSofrSpread: null,
        tgcrSofrSpread: null,
        repoSpreadRegime: '未知'
      },
      consumer: {},
      credit: {},
      curve: {}
    }
  };

  const matrix = buildCrossValidationMatrix(syntheticRadarData, {}, null);
  const rows = flattenEvidence(matrix);
  const renderedEvidence = rows
    .map((row) => `${row.narrative} ${row.bucket} ${row.source} ${row.value ?? ''} ${row.detail ?? ''}`)
    .join('\n');

  assert(
    !renderedEvidence.includes('BGCR-SOFR +0.0bp'),
    'missing BGCR-SOFR spread must not render as BGCR-SOFR +0.0bp.'
  );
  assert(
    !rows.some((row) => row.source === 'repo_zero_stress'),
    'missing BGCR-SOFR spread must not create repo_zero_stress evidence.'
  );
  assert(
    !rows.some((row) => row.source === 'repo_stress' && row.value === '+0.0bp'),
    'missing BGCR-SOFR spread must not create repo_stress +0.0bp evidence.'
  );
  assert(
    rows.some((row) => row.source === 'repo_stress' && row.bucket === 'missingEvidence' && row.value === null),
    'missing BGCR/TGCR spread should remain missingEvidence with null value.'
  );
}

function assertCrossValidationFiniteGuardsMissingValues() {
  const source = readText('scripts/modules/buildCrossValidationMatrix.js');
  const finiteMatch = source.match(/function finite\(value\) \{[\s\S]*?\n\}/u);

  assert(finiteMatch, 'buildCrossValidationMatrix finite helper not found.');
  assert(
    finiteMatch[0].includes('value === null') && finiteMatch[0].includes('value === void 0'),
    'cross-validation finite helper must guard null/undefined before Number(value).'
  );
  assert(
    finiteMatch[0].includes("typeof value === 'string'") && finiteMatch[0].includes("value.trim() === ''"),
    'cross-validation finite helper must guard empty strings before Number(value).'
  );
}

function assertMacroOverviewMissingValueDisplayGuards() {
  const source = readText('scripts/modules/renderMacroOverview.js');
  const forbiddenSnippets = [
    '(brent ?? 0).toFixed(2)',
    '(crackSpread ?? 0).toFixed(2)',
    '(ismPmi ?? 0).toFixed(1)',
    'signedFixed(qqqZ ?? 0, 2)',
    '(hyOas ?? 0).toFixed(2)',
    '(igOas ?? 0).toFixed(2)',
    'signedFixed(nfci ?? 0, 2)',
    'signedFixedWithZero(asNumber(fed.bgcrSofrSpread) ?? 0, 0)',
    'signedFixedWithZero((asNumber(policy.futureMinusTargetMid) ?? 0) * 100, 1)',
    'signedFixedWithZero((asNumber(curve.t10y2y) ?? 0) * 100, 0)',
    '(hy ?? 0).toFixed(2)',
    '(ig ?? 0).toFixed(2)',
  ];

  for (const snippet of forbiddenSnippets) {
    assert(!source.includes(snippet), `renderMacroOverview.js must not default missing display value to zero: ${snippet}`);
  }

  const requiredSnippets = [
    "brent !== null ? brent.toFixed(2) : '—'",
    "crackSpread !== null ? crackSpread.toFixed(2) : '—'",
    "ismPmi !== null ? ismPmi.toFixed(1) : '—'",
    'signedFixed(qqqZ, 2)',
    "hyOas !== null ? hyOas.toFixed(2) : '—'",
    "igOas !== null ? igOas.toFixed(2) : '—'",
    'signedFixed(nfci, 2)',
    'signedFixedWithZero(asNumber(fed.bgcrSofrSpread), 0)',
    'policySpread !== null ? policySpread * 100 : null',
    'curveSpread !== null ? curveSpread * 100 : null',
    "hy !== null ? hy.toFixed(2) : '—'",
    "ig !== null ? ig.toFixed(2) : '—'",
  ];

  for (const snippet of requiredSnippets) {
    assert(source.includes(snippet), `renderMacroOverview.js missing null-safe display guard: ${snippet}`);
  }
}

function main() {
  assertRepoMissingStaysMissing();
  assertCrossValidationFiniteGuardsMissingValues();
  assertMacroOverviewMissingValueDisplayGuards();
  console.log('Null-zero display guard: PASS');
}

main();
