// Candidate CSP for the local verification harness, plus the hash helpers the isolated
// verification needs.
//
// The policy TEXT is owned by `scripts/lib/edgeone-csp-policy.mjs` — the same rule the release
// staging generator uses — so no directive or policy string is defined twice. This module only
// decides WHICH pages contribute hashes:
//
//   production    the real reader pages only. This is the shape that may ever be published, and it
//                 contains no fixture hash.
//   verification  production plus the `allowed-inline.html` control fixture, because the harness
//                 needs a control page whose content is legitimately allowed.
//   control       production plus the `throw-inline.html` marker hash. It exists only so the
//                 report-only pass can prove that a body whose hash IS present produces no
//                 violation — the "hash formula is self-consistent" case. The enforce pass
//                 deliberately omits it.
//
// The extra hashes are appended through the shared serializer rather than by editing policy text,
// so the template stays single-sourced.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  GOOGLE_FONTS_FILES,
  GOOGLE_FONTS_STYLESHEET,
  REPORT_ONLY_HEADER,
  buildEdgeoneJson,
  derivePageHashes,
  extractInlineBodies,
  normalizeInlineText,
  sha256Source,
  validateCspConfig,
  withAdditionalHashes,
} from '../../scripts/lib/edgeone-csp-policy.mjs';

export { GOOGLE_FONTS_FILES, GOOGLE_FONTS_STYLESHEET, REPORT_ONLY_HEADER, extractInlineBodies, normalizeInlineText, sha256Source };

export const DEFAULT_CONFIG_PATH = resolve(import.meta.dirname, '..', '..', 'config', 'edgeone', 'csp-report-only.json');
const PRODUCTION_PAGES = ['bubble-watch.html'];
const CONTROL_HASH_FIXTURE = 'throw-inline.html';

export function readProductionConfig(configPath = DEFAULT_CONFIG_PATH) {
  return validateCspConfig(JSON.parse(readFileSync(configPath, 'utf8')));
}

export function readInlineBodies(root, file, tagName) {
  return extractInlineBodies(readFileSync(resolve(root, file), 'utf8'), tagName);
}

export function hashInlineBodies(root, file, tagName) {
  return readInlineBodies(root, file, tagName).map(sha256Source);
}

/**
 * Policies derived from the artifact under test plus the control fixtures.
 *
 * Keys kept stable for the verification harness: `production`, `verification`/`policy`,
 * `withControlHash`, `controlScriptHash`, `scriptHashes`, `styleHashes`, `config`.
 */
export function buildPagePolicies({ artifactRoot, fixtureRoot, configPath = DEFAULT_CONFIG_PATH }) {
  const config = readProductionConfig(configPath);
  const productionPages = PRODUCTION_PAGES.map((file) => derivePageHashes(artifactRoot, file));
  const fixturePages = ['allowed-inline.html'].map((file) => derivePageHashes(fixtureRoot, file));

  const production = buildEdgeoneJson({ config, pages: productionPages });
  const verification = buildEdgeoneJson({ config, pages: [...productionPages, ...fixturePages] });

  const controlBody = readInlineBodies(fixtureRoot, CONTROL_HASH_FIXTURE, 'script')[0];
  if (typeof controlBody !== 'string') throw new Error(`${CONTROL_HASH_FIXTURE} has no inline script to hash`);
  const controlScriptHash = sha256Source(controlBody);
  const withControlHash = withAdditionalHashes(config, {
    scriptHashes: productionPages.flatMap((page) => page.scriptHashes),
    styleHashes: productionPages.flatMap((page) => page.styleHashes),
    extraScriptHashes: [controlScriptHash],
  });

  return {
    production: production.policy,
    verification: verification.policy,
    // Compatibility alias: the harness's "candidate" for the local modes is the verification policy.
    policy: verification.policy,
    withControlHash,
    withControlHashNoFonts: withControlHash,
    noFonts: verification.policy,
    config,
    // Hash sources offered to the harness: the real pages' plus the control fixture's.
    scriptHashes: [...productionPages, ...fixturePages].flatMap((page) => page.scriptHashes),
    styleHashes: [...productionPages, ...fixturePages].flatMap((page) => page.styleHashes),
    controlScriptHash,
    productionPages,
    fixturePages,
  };
}

/** Backwards-compatible alias used by earlier harness revisions. */
export function buildCandidate({ artifactRoot, fixtureRoot, configPath = DEFAULT_CONFIG_PATH }) {
  return buildPagePolicies({ artifactRoot, fixtureRoot, configPath });
}
