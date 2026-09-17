import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import childProcess from 'node:child_process';
import { validateAcledPrivateBatch } from '../../scripts/world-order/acled-private-validation.mjs';
import { DETAIL_PAGES } from '../../scripts/world-order/acled-detail-discovery.mjs';
const listing = () => fs.readdirSync(os.tmpdir()).filter(n => n.startsWith('gfrr-acled-private-')).sort();
const files = () => DETAIL_PAGES.map(p => ({ url: `https://acleddata.com/system/files/2026-09/${p.kind === 'monthly' ? `number_of_${p.identity}_as-of-11Sep2026` : `${p.identity}_aggregated_data_up_to_week_of-2026-09-05`}.xlsx`, bytes: Buffer.from('PRIVATE_INVALID_FILE') }));
test('invalid batch cannot create a directory or touch production', () => {
  const before = listing();
  for (const input of [null, [], files().slice(1), files().map(f => ({ ...f, bytes: null }))]) {
    const r = validateAcledPrivateBatch(input);
    assert.equal(r.report.reason, 'invalid_batch'); assert.equal(r.candidates, null);
    assert.equal(r.report.productionWritten, false);
  }
  assert.deepEqual(listing(), before);
});
test('real sanitizer failure is isolated, suppressed, and cleans only new private files', () => {
  const before = listing();
  const paths = ['config/world-order-acled-global-monthly.json', 'config/world-order-acled-regional-weekly.json'];
  const originals = paths.map(p => fs.readFileSync(p));
  const r = validateAcledPrivateBatch(files());
  assert.equal(r.report.reason, 'weekly_validation_failed'); assert.equal(r.candidates, null);
  assert.equal(r.report.cleanupConfirmed, true); assert.equal(r.report.rawFilesRetained, false);
  assert.doesNotMatch(JSON.stringify(r), /PRIVATE|INVALID_FILE|xlsx|[A-Z]:\\/u);
  assert.deepEqual(listing(), before);
  paths.forEach((p, i) => assert.deepEqual(fs.readFileSync(p), originals[i]));
});

test('missing locked XLSX dependency fails before either sanitizer and cleans its private workspace', t => {
  const before = listing(), realpath = fs.realpathSync;
  let calls = 0;
  t.mock.method(fs, 'realpathSync', target => {
    if (path.basename(target) === 'xlsx' && path.basename(path.dirname(target)) === 'node_modules') {
      throw Object.assign(new Error('dependency missing'), { code: 'ENOENT' });
    }
    return realpath(target);
  });
  t.mock.method(childProcess, 'spawnSync', () => { calls++; throw new Error('must not run'); });
  const r = validateAcledPrivateBatch(files());
  assert.equal(r.report.reason, 'private_validation_failed');
  assert.equal(calls, 0); assert.equal(r.candidates, null);
  assert.equal(r.report.cleanupConfirmed, true); assert.equal(r.report.rawFilesRetained, false);
  assert.equal(r.report.productionWritten, false); assert.deepEqual(listing(), before);
});

test('second sanitizer failure never releases the first candidate', t => {
  const before = listing(); let calls = 0;
  t.mock.method(childProcess, 'spawnSync', (_exe, _args, options) => {
    calls++;
    fs.writeFileSync(path.join(options.cwd, 'config', 'world-order-acled-regional-weekly.json'), '{}');
    assert.equal(options.env.NODE_OPTIONS, undefined);
    assert.equal(options.env.ACLED_DOWNLOAD_PASSWORD, undefined);
    return { status: calls === 1 ? 0 : 1 };
  });
  const r = validateAcledPrivateBatch(files());
  assert.equal(calls, 2); assert.equal(r.report.reason, 'monthly_validation_failed');
  assert.equal(r.candidates, null); assert.deepEqual(listing(), before);
});

test('cleanup failure revokes even successful candidates and discloses retained private input', t => {
  const parent = fs.realpathSync(os.tmpdir()); let owned;
  t.mock.method(childProcess, 'spawnSync', (_exe, _args, options) => {
    owned = options.cwd;
    for (const name of ['world-order-acled-regional-weekly.json', 'world-order-acled-global-monthly.json']) fs.writeFileSync(path.join(owned, 'config', name), '{}');
    return { status: 0 };
  });
  const original = fs.rmSync;
  const mocked = t.mock.method(fs, 'rmSync', () => { throw new Error('PRIVATE'); });
  try {
    const r = validateAcledPrivateBatch(files());
    assert.equal(r.candidates, null); assert.equal(r.report.status, 'stopped');
    assert.equal(r.report.reason, 'cleanup_failed'); assert.equal(r.report.rawFilesRetained, true);
    assert.equal(r.report.cleanupConfirmed, false); assert.doesNotMatch(JSON.stringify(r), /PRIVATE/u);
  } finally {
    mocked.mock.restore();
    // Only remove the unique test directory observed from this invocation.
    assert.equal(path.dirname(owned), parent);
    assert.ok(path.basename(owned).startsWith('gfrr-acled-private-'));
    assert.equal(fs.realpathSync(owned), owned);
    original(owned, { recursive: true });
  }
});
