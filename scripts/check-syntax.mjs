import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = 'scripts';
const EXCLUDED_DIRS = new Set(['.git', 'node_modules']);

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

export function collectScriptFiles(dir) {
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

export function syntaxConcurrency(parallelism = availableParallelism()) {
  return Math.max(1, Math.min(4, Number.isSafeInteger(parallelism) ? parallelism : 1));
}

// Keep Node's real parser and the original 1 MiB child-output limit. No source
// is imported or executed, and spawn/signal/output-limit failures stay failures.
export function checkFileSyntax(file, execute = execFile) {
  return new Promise((resolve) => {
    execute(process.execPath, ['--check', file], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024
    }, (error, stdout, stderr) => resolve({
      status: error ? null : 0,
      stdout: stdout || '',
      stderr: stderr || ''
    }));
  });
}

export async function checkSyntaxFiles(files, { concurrency = syntaxConcurrency(), check = checkFileSyntax } = {}) {
  const results = new Array(files.length);
  let next = 0;
  async function worker() {
    while (next < files.length) {
      const index = next++;
      try {
        results[index] = await check(files[index]);
      } catch (error) {
        results[index] = { status: null, stdout: '', stderr: String(error.message || error) };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(syntaxConcurrency(concurrency), files.length) }, worker));
  return results;
}

async function main() {
  const files = collectScriptFiles(ROOT_DIR).sort((a, b) => a.localeCompare(b));
  const results = await checkSyntaxFiles(files);
  const failures = [];

  // Child completion order must not change the established diagnostic order.
  for (const [index, file] of files.entries()) {
    const result = results[index];
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
    process.exitCode = 1;
    return;
  }
  console.log('Syntax check passed');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
