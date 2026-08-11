export const ACLED_PUBLISH_BRANCH = 'main';
export const ACLED_PUBLISH_UPSTREAM = 'origin/main';
export const ACLED_CONFIG_PATHS = Object.freeze([
  'config/world-order-acled-regional-weekly.json',
  'config/world-order-acled-global-monthly.json'
]);

function normalizePaths(paths) {
  return [...new Set((paths ?? []).map((value) => String(value).trim().replace(/\\/gu, '/')).filter(Boolean))];
}

export function validateAcledPublishContext({
  currentBranch,
  upstreamBranch,
  behindCount,
  trackedChangePaths,
  aheadCommitPaths,
  unmergedPaths
}) {
  const failures = [];
  if (currentBranch !== ACLED_PUBLISH_BRANCH) {
    failures.push(`current branch must be ${ACLED_PUBLISH_BRANCH}, got ${currentBranch || '<detached>'}`);
  }
  if (upstreamBranch !== ACLED_PUBLISH_UPSTREAM) {
    failures.push(`upstream must be ${ACLED_PUBLISH_UPSTREAM}, got ${upstreamBranch || '<none>'}`);
  }
  if (!Number.isInteger(behindCount) || behindCount < 0) {
    failures.push(`behindCount must be a non-negative integer, got ${behindCount}`);
  } else if (behindCount > 0) {
    failures.push(`local main is behind origin/main by ${behindCount} commit(s)`);
  }

  const allowed = new Set(ACLED_CONFIG_PATHS);
  const unexpectedTracked = normalizePaths(trackedChangePaths).filter((file) => !allowed.has(file));
  if (unexpectedTracked.length > 0) {
    failures.push(`unrelated tracked changes present: ${unexpectedTracked.join(', ')}`);
  }

  const unexpectedAhead = normalizePaths(aheadCommitPaths).filter((file) => !allowed.has(file));
  if (unexpectedAhead.length > 0) {
    failures.push(`local main has unrelated unpushed commit paths: ${unexpectedAhead.join(', ')}`);
  }

  const conflicts = normalizePaths(unmergedPaths);
  if (conflicts.length > 0) failures.push(`unmerged paths present: ${conflicts.join(', ')}`);

  return failures;
}
