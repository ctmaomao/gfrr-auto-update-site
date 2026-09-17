import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { validAcledReceipt } from './acled-auto-github.mjs';

export function checkAcledRefreshReceipt({ root, receipt } = {}) {
  try {
    if (!validAcledReceipt(receipt) || Object.keys(process.env).some(k => /^GIT_/iu.test(k) && k.toUpperCase() !== 'GIT_PAGER')) return false;
    const git = (args, raw = false) => {
      const result = execFileSync('git', args, { cwd: root, timeout: 15000, maxBuffer: raw ? 1024 * 1024 : 65536,
        encoding: raw ? null : 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
        env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, GIT_OPTIONAL_LOCKS: '0', GIT_NO_REPLACE_OBJECTS: '1' } });
      return raw ? result : result.trim();
    };
    if (git(['branch', '--show-current']) !== 'main'
      || git(['remote', 'get-url', 'origin']) !== 'https://github.com/ctmaomao/gfrr-auto-update-site.git') return false;
    git(['merge-base', '--is-ancestor', receipt.acled_config_commit, 'HEAD']);
    for (const [kind, name] of [['weekly', 'regional-weekly'], ['monthly', 'global-monthly']]) {
      const relative = `config/world-order-acled-${name}.json`, file = path.join(root, relative);
      if (!fs.lstatSync(file).isFile() || fs.statSync(file).size > 1024 * 1024) return false;
      const bytes = fs.readFileSync(file);
      if (createHash('sha256').update(bytes).digest('hex') !== receipt[`acled_${kind}_sha256`]
        || createHash('sha256').update(git(['show', `${receipt.acled_config_commit}:${relative}`], true)).digest('hex') !== receipt[`acled_${kind}_sha256`]
        || JSON.parse(bytes).preparedBy !== 'github-actions-acled-auto') return false;
    }
    return true;
  } catch { return false; }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
export function acledSourceMatches(actual, expected) {
  return !!actual && !!expected && actual.enabled === true && expected.enabled === true
    && ['ok', 'partial', 'stale'].includes(expected.status)
    && JSON.stringify(canonical(actual)) === JSON.stringify(canonical(expected));
}
