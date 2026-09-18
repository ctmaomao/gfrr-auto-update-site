import { createHash } from 'node:crypto';

// ADR-0051: owner approved one login/file/logout diagnostic, not general ACLED access.
// Exact reviewed workflow bytes (LF-normalized) bind the exception to manual/main-only,
// read-only execution and step-scoped download credentials. No substring-only exemptions.
// Any workflow edit requires a new independent policy review and digest update.
export const AUTH_WORKFLOW_PATH = '.github/workflows/acled-authenticated-file-probe.yml';
export const AUTH_WORKFLOW_SHA256 = '39334de90d2b5320f40f2ecf882743e420c825564ac1fba36271f5f95bc9991c';
// ADR-0052: separate one-use HTML detail discovery; not a file downloader.
// Exact bytes retain manual/main-only read access. A changed target needs policy review.
export const DETAIL_WORKFLOW_PATH = '.github/workflows/acled-authenticated-detail-discovery.yml';
export const DETAIL_WORKFLOW_SHA256 = '70d2976abaf877ffff8eff7bc0373290396f721cdf68ec4551644161341ed352';
// ADR-0054: one private batch acceptance, no schedule, artifacts or publication.
// Only these exact reviewed bytes may reference the two download Secrets.
export const BATCH_WORKFLOW_PATH = '.github/workflows/acled-private-batch-acceptance.yml';
export const BATCH_WORKFLOW_SHA256 = '483b33300f716ed397a42847841e130dc0b56a5a6f63650aa0f6aad39bc2c060';
// ADR-0055: only the separately reviewed weekly/initial automatic workflow.
// Its permanent pre-login claims and exact bounds cannot be transferred to reminders.
export const AUTO_WORKFLOW_PATH = '.github/workflows/acled-auto-update.yml';
export const AUTO_WORKFLOW_SHA256 = '205d1728a11ba7ed2bb859aea4031b77f033ea95b8005f66bca39b4863b59088';
// ADR-0056: exact Mon pair / Wed+Fri weekly-only cadence, not arbitrary schedules.
// The original digest remains an explicit rollback-compatible lower-frequency
// version at the SAME path; both use the SAME permanent Monday/initial claims.
// It grants no extra slot or caller. Any other bytes still need policy review.
export const SPLIT_AUTO_WORKFLOW_SHA256 = '5a281ebbe63b9f71105a56a698536f7abfac66d1f9c67b063f80749530b291d7';
export function isReviewedAcledAuthWorkflow(file, text) {
  const expected = file === AUTH_WORKFLOW_PATH ? AUTH_WORKFLOW_SHA256
    : file === DETAIL_WORKFLOW_PATH ? DETAIL_WORKFLOW_SHA256
      : file === BATCH_WORKFLOW_PATH ? BATCH_WORKFLOW_SHA256
        : file === AUTO_WORKFLOW_PATH ? AUTO_WORKFLOW_SHA256 : null;
  if (expected === null || typeof text !== 'string') return false;
  const digest = createHash('sha256').update(text.replace(/\r\n/gu, '\n')).digest('hex');
  return digest === expected || (file === AUTO_WORKFLOW_PATH && digest === SPLIT_AUTO_WORKFLOW_SHA256);
}
