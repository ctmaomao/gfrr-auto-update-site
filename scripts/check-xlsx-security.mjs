#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const EXPECTED_SOURCE = 'https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz';
const EXPECTED_INTEGRITY = 'sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==';
const SANITIZERS = new Map([
  ['scripts/world-order/sanitize-acled-weekly.mjs', ['16 * 1024 * 1024', '350_000']],
  ['scripts/world-order/sanitize-acled-monthly.mjs', ['1 * 1024 * 1024', '50_000']]
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function checkDependencyLock() {
  const pkg = readJson('package.json');
  const lock = readJson('package-lock.json');
  const locked = lock.packages?.['node_modules/xlsx'];
  assert(!pkg.dependencies, 'xlsx must not enter production dependencies.');
  assert(pkg.devDependencies?.xlsx === EXPECTED_SOURCE, 'package.json must pin the official SheetJS 0.20.3 tarball.');
  assert(lock.packages?.['']?.devDependencies?.xlsx === EXPECTED_SOURCE, 'package-lock root dependency must match package.json.');
  assert(locked?.version === '0.20.3', 'package-lock must resolve xlsx 0.20.3.');
  assert(locked?.resolved === EXPECTED_SOURCE, 'package-lock must retain the official SheetJS source URL.');
  assert(locked?.integrity === EXPECTED_INTEGRITY, 'package-lock integrity does not match the reviewed 0.20.3 tarball.');
  assert(locked?.dev === true, 'xlsx must remain a devDependency.');
}

function checkSanitizerBoundaries() {
  const importers = walk('scripts')
    .filter((file) => /\.m?js$/u.test(file))
    .filter((file) => /from\s+['"]xlsx['"]/u.test(readFileSync(file, 'utf8')))
    .map((file) => relative('.', file).replaceAll('\\', '/'))
    .sort();
  assert(
    JSON.stringify(importers) === JSON.stringify([...SANITIZERS.keys()].sort()),
    `xlsx import boundary changed: ${importers.join(', ') || '(none)'}`
  );

  for (const [file, [byteLimit, rowLimit]] of SANITIZERS) {
    const source = readFileSync(file, 'utf8');
    for (const marker of [
      'import * as xlsx',
      'xlsx.set_fs(fs)',
      `MAX_INPUT_BYTES = ${byteLimit}`,
      `MAX_DATA_ROWS = ${rowLimit}`,
      'fs.lstatSync(candidate)',
      'stats.isSymbolicLink()',
      'fs.realpathSync(inputDir)',
      "sheet['!fullref'] || sheet['!ref']",
      "sheets: 'Sheet1'",
      'sheetRows: MAX_DATA_ROWS + 2'
    ]) {
      assert(source.includes(marker), `${file} missing XLSX boundary: ${marker}`);
    }
  }
}

checkDependencyLock();
checkSanitizerBoundaries();
console.log('XLSX dependency and input boundaries: PASS');
