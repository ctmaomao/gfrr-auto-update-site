import fs from 'node:fs';
import process from 'node:process';
import { shortHash } from '../lib/check-script-helpers.mjs';
import { assertValid, validateWeeklyEditorialInput, validateWeeklyEditorialOutput } from './weekly-editorial-contract.mjs';

// Read-only contract replay: no env/key access, fetch, provider, output file, projection or writer.
const paths = { input: 'manual-artifacts/bubble-watch-weekly-editorial/editorial-input-latest.json', failure: 'manual-artifacts/bubble-watch-weekly-editorial/deepseek-failure-latest.json' };
try {
  for (let i = 2; i < process.argv.length; i += 2) {
    const flag = process.argv[i]; const value = process.argv[i + 1];
    if (!['--input', '--failure'].includes(flag) || !value || value.startsWith('--')) throw Error('invalid replay arguments');
    paths[flag.slice(2)] = value;
  }
  const input = JSON.parse(fs.readFileSync(paths.input, 'utf8'));
  assertValid(validateWeeklyEditorialInput(input), 'replay input');
  const failure = JSON.parse(fs.readFileSync(paths.failure, 'utf8'));
  const candidate = failure.replayCandidate;
  if (candidate?.schemaVersion !== 'bubble-weekly-editorial-replay-only-v1' || candidate.replayOnly !== true || candidate.productionEligible !== false || candidate.inputDigestShort !== shortHash(input, 16)) throw Error('missing or mismatched replay candidate');
  const result = validateWeeklyEditorialOutput(candidate.output, input);
  console.log(JSON.stringify({ diagnosticOnly: true, productionEligible: false, apiCallCount: 0,
    exactReplay: !candidate.redactionsApplied && !candidate.omittedFields && !candidate.bounded, ...result }));
  process.exitCode = result.ok ? 0 : 1;
} catch {
  // A malformed local file may contain a credential; never echo JSON parser error text or file contents.
  console.error('Bubble editorial replay failed: check arguments, input contract and matching replay-only candidate.');
  process.exitCode = 1;
}
