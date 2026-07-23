import fs from 'node:fs';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const MAX_EOCD_SEARCH = 65_557;

function fail(label, message) {
  throw new Error(`${label}: ${message}`);
}

function inspectZip(buffer, limits, label) {
  let eocdOffset = -1;
  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - MAX_EOCD_SEARCH); offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) fail(label, 'missing ZIP end-of-central-directory record');

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralSize = buffer.readUInt32LE(eocdOffset + 12);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    fail(label, 'ZIP64 workbooks are not accepted');
  }
  if (entryCount === 0 || entryCount > limits.maxEntries) {
    fail(label, `ZIP entry count ${entryCount} exceeds 1-${limits.maxEntries}`);
  }
  if (centralOffset + centralSize > eocdOffset) {
    fail(label, 'invalid ZIP central-directory bounds');
  }

  let offset = centralOffset;
  let totalUncompressedBytes = 0;
  const localSpans = [];
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > eocdOffset || buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) {
      fail(label, `invalid ZIP central-directory entry ${index + 1}`);
    }
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedBytes = buffer.readUInt32LE(offset + 20);
    const uncompressedBytes = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const nextOffset = offset + 46 + nameLength + extraLength + commentLength;
    if (nextOffset > eocdOffset) fail(label, `truncated ZIP central-directory entry ${index + 1}`);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    if ((flags & 1) !== 0) fail(label, `encrypted ZIP entry is not accepted: ${name || index + 1}`);
    if (!name || name.includes('\0') || name.includes('\\') || name.startsWith('/') || name.split('/').includes('..')) {
      fail(label, `unsafe ZIP entry name: ${name || '(empty)'}`);
    }
    if (method !== 0 && method !== 8) fail(label, `unsupported ZIP compression method ${method}: ${name}`);
    if (uncompressedBytes > limits.maxEntryUncompressedBytes) {
      fail(label, `ZIP entry ${name} expands to ${uncompressedBytes} bytes`);
    }
    if (localOffset + 30 > centralOffset || buffer.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) {
      fail(label, `invalid ZIP local-file header: ${name}`);
    }
    const localFlags = buffer.readUInt16LE(localOffset + 6);
    const localMethod = buffer.readUInt16LE(localOffset + 8);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    if (localFlags !== flags || localMethod !== method) fail(label, `ZIP header mismatch: ${name}`);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataOffset + compressedBytes;
    if (dataOffset > centralOffset || dataEnd > centralOffset) fail(label, `invalid ZIP compressed-data bounds: ${name}`);
    const localName = buffer.subarray(localOffset + 30, localOffset + 30 + localNameLength).toString('utf8');
    if (localName !== name) fail(label, `ZIP local filename mismatch: ${name}`);
    const compressed = buffer.subarray(dataOffset, dataEnd);
    let expanded;
    try {
      expanded = method === 0
        ? compressed
        : inflateRawSync(compressed, { maxOutputLength: limits.maxEntryUncompressedBytes + 1 });
    } catch (error) {
      fail(label, `bounded ZIP expansion failed for ${name}: ${error?.code || 'invalid compressed data'}`);
    }
    const actualUncompressedBytes = expanded.length;
    if (actualUncompressedBytes !== uncompressedBytes) {
      fail(label, `ZIP entry ${name} declares ${uncompressedBytes} bytes but expands to ${actualUncompressedBytes}`);
    }
    const ratio = compressedBytes === 0 ? (actualUncompressedBytes === 0 ? 1 : Infinity) : actualUncompressedBytes / compressedBytes;
    if (ratio > limits.maxCompressionRatio) {
      fail(label, `ZIP entry ${name} compression ratio ${ratio.toFixed(1)} exceeds ${limits.maxCompressionRatio}`);
    }
    totalUncompressedBytes += actualUncompressedBytes;
    if (totalUncompressedBytes > limits.maxUncompressedBytes) {
      fail(label, `ZIP expands beyond ${limits.maxUncompressedBytes} bytes`);
    }
    localSpans.push({ start: localOffset, end: dataEnd, name });
    offset = nextOffset;
  }
  if (offset !== centralOffset + centralSize) fail(label, 'ZIP central-directory size mismatch');
  localSpans.sort((left, right) => left.start - right.start);
  for (let index = 1; index < localSpans.length; index += 1) {
    if (localSpans[index].start < localSpans[index - 1].end) {
      fail(label, `overlapping ZIP entries: ${localSpans[index - 1].name} and ${localSpans[index].name}`);
    }
  }
  return { entryCount, totalUncompressedBytes };
}

function resolveInputFile(inputDir, filename, maxInputBytes) {
  const candidate = path.resolve(inputDir, filename);
  const stats = fs.lstatSync(candidate);
  if (!stats.isFile() || stats.isSymbolicLink()) fail(filename, 'input must be a regular file');
  if (stats.size > maxInputBytes) fail(filename, `file size ${stats.size} exceeds ${maxInputBytes} bytes`);
  const resolvedInputDir = fs.realpathSync(inputDir);
  const resolvedFile = fs.realpathSync(candidate);
  const relative = path.relative(resolvedInputDir, resolvedFile);
  if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail(filename, 'resolved path escapes the input directory');
  }
  return { filePath: resolvedFile, compressedBytes: stats.size };
}

export function preflightXlsxInputs({ inputDir, filenames, maxInputBytes, maxBatchInputBytes, maxBatchUncompressedBytes, zipLimits }) {
  const files = new Map();
  let batchInputBytes = 0;
  let batchUncompressedBytes = 0;
  for (const filename of filenames) {
    const resolved = resolveInputFile(inputDir, filename, maxInputBytes);
    const zip = inspectZip(fs.readFileSync(resolved.filePath), zipLimits, filename);
    batchInputBytes += resolved.compressedBytes;
    batchUncompressedBytes += zip.totalUncompressedBytes;
    if (batchInputBytes > maxBatchInputBytes) fail('xlsx batch', `compressed input exceeds ${maxBatchInputBytes} bytes`);
    if (batchUncompressedBytes > maxBatchUncompressedBytes) fail('xlsx batch', `uncompressed input exceeds ${maxBatchUncompressedBytes} bytes`);
    files.set(filename, resolved.filePath);
  }
  return files;
}

function columnNumber(letters) {
  return [...letters].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0);
}

export function assertWorksheetDimensions(sheet, filename, { maxDataRows, maxColumns }) {
  const range = sheet?.['!fullref'] || sheet?.['!ref'];
  if (!range) return;
  const end = String(range).split(':').at(-1).replaceAll('$', '').toUpperCase();
  const match = end.match(/^([A-Z]{1,3})([1-9]\d*)$/u);
  if (!match) fail(filename, `invalid worksheet range ${range}`);
  const rowsIncludingHeader = Number(match[2]);
  const columns = columnNumber(match[1]);
  if (rowsIncludingHeader > maxDataRows + 1) fail(filename, `worksheet exceeds ${maxDataRows} data rows`);
  if (columns > maxColumns) fail(filename, `worksheet exceeds ${maxColumns} columns`);
}
