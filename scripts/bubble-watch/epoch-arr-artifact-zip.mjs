import { crc32, inflateRawSync } from 'node:zlib';
import { EPOCH_ARTIFACT_POLICY as p } from './epoch-arr-artifact.mjs';

// Restricted single-file ZIP reader, NOT a general-purpose extractor. Never
// creates filesystem paths. Accept stored/deflated standard ZIP only, not ZIP64.
export function readEpochArtifactZip(input) {
  const bad = () => { throw new Error('artifact_zip_invalid'); };
  try {
    if (!(input instanceof Uint8Array) || input.byteLength > p.zipBytes || input.byteLength < 100) bad();
    const b = Buffer.from(input), end = b.length - 22;
    if (b.readUInt32LE(end) !== 0x06054b50 || b.readUInt16LE(end + 4) !== 0 || b.readUInt16LE(end + 6) !== 0
      || b.readUInt16LE(end + 8) !== 1 || b.readUInt16LE(end + 10) !== 1 || b.readUInt16LE(end + 20) !== 0) bad();
    const centralSize = b.readUInt32LE(end + 12), c = b.readUInt32LE(end + 16);
    if (c < 30 || c + centralSize !== end || b.readUInt32LE(c) !== 0x02014b50) bad();
    const flags = b.readUInt16LE(c + 8), method = b.readUInt16LE(c + 10), crc = b.readUInt32LE(c + 16);
    const compressed = b.readUInt32LE(c + 20), size = b.readUInt32LE(c + 24), nameSize = b.readUInt16LE(c + 28);
    const extra = b.readUInt16LE(c + 30), comment = b.readUInt16LE(c + 32), attributes = b.readUInt32LE(c + 38);
    if ((flags & ~0x808) !== 0 || ![0, 8].includes(method) || size < 1 || size > p.bytes || compressed > p.zipBytes
      || b.readUInt16LE(c + 34) !== 0 || b.readUInt32LE(c + 42) !== 0 || (attributes & 0x10)
      || ![0, 0x8000].includes((attributes >>> 16) & 0xf000) || 46 + nameSize + extra + comment !== centralSize) bad();
    const expectedName = Buffer.from(p.fileName);
    if (!b.subarray(c + 46, c + 46 + nameSize).equals(expectedName) || b.readUInt32LE(0) !== 0x04034b50
      || b.readUInt16LE(6) !== flags || b.readUInt16LE(8) !== method || b.readUInt16LE(26) !== nameSize) bad();
    const localExtra = b.readUInt16LE(28), start = 30 + nameSize + localExtra, dataEnd = start + compressed;
    if (!b.subarray(30, 30 + nameSize).equals(expectedName) || dataEnd > c) bad();
    // Reject ZIP64 and malformed extras even when small size fields look valid.
    for (const [offset, length] of [[30 + nameSize, localExtra], [c + 46 + nameSize, extra]]) {
      let pos = offset;
      while (pos < offset + length) {
        if (pos + 4 > offset + length || b.readUInt16LE(pos) === 1) bad();
        pos += 4 + b.readUInt16LE(pos + 2);
        if (pos > offset + length) bad();
      }
    }
    if (flags & 8) {
      const signature = c - dataEnd === 16;
      if (!signature && c - dataEnd !== 12) bad();
      if (signature && b.readUInt32LE(dataEnd) !== 0x08074b50) bad();
      const d = dataEnd + (signature ? 4 : 0);
      if (b.readUInt32LE(d) !== crc || b.readUInt32LE(d + 4) !== compressed || b.readUInt32LE(d + 8) !== size) bad();
      for (const [offset, value] of [[14, crc], [18, compressed], [22, size]]) if (![0, value].includes(b.readUInt32LE(offset))) bad();
    } else if (dataEnd !== c || b.readUInt32LE(14) !== crc || b.readUInt32LE(18) !== compressed || b.readUInt32LE(22) !== size) bad();
    const inflated = method === 8 ? inflateRawSync(b.subarray(start, dataEnd), { maxOutputLength: p.bytes, info: true }) : null;
    if (inflated && inflated.engine.bytesWritten !== compressed) bad();
    const data = inflated ? inflated.buffer : b.subarray(start, dataEnd);
    if (data.length !== size || crc32(data) !== crc) bad();
    return Buffer.from(data);
  } catch { bad(); }
}
