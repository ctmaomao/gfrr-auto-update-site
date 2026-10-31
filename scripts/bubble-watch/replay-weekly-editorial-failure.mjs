import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { shortHash } from '../lib/check-script-helpers.mjs';
import { validateWeeklyEditorialInput, validateWeeklyEditorialOutput } from './weekly-editorial-contract.mjs';

// Read-only contract replay: no env/key access, fetch, provider, output file, projection or writer.
// Failure reasons are fixed codes: neither the report nor the stderr line echoes file contents,
// parser text, provider prose or credentials, so a retained artifact can be triaged without leaks.
const DEFAULT_PATHS = {
  input: 'manual-artifacts/bubble-watch-weekly-editorial/editorial-input-latest.json',
  failure: 'manual-artifacts/bubble-watch-weekly-editorial/deepseek-failure-latest.json'
};

function report(reason, extra = {}) {
  return { diagnosticOnly: true, productionEligible: false, apiCallCount: 0, exactReplay: false, ok: false, reason, errors: [], ...extra };
}

export function parseReplayPaths(argv) {
  const paths = { ...DEFAULT_PATHS };
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i]; const value = argv[i + 1];
    if (!['--input', '--failure'].includes(flag) || !value || value.startsWith('--')) throw Error('invalid replay arguments');
    paths[flag.slice(2)] = value;
  }
  return paths;
}

// Returns { code, payload }. code 0 means the retained candidate passes the current validator;
// code 1 means the candidate reproduces contract errors or the evidence is missing/mismatched.
export function replayWeeklyEditorialFailure({ inputPath, failurePath, readFile = (file) => fs.readFileSync(file, 'utf8') }) {
  const fail = (reason, extra) => ({ code: 1, payload: report(reason, extra) });

  let input;
  try {
    input = JSON.parse(readFile(inputPath));
  } catch { return fail('missing_or_unreadable_input'); }

  let inputValid = false;
  try { inputValid = validateWeeklyEditorialInput(input).ok; } catch { inputValid = false; }
  if (!inputValid) return fail('input_contract_invalid');

  let failure;
  try {
    failure = JSON.parse(readFile(failurePath));
  } catch { return fail('missing_or_unreadable_failure'); }

  const candidate = failure?.replayCandidate;
  if (candidate?.schemaVersion !== 'bubble-weekly-editorial-replay-only-v1' || candidate.replayOnly !== true || candidate.productionEligible !== false) {
    return fail('missing_replay_candidate');
  }
  if (candidate.inputDigestShort !== shortHash(input, 16)) return fail('input_digest_mismatch');

  let result = null;
  try { result = validateWeeklyEditorialOutput(candidate.output, input); } catch { result = null; }
  if (!result) return fail('replay_validator_threw');

  const exactReplay = !candidate.redactionsApplied && !candidate.omittedFields && !candidate.bounded;
  return {
    code: result.ok ? 0 : 1,
    payload: {
      diagnosticOnly: true, productionEligible: false, apiCallCount: 0, exactReplay,
      ok: result.ok, reason: result.ok ? 'replay_valid' : 'replay_found_contract_errors',
      errors: result.errors, warnings: result.warnings, visibleTextLength: result.visibleTextLength
    }
  };
}

function main() {
  let paths;
  try { paths = parseReplayPaths(process.argv.slice(2)); } catch { paths = null; }
  const outcome = paths
    ? replayWeeklyEditorialFailure({ inputPath: paths.input, failurePath: paths.failure })
    : { code: 1, payload: report('invalid_arguments') };
  console.log(JSON.stringify(outcome.payload));
  if (outcome.code !== 0) {
    // Never echo JSON parser text, file contents or credentials.
    console.error(`Bubble editorial replay failed (${outcome.payload.reason}): check arguments, input contract and matching replay-only candidate.`);
  }
  process.exitCode = outcome.code;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
