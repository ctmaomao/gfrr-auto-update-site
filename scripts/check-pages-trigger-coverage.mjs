#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const WORKFLOWS_DIR = '.github/workflows';
const PAGES_WORKFLOW = '.github/workflows/deploy-static-site-to-pages.yml';

// Workflows that commit but NOT to main (e.g., realtime-data branch).
// These should NOT trigger Pages deploy. Each must have an explicit reason.
const EXCLUDED_FROM_PAGES = {
  'Build Realtime Market': 'commits to realtime-data branch (consumed by daily-radar, not by Pages)',
  'Recover Stale Realtime Market': 'commits to realtime-data branch (same publish branch as Build Realtime Market)',
};

const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

// --- Step 1: Read Pages workflow and extract workflow_run.workflows list ---

if (!existsSync(PAGES_WORKFLOW)) {
  console.error(`M-60: ${PAGES_WORKFLOW} missing`);
  process.exit(1);
}

const pagesSrc = readFileSync(PAGES_WORKFLOW, 'utf8');

// Match the workflow_run.workflows block. The block ends at the next sibling key
// at the same indentation (typically `types:` immediately follows in this project).
const wfRunMatch = pagesSrc.match(/workflow_run:\s*\n\s+workflows:\s*\n([\s\S]+?)\n\s+types:/);
let pagesListeners = new Set();
if (!wfRunMatch) {
  fail('Pages workflow missing workflow_run.workflows block (or types: not found as sibling key)');
} else {
  const listingText = wfRunMatch[1];
  const listed = listingText
    .split('\n')
    .map((line) => line.trim().replace(/^-\s*/, '').trim())
    .filter(Boolean);
  pagesListeners = new Set(listed);
}

// --- Step 2: Scan all workflow files and categorize each ---

const workflowFiles = readdirSync(WORKFLOWS_DIR)
  .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
  .map((f) => join(WORKFLOWS_DIR, f))
  .filter((p) => p.replace(/\\/g, '/') !== PAGES_WORKFLOW); // exclude Pages workflow itself

const report = [];

for (const filepath of workflowFiles) {
  const src = readFileSync(filepath, 'utf8');

  // Extract top-level name (first `name:` line at column 0)
  const nameMatch = src.match(/^name:\s*(.+)$/m);
  const workflowName = nameMatch ? nameMatch[1].trim() : null;
  if (!workflowName) {
    fail(`${filepath}: missing top-level "name:" declaration; cannot match against Pages workflow_run list`);
    continue;
  }

  // Heuristic 1: has `permissions: contents: write` anywhere in the file?
  // Default permissions may also allow write; we accept both as "could commit".
  const hasContentsWrite = /permissions:\s*\n[\s\S]*?contents:\s*write/.test(src);
  const hasContentsRead = /permissions:\s*\n[\s\S]*?contents:\s*read/.test(src);

  // Heuristic 2: scan for `git push` and `git commit` patterns in run blocks.
  // We look only at lines that appear to be in shell run blocks.
  const pushLines = src.match(/git\s+push[^\n]*/g) || [];
  const commitLines = src.match(/git\s+commit[^\n]*/g) || [];

  const pushesToRealtimeBranch = pushLines.some((line) =>
    line.includes('realtime-data')
  );
  // Treat any push that is not explicitly to realtime-data as a push to main
  // (workflows in this project either push to main or to realtime-data).
  const pushesToMain = pushLines.some((line) => !line.includes('realtime-data'));

  const hasCommit = commitLines.length > 0;
  const hasPush = pushLines.length > 0;

  // Heuristic 3: workflows that assert no diff (dry-run / provider-test pattern)
  // explicitly state `git diff --exit-code` - these never commit even though
  // they may have permissions.
  const assertsNoDiff = /git\s+diff\s+--exit-code/.test(src);

  // Determine category
  let category;
  let needsPagesTrigger = false;
  let reason;

  if (hasContentsRead && !hasContentsWrite && !hasPush) {
    category = 'read-only';
    reason = 'Has permissions: contents: read; no commits';
  } else if (assertsNoDiff && !pushesToMain) {
    category = 'dry-run';
    reason = 'Has `git diff --exit-code` assertion; no main commits';
  } else if (pushesToRealtimeBranch && !pushesToMain) {
    category = 'realtime-data-branch';
    reason = 'Commits to realtime-data branch only';
  } else if (hasCommit && pushesToMain) {
    category = 'commits-to-main';
    needsPagesTrigger = true;
    reason = 'Has git commit and git push to main';
  } else if (hasContentsWrite && hasCommit && hasPush) {
    category = 'commits-unclear';
    needsPagesTrigger = true; // treat as commit-to-main until proven otherwise
    reason = 'Has contents:write + git commit + git push, but push destination unclear';
  } else if (!hasCommit && !hasPush) {
    category = 'no-write';
    reason = 'No git commit or push detected';
  } else {
    category = 'unclassified';
    reason = `commit=${hasCommit} push=${hasPush} contents-write=${hasContentsWrite}`;
  }

  const isExcluded = Object.prototype.hasOwnProperty.call(EXCLUDED_FROM_PAGES, workflowName);
  const isInPagesList = pagesListeners.has(workflowName);

  report.push({
    filepath,
    workflowName,
    category,
    needsPagesTrigger,
    isInPagesList,
    isExcluded,
    reason,
    excludedReason: isExcluded ? EXCLUDED_FROM_PAGES[workflowName] : null,
  });

  // --- Validation rules ---

  // Rule 1: commits-to-main MUST be either in Pages list OR explicitly excluded.
  if (needsPagesTrigger) {
    if (isExcluded) {
      // Exclusion check: if a commits-to-main workflow is excluded, that's
      // suspicious - the maintainer should verify the heuristic is correct.
      warn(
        `${workflowName} (${filepath}) commits to main BUT is in EXCLUDED_FROM_PAGES with reason "${EXCLUDED_FROM_PAGES[workflowName]}". Verify the exclusion is intentional; commits-to-main workflows normally need Pages auto-deploy.`
      );
    } else if (!isInPagesList) {
      fail(
        `${workflowName} (${filepath}) commits to main but is NOT in ${PAGES_WORKFLOW} workflow_run.workflows list. Either:\n` +
        `    (a) add "${workflowName}" to deploy-static-site-to-pages.yml workflow_run.workflows, or\n` +
        '    (b) if this workflow should NOT trigger Pages, add it to EXCLUDED_FROM_PAGES in this check with a written reason.'
      );
    }
  }

  // Rule 2: workflows that don't appear to commit-to-main should not be in Pages list
  // (warning only - sometimes a workflow may transitively trigger Pages refresh and
  // is correctly listed even if it doesn't commit directly).
  if (!needsPagesTrigger && isInPagesList) {
    warn(
      `${workflowName} (${filepath}) is in Pages workflow_run.workflows but no main commit was detected. Heuristic may be wrong, or the listing may be obsolete. Category: ${category}.`
    );
  }

  // Rule 3: commits-unclear is a fail; the maintainer must clarify.
  if (category === 'commits-unclear' && !isExcluded && !isInPagesList) {
    fail(
      `${workflowName} (${filepath}) has contents:write + git commit + git push but the destination branch is unclear. Manually verify and either:\n` +
      `    (a) add to Pages workflow_run.workflows if pushing to main, or\n` +
      '    (b) add to EXCLUDED_FROM_PAGES with reason.'
    );
  }
}

