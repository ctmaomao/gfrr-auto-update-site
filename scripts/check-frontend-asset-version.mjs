// Enforcement wrapper for the frontend asset cache-version rule (AGENTS.md §1).
//
// It is intentionally thin: all detection lives in review-frontend-asset-version.mjs so
// the observable review and the blocking gate can never disagree about what counts as a
// missing bump. A clean tree always passes — in CI the working tree is clean by
// definition, so this gate bites locally, before an unbumped change is committed.
import { evaluateFrontendAssetVersionStatus } from './review-frontend-asset-version.mjs';

const result = evaluateFrontendAssetVersionStatus();

for (const limitation of result.knownLimitations) {
  console.log(`- known limitation: ${limitation}`);
}

if (result.status === 'ok') {
  console.log(
    `Frontend asset version check: PASS (version=${result.workingVersion ?? 'unknown'}, scope=${result.scopeFiles.length} files)`,
  );
  process.exit(0);
}

if (result.status === 'shallow_history_fallback' || result.status === 'app_version_missing') {
  // Cannot decide without history or without the version constant; report loudly but do
  // not block, so an environment limitation never masquerades as a policy violation.
  console.error(`Frontend asset version check: WATCH (${result.status}) — ${result.reason}`);
  process.exit(0);
}

console.error('Frontend asset version check: FAIL');
console.error(`- ${result.reason}`);
console.error(`- APP_VERSION is still ${result.workingVersion ?? 'unknown'}`);
if (result.changedScopeFiles.length > 0) {
  for (const file of result.changedScopeFiles) console.error(`- changed without a bump: ${file}`);
}
console.error('- Frontend files are loaded with ?v=${APP_VERSION}, so an unbumped change stays behind the cached module graph and is invisible to returning visitors.');
process.exit(1);
