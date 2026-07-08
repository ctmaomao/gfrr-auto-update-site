import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';

export function readJson(filePath, { requireExists = true, missingMessage } = {}) {
  const absolutePath = resolve(filePath);
  if (requireExists && !existsSync(absolutePath)) {
    throw new Error(missingMessage || `Input file does not exist: ${filePath}`);
  }
  return JSON.parse(readFileSync(absolutePath, 'utf8'));
}

export function writeJson(filePath, value, { force = true } = {}) {
  const absolutePath = resolve(filePath);
  if (!force && existsSync(absolutePath)) {
    throw new Error(`Output already exists; use --force to overwrite: ${filePath}`);
  }
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return absolutePath;
}

export function safeRelativePath(filePath) {
  if (!filePath) return null;
  const absolutePath = resolve(filePath);
  const relativePath = relative(process.cwd(), absolutePath);
  if (relativePath === '' || relativePath.startsWith('..')) return null;
  return relativePath.replace(/\\/g, '/');
}

export function isManualArtifactPath(filePath, prefix = 'manual-artifacts/') {
  const relativePath = safeRelativePath(filePath);
  return Boolean(relativePath && relativePath.startsWith(prefix));
}

export function isTransportShockManualArtifactPath(filePath) {
  return isManualArtifactPath(filePath, 'manual-artifacts/transport-shock-confirmation-factor/');
}

export function shortHash(value, length = 16) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, length);
}

export function runNode(args, { cwd = process.cwd(), maxBuffer = 10 * 1024 * 1024 } = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`node ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  return String(result.stdout || '');
}

export function assertIncludes(text, marker, label = 'text') {
  if (!String(text).includes(marker)) throw new Error(`${label} missing marker: ${marker}`);
}

export function assertAllFalse(record, label = 'record', allowedTrue = new Set()) {
  for (const [key, value] of Object.entries(record || {})) {
    if (allowedTrue.has(key)) {
      if (value !== true) throw new Error(`${label}.${key} must be true.`);
    } else if (value !== false) {
      throw new Error(`${label}.${key} must be false.`);
    }
  }
}

export function assertAllTrue(record, label = 'record') {
  for (const [key, value] of Object.entries(record || {})) {
    if (value !== true) throw new Error(`${label}.${key} must be true.`);
  }
}
