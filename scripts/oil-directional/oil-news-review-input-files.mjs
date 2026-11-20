import { existsSync, readdirSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { isManualArtifactPath, safeRelativePath } from '../lib/check-script-helpers.mjs';
import { WATCH_PATH } from './oil-news-watch-history.mjs';

function isFixturePath(filePath) {
  const relativePath = safeRelativePath(filePath);
  return Boolean(relativePath && relativePath.startsWith('docs/fixtures/'));
}

function isProductionWatchPath(filePath) {
  const relativePath = safeRelativePath(filePath);
  return relativePath === WATCH_PATH;
}

export function isSafeInputPath(filePath) {
  return isManualArtifactPath(filePath) || isFixturePath(filePath) || isProductionWatchPath(filePath);
}

export function expandInputFiles(options) {
  const files = [...options.inputs];
  for (const inputDir of options.inputDirs) {
    const absoluteDir = resolve(inputDir);
    if (!existsSync(absoluteDir)) throw new Error(`Input directory does not exist: ${inputDir}`);
    const jsonFiles = readdirSync(absoluteDir)
      .filter((name) => extname(name).toLowerCase() === '.json' && !name.endsWith('.archive-meta.json'))
      .sort((a, b) => a.localeCompare(b))
      .map((name) => `${inputDir.replace(/\\/g, '/')}/${name}`);
    files.push(...jsonFiles);
  }
  return [...new Set(files)];
}
