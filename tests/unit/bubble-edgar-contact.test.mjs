import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EDGAR_CONTACT_ENV, resolveEdgarIdentity, describeEdgarIdentity } from '../../scripts/bubble-watch/edgar-contact.mjs';

// The reviewed fallback identity is the one already used by the builder; no new address is
// introduced by this change. Synthetic test contacts use the non-deliverable .invalid TLD.
const FALLBACK = 'gfrr-auto-update-site bubble-watch ctmaomao@users.noreply.github.com';
const withContact = (value) => ({ [EDGAR_CONTACT_ENV]: value });

test('declared SEC contact is opt-in and unset or malformed values keep the existing identity', () => {
  assert.equal(EDGAR_CONTACT_ENV, 'BUBBLE_WATCH_EDGAR_CONTACT');
  for (const value of [undefined, '', '   ', 'gfrr-auto-update-site', 'gfrr-auto-update-site bubble-watch@', 'tool sec-contact@fixture', 'x'.repeat(220), `tool sec-contact@fixture.invalid\r\nX-Injected: 1`]) {
    const identity = resolveEdgarIdentity(withContact(value), FALLBACK);
    assert.equal(identity.configured, false, String(value));
    assert.equal(identity.userAgent, FALLBACK, String(value));
    assert.ok(identity.reason, String(value));
  }
  // A trailing newline is a common secret-export artifact; trimming it is safe because the
  // resolved value can then never carry a header separator.
  const trimmed = resolveEdgarIdentity(withContact('tool sec-contact@fixture.invalid\n'), FALLBACK);
  assert.equal(trimmed.configured, true);
  assert.equal(trimmed.userAgent, 'tool sec-contact@fixture.invalid');
  assert.equal(resolveEdgarIdentity({}, FALLBACK).reason, 'not_configured');
  assert.equal(resolveEdgarIdentity(withContact('tool name\ncontact@fixture.invalid'), FALLBACK).reason, 'invalid_characters');
});

test('a well-formed declared contact replaces the identity without exposing it in diagnostics', () => {
  const declared = 'GFrr Research sec-contact@fixture.invalid';
  const identity = resolveEdgarIdentity(withContact(declared), FALLBACK);
  assert.equal(identity.configured, true);
  assert.equal(identity.userAgent, declared);
  assert.equal(identity.reason, null);
  assert.equal(describeEdgarIdentity(withContact(declared)), 'configured');
  assert.equal(describeEdgarIdentity({}), 'fallback (not_configured)');
  assert.equal(describeEdgarIdentity(withContact('bad contact')), 'fallback (invalid_format)');
  for (const status of [describeEdgarIdentity(withContact(declared)), describeEdgarIdentity({}), describeEdgarIdentity(withContact('bad'))]) {
    assert.equal(status.includes('@'), false);
    assert.equal(status.includes('fixture.invalid'), false);
    assert.equal(status.includes('GFrr'), false);
  }
});

test('builder and the audit workflow wire the contact separately; the production refresh job stays frozen', () => {
  const builder = fs.readFileSync('scripts/build-bubble-watch.mjs', 'utf8');
  assert.match(builder, /resolveEdgarIdentity\(process\.env, EDGAR_FALLBACK_UA\)/u);
  assert.match(builder, /describeEdgarIdentity\(process\.env\)/u);
  // The value must never be logged: only the mode/reason helper is printed.
  assert.equal(/console\.(?:log|warn|error)\([^)]*EDGAR_UA/u.test(builder), false);
  assert.equal(builder.includes('EDGAR_FALLBACK_UA = \'gfrr-auto-update-site bubble-watch ctmaomao@users.noreply.github.com\''), true);
  assert.equal((builder.match(/gfrr-auto-update-site bubble-watch ctmaomao@users\.noreply\.github\.com/gu) || []).length, 1);

  // Only the read-only audit workflow injects the identity. The production refresh job is
  // hash-frozen by tests/unit/epoch-arr-weekly.test.mjs and must not gain this env line
  // here: wiring production requires its own ADR-reviewed change (and a new frozen hash).
  const audit = fs.readFileSync('.github/workflows/audit-bubble-watch-sources.yml', 'utf8');
  assert.equal((audit.match(/BUBBLE_WATCH_EDGAR_CONTACT: \$\{\{ secrets\.BUBBLE_WATCH_EDGAR_CONTACT \}\}/gu) || []).length, 2);
  assert.equal(/echo[^\n]*BUBBLE_WATCH_EDGAR_CONTACT/u.test(audit), false);
  assert.equal(/printenv|env \|/u.test(audit), false);

  const refresh = fs.readFileSync('.github/workflows/refresh-bubble-watch.yml', 'utf8');
  assert.equal(refresh.includes('BUBBLE_WATCH_EDGAR_CONTACT'), false, 'production refresh is not wired; requires an independent ADR-reviewed change');
  assert.equal(/secrets\.BUBBLE_WATCH_EDGAR_CONTACT/u.test(refresh), false, 'production refresh must not reference the contact secret');
});
