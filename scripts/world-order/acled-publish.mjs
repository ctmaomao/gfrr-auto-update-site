#!/usr/bin/env node
/**
 * Explicit opt-in publish helper for ACLED weekly/monthly manual refreshes.
 *
 * Full chain:
 *   status weekly + monthly -> commit changed config(s) -> push -> dispatch
 *   "Refresh World Order Stress" workflow -> watch CI -> pull -> re-verify
 *   both tracks.
 *
 * The status helpers remain read-mostly by design. This side-effectful helper
 * only commits the derived ACLED config JSON files. Raw xlsx files stay
 * untracked under manual-artifacts/, and data/world-order-stress.json is still
 * built exclusively by CI because local builds may not have production secrets.
 *
 * Requires the GitHub CLI (`gh`) authenticated against this repo.
 *
 * Usage: npm run acled:publish
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ACLED_PUBLISH_BRANCH,
  ACLED_PUBLISH_UPSTREAM,
  validateAcledPublishContext
} from './acled-publish-guard.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORKFLOW_NAME = 'Refresh World Order Stress';

const TRACKS = [
  {
    key: 'weekly',
    label: 'ACLED weekly',
    statusCmd: 'npm run acled:status:weekly',
    configRel: 'config/world-order-acled-regional-weekly.json',
    commitSubject(config) {
      return `chore(world-order): refresh ACLED weekly to ${config?.latestWeek ?? 'unknown-week'}`;
    },
  },
  {
    key: 'monthly',
    label: 'ACLED monthly',
    statusCmd: 'npm run acled:status:monthly',
    configRel: 'config/world-order-acled-global-monthly.json',
    commitSubject(config) {
      return `chore(world-order): refresh ACLED monthly to ${config?.asOfDate ?? 'unknown-asof'}`;
    },
  },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function sh(cmd, { capture = false } = {}) {
  return execSync(cmd, {
    cwd: root,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    shell: true,
  });
}

function captureLines(cmd) {
  return sh(cmd, { capture: true })
    .split(/\r?\n/gu)
    .map((line) => line.trim())
    .filter(Boolean);
}

function ensureMainPublishContext() {
  const currentBranch = sh('git branch --show-current', { capture: true }).trim();
  let upstreamBranch = '';
  let behindCount = 0;
  let aheadCommitPaths = [];

  // Do not even fetch when invoked from a feature branch. Publishing is a
  // deliberate main-only operation, not a way to promote the current branch.
  if (currentBranch === ACLED_PUBLISH_BRANCH) {
    sh(`git fetch origin ${ACLED_PUBLISH_BRANCH}`);
    upstreamBranch = sh(
      `git for-each-ref --format="%(upstream:short)" "refs/heads/${ACLED_PUBLISH_BRANCH}"`,
      { capture: true }
    ).trim();
    behindCount = Number(sh(
      `git rev-list --count HEAD..${ACLED_PUBLISH_UPSTREAM}`,
      { capture: true }
    ).trim());
    aheadCommitPaths = captureLines(`git diff --name-only ${ACLED_PUBLISH_UPSTREAM}..HEAD`);
  }

  const trackedChangePaths = [
    ...captureLines('git diff --name-only'),
    ...captureLines('git diff --cached --name-only')
  ];
  const unmergedPaths = captureLines('git diff --name-only --diff-filter=U');
  const failures = validateAcledPublishContext({
    currentBranch,
    upstreamBranch,
    behindCount,
    trackedChangePaths,
    aheadCommitPaths,
    unmergedPaths
  });

  if (failures.length > 0) {
    console.log('\n❌ ACLED publish 已停止：只允许从最新、无无关改动的 main 发布。');
    for (const failure of failures) console.log(`   - ${failure}`);
    console.log(`   请切换并同步 ${ACLED_PUBLISH_UPSTREAM}，再重新运行 status 与 publish。`);
    process.exit(1);
  }

  console.log(`✅ publish branch guard: ${ACLED_PUBLISH_BRANCH} -> ${ACLED_PUBLISH_UPSTREAM}`);
}

function ensureHeadPublishedToMain() {
  sh(`git fetch origin ${ACLED_PUBLISH_BRANCH}`);
  const localHead = sh('git rev-parse HEAD', { capture: true }).trim();
  const remoteHead = sh(`git rev-parse ${ACLED_PUBLISH_UPSTREAM}`, { capture: true }).trim();
  if (!localHead || localHead !== remoteHead) {
    console.log('\n❌ main push 后本地 HEAD 与 origin/main 不一致，未触发 workflow。');
    console.log(`   local HEAD: ${localHead || '<missing>'}`);
    console.log(`   origin/main: ${remoteHead || '<missing>'}`);
    process.exit(1);
  }
}

function readJson(rel) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
  } catch {
    return null;
  }
}

// Runs a status helper, echoes its output, and returns the parsed `status=` line.
// The status helper exits 1 on check_failed; treat that as a hard abort.
function readStatus(track, label) {
  console.log(`\n===== ${label}: ${track.label} =====`);
  let out;
  try {
    out = execSync(track.statusCmd, { cwd: root, encoding: 'utf8', shell: true });
  } catch (error) {
    process.stdout.write(error.stdout ?? '');
    process.stderr.write(error.stderr ?? '');
    console.log(`\n❌ ${track.statusCmd} 非零退出(check_failed)——先修复上面的输出再 publish。`);
    process.exit(1);
  }
  process.stdout.write(out);
  const matches = out.match(/^status=([a-z_]+)/gm);
  if (!matches || matches.length === 0) {
    console.log(`\n❌ 无法从 ${track.statusCmd} 输出解析 status= 行,中止。`);
    process.exit(1);
  }
  return {
    track,
    status: matches[matches.length - 1].slice('status='.length),
  };
}

function latestRunId() {
  try {
    const out = sh(
      `gh run list --workflow "${WORKFLOW_NAME}" --branch "${ACLED_PUBLISH_BRANCH}" --event workflow_dispatch --limit 1 --json databaseId --jq ".[0].databaseId"`,
      { capture: true }
    ).trim();
    return out || null;
  } catch {
    return null;
  }
}

function configGitState(rel) {
  return sh(`git status --porcelain "${rel}"`, { capture: true }).trim();
}

function commitMessageFor(tracks) {
  if (tracks.length === 1) {
    const track = tracks[0];
    return track.commitSubject(readJson(track.configRel));
  }
  return 'chore(world-order): refresh ACLED weekly and monthly aggregates';
}

// ---- 0/5 preconditions: main-only Git context + gh authenticated ----
ensureMainPublishContext();

try {
  sh('gh auth status', { capture: true });
} catch {
  console.log('❌ GitHub CLI (gh) 不可用或未登录。请先安装并 `gh auth login`,或手动执行:');
  console.log(`   1) 确认当前分支是 ${ACLED_PUBLISH_BRANCH} 且已同步 ${ACLED_PUBLISH_UPSTREAM}`);
  console.log('   2) git add config/world-order-acled-*.json && git commit -m "chore(world-order): refresh ACLED aggregates" && git push origin main:main');
  console.log(`   3) GitHub -> Actions -> "${WORKFLOW_NAME}" -> Run workflow (branch: main)`);
  process.exit(1);
}

// ---- 1/5 status gates ----
const preResults = TRACKS.map((track) => readStatus(track, '1/5 pre-publish gate'));
const staleTracks = preResults
  .filter((result) => result.status === 'sanitized_not_refreshed')
  .map((result) => result.track);
const blocking = preResults.filter(
  (result) => !['data_current', 'sanitized_not_refreshed'].includes(result.status)
);

if (blocking.length > 0) {
  console.log('\n❓ publish 仅处理 data_current / sanitized_not_refreshed。以下 track 需要人工处理:');
  for (const result of blocking) console.log(`   ${result.track.key}: status=${result.status}`);
  process.exit(1);
}

if (staleTracks.length === 0) {
  console.log('\n✅ weekly/monthly 都是 data_current — 无需 publish,data 已是最新。');
  process.exit(0);
}

// ---- 2/5 commit changed config(s) only ----
console.log('\n===== 2/5 commit changed ACLED config(s) =====');
const dirtyTracks = staleTracks.filter((track) => configGitState(track.configRel));
if (dirtyTracks.length > 0) {
  for (const track of dirtyTracks) sh(`git add "${track.configRel}"`);
  const pathspec = dirtyTracks.map((track) => `"${track.configRel}"`).join(' ');
  const message = commitMessageFor(dirtyTracks);
  sh(`git commit -m ${JSON.stringify(message)} -- ${pathspec}`);
} else {
  console.log('stale config 已是 committed (clean) — 跳过 commit,直接 push + 触发 workflow。');
}

// ---- 3/5 explicit main push (fail closed on any race/rejection) ----
console.log('\n===== 3/5 push =====');
try {
  sh('git push origin main:main');
} catch {
  console.log('❌ main push 被拒，未自动 rebase、未触发 workflow。');
  console.log('   请人工核对 origin/main 的新提交，在最新 main 上重新运行 status 与 publish。');
  process.exit(1);
}
ensureHeadPublishedToMain();

// ---- 4/5 dispatch workflow + watch ----
console.log(`\n===== 4/5 dispatch "${WORKFLOW_NAME}" =====`);
const beforeRunId = latestRunId();
sh(`gh workflow run "${WORKFLOW_NAME}" --ref "${ACLED_PUBLISH_BRANCH}"`);
let runId = null;
for (let attempt = 0; attempt < 15; attempt += 1) {
  await sleep(4000);
  const id = latestRunId();
  if (id && id !== beforeRunId) {
    runId = id;
    break;
  }
}
if (!runId) {
  console.log('❌ dispatch 后 60s 内未观测到新 run;去 Actions 页面人工确认,CI 绿后 git pull + npm run acled:publish。');
  process.exit(1);
}
console.log(`run id: ${runId} — 等待 CI 完成…`);
try {
  sh(`gh run watch ${runId} --exit-status`);
} catch {
  console.log(`❌ workflow run ${runId} 失败 — 看 Actions 日志排查;data 未刷新。`);
  process.exit(1);
}

// ---- 5/5 pull + re-verify ----
console.log('\n===== 5/5 pull + re-verify =====');
sh(`git pull --ff-only origin ${ACLED_PUBLISH_BRANCH}`);
const finalResults = TRACKS.map((track) => readStatus(track, 'final verify'));
const notCurrent = finalResults.filter((result) => result.status !== 'data_current');
if (notCurrent.length === 0) {
  console.log('\n✅ publish 完成 — weekly/monthly 均 data_current,前端世界秩序附录会显示最新 ACLED 数据。');
  process.exit(0);
}

console.log('\n❓ CI 已绿但仍有 track 不是 data_current — 请人工核对:');
for (const result of notCurrent) console.log(`   ${result.track.key}: status=${result.status}`);
process.exit(1);
