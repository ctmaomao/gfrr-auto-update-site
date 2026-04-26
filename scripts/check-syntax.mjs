import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = 'scripts';
const EXCLUDED_DIRS = new Set(['.git', 'node_modules']);

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function collectScriptFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) files.push(...collectScriptFiles(fullPath));
      continue;
    }
    if (entry.isFile() && /\.(mjs|js)$/.test(entry.name)) {
      files.push(toPosixPath(fullPath));
    }
  }
  return files;
}

const FILES = collectScriptFiles(ROOT_DIR).sort((a, b) => a.localeCompare(b));

const failures = [];

for (const file of FILES) {
  const result = spawnSync(process.execPath, ['--check', file], {
    encoding: 'utf8'
  });

  if (result.status === 0) {
    console.log(`OK ${file}`);
    continue;
  }

  failures.push(file);
  console.error(`FAIL ${file}`);
  if (result.stdout) console.error(result.stdout.trimEnd());
  if (result.stderr) console.error(result.stderr.trimEnd());
}

if (failures.length > 0) {
  console.error(`Syntax check failed: ${failures.length} file(s) failed`);
  process.exit(1);
}

console.log('Syntax check passed');
