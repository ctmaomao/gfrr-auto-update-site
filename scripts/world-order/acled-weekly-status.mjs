#!/usr/bin/env node
/**
 * One-command ACLED weekly refresh + verification helper.
 *
 * Runs the weekly sanitizer and the weekly aggregate check, then compares the
 * in-repo committed config aggregate against the deployed/scored
 * data/world-order-stress.json so an operator can tell whether a manual ACLED
 * refresh has (a) been sanitized into the repo config and (b) propagated into
 * data via the CI "Refresh World Order Stress" rebuild.
 *
 * READ-MOSTLY: the only write is the sanitizer (the refresh itself). This script
 * does NOT commit, push, or trigger any workflow — it only reports + guides.
 *
 * Usage: npm run acled:status   (or: node scripts/world-order/acled-weekly-status.mjs)
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const configPath = path.join(root, 'config', 'world-order-acled-regional-weekly.json');
const dataPath = path.join(root, 'data', 'world-order-stress.json');

function runStep(label, cmd) {
  console.log(`\n===== ${label} =====`);
  try {
    execSync(cmd, { cwd: root, stdio: 'inherit', shell: true });
    return true;
  } catch {
    console.log(`(${label} FAILED — non-zero exit; see output above)`);
    return false;
  }
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

// 1) sanitize: ingest any xlsx in manual-artifacts/world-order/acled-input/weekly -> config
//    (no-op if no xlsx placed; sanitizer prints "no input files")
const sanitizeOk = runStep('1/3 sanitize weekly (xlsx -> config)', 'npm run acled:sanitize:weekly');

// 2) validate the committed config aggregate
const checkOk = runStep('2/3 check weekly aggregate', 'npm run check:world-order-acled-weekly');

// 3) compare in-repo config vs deployed data
console.log('\n===== 3/3 config (in-repo) vs data (deployed) =====');
const config = readJson(configPath);
const data = readJson(dataPath);
const acled = data?.externalSources?.acled || {};
const summary = acled.summary || {};

const cfg = {
  latestWeek: config?.latestWeek ?? null,
  preparedAt: config?.preparedAt ?? null,
  events4w: config?.global?.eventsLast4Weeks ?? null,
};
const dat = {
  latestWeek: summary.latestWeek ?? null,
  lastFetchedAt: acled.lastFetchedAt ?? null,
  events4w: summary.eventsLast4Weeks ?? null,
};

console.log(`config:  latestWeek=${cfg.latestWeek}  preparedAt=${cfg.preparedAt}  events4w=${cfg.events4w}`);
console.log(`data:    latestWeek=${dat.latestWeek}  lastFetchedAt=${dat.lastFetchedAt}  events4w=${dat.events4w}`);

// preparedAt / lastFetchedAt are ISO-8601 strings -> lexicographic compare == chronological.
let status;
if (config === null || !cfg.preparedAt) {
  status = 'config_missing_or_no_input';
} else if (
  cfg.preparedAt === dat.lastFetchedAt &&
  cfg.latestWeek === dat.latestWeek &&
  cfg.events4w === dat.events4w
) {
  status = 'data_current';
} else if (!dat.lastFetchedAt || cfg.preparedAt > dat.lastFetchedAt) {
  status = 'sanitized_not_refreshed';
} else {
  status = 'data_ahead_or_local_stale';
}

// git state of the committed config file
let gitState = 'unknown';
try {
  const rel = path.relative(root, configPath).split(path.sep).join('/');
  const out = execSync(`git status --porcelain "${rel}"`, { cwd: root }).toString().trim();
  gitState = out ? `uncommitted/modified (${out.slice(0, 2).trim()})` : 'committed (clean)';
} catch {
  /* git not available — ignore */
}
console.log(`config git state: ${gitState}`);

const verdicts = {
  data_current:
    '✅ data_current — data/world-order-stress.json 已反映 config 最新刷新;前端世界秩序附录显示的就是这一周。',
  sanitized_not_refreshed:
    '⏳ sanitized_not_refreshed — config 已更新但 data 还旧。下一步:\n' +
    '   先切换并同步 main；一条命令打通全链: npm run acled:publish (main-only guard + 提交 config + push main + 触发 main workflow + 等 CI + pull 复核;需已登录 gh CLI)\n' +
    '   或手动三步:\n' +
    '   1) 在最新 main 上 git add config/world-order-acled-regional-weekly.json && git commit -m "chore(world-order): refresh ACLED weekly" && git push origin main:main\n' +
    '   2) GitHub -> Actions -> "Refresh World Order Stress" -> Run workflow (branch: main)\n' +
    '   3) CI 跑完 + git pull 后再跑本命令,应转为 data_current。',
  config_missing_or_no_input:
    '⚠️ config_missing_or_no_input — 未读到有效 config(可能未放置 xlsx,sanitize 为 no-op)。\n' +
    '   把 6 个 ACLED 周度 xlsx 放进 manual-artifacts/world-order/acled-input/weekly/ 再跑本命令。',
  data_ahead_or_local_stale:
    '❓ data_ahead_or_local_stale — data 比本地 config 还新(或本地 config 落后)。先 git pull 同步,异常请人工核对。',
};

console.log('\n===== VERDICT =====');
// If sanitize or check failed (bad xlsx, expired latestWeek, config checker FAIL),
// the config-vs-data comparison below is NOT trustworthy — fail loudly instead of
// misleading the operator with a stale "data_current".
if (!sanitizeOk || !checkOk) {
  console.log('❌ check_failed — sanitize 或 check 步骤非零退出(坏 xlsx / expired latestWeek / config 校验失败)。');
  console.log('   先按上面的输出修复;步骤失败时下方 config-vs-data 对比不可信,不要据此判断"已进仓"。');
  console.log(`\nstatus=check_failed (informational config-vs-data: ${status})`);
  process.exit(1);
}
console.log(verdicts[status]);
console.log(`\nstatus=${status}`);
