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
export function isReviewedAcledAuthWorkflow(file, text) {
  const expected = file === AUTH_WORKFLOW_PATH ? AUTH_WORKFLOW_SHA256
    : file === DETAIL_WORKFLOW_PATH ? DETAIL_WORKFLOW_SHA256
      : file === BATCH_WORKFLOW_PATH ? BATCH_WORKFLOW_SHA256 : null;
  return expected !== null && typeof text === 'string'
    && createHash('sha256').update(text.replace(/\r\n/gu, '\n')).digest('hex') === expected;
}
