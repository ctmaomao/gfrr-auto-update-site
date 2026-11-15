import assert from 'node:assert/strict';

// Explicit accounting injection for pre-existing offline content/quality tests.
// Runtime callers never import this helper. Separate budget tests exercise the
// real reservation boundary, including refusal before provider transport.
export async function fixtureDeepSeekBudget({ key, payload, consumer }, request) {
  assert(['macro-editorial', 'bubble-editorial'].includes(consumer));
  assert.equal(typeof request, 'function');
  return request({
    url: 'https://api.deepseek.com/chat/completions',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(payload)
  });
}
