#!/usr/bin/env node
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const EXPECTED_SOURCE = 'https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz';
const EXPECTED_INTEGRITY = 'sha512-oLDq3jw7AcLqKWH2AhCpVTZl8mf6X2YReP+Neh0SJUzV/BdZYjth94tG5toiMB1PPrYtxOCfaoUCkvtuH+3AJA==';
const SANITIZERS = new Map([
  ['scripts/world-order/sanitize-acled-weekly.mjs', ['16 * 1024 * 1024', '350_000', '32']],
  ['scripts/world-order/sanitize-acled-monthly.mjs', ['1 * 1024 * 1024', '50_000', '8']]
]);
const SKIP_DIRECTORIES = new Set(['.git', '.wrangler', '_site', 'manual-artifacts', 'node_modules', 'playwright-report', 'test-results']);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return SKIP_DIRECTORIES.has(entry.name) ? [] : walk(path);
    return [path];
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
  const xlsxImport = /(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*(?:\(\s*)?)['"]xlsx(?:\/[^'"]*)?['"]/u;
  const importers = walk('.')
    .filter((file) => /\.[cm]?js$/u.test(file))
    .filter((file) => xlsxImport.test(readFileSync(file, 'utf8')))
    .map((file) => relative('.', file).replaceAll('\\', '/'))
    .sort();
  assert(
    JSON.stringify(importers) === JSON.stringify([...SANITIZERS.keys()].sort()),
    `xlsx import boundary changed: ${importers.join(', ') || '(none)'}`
  );

  for (const [file, [byteLimit, rowLimit, columnLimit]] of SANITIZERS) {
    const source = readFileSync(file, 'utf8');
    for (const marker of [
      'import * as xlsx',
      'xlsx.set_fs(fs)',
      "from './xlsx-input-guard.mjs'",
      `MAX_INPUT_BYTES = ${byteLimit}`,
      `MAX_DATA_ROWS = ${rowLimit}`,
      `MAX_DATA_COLUMNS = ${columnLimit}`,
      'MAX_BATCH_INPUT_BYTES',
      'MAX_BATCH_UNCOMPRESSED_BYTES',
      'preflightXlsxInputs({',
      'assertWorksheetDimensions(',
      "sheets: 'Sheet1'",
      'sheetRows: MAX_DATA_ROWS + 2'
    ]) {
      assert(source.includes(marker), `${file} missing XLSX boundary: ${marker}`);
    }
  }

  const guard = readFileSync('scripts/world-order/xlsx-input-guard.mjs', 'utf8');
  for (const marker of [
    'CENTRAL_SIGNATURE',
    'fs.lstatSync(candidate)',
    'stats.isSymbolicLink()',
    'fs.realpathSync(inputDir)',
    'inflateRawSync(compressed, { maxOutputLength:',
    'actualUncompressedBytes !== uncompressedBytes',
    'maxCompressionRatio',
    'maxBatchUncompressedBytes',
    'assertWorksheetDimensions',
  ]) assert(guard.includes(marker), `XLSX guard missing executable boundary: ${marker}`);

  const test = readFileSync('tests/unit/xlsx-input-guard.test.mjs', 'utf8');
  for (const marker of ['compression ratio', 'unsafe ZIP entry name', 'declares 100 bytes but expands to 900', 'data rows', 'columns']) {
    assert(test.includes(marker), `XLSX adversarial test missing: ${marker}`);
  }
}

checkDependencyLock();
checkSanitizerBoundaries();
console.log('XLSX dependency and input boundaries: PASS');
