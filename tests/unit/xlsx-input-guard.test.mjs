import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { deflateRawSync } from 'node:zlib';

import { assertWorksheetDimensions, preflightXlsxInputs } from '../../scripts/world-order/xlsx-input-guard.mjs';

function zipDirectory(entries) {
  const localRecords = [];
  const centralRecords = [];
  let localOffset = 0;
  for (const { name, content = Buffer.alloc(0), flags = 0, method = 8, declaredUncompressedBytes } of entries) {
    const filename = Buffer.from(name);
    const compressed = method === 0 ? content : deflateRawSync(content);
    const local = Buffer.alloc(30 + filename.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(filename.length, 26);
    filename.copy(local, 30);
    localRecords.push(local, compressed);

    const central = Buffer.alloc(46 + filename.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(declaredUncompressedBytes ?? content.length, 24);
    central.writeUInt16LE(filename.length, 28);
    central.writeUInt32LE(localOffset, 42);
    filename.copy(central, 46);
    centralRecords.push(central);
    localOffset += local.length + compressed.length;
  }
  const central = Buffer.concat(centralRecords);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localRecords, central, eocd]);
}

function centralOffset(buffer) {
  return buffer.readUInt32LE(buffer.length - 6);
}

function writeCase(directory, name, buffer) {
  writeFileSync(join(directory, name), buffer);
  return () => preflightXlsxInputs({
    inputDir: directory,
    filenames: [name],
    maxInputBytes: 10_000,
    maxBatchInputBytes: 10_000,
    maxBatchUncompressedBytes: 10_000,
    zipLimits: ZIP_LIMITS,
  });
}

const ZIP_LIMITS = {
  maxEntries: 4,
  maxEntryUncompressedBytes: 1_000,
  maxUncompressedBytes: 1_500,
  maxCompressionRatio: 20,
};

test('XLSX preflight validates actual expansion before SheetJS sees a workbook', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'gfrr-xlsx-guard-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const valid = zipDirectory([
    { name: 'xl/worksheets/sheet1.xml', content: Buffer.from(Array.from({ length: 200 }, (_, index) => index)) },
    { name: 'xl/empty/', content: Buffer.alloc(0), method: 0 },
  ]);
  writeFileSync(join(directory, 'valid.xlsx'), valid);

  const files = preflightXlsxInputs({
    inputDir: directory,
    filenames: ['valid.xlsx'],
    maxInputBytes: valid.length,
    maxBatchInputBytes: valid.length,
    maxBatchUncompressedBytes: 200,
    zipLimits: ZIP_LIMITS,
  });
  assert.equal(files.get('valid.xlsx'), join(directory, 'valid.xlsx'));

  writeFileSync(join(directory, 'bomb.xlsx'), zipDirectory([
    { name: 'xl/worksheets/sheet1.xml', content: Buffer.alloc(500, 'x') },
  ]));
  assert.throws(() => preflightXlsxInputs({
    inputDir: directory,
    filenames: ['bomb.xlsx'],
    maxInputBytes: 1_000,
    maxBatchInputBytes: 1_000,
    maxBatchUncompressedBytes: 1_000,
    zipLimits: ZIP_LIMITS,
  }), /compression ratio/u);

  writeFileSync(join(directory, 'escape.xlsx'), zipDirectory([
    { name: '../secret', content: Buffer.from('bounded') },
  ]));
  assert.throws(() => preflightXlsxInputs({
    inputDir: directory,
    filenames: ['escape.xlsx'],
    maxInputBytes: 1_000,
    maxBatchInputBytes: 1_000,
    maxBatchUncompressedBytes: 1_000,
    zipLimits: ZIP_LIMITS,
  }), /unsafe ZIP entry name/u);

  assert.throws(() => preflightXlsxInputs({
    inputDir: directory,
    filenames: ['valid.xlsx'],
    maxInputBytes: valid.length - 1,
    maxBatchInputBytes: 1_000,
    maxBatchUncompressedBytes: 1_000,
    zipLimits: ZIP_LIMITS,
  }), /file size/u);

  writeFileSync(join(directory, 'forged.xlsx'), zipDirectory([
    { name: 'xl/worksheets/sheet1.xml', content: Buffer.alloc(900, 'q'), declaredUncompressedBytes: 100 },
  ]));
  assert.throws(() => preflightXlsxInputs({
    inputDir: directory,
    filenames: ['forged.xlsx'],
    maxInputBytes: 2_000,
    maxBatchInputBytes: 2_000,
    maxBatchUncompressedBytes: 1_500,
    zipLimits: ZIP_LIMITS,
  }), /declares 100 bytes but expands to 900/u);
});

