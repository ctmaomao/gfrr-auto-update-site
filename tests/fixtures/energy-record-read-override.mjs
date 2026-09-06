// Child-process fault injection; no real document writes or runtime fallback.
import fs from 'node:fs';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';

const originalRead = fs.readFileSync;
const recordPath = path.resolve('docs/ENERGY_TRANSPORT_IMPLEMENTATION_HISTORY.md');
const backlogPath = path.resolve('docs/PROJECT_BACKLOG.md');
const records = originalRead(recordPath, 'utf8');
const mode = process.env.ENERGY_RECORD_TEST_MODE;
const marker = process.env.ENERGY_RECORD_TEST_MARKER;
if (!['concise', 'marker', 'missing'].includes(mode)) throw new Error('Invalid test mode');
if (mode === 'marker' && (!marker || !records.includes(marker))) throw new Error('Invalid test marker');

fs.readFileSync = function (file, ...args) {
  const resolved = typeof file === 'string' ? path.resolve(file) : '';
  if (resolved === backlogPath) {
    // A complete legacy backlog must not rescue lost records at their new target.
    return mode === 'concise' ? '# Current work\nNo historical names are required here.\n' : records;
  }
  if (resolved === recordPath) {
    if (mode === 'missing') {
      const error = new Error(`ENOENT: ${recordPath}`);
      error.code = 'ENOENT';
      throw error;
    }
    return mode === 'marker' ? records.replaceAll(marker, 'REMOVED_BY_TEST') : records;
  }
  return originalRead.call(this, file, ...args);
};
syncBuiltinESMExports();
