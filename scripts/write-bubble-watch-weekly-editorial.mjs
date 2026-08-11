import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { applyWeeklyEditorialProjection } from './bubble-watch/weekly-editorial-production.mjs';

const SAFE_TARGET = 'data/bubble-watch.json';
const REQUIRED_FLAGS = new Set(['--confirm-production-write', '--data-only']);

function normalizeRepoPath(filePath) {
  return path.relative(process.cwd(), path.resolve(filePath)).split(path.sep).join('/');
}

export function assertWeeklyEditorialSafeTarget(targetPath) {
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
  if (!options.input) throw new Error('missing required --input path');
  if (!options.target) throw new Error('missing required --target path');
  return options;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonAtomically(filePath, value) {
  const resolved = path.resolve(filePath);
  const directory = path.dirname(resolved);
  const temporary = path.join(directory, `.${path.basename(resolved)}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.renameSync(temporary, resolved);
  } catch (error) {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
    throw error;
  }
}

export function buildWeeklyEditorialWriteResult(bubbleWatch, projection) {
  if (projection?.schemaVersion !== 'bubble-watch-weekly-editorial-production-projection-v1') {
    throw new Error('input must be a weekly editorial production projection');
  }
  if (projection.target !== 'data/bubble-watch.json.summary.weekly_editorial') {
    throw new Error('projection target is invalid');
  }
  return applyWeeklyEditorialProjection(bubbleWatch, projection.weeklyEditorial);
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const target = assertWeeklyEditorialSafeTarget(options.target);
    const before = readJson(target);
    const projection = readJson(options.input);
    const after = buildWeeklyEditorialWriteResult(before, projection);
    const changed = JSON.stringify(before.summary?.weekly_editorial || null) !== JSON.stringify(after.summary.weekly_editorial);
    if (changed) writeJsonAtomically(target, after);
    console.log(`Bubble Watch weekly editorial production write PASS (target=${target}, changed=${changed}, scoringChanged=false)`);
  } catch (error) {
    console.error(`Bubble Watch weekly editorial production write FAIL: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main();
