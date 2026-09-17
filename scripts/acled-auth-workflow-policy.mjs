import { createHash } from 'node:crypto';

// ADR-0051: owner approved one login/file/logout diagnostic, not general ACLED access.
// Exact reviewed workflow bytes (LF-normalized) bind the exception to manual/main-only,
// read-only execution and step-scoped download credentials. No substring-only exemptions.
// Any workflow edit requires a new independent policy review and digest update.
export const AUTH_WORKFLOW_PATH = '.github/workflows/acled-authenticated-file-probe.yml';
export const AUTH_WORKFLOW_SHA256 = '39334de90d2b5320f40f2ecf882743e420c825564ac1fba36271f5f95bc9991c';
export function isReviewedAcledAuthWorkflow(file, text) {
  return file === AUTH_WORKFLOW_PATH && typeof text === 'string'
    && createHash('sha256').update(text.replace(/\r\n/gu, '\n')).digest('hex') === AUTH_WORKFLOW_SHA256;
}
