// Artifact-content fingerprint for the isolated CSP verification.
//
// The policy string is NOT an artifact version: rewriting `scripts/app.js`, `assets/styles.css`,
// an HTML entry or any JSON leaves the policy byte-identical. Without a separate content
// fingerprint, a `--no-fresh` rerun could compare a new artifact against digests recorded from
// an older one. This module hashes exactly the files the verification serves from `_site`.
//
// Coverage boundary: this covers the `_site` tree only. `tests/csp/fixtures/` and the verification
// code are served by the CSP server from separate roots and are NOT fingerprinted here. Of the
// fixtures, only `allowed-inline.html` contributes to the candidate policy (its inline script and
// style hashes), so editing it also moves the POLICY fingerprint. The other control fixtures
// (`throw-inline`, `throw-style`, `throw-attr`) and the test assertions can change without moving
// either fingerprint — see the known limitation noted in PROJECT_BACKLOG.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

/** Sorted relative paths of every regular file under `root` (dot-directories excluded). */
export function listArtifactFiles(root) {
  const rootPath = resolve(root);
  const files = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith('.')) continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (statSync(path).isFile()) files.push(relative(rootPath, path).split(sep).join('/'));
    }
  };
  walk(rootPath);
  return files.sort();
}

/**
 * Deterministic content fingerprint: path bytes plus content bytes for every served file, in
 * sorted order. Any added, removed or edited file changes the digest.
 */
export function computeArtifactFingerprint(root) {
  const hash = createHash('sha256');
  const files = listArtifactFiles(root);
  for (const file of files) {
    hash.update(`path:${file}\u0000`);
    hash.update(readFileSync(resolve(root, file)));
    hash.update('\u0000');
  }
  return { fingerprint: hash.digest('hex').slice(0, 16), fileCount: files.length, files };
}
