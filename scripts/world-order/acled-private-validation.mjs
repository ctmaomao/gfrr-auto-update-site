import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import childProcess from 'node:child_process';
import { validateAcledDownloadManifest } from './acled-download-manifest.mjs';
import { BATCH_LIMITS } from './acled-batch-reader.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const modules = ['sanitize-acled-weekly.mjs', 'sanitize-acled-monthly.mjs', 'xlsx-input-guard.mjs',
  'acled-weekly-coverage.mjs', 'acled-weekly-window.mjs', 'acled-monthly-filename.mjs', 'acled-monthly-trend.mjs'];
const outputs = ['world-order-acled-regional-weekly.json', 'world-order-acled-global-monthly.json'];

// No production paths are written: unchanged sanitizers execute in a disposable
// miniature workspace. Raw XLSX never leaves that workspace or becomes an artifact.
export function validateAcledPrivateBatch(workbooks, { scope = 'pair' } = {}) {
  const report = { status: 'stopped', productionWritten: false, rawFilesRetained: false, cleanupConfirmed: true };
  const result = { report, candidates: null };
  let entries;
  try {
    if (!Array.isArray(workbooks)) throw new Error();
    entries = validateAcledDownloadManifest(workbooks.map(w => w.url), { scope }).entries;
    const totals = { weekly: 0, monthly: 0 };
    for (const entry of entries) {
      const file = workbooks.find(w => w.url === entry.url), limits = BATCH_LIMITS[entry.kind];
      if (!Buffer.isBuffer(file.bytes) || !file.bytes.length || file.bytes.length > limits.fileBytes) throw new Error();
      totals[entry.kind] += file.bytes.length;
      if (totals[entry.kind] > limits.batchBytes) throw new Error();
    }
  } catch { report.reason = 'invalid_batch'; return result; }
  const kinds = scope === 'weekly' ? ['weekly'] : ['weekly', 'monthly'];
  const parent = fs.realpathSync(os.tmpdir());
  let directory;
  try {
    directory = fs.mkdtempSync(path.join(parent, 'gfrr-acled-private-'));
    fs.chmodSync(directory, 0o700);
    const code = path.join(directory, 'scripts', 'world-order');
    fs.mkdirSync(code, { recursive: true });
    fs.mkdirSync(path.join(directory, 'config'));
    for (const name of modules) fs.copyFileSync(path.join(repo, 'scripts', 'world-order', name), path.join(code, name), fs.constants.COPYFILE_EXCL);
    // Only the existing locked dev dependency is linked; no dependency install or network.
    fs.mkdirSync(path.join(directory, 'node_modules'));
    fs.symlinkSync(fs.realpathSync(path.join(repo, 'node_modules', 'xlsx')), path.join(directory, 'node_modules', 'xlsx'), process.platform === 'win32' ? 'junction' : 'dir');
    for (const kind of kinds) fs.mkdirSync(path.join(directory, 'manual-artifacts', 'world-order', 'acled-input', kind), { recursive: true });
    for (const entry of entries) fs.writeFileSync(path.join(directory, 'manual-artifacts', 'world-order', 'acled-input', entry.kind, entry.filename),
      workbooks.find(w => w.url === entry.url).bytes, { flag: 'wx', mode: 0o600 });
    for (const kind of kinds) {
      const child = childProcess.spawnSync(process.execPath, [path.join(code, `sanitize-acled-${kind}.mjs`)], {
        cwd: directory, timeout: 120000, maxBuffer: 1024 * 1024, windowsHide: true,
        env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TZ: 'UTC' }, encoding: 'utf8' });
      if (child.error || child.status !== 0) { report.reason = `${kind}_validation_failed`; return result; }
    }
    const candidates = {};
    for (const name of (scope === 'weekly' ? outputs.slice(0, 1) : outputs)) {
      const target = path.join(directory, 'config', name), stat = fs.lstatSync(target);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) throw new Error();
      candidates[name] = JSON.parse(fs.readFileSync(target, 'utf8'));
    }
    result.candidates = candidates; report.status = 'private_validation_passed';
  } catch { report.reason = 'private_validation_failed'; }
  finally {
    if (directory) {
      try {
        if (path.dirname(directory) !== parent || !path.basename(directory).startsWith('gfrr-acled-private-') || fs.realpathSync(directory) !== directory) throw new Error();
        fs.rmSync(directory, { recursive: true });
      } catch {
        report.cleanupConfirmed = false; report.rawFilesRetained = true;
        report.status = 'stopped'; report.reason = 'cleanup_failed'; result.candidates = null;
      }
    }
  }
  return result;
}
