import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { applyEditorialProjection } from './macro-risk/editorial-production.mjs';

const SAFE_TARGET = 'data/radar-data.json';
const REQUIRED_FLAGS = new Set(['--confirm-production-write', '--data-only']);

function normalizeRepoPath(filePath) { return path.relative(process.cwd(), path.resolve(filePath)).split(path.sep).join('/'); }

export function assertEditorialSafeTarget(targetPath) {
  const target = normalizeRepoPath(targetPath);
  if (target !== SAFE_TARGET) throw new Error(`refusing unsafe target: ${target}`);
  return target;
}

function parseArgs(argv) {
  const options = { input: null, target: null, flags: new Set() };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input') options.input = argv[++index];
    else if (arg === '--target') options.target = argv[++index];
    else if (REQUIRED_FLAGS.has(arg)) options.flags.add(arg);
    else throw new Error(`unsupported argument: ${arg}`);
  }
  for (const flag of REQUIRED_FLAGS) if (!options.flags.has(flag)) throw new Error(`missing required flag: ${flag}`);
  if (!options.input || !options.target) throw new Error('missing required --input or --target path');
  return options;
}

export function buildEditorialWriteResult(radarData, projection, now = new Date()) {
  if (projection?.schemaVersion !== 'macro-risk-editorial-production-projection-v1') throw new Error('input must be a macro risk editorial production projection');
  if (projection.target !== 'data/radar-data.json.macroRiskEditorialLayer') throw new Error('projection target is invalid');
  return applyEditorialProjection(radarData, projection.macroRiskEditorialLayer, now);
}

function writeJsonAtomically(filePath, value) {
  const resolved = path.resolve(filePath);
  const temporary = path.join(path.dirname(resolved), `.${path.basename(resolved)}.${process.pid}.${Date.now()}.tmp`);
  try { fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); fs.renameSync(temporary, resolved); }
  catch (error) { if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true }); throw error; }
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const target = assertEditorialSafeTarget(options.target);
    const before = JSON.parse(fs.readFileSync(target, 'utf8'));
    const projection = JSON.parse(fs.readFileSync(options.input, 'utf8'));
    const after = buildEditorialWriteResult(before, projection);
    const changed = JSON.stringify(before.macroRiskEditorialLayer || null) !== JSON.stringify(after.macroRiskEditorialLayer);
    if (changed) writeJsonAtomically(target, after);
    console.log(`Macro risk editorial production write PASS (target=${target}, changed=${changed}, scoringChanged=false)`);
  } catch (error) { console.error(`Macro risk editorial production write FAIL: ${error.message}`); process.exitCode = 1; }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main();