// --- Step 3: Verify Pages list entries actually match real workflow files ---

for (const listed of pagesListeners) {
  const found = report.find((r) => r.workflowName === listed);
  if (!found) {
    fail(
      `Pages workflow_run lists "${listed}" but no workflow file with that name: declaration was found. Either rename the workflow or update Pages listing.`
    );
  }
}

// --- Step 4: Verify refresh-world-order-stress.yml no longer has obsolete steps ---

const refreshPath = '.github/workflows/refresh-world-order-stress.yml';
if (existsSync(refreshPath)) {
  const refreshSrc = readFileSync(refreshPath, 'utf8');
  if (refreshSrc.includes('gh workflow run deploy-static-site-to-pages.yml')) {
    fail(
      `${refreshPath} still has explicit "gh workflow run deploy-static-site-to-pages.yml" step from PR #213. Remove it; M-60 uses workflow_run in Pages workflow to auto-trigger instead.`
    );
  }
  if (/id:\s*commit_step/.test(refreshSrc) && refreshSrc.includes('committed=true')) {
    fail(
      `${refreshPath} still has commit_step id and committed output from PR #213. Simplify the Commit step now that the explicit Pages trigger step has been removed.`
    );
  }
}

// --- Step 5: Print categorized report ---

console.log('Pages trigger coverage report:');
console.log('');
console.log('  Status | Category              | Workflow Name');
console.log('  -------|-----------------------|--------------');

// Sort by status priority for readability
const statusPriority = { 'MISSING': 0, 'unclear': 1, 'registered': 2, 'excluded': 3, 'N/A': 4 };
function reportStatusKey(item) {
  if (item.needsPagesTrigger) {
    if (item.isInPagesList) return 'registered';
    if (item.isExcluded) return 'excluded';
    return 'MISSING';
  }
  if (item.isExcluded) return 'excluded';
  if (item.isInPagesList) return 'unclear';
  return 'N/A';
}
const sortedReport = report.slice().sort((a, b) => {
  const sa = reportStatusKey(a);
  const sb = reportStatusKey(b);
  return (statusPriority[sa] ?? 9) - (statusPriority[sb] ?? 9);
});

for (const r of sortedReport) {
  let status;
  if (r.needsPagesTrigger) {
    if (r.isInPagesList) status = '✓ registered';
    else if (r.isExcluded) status = '✓ excluded';
    else status = '✗ MISSING';
  } else if (r.isExcluded) {
    status = '✓ excluded';
  } else if (r.isInPagesList) {
    status = '⚠ listed-but-no-commit';
  } else {
    status = '— N/A';
  }
  console.log(`  ${status.padEnd(22)} | ${r.category.padEnd(22)} | ${r.workflowName}`);
}
console.log('');

if (warnings.length > 0) {
  console.log('Warnings:');
  for (const w of warnings) console.log('  -', w);
  console.log('');
}

if (errors.length > 0) {
  console.error('Pages trigger coverage check FAILED:');
  for (const e of errors) console.error('  -', e);
  console.error('');
  process.exit(1);
}

console.log('Pages trigger coverage check: PASS');
