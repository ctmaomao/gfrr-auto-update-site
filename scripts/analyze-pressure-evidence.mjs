#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { historicalErrorDiagnostics, ledgerChangeDiagnostics, diagnosticsMarkdown } from './daily/pressure-evidence-diagnostics.mjs';
import { digest } from './daily/pressure-model.mjs';

const ROOT = path.resolve('manual-artifacts/main-score-audit/pressure-model');
export function parseEvidenceArgs(args) {
  const options = { cache: path.join(ROOT, 'source-cache.json'), report: path.join(ROOT, 'report.json'),
    ledger: path.join(ROOT, 'shadow-ledger.json'), outputDir: path.join(ROOT, 'diagnostics') };
  const keys = { '--cache': 'cache', '--report': 'report', '--ledger': 'ledger', '--output-dir': 'outputDir' };
  for (let i = 0; i < args.length; i++) {
    const key = keys[args[i]], value = args[++i];
    if (!key || !value || value.startsWith('--')) throw new Error('Invalid evidence arguments');
    options[key] = path.resolve(value);
  }
  if (!options.outputDir.startsWith(ROOT + path.sep)) throw new Error('Output must stay in ignored pressure research directory');
  for (const file of ['diagnostics.json', 'summary.md']) if (['cache', 'report', 'ledger'].some(key => path.resolve(options[key]) === path.join(options.outputDir, file))) {
    throw new Error('Diagnostic output cannot overwrite an input');
  }
  // Refuse symlinked destinations rather than letting an ignored path redirect to production.
  for (let target = options.outputDir; target !== path.dirname(target); target = path.dirname(target)) {
    if (fs.lstatSync(target, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error('Linked output directory forbidden');
  }
  for (const file of ['diagnostics.json', 'summary.md']) {
    const target = path.join(options.outputDir, file);
    if (fs.lstatSync(target, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error('Linked output file forbidden');
  }
  return options;
}

export function main(args = process.argv.slice(2)) {
  const options = parseEvidenceArgs(args), read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  const protocol = read('config/pressure-model-research.json');
  const result = { schemaVersion: 'pressure-evidence-diagnostics-v1', generatedAt: new Date().toISOString(),
    diagnosticImplementationHash: digest(['scripts/analyze-pressure-evidence.mjs', 'scripts/daily/pressure-evidence-diagnostics.mjs',
      'scripts/audit-pressure-vintages.mjs'].map(file => fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n'))),
    productionReplacementEnabled: false,
    shadow: ledgerChangeDiagnostics(read(options.ledger), protocol),
    history: historicalErrorDiagnostics(read(options.cache), read(options.report), protocol, read('config/rules.json')) };
  fs.mkdirSync(options.outputDir, { recursive: true });
  fs.writeFileSync(path.join(options.outputDir, 'diagnostics.json'), JSON.stringify(result, null, 2) + '\n');
  fs.writeFileSync(path.join(options.outputDir, 'summary.md'), diagnosticsMarkdown(result));
  console.log(JSON.stringify({ outputDir: options.outputDir, matchedWeeks: result.history.matchedWeeks,
    records: result.shadow.records, transitions: result.shadow.transitions.length, modelImplementationHash: result.shadow.implementationHash }));
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(`[pressure-evidence] ${error.message}`); process.exitCode = 1; }
}
