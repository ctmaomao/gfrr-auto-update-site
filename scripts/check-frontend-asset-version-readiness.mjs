import { evaluateFrontendAssetVersionStatus } from './review-frontend-asset-version.mjs';

const result = evaluateFrontendAssetVersionStatus();

if (result.status === 'ok') {
  console.log(`Frontend asset version check: PASS (version=${result.currentVersion || 'unknown'}, scope=${result.scopeFiles.length} files)`);
} else if (result.status === 'shallow_history_fallback') {
  console.log(`Frontend asset version check: WATCH (shallow git clone; fallback to head scope inspection)`);
} else if (result.status === 'unbumped_frontend_changes') {
  console.log(`Frontend asset version check: WATCH (unbumped frontend scope changes: ${result.changedScopeFiles.join(', ')})`);
} else {
  console.log(`Frontend asset version check: WATCH (status=${result.status}; ${result.reason})`);
}

if (result.knownLimitations.length > 0) {
  for (const limitation of result.knownLimitations) {
    console.log(`- known limitation: ${limitation}`);
  }
}
