import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { collectAcledSessionBatch } from './acled-session-batch.mjs';
import { validateAcledPrivateBatch } from './acled-private-validation.mjs';
import { reviewAcledConfigPair } from './acled-config-review.mjs';
import { publishAcledPair } from './acled-pair-publication.mjs';
import { claimAcledSlot, dispatchAcledFollowup } from './acled-auto-github.mjs';
import { acledAutoPlan } from './acled-auto-cadence.mjs';
import { isAcledRepositoryOrigin } from './acled-repository.mjs';

const files = { weekly: 'config/world-order-acled-regional-weekly.json', monthly: 'config/world-order-acled-global-monthly.json' };
const sha = v => createHash('sha256').update(v).digest('hex');
export function acledAutoContext(env) {
  return env.GITHUB_ACTIONS === 'true' && ['schedule', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)
    && env.GITHUB_REF === 'refs/heads/main' && env.GITHUB_RUN_ATTEMPT === '1'
    && env.GITHUB_REPOSITORY === 'ctmaomao/gfrr-auto-update-site'
    && env.GITHUB_WORKFLOW_REF === 'ctmaomao/gfrr-auto-update-site/.github/workflows/acled-auto-update.yml@refs/heads/main';
}

export async function runAcledAutoUpdate({ execute = false, env = process.env, root = process.cwd(), now = new Date(),
  fetchImpl = fetch, collect = collectAcledSessionBatch, validate = validateAcledPrivateBatch,
  publish = publishAcledPair } = {}) {
  const report = { schemaVersion: 'acled-auto-update-v1', status: 'dry_run', githubRequests: 0,
    acledRequests: 0, sessionMayRemain: false, configurationsPublished: false, sitePublished: false, retryAllowed: false };
  if (execute !== true) return report;
  report.status = 'execution_hold';
  let batch, validated;
  try {
    if (!acledAutoContext(env) || Object.keys(process.env).some(k => /^GIT_/iu.test(k) && k.toUpperCase() !== 'GIT_PAGER')) return report;
    const plan = acledAutoPlan(env, now);
    if (!plan) return report;
    report.plan = plan;
    const username = env.ACLED_DOWNLOAD_USERNAME, password = env.ACLED_DOWNLOAD_PASSWORD, token = env.GH_TOKEN;
    if (![username, password].every(v => typeof v === 'string' && v.length > 0 && v.length <= 1024 && !/[\x00-\x1f\x7f]/u.test(v))) return report;
    const git = args => execFileSync('git', args, { cwd: root, timeout: 15000, maxBuffer: 1024 * 1024,
      encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, GIT_OPTIONAL_LOCKS: '0', GIT_NO_REPLACE_OBJECTS: '1' } });
    if (git(['branch', '--show-current']).trim() !== 'main'
      || !isAcledRepositoryOrigin(git(['remote', 'get-url', 'origin']).trim())
      || git(['status', '--porcelain', '--untracked-files=all'])) return report;
    const expectedHead = git(['rev-parse', 'HEAD']).trim();
    if (git(['rev-parse', 'refs/remotes/origin/main']).trim() !== expectedHead) return report;
    const baseline = Object.fromEntries(Object.entries(files).map(([kind, file]) => [kind, git(['show', `${expectedHead}:${file}`])]));
    const expectedBaselineSha256 = Object.fromEntries(Object.entries(baseline).map(([k, v]) => [k, sha(v)]));
    if (reviewAcledConfigPair({ baseline, candidate: baseline, expectedBaselineSha256 }).status !== 'unchanged') return report;
    // The existing receipt requires automatic provenance for both inputs. Never
    // rewrite a manual month's provenance or discover this only after publication.
    // Monday pair acquisition can establish a new fully automatic validated pair.
    if (plan.scope === 'weekly' && JSON.parse(baseline.monthly).preparedBy !== 'github-actions-acled-auto') {
      report.status = 'monthly_baseline_receipt_hold'; return report;
    }
    report.expectedHead = expectedHead;
    report.claim = await claimAcledSlot({ slot: plan.slot, expectedHead, token, fetchImpl });
    report.githubRequests += report.claim.requestCount;
    if (report.claim.status !== 'claimed') { report.status = report.claim.status; return report; }
    report.status = 'collection_failed';
    report.acledRequests = null; // An unexpected transport exception is not proof of zero requests.
    report.sessionMayRemain = true;
    batch = await collect({ username, password, fetchImpl, scope: plan.scope });
    report.collection = batch.report; report.acledRequests = batch.report.requestCount;
    report.sessionMayRemain = batch.report.sessionMayRemain !== false;
    if (batch.report.status !== 'authenticated_zip_batch_read' || batch.report.logout !== 'confirmed'
      || batch.report.sessionMayRemain !== false || !batch.workbooks
      || batch.report.requestCount !== plan.maxAcledRequests) return report;
    validated = validate(batch.workbooks, { scope: plan.scope }); batch.workbooks = null;
    report.validation = validated.report; report.status = 'validation_failed';
    if (validated.report.status !== 'private_validation_passed' || !validated.report.cleanupConfirmed || !validated.candidates) return report;
    const expectedKeys = (plan.scope === 'weekly' ? [files.weekly] : Object.values(files)).map(file => file.slice('config/'.length)).sort();
    if (Object.keys(validated.candidates).sort().join('|') !== expectedKeys.join('|')) return report;
    const candidate = Object.fromEntries(Object.entries(files).map(([kind, file]) => {
      // The untouched monthly baseline stays byte-for-byte pinned, including its clock.
      if (plan.scope === 'weekly' && kind === 'monthly') return [kind, baseline.monthly];
      const value = structuredClone(validated.candidates[file.slice('config/'.length)]);
      value.preparedBy = 'github-actions-acled-auto';
      return [kind, `${JSON.stringify(value, null, 2)}\n`];
    }));
    validated.candidates = null;
    const comparison = reviewAcledConfigPair({ baseline, candidate, expectedBaselineSha256 });
    report.comparison = comparison;
    if (!['unchanged', 'review_required'].includes(comparison.status)) { report.status = 'candidate_hold'; return report; }
    const reviewedCandidateSha256 = Object.fromEntries(Object.entries(candidate).map(([k, v]) => [k, sha(v)]));
    report.candidateSha256 = reviewedCandidateSha256;
    report.status = 'publication_unknown'; report.configurationsPublished = null;
    // ADR-0055 owner execution approval, NOT a representation of official source permission.
    report.publication = await publish({ execute: true, publicationApproved: true, sourceUseApproved: true,
      root, expectedHead, expectedBaselineSha256, reviewedCandidateSha256, candidate, token, fetchImpl });
    report.githubRequests += report.publication.requestCount;
    report.configurationsPublished = report.publication.configurationsPublished;
    report.status = report.publication.status;
    if (report.publication.status !== 'configurations_published_refresh_pending') return report;
    report.receipt = { acled_config_commit: report.publication.commit, acled_weekly_sha256: reviewedCandidateSha256.weekly,
      acled_monthly_sha256: reviewedCandidateSha256.monthly };
    report.refresh = await dispatchAcledFollowup({ target: 'refresh', receipt: report.receipt, token, fetchImpl });
    report.githubRequests += report.refresh.requestCount;
    report.status = report.refresh.status === 'dispatch_accepted' ? 'refresh_dispatched_site_pending' : 'published_refresh_unknown';
    return report;
  } catch { return report; }
  finally { if (batch) batch.workbooks = null; if (validated) validated.candidates = null; }
}
