#!/usr/bin/env node
import { cpSync, lstatSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, '_site');
const entries = [
  'index.html',
  'bubble-watch.html',
  'assets',
  'data',
  'realtime',
  'scripts/app.js',
  'scripts/modules',
];

export function isAllowedPagesArtifactFile(relativePath) {
  const normalized = relativePath.replaceAll('\\', '/');
  if (normalized.split('/').some((part) => part.startsWith('.'))) return false;
  if (normalized === 'index.html' || normalized === 'bubble-watch.html' || normalized === 'scripts/app.js') return true;
  if (normalized.startsWith('assets/')) return ['.css', '.svg'].includes(extname(normalized));
  if (normalized.startsWith('data/') || normalized.startsWith('realtime/')) return extname(normalized) === '.json';
  return normalized.startsWith('scripts/modules/') && extname(normalized) === '.js';
}

function validateArtifactTree(directory, base = directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink() || lstatSync(path).isSymbolicLink()) {
      throw new Error(`Pages artifact contains a symbolic link: ${path}`);
    }
    if (entry.isDirectory()) validateArtifactTree(path, base);
    else if (!isAllowedPagesArtifactFile(relative(base, path))) throw new Error(`Forbidden Pages artifact file: ${path}`);
  }
}

export function buildPagesArtifact() {
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  for (const entry of entries) {
    const source = resolve(root, entry);
    const target = resolve(output, entry);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, { recursive: true });
  }
  validateArtifactTree(output);
  console.log(`Prepared Pages artifact: ${output}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) buildPagesArtifact();
