import test from 'node:test';
import assert from 'node:assert/strict';
import { validateNoForbiddenSerializedText } from '../../scripts/oil-directional/oil-news-review-input-files.mjs';

test('offline review guard preserves the original case-sensitive markers and diagnostic', () => {
  const label = 'manual fixture';
  for (const [marker, first] of [
    ['TAVILY_API_KEY', 'TAVILY_API_KEY'],
    ['TAVILY_API_KEYS', 'TAVILY_API_KEY'],
    ['BRAVE_API_KEY', 'BRAVE_API_KEY'],
    ['BRAVE_API_KEYS', 'BRAVE_API_KEY'],
    ...['Authorization', 'X-Subscription-Token', 'Bearer ', '"snippet"', '"body"', '"rawResponse"']
      .map(marker => [marker, marker])
  ]) {
    assert.throws(() => validateNoForbiddenSerializedText(marker, label), {
      message: `${label} contains forbidden marker: ${first}`
    });
  }
  assert.throws(() => validateNoForbiddenSerializedText('{"body":"TAVILY_API_KEYS"}', label), {
    message: `${label} contains forbidden marker: TAVILY_API_KEY`
  });
  assert.doesNotThrow(() =>
    validateNoForbiddenSerializedText('{"bodyText":"authorization","token":"Bearer","RawResponse":null}', label));
});
