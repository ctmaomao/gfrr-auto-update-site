#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { acquireAcledPublishLock, prepareAcledMain } from './acled-prepare-main.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
let release;
try {
  if (args.some(arg => arg !== '--dry-run')) throw new Error('仅支持 --dry-run 参数。');
  const dryRun = args.includes('--dry-run');
  if (!dryRun) release = acquireAcledPublishLock(root);
  prepareAcledMain({ root, dryRun });
  if (!dryRun) {
    // Resolve after switching so only main's publisher, checks and sanitizers run.
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/world-order/acled-publish.mjs')], {
      cwd: root, stdio: 'inherit'
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  }
} catch (error) {
  console.error(`ACLED 自动发布已停止：${error.message}`);
  process.exitCode = 1;
} finally {
  release?.();
}
