import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = 'scripts';
const EXCLUDED_DIRS = new Set(['.git', 'node_modules']);
const MAX_OUTPUT_BYTES = 1024 * 1024;

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

// Keep Node's real parser and spawnSync's aggregate 1 MiB child-output limit.
// execFile alone caps each stream separately, so count raw bytes across both.
// No source is imported or executed; spawn/signal/output failures stay failures.
export function checkFileSyntax(file, execute = execFile) {
  return new Promise((resolve) => {
    let outputBytes = 0;
    let outputLimitExceeded = false;
    const child = execute(process.execPath, ['--check', file], {
      encoding: 'buffer',
      maxBuffer: MAX_OUTPUT_BYTES
    }, (error, stdout, stderr) => resolve({
      status: error || outputLimitExceeded ? null : 0,
      stdout: stdout?.toString('utf8') || '',
      stderr: stderr?.toString('utf8') || ''
    }));
    const countOutput = (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_OUTPUT_BYTES && !outputLimitExceeded) {
        outputLimitExceeded = true;
        child.kill();
      }
    };
    child?.stdout?.on('data', countOutput);
    child?.stderr?.on('data', countOutput);
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

if (process.argv[1] && fs.existsSync(process.argv[1])
  && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) await main();
