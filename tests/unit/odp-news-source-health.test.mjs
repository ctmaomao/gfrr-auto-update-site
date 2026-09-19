// Focused guard for the ODP news source-health line.
//
// Extracted from gdelt-event-units.test.mjs so it can run inside `check:all`
// without dragging in that file's heavier, unrelated GDELT cloud tests.
//
// The codes asserted here are the real ones emitted by scripts/lib/tavily-budget.mjs
// and preserved verbatim into sourceStatus.details.<source>.queryRuns[].error by
// scripts/lib/search-request-policy.mjs. An earlier version of this regression used
// http_432_plan_limit, which the ledger no longer produces, so it passed while the
// shipped notice could never render.
import test from 'node:test';
import assert from 'node:assert/strict';
import { newsSourceHealthText } from '../../scripts/modules/renderOilDirectional.js';

const build = (error, sourceKey = 'tavily') => ({
  status: 'partial',
  sourceStatus: {
    gdeltDoc: 'live',
    tavily: 'error',
    brave: 'live',
    details: { [sourceKey]: { queryRuns: [{ queryId: 'q1', status: 'error', error }] } },
  },
  aggregate: { liveSourceCount: 2, configuredSourceCount: 3 },
  queryCoverage: { queryCount: 9, querySuccessCount: 6 },
});

test('account and project ledger limits are reported as exhaustion', () => {
  assert.match(newsSourceHealthText(build('tavily_budget_account_limit')), /Tavily额度耗尽降级/u);
  assert.match(newsSourceHealthText(build('tavily_budget_project_limit')), /Tavily额度耗尽降级/u);
});

test('a stopped collection session is reported as paused, not as exhaustion', () => {
  const text = newsSourceHealthText(build('tavily_budget_session_stopped'));
  assert.match(text, /Tavily采集已暂停降级/u);
  assert.doesNotMatch(text, /额度耗尽/u);
});

test('other ledger failures keep the generic degraded wording instead of guessing a cause', () => {
  for (const other of [
    'tavily_budget_ledger_full',
    'tavily_budget_credentials_missing',
    'tavily_budget_invalid_ledger',
    'tavily_budget_contention',
    'tavily_budget_store_unavailable',
  ]) {
    const text = newsSourceHealthText(build(other));
    assert.match(text, /Tavily降级/u, other);
    assert.doesNotMatch(text, /额度耗尽|采集已暂停/u, other);
  }
});

test('a rate limit is not an exhaustion and is never attributed as one', () => {
  const text = newsSourceHealthText(build('GDELT DOC broad oil-news cache HTTP 429 after 1 attempt(s)'));
  assert.doesNotMatch(text, /额度耗尽|采集已暂停/u);
});

test('no ledger code, HTTP status or provider text reaches the rendered line', () => {
  const codes = [
    'tavily_budget_account_limit',
    'tavily_budget_project_limit',
    'tavily_budget_session_stopped',
    'http_432_plan_limit',
    'http_429_rate_limited',
  ];
  for (const code of codes) {
    assert.doesNotMatch(newsSourceHealthText(build(code)), /tavily_budget|432|429|plan_limit|http_/u, code);
  }
});

test('a healthy source line carries no attribution suffix', () => {
  const text = newsSourceHealthText({
    status: 'ok',
    sourceStatus: { gdeltDoc: 'live', tavily: 'live', brave: 'live', details: {} },
    aggregate: { liveSourceCount: 3, configuredSourceCount: 3 },
    queryCoverage: { queryCount: 9, querySuccessCount: 9 },
  });
  assert.doesNotMatch(text, /额度耗尽|采集已暂停/u);
});
