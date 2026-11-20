import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { replayControlAudit } from '../../tools/oil-directional/replay-thermal-control-audit.mjs';

test('restricted operations and full-operation recovery remain one historical episode', () => {
  const audit = replayControlAudit();
  assert.deepEqual(audit.rows.map(r => [r.publicationDate,r.state]), [
    ['2022-06-24','restricted_operations'], ['2022-10-07','full_operations_reported']
  ]);
  assert.equal(audit.documentedEpisodes, 1);
  assert.equal(audit.admittedIndependentControlWindows, 0);
  assert.equal(audit.admittedPairedHoldoutWindows, 0);
  assert.equal(audit.status, 'inconclusive');
  for (const row of audit.rows) {
    assert.equal(row.timeZone, 'Europe/Vienna');
    assert.equal(row.publicationPrecision, 'local_date_only');
    for (const field of ['eventFreeThroughoutWindow','firstKnownToStudyAt','qualifiedThermalObservation','comparatorDecision','augmentedDecision']) {
      assert.equal(row[field], null);
    }
  }
  assert.equal(audit.incrementalGain, null);
  assert.equal(audit.falseAlertHarm, null);
  assert.equal(audit.eligibleForProduction, false);
});
test('changed local transcription fails closed; no alternate manifest is silently accepted', () => {
  assert.throws(() => replayControlAudit(Buffer.from('{}')), /reviewed pin/);
});
test('standalone offline CLI resolves its manifest regardless of working directory', () => {
  const script = fileURLToPath(new URL('../../tools/oil-directional/replay-thermal-control-audit.mjs', import.meta.url));
  assert.deepEqual(JSON.parse(execFileSync(process.execPath, [script], { cwd: '/' })), replayControlAudit());
});
