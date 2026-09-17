import { createHash } from 'node:crypto';
import { collectAcledSessionBatch } from './acled-session-batch.mjs';
import { validateAcledPrivateBatch } from './acled-private-validation.mjs';

export function batchExecutionAllowed(env) {
  return env.GITHUB_ACTIONS === 'true' && env.GITHUB_EVENT_NAME === 'workflow_dispatch'
    && env.GITHUB_REF === 'refs/heads/main' && env.GITHUB_REPOSITORY === 'ctmaomao/gfrr-auto-update-site'
    && env.GITHUB_RUN_ATTEMPT === '1'
    && env.GITHUB_WORKFLOW_REF === 'ctmaomao/gfrr-auto-update-site/.github/workflows/acled-private-batch-acceptance.yml@refs/heads/main';
}

function summarize(candidate, dateKey) {
  const date = candidate?.[dateKey];
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(date)
    || !Array.isArray(candidate.filesIngested) || candidate.filesIngested.length !== 6) throw new Error();
  const rows = candidate.filesIngested.reduce((sum, f) => {
    if (!Number.isSafeInteger(f.rowCount) || f.rowCount < 0) throw new Error();
    return sum + f.rowCount;
  }, 0);
  // Exclude only run-local preparedAt; useful for later semantic comparisons.
  const { preparedAt, ...semantic } = candidate;
  return { date, files: 6, rows, sha256: createHash('sha256').update(JSON.stringify(semantic)).digest('hex') };
}

export async function acceptAcledBatch({ username, password, fetchImpl,
  collect = collectAcledSessionBatch, validate = validateAcledPrivateBatch } = {}) {
  let batch;
  try {
    batch = await collect({ username, password, fetchImpl });
    if (batch.report.status !== 'authenticated_zip_batch_read' || batch.report.logout !== 'confirmed' || !batch.workbooks) {
      return { schemaVersion: 'acled-batch-acceptance-v1', status: 'collection_failed', collection: batch.report, productionWritten: false };
    }
    const validated = validate(batch.workbooks);
    batch.workbooks = null;
    const base = { schemaVersion: 'acled-batch-acceptance-v1', status: 'validation_failed',
      collection: batch.report, validation: validated.report, productionWritten: false };
    if (validated.report.status !== 'private_validation_passed' || !validated.report.cleanupConfirmed || !validated.candidates) return base;
    try {
      return { ...base, status: 'validated_not_published',
        weekly: summarize(validated.candidates['world-order-acled-regional-weekly.json'], 'latestWeek'),
        monthly: summarize(validated.candidates['world-order-acled-global-monthly.json'], 'asOfDate') };
    } finally { validated.candidates = null; }
  } catch {
    return { schemaVersion: 'acled-batch-acceptance-v1', status: 'stopped', reason: 'acceptance_failed',
      sessionMayRemain: batch?.report?.sessionMayRemain ?? true, productionWritten: false };
  } finally { if (batch) batch.workbooks = null; }
}
