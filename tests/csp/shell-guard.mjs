// Shell resolution for the bash-driven workflow cases.
//
// Extracted only because two real callers need the same logic: the review suite (which must fail
// in CI when no shell is available) and the regression cases that verify that decision. Keeping it
// pure over its inputs means the decision can be tested directly, without re-invoking the test
// runner as a subprocess (which would recurse).
import { execFileSync } from 'node:child_process';

/**
 * Locates the shell used by the workflow-semantics cases. `GF_BASH` is a controlled TEST input —
 * never read from pages, artifacts or any other untrusted/published content; otherwise Linux uses
 * the system bash and Windows uses Git Bash.
 */
export function resolveBash(env = process.env, platform = process.platform) {
  if (env.GF_BASH) return env.GF_BASH;
  if (platform === 'win32') return 'C:\\Program Files\\Git\\bin\\bash.exe';
  return 'bash';
}

function defaultRun(command, args, options) {
  return execFileSync(command, args, options);
}

/**
 * True only when the candidate really runs as bash. A path that merely exists, or a process that
 * exits 0, is not sufficient: `BASH_VERSION` must print something shaped like a bash version. That
 * rejects a different shell or a random program that happens to exit 0 and print usage text, which
 * an "output is non-empty" check would have accepted.
 */
export function shellUsable(candidate, run = defaultRun) {
  try {
    const out = run(candidate, ['--noprofile', '--norc', '-c', 'printf %s "$BASH_VERSION"'], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return /^\d+\.\d+/u.test(String(out).trim());
  } catch {
    return false;
  }
}

/**
 * Decides what a bash-driven case must do in this environment.
 *
 * In CI a missing shell must FAIL: these cases are the reason the suite is wired in at all, and a
 * skip would let a PR check report success while the workflow steps were never exercised. Outside
 * CI a local environment without bash may skip, and the reason travels with the decision so the
 * skip is never silent.
 */
export function bashGuard({ env = process.env, platform = process.platform, run = defaultRun } = {}) {
  const candidate = resolveBash(env, platform);
  if (shellUsable(candidate, run)) return { ok: true, candidate };
  const reason = `no usable bash (BASH_VERSION not reported by: ${candidate})`;
  return { ok: false, candidate, reason, mustFail: env.GF_REQUIRE_BASH === '1' };
}
