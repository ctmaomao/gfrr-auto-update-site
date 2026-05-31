import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const errors = [];
const fail = (m) => errors.push(m);
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

const FORBIDDEN = ['buildMacroCoherence', 'macroCoherence'];
const SCORING_FILES = [
  'scripts/run-daily-pipeline.mjs',
  'scripts/modules/decision.js',
  'scripts/modules/realtime.js',
];
for (const f of SCORING_FILES) {
  const txt = read(f);
  for (const sym of FORBIDDEN) {
    if (txt.includes(sym)) fail(`${f} must not reference '${sym}' — macro coherence is display-only.`);
  }
}

const data = JSON.parse(read('data/radar-data.json'));
const hasKey = (o, k) => o && Object.prototype.hasOwnProperty.call(o, k);
if (hasKey(data, 'macroCoherence') || hasKey(data.macroDrivers, 'macroCoherence')) {
  fail('data/radar-data.json must not contain macroCoherence — render-time only, never persisted.');
}

const matrixSrc = read('scripts/modules/buildCrossValidationMatrix.js');
if (!matrixSrc.includes('export function buildMacroCoherence')) {
  fail('buildMacroCoherence must be defined + exported in buildCrossValidationMatrix.js.');
}
if (/consistencyScore/.test(matrixSrc.split('export function buildMacroCoherence')[1] || '')) {
  fail('buildMacroCoherence must not compute or reference consistencyScore (no second score).');
}

if (errors.length > 0) {
  console.error('Macro coherence display-only check FAILED:');
  errors.forEach((e) => console.error('  -', e));
  process.exit(1);
}
console.log('Macro coherence display-only check: PASS (display-only; not referenced by scoring/decision; not persisted; no second score)');
