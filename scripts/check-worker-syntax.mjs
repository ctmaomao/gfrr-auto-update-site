import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = 'workers/gfrr-realtime-worker/src';

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function collectWorkerFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectWorkerFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(toPosixPath(fullPath));
    }
  }
  return files;
}

if (!fs.existsSync(ROOT_DIR)) {
  console.error(`Worker syntax check failed: missing ${ROOT_DIR}`);
  process.exit(1);
}

const files = collectWorkerFiles(ROOT_DIR).sort((a, b) => a.localeCompare(b));
if (files.length === 0) {
  console.error(`Worker syntax check failed: no .js files found under ${ROOT_DIR}`);
  process.exit(1);
}

const failures = [];

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    encoding: 'utf8',
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
  console.error(`Worker syntax check failed: ${failures.length} file(s) failed`);
  process.exit(1);
}

console.log(`Worker syntax check passed (${files.length} files)`);
