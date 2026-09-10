import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export function loadPublishedBaseline({ cwd = process.cwd(), git = args => execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 20000, maxBuffer: 8 * 1024 * 1024 }) } = {}) {
  git(['fetch', 'origin', 'realtime-data']);
  const sha = git(['rev-parse', 'origin/realtime-data']).trim();
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Invalid realtime baseline commit');
  const text = git(['show', `${sha}:realtime/market.json`]);
  const payload = JSON.parse(text);
  if (!payload?.values || typeof payload.values !== 'object' || Array.isArray(payload.values)
    || typeof payload.updatedAt !== 'string' || !Number.isFinite(Date.parse(payload.updatedAt))
    || payload.sourceMode === 'mock') throw new Error('Invalid published realtime baseline');
  // Cache age is preserved, not refreshed. Existing per-field trust gates decide whether it is usable.
  const destination = path.join(cwd, 'realtime', 'market.json');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.baseline-tmp`;
  fs.writeFileSync(temporary, text);
  fs.renameSync(temporary, destination);
  return { sha, updatedAt: payload.updatedAt };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(loadPublishedBaseline())); }
  catch { console.error('Published realtime baseline unavailable; refusing to use the main checkout cache.'); process.exitCode = 1; }
}
