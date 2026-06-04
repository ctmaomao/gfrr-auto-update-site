#!/usr/bin/env node
/**
 * One-command ACLED monthly refresh + verification helper.
 *
 * Monthly sibling of scripts/world-order/acled-weekly-status.mjs. Runs the monthly
 * sanitizer and the monthly aggregate check, then compares the in-repo committed
 * config aggregate against the deployed/scored data/world-order-stress.json so an
 * operator can tell whether a manual ACLED monthly refresh has (a) been sanitized
 * into the repo config and (b) propagated into data via the CI "Refresh World Order
 * Stress" rebuild.
 *
 * READ-MOSTLY: the only write is the sanitizer (the refresh itself). This script
 * does NOT commit, push, or trigger any workflow — it only reports + guides.
 *
 * NOTE on the comparison key: data/world-order-stress.json's
 * externalSources.acled.lastFetchedAt reflects the WEEKLY preparedAt
 * (fetch-acled.mjs: `lastFetchedAt = weekly.preparedAt || monthly.preparedAt`),
 * so it is NOT a reliable signal for monthly freshness. The monthly verdict
 * instead compares the monthly-only summary fields (monthlyAsOfDate,
 * monthlyLatestFullYear, politicalViolenceEventsLatestFullYear) between config and
 * data, with asOfDate as the monotonic ordering key.
 *
 * Usage: npm run acled:status:monthly   (or: node scripts/world-order/acled-monthly-status.mjs)
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const configPath = path.join(root, 'config', 'world-order-acled-global-monthly.json');
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

// The exact monthly *content* fields fetch-acled.mjs projects into
// data/world-order-stress.json's externalSources.acled.summary (buildMonthlyFields), MINUS
// monthlySourceFreshness — that one is time-derived (recomputed from asOfDate vs today at build
// time), not config content, so comparing it would produce spurious mismatches as data ages.
// Comparing the full signature (not just the event count) is what prevents a false data_current
// when ACLED republishes/corrects a same-as-of batch or the sanitizer changes a derived field
// while politicalViolenceEventsLatestFullYear happens to stay equal.
const SIGNATURE_KEYS = [
  'monthlyAsOfDate',
  'monthlyLatestFullYear',
  'politicalViolenceEventsLatestFullYear',
  'politicalViolenceYoyDelta',
  'civilianTargetingShareLatestFullYear',
  'fatalitiesLatestFullYear',
  'monthlyLatest12mVsPrior12mDelta',
];

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

// Project a freshly-read config the same way fetch-acled.mjs would, so the comparison answers:
// "would a CI rebuild change any monthly summary field?" (apples-to-apples with the data side).
function signatureFromConfig(config) {
  if (!config) return null;
  return {
    monthlyAsOfDate: typeof config.asOfDate === 'string' ? config.asOfDate : null,
    monthlyLatestFullYear: Number.isInteger(config.latestFullYear) ? config.latestFullYear : null,
    politicalViolenceEventsLatestFullYear: finiteOrNull(config.global?.politicalViolenceEventsLatestFullYear),
    politicalViolenceYoyDelta: finiteOrNull(config.global?.politicalViolenceYoyDelta),
    civilianTargetingShareLatestFullYear: finiteOrNull(config.global?.civilianTargetingShareLatestFullYear),
    fatalitiesLatestFullYear: finiteOrNull(config.global?.fatalitiesLatestFullYear),
    monthlyLatest12mVsPrior12mDelta: finiteOrNull(config.monthlyTrend?.latest12mVsPrior12mDelta),
  };
}

function signatureFromData(summary) {
  return {
    monthlyAsOfDate: summary.monthlyAsOfDate ?? null,
    monthlyLatestFullYear: summary.monthlyLatestFullYear ?? null,
    politicalViolenceEventsLatestFullYear: summary.politicalViolenceEventsLatestFullYear ?? null,
    politicalViolenceYoyDelta: summary.politicalViolenceYoyDelta ?? null,
    civilianTargetingShareLatestFullYear: summary.civilianTargetingShareLatestFullYear ?? null,
    fatalitiesLatestFullYear: summary.fatalitiesLatestFullYear ?? null,
    monthlyLatest12mVsPrior12mDelta: summary.monthlyLatest12mVsPrior12mDelta ?? null,
  };
}

function fmtSignature(sig) {
  if (sig === null) return '(none)';
  return SIGNATURE_KEYS.map((k) => `${k}=${sig[k]}`).join('  ');
}

// 1) sanitize: ingest the 6 xlsx in manual-artifacts/world-order/acled-input/monthly -> config
//    (no-op if no xlsx placed; sanitizer prints "no input files". Strict: fails if the
//    6-file batch is incomplete — runStep then reports check_failed below.)
const sanitizeOk = runStep('1/3 sanitize monthly (xlsx -> config)', 'npm run acled:sanitize:monthly');

// 2) validate the committed config aggregate
const checkOk = runStep('2/3 check monthly aggregate', 'npm run check:world-order-acled-monthly');

// 3) compare in-repo config vs deployed data
console.log('\n===== 3/3 config (in-repo) vs data (deployed) =====');
const config = readJson(configPath);
const data = readJson(dataPath);
const acled = data?.externalSources?.acled || {};
const summary = acled.summary || {};

const cfgSig = signatureFromConfig(config);
const datSig = signatureFromData(summary);
const diffFields = cfgSig === null ? SIGNATURE_KEYS : SIGNATURE_KEYS.filter((k) => cfgSig[k] !== datSig[k]);

console.log(`config:  ${fmtSignature(cfgSig)}  preparedAt=${config?.preparedAt ?? null}`);
console.log(`data:    ${fmtSignature(datSig)}`);
if (cfgSig !== null && diffFields.length > 0) console.log(`differing fields: ${diffFields.join(', ')}`);

// Compare the FULL projected monthly signature (every field fetch-acled.mjs writes into
// externalSources.acled.summary), not just the event count — otherwise a same-as-of-batch
// correction or a sanitizer logic change that leaves politicalViolenceEventsLatestFullYear
// unchanged would falsely read as data_current while yoyDelta / civilianTargetingShare /
// fatalities / monthly-12m-trend in data go stale. asOfDate is the YYYY-MM-DD monotonic key for
// the not-current branch; `>=` (not `>`) treats a same-asOfDate local re-sanitize with changed
// content as sanitized_not_refreshed. Unlike weekly, lastFetchedAt cannot be trusted here — it
// mirrors weekly's preparedAt (see fetch-acled.mjs).
let status;
if (cfgSig === null || !cfgSig.monthlyAsOfDate) {
  status = 'config_missing_or_no_input';
} else if (diffFields.length === 0) {
  status = 'data_current';
} else if (!datSig.monthlyAsOfDate || cfgSig.monthlyAsOfDate >= datSig.monthlyAsOfDate) {
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
    '✅ data_current — data/world-order-stress.json 已反映 config 最新月度刷新;前端世界秩序附录显示的就是这一批 as-of。',
  sanitized_not_refreshed:
    '⏳ sanitized_not_refreshed — config 已更新但 data 还旧。下一步:\n' +
    '   1) git add config/world-order-acled-global-monthly.json && git commit -m "data: refresh ACLED monthly global aggregate" && git push\n' +
    '   2) GitHub -> Actions -> "Refresh World Order Stress" -> Run workflow\n' +
    '   3) CI 跑完 + git pull 后再跑本命令,应转为 data_current。',
  config_missing_or_no_input:
    '⚠️ config_missing_or_no_input — 未读到有效 config(可能未放置 xlsx,sanitize 为 no-op)。\n' +
    '   把 6 个 ACLED 月度 xlsx(同一 as-of 日期戳)放进 manual-artifacts/world-order/acled-input/monthly/ 再跑本命令。',
  data_ahead_or_local_stale:
    '❓ data_ahead_or_local_stale — data 比本地 config 还新(或本地 config 落后)。先 git pull 同步,异常请人工核对。',
};

console.log('\n===== VERDICT =====');
// If sanitize or check failed (incomplete 6-file batch, bad xlsx, expired asOfDate, config
// checker FAIL), the config-vs-data comparison below is NOT trustworthy — fail loudly instead
// of misleading the operator with a stale "data_current".
if (!sanitizeOk || !checkOk) {
  console.log('❌ check_failed — sanitize 或 check 步骤非零退出(缺 6 文件之一 / 坏 xlsx / expired asOfDate / config 校验失败)。');
  console.log('   先按上面的输出修复;步骤失败时下方 config-vs-data 对比不可信,不要据此判断"已进仓"。');
  console.log(`\nstatus=check_failed (informational config-vs-data: ${status})`);
  process.exit(1);
}
console.log(verdicts[status]);
console.log(`\nstatus=${status}`);