test('XLSX preflight rejects malformed ZIP structures and deceptive headers', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'gfrr-xlsx-structure-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  assert.throws(writeCase(directory, 'missing-eocd.xlsx', Buffer.alloc(22)), /missing ZIP/u);

  const zip64 = zipDirectory([{ name: 'a', content: Buffer.from('a'), method: 0 }]);
  zip64.writeUInt16LE(0xffff, zip64.length - 12);
  assert.throws(writeCase(directory, 'zip64.xlsx', zip64), /ZIP64/u);

  const zeroEntries = zipDirectory([{ name: 'a', content: Buffer.from('a'), method: 0 }]);
  zeroEntries.writeUInt16LE(0, zeroEntries.length - 12);
  assert.throws(writeCase(directory, 'zero.xlsx', zeroEntries), /entry count 0/u);

  const tooManyEntries = zipDirectory([{ name: 'a', content: Buffer.from('a'), method: 0 }]);
  tooManyEntries.writeUInt16LE(5, tooManyEntries.length - 12);
  assert.throws(writeCase(directory, 'many.xlsx', tooManyEntries), /entry count 5/u);

  const badBounds = zipDirectory([{ name: 'a', content: Buffer.from('a'), method: 0 }]);
  badBounds.writeUInt32LE(badBounds.readUInt32LE(badBounds.length - 10) + 1, badBounds.length - 10);
  assert.throws(writeCase(directory, 'bounds.xlsx', badBounds), /central-directory bounds/u);

  const badCentral = zipDirectory([{ name: 'a', content: Buffer.from('a'), method: 0 }]);
  badCentral.writeUInt32LE(0, centralOffset(badCentral));
  assert.throws(writeCase(directory, 'central.xlsx', badCentral), /central-directory entry/u);

  const truncatedCentral = zipDirectory([{ name: 'a', content: Buffer.from('a'), method: 0 }]);
  truncatedCentral.writeUInt16LE(500, centralOffset(truncatedCentral) + 28);
  assert.throws(writeCase(directory, 'truncated.xlsx', truncatedCentral), /truncated ZIP/u);

  const invalidLocal = zipDirectory([{ name: 'a', content: Buffer.from('a'), method: 0 }]);
  invalidLocal.writeUInt32LE(0, 0);
  assert.throws(writeCase(directory, 'local.xlsx', invalidLocal), /local-file header/u);

  const mismatchedHeader = zipDirectory([{ name: 'a', content: Buffer.from('a'), method: 0 }]);
  mismatchedHeader.writeUInt16LE(8, 8);
  assert.throws(writeCase(directory, 'header.xlsx', mismatchedHeader), /header mismatch/u);

  const mismatchedName = zipDirectory([{ name: 'a', content: Buffer.from('a'), method: 0 }]);
  mismatchedName.write('b', 30);
  assert.throws(writeCase(directory, 'name.xlsx', mismatchedName), /local filename mismatch/u);

  const badDataBounds = zipDirectory([{ name: 'a', content: Buffer.from('a'), method: 0 }]);
  badDataBounds.writeUInt32LE(10_000, centralOffset(badDataBounds) + 20);
  assert.throws(writeCase(directory, 'data-bounds.xlsx', badDataBounds), /compressed-data bounds/u);

  const invalidDeflate = zipDirectory([{ name: 'a', content: Buffer.from('some content') }]);
  invalidDeflate.writeUInt32LE(1, centralOffset(invalidDeflate) + 20);
  assert.throws(writeCase(directory, 'deflate.xlsx', invalidDeflate), /bounded ZIP expansion failed/u);

  const sizeMismatch = zipDirectory([{ name: 'a', content: Buffer.from('a'), method: 0 }]);
  sizeMismatch.writeUInt32LE(sizeMismatch.readUInt32LE(sizeMismatch.length - 10) - 1, sizeMismatch.length - 10);
  assert.throws(writeCase(directory, 'central-size.xlsx', sizeMismatch), /size mismatch/u);

  const overlap = zipDirectory([
    { name: 'a', content: Buffer.from('1'), method: 0 },
    { name: 'a', content: Buffer.from('1'), method: 0 },
  ]);
  const secondCentral = centralOffset(overlap) + 47;
  overlap.writeUInt32LE(0, secondCentral + 42);
  assert.throws(writeCase(directory, 'overlap.xlsx', overlap), /overlapping ZIP entries/u);
});

