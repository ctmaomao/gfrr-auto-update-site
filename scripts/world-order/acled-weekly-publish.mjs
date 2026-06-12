#!/usr/bin/env node
/**
 * Explicit opt-in publish helper for the ACLED weekly refresh.
 *
 * Full chain: acled:status -> commit config -> push -> dispatch "Refresh World
 * Order Stress" workflow -> watch CI -> pull -> re-verify (expect data_current).
 *
 * acled:status stays read-only by design; this is its side-effectful sibling
 * that an operator runs ONLY after acled:status reports sanitized_not_refreshed.
 * It commits ONLY the derived weekly config JSON — raw xlsx files stay
 * untracked under manual-artifacts/, and data/world-order-stress.json is still
 * built exclusively by CI (local builds lack the GDELT secret; never commit a
 * locally built world-order-stress.json).
 *
 * Requires the GitHub CLI (`gh`) authenticated against this repo.
 *
 * Usage: npm run acled:publish   (or: node scripts/world-order/acled-weekly-publish.mjs)
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONFIG_REL = 'config/world-order-acled-regional-weekly.json';
const WORKFLOW_NAME = 'Refresh World Order Stress';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function sh(cmd, { capture = false } = {}) {
  return execSync(cmd, {
    cwd: root,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    shell: true,
  });
}

// Runs acled:status, echoes its output, and returns the parsed `status=` line.
// The status script exits 1 on check_failed — treat that as a hard abort.
function readStatus(label) {
  console.log(`\n===== ${label} =====`);
  let out;
  try {
    out = execSync('npm run acled:status', { cwd: root, encoding: 'utf8', shell: true });
  } catch (error) {
    process.stdout.write(error.stdout ?? '');
    process.stderr.write(error.stderr ?? '');
    console.log('\n❌ acled:status 非零退出(check_failed)——先修复上面的输出再 publish。');
    process.exit(1);
  }
  process.stdout.write(out);
  const matches = out.match(/^status=([a-z_]+)/gm);
  if (!matches || matches.length === 0) {
    console.log('\n❌ 无法从 acled:status 输出解析 status= 行,中止。');
    process.exit(1);
  }
  return matches[matches.length - 1].slice('status='.length);
}

function latestRunId() {
  try {
    const out = sh(
      `gh run list --workflow "${WORKFLOW_NAME}" --limit 1 --json databaseId --jq ".[0].databaseId"`,
      { capture: true }
    ).trim();
    return out || null;
  } catch {
    return null;
  }
}

// ---- 0/5 preconditions: gh available + authenticated ----
try {
  sh('gh auth status', { capture: true });
} catch {
  console.log('❌ GitHub CLI (gh) 不可用或未登录。请先安装并 `gh auth login`,或手动执行:');
  console.log(`   1) git add ${CONFIG_REL} && git commit -m "chore(world-order): refresh ACLED weekly" && git push`);
  console.log(`   2) GitHub -> Actions -> "${WORKFLOW_NAME}" -> Run workflow`);
  process.exit(1);
}

// ---- 1/5 status gate ----
const status = readStatus('1/5 acled:status (pre-publish gate)');
if (status === 'data_current') {
  console.log('\n✅ data_current — 无需 publish,data 已是最新。');
  process.exit(0);
}
if (status !== 'sanitized_not_refreshed') {
  console.log(`\n❓ status=${status} — publish 仅处理 sanitized_not_refreshed;请按上面 acled:status 的指引人工处理。`);
  process.exit(1);
}

// ---- 2/5 commit (config only) ----
console.log('\n===== 2/5 commit config =====');
const porcelain = sh(`git status --porcelain "${CONFIG_REL}"`, { capture: true }).trim();
if (porcelain) {
  const config = JSON.parse(fs.readFileSync(path.join(root, CONFIG_REL), 'utf8'));
  const week = config?.latestWeek ?? 'unknown-week';
  sh(`git add "${CONFIG_REL}"`);
  sh(`git commit -m "chore(world-order): refresh ACLED weekly to ${week}" -- "${CONFIG_REL}"`);
} else {
  console.log('config 已是 committed (clean) — 跳过 commit,直接 push + 触发 workflow。');
}

// ---- 3/5 push (rebase-and-retry once on reject) ----
console.log('\n===== 3/5 push =====');
try {
  sh('git push');
} catch {
  console.log('push 被拒(远端有新提交),执行 git pull --rebase 后重试一次…');
  sh('git pull --rebase');
  sh('git push');
}

// ---- 4/5 dispatch workflow + watch ----
console.log(`\n===== 4/5 dispatch "${WORKFLOW_NAME}" =====`);
const beforeRunId = latestRunId();
sh(`gh workflow run "${WORKFLOW_NAME}"`);
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
  console.log('❌ dispatch 后 60s 内未观测到新 run;去 Actions 页面人工确认,CI 绿后 git pull + npm run acled:status。');
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
sh('git pull --rebase');
const finalStatus = readStatus('final acled:status');
if (finalStatus === 'data_current') {
  console.log('\n✅ publish 完成 — data_current,前端世界秩序附录将随 Pages 部署显示最新周。');
  process.exit(0);
}
console.log(`\n❓ CI 已绿但 status=${finalStatus} — 请人工核对(可能 Pages/data 提交尚未拉齐,稍后重跑 npm run acled:status)。`);
process.exit(1);
