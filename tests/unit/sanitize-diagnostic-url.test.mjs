import assert from 'node:assert/strict';
import test from 'node:test';

import { sanitizeDiagnosticUrl } from '../../scripts/sanitize-diagnostic-url.mjs';

test('diagnostic URLs never retain secrets from query strings or fragments', () => {
  const diagnostic = sanitizeDiagnosticUrl('https://api.stlouisfed.org/fred/series?api_key=secret-value#token');
  assert.equal(diagnostic, 'https://api.stlouisfed.org/fred/series');
  assert.equal(diagnostic.includes('secret-value'), false);
  assert.equal(sanitizeDiagnosticUrl('not a URL'), '[invalid-url]');
});