test('XLSX preflight enforces names, encryption, methods, and aggregate limits', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'gfrr-xlsx-limits-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  for (const [filename, entryName] of [
    ['empty.xlsx', ''],
    ['nul.xlsx', 'bad\0name'],
    ['slash.xlsx', '/absolute'],
    ['backslash.xlsx', 'bad\\name'],
    ['parent.xlsx', '../parent'],
  ]) {
    assert.throws(writeCase(directory, filename, zipDirectory([
      { name: entryName, content: Buffer.from('a'), method: 0 },
    ])), /unsafe ZIP entry name/u);
  }

  assert.throws(writeCase(directory, 'encrypted.xlsx', zipDirectory([
    { name: 'a', content: Buffer.from('a'), flags: 1, method: 0 },
  ])), /encrypted ZIP/u);
  assert.throws(writeCase(directory, 'method.xlsx', zipDirectory([
    { name: 'a', content: Buffer.from('a'), method: 99 },
  ])), /unsupported ZIP compression/u);
  assert.throws(writeCase(directory, 'entry-size.xlsx', zipDirectory([
    { name: 'a', content: Buffer.alloc(1_001), method: 0 },
  ])), /expands to 1001/u);

  const total = zipDirectory([
    { name: 'a', content: Buffer.alloc(800), method: 0 },
    { name: 'b', content: Buffer.alloc(800), method: 0 },
  ]);
  assert.throws(writeCase(directory, 'total.xlsx', total), /ZIP expands beyond 1500/u);

  const batchOne = zipDirectory([{ name: 'a', content: Buffer.alloc(200), method: 0 }]);
  const batchTwo = zipDirectory([{ name: 'b', content: Buffer.alloc(200), method: 0 }]);
  writeFileSync(join(directory, 'one.xlsx'), batchOne);
  writeFileSync(join(directory, 'two.xlsx'), batchTwo);
  assert.throws(() => preflightXlsxInputs({
    inputDir: directory,
    filenames: ['one.xlsx', 'two.xlsx'],
    maxInputBytes: 1_000,
    maxBatchInputBytes: batchOne.length + batchTwo.length - 1,
    maxBatchUncompressedBytes: 1_000,
    zipLimits: ZIP_LIMITS,
  }), /compressed input/u);
  assert.throws(() => preflightXlsxInputs({
    inputDir: directory,
    filenames: ['one.xlsx', 'two.xlsx'],
    maxInputBytes: 1_000,
    maxBatchInputBytes: 2_000,
    maxBatchUncompressedBytes: 399,
    zipLimits: ZIP_LIMITS,
  }), /uncompressed input/u);

  mkdirSync(join(directory, 'directory.xlsx'));
  assert.throws(() => preflightXlsxInputs({
    inputDir: directory,
    filenames: ['directory.xlsx'],
    maxInputBytes: 1_000,
    maxBatchInputBytes: 1_000,
    maxBatchUncompressedBytes: 1_000,
    zipLimits: ZIP_LIMITS,
  }), /regular file/u);

  const outside = join(directory, '..', `outside-${process.pid}.xlsx`);
  writeFileSync(outside, batchOne);
  t.after(() => rmSync(outside, { force: true }));
  assert.throws(() => preflightXlsxInputs({
    inputDir: directory,
    filenames: [`../${outside.split(/[\\/]/u).at(-1)}`],
    maxInputBytes: 1_000,
    maxBatchInputBytes: 1_000,
    maxBatchUncompressedBytes: 1_000,
    zipLimits: ZIP_LIMITS,
  }), /escapes the input directory/u);
});

test('worksheet dimensions include the header and reject excess rows or columns', () => {
  assert.doesNotThrow(() => assertWorksheetDimensions({}, 'empty.xlsx', {
    maxDataRows: 350_000,
    maxColumns: 32,
  }));
  assert.doesNotThrow(() => assertWorksheetDimensions({ '!ref': 'A1:M350001' }, 'valid.xlsx', {
    maxDataRows: 350_000,
    maxColumns: 32,
  }));
  assert.throws(() => assertWorksheetDimensions({ '!ref': 'A1:M350002' }, 'rows.xlsx', {
    maxDataRows: 350_000,
    maxColumns: 32,
  }), /data rows/u);
  assert.throws(() => assertWorksheetDimensions({ '!ref': 'A1:AG2' }, 'columns.xlsx', {
    maxDataRows: 350_000,
    maxColumns: 32,
  }), /columns/u);
  assert.throws(() => assertWorksheetDimensions({ '!fullref': 'not-a-range' }, 'invalid.xlsx', {
    maxDataRows: 350_000,
    maxColumns: 32,
  }), /invalid worksheet range/u);
});
