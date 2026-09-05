import test from 'node:test';
import assert from 'node:assert/strict';
import { createBofaFailureDiagnostic, parseBofaCheckpointMetrics, selectLatestBofaCheckpointUrl } from '../../scripts/daily/bofa-checkpoint.mjs';
import { fetchBofaConsumerCheckpoint } from '../../scripts/run-daily-pipeline.mjs';

const origin = 'https://institute.bankofamerica.com';
const report = (month, year = 2026) => `${origin}/economic-insights/consumer-checkpoint-${month}-${year}.html`;
const pdf = (month, year = 2026) => `${origin}/content/dam/economic-insights/consumer-checkpoint-${month}-${year}.pdf`;
const nowMs = Date.parse('2026-09-05T09:00:00Z');
const august = { reportUrl: report('august'), pdfUrl: pdf('august'), nowMs };
// Compact synthetic regression sentences, not archived report text or a PDF.
const total = 'Total card spending growth eased to 5.0% year-over-year (YoY) in July, from 6.3% in June.';
const exGas = 'Spending ex-gas still rose a solid 4.3% YoY.';
const explicit = 'Total credit and debit card spending per household rose 5.0% YoY in July, from 6.3% in June.';
const parse = (text, options = august) => parseBofaCheckpointMetrics(text, options);

test('failure diagnostics expose only allowlisted stages, classes and HTTP status', () => {
  const secret = 'private-token https://private.invalid/path?key=private-token Authorization: Bearer private-token';
  for (const [stage, message, classification, status] of [
    ['landing_fetch', `failed: HTTP 403 ${secret}`, 'http_error', 403],
    ['report_fetch', `failed: HTTP 429 ${secret}`, 'http_error', 429],
    ['report_fetch', `failed: HTTP 503 ${secret}`, 'http_error', 503],
    ['landing_fetch', `failed: timeout 10000ms ${secret}`, 'request_timeout', null],
    ['report_fetch', `failed: fetch failed ${secret}`, 'network_error', null],
    ['report_discovery', `missing non-future official report link ${secret}`, 'report_discovery_failed', null],
    ['report_discovery', `stale or future report month ${secret}`, 'report_freshness_rejected', null],
    ['report_parse', `unreviewed shorthand spending basis ${secret}`, 'source_review_required', null],
    ['report_parse', `PDF report month mismatch ${secret}`, 'report_identity_rejected', null],
    ['report_parse', `conflicting current YoY ${secret}`, 'parse_contract_rejected', null],
    ['report_parse', `HTTP 403 ${secret}`, 'parse_contract_rejected', null],
    ['landing_fetch', secret, 'unexpected_failure', null],
    [secret, `HTTP 403 ${secret}`, 'unexpected_failure', null]
  ]) {
    const diagnostic = createBofaFailureDiagnostic(new Error(message), stage);
    assert.equal(diagnostic.classification, classification);
    assert.equal(diagnostic.httpStatus, status);
    assert.deepEqual(Object.keys(diagnostic), ['source', 'stage', 'classification', 'httpStatus']);
    assert.doesNotMatch(JSON.stringify(diagnostic), /private|https|Authorization|Bearer/u);
  }
  assert.equal(createBofaFailureDiagnostic({ name: 'AbortError' }, 'report_fetch').classification, 'request_timeout');
  assert.equal(createBofaFailureDiagnostic(null, 'landing_fetch').classification, 'unexpected_failure');
});

test('production fetch logs one sanitized failure at the actual stage and still rejects', async t => {
  t.mock.method(Date, 'now', () => nowMs);
  const warnings = [];
  t.mock.method(console, 'warn', line => warnings.push(line));
  const landing = `<a href="${report('august')}">Report</a>`;
  const reportHtml = `<a href="${pdf('august')}">Full analysis</a><p>private-token no metrics</p>`;
  let calls = 0;
  const mockedFetch = t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    return new Response(calls === 1 ? landing : reportHtml);
  });
  await assert.rejects(fetchBofaConsumerCheckpoint(), /missing unambiguous/u);
  assert.equal(calls, 2);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /"stage":"report_parse"/u);
  assert.match(warnings[0], /"classification":"parse_contract_rejected"/u);
  assert.doesNotMatch(warnings[0], /private-token|https|no metrics/u);

  warnings.length = 0;
  mockedFetch.mock.mockImplementation(async () => new Response('<p>No report anchors</p>'));
  await assert.rejects(fetchBofaConsumerCheckpoint(), /missing non-future/u);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /"stage":"report_discovery"/u);

  warnings.length = 0;
  calls = 0;
  mockedFetch.mock.mockImplementation(async () => {
    calls += 1;
    return new Response(calls === 1 ? landing : `<a href="${pdf('august')}">Full analysis</a><p>${total} ${exGas}</p>`);
  });
  assert.equal((await fetchBofaConsumerCheckpoint()).bofaStatus, 'live');
  assert.equal(calls, 2);
  assert.equal(warnings.length, 0);
});

test('HTTP failures keep the existing bounded retry count and distinguish landing from report', async t => {
  t.mock.method(Date, 'now', () => nowMs);
  const warnings = [];
  t.mock.method(console, 'warn', line => warnings.push(line));
  let calls = 0;
  const mockedFetch = t.mock.method(globalThis, 'fetch', async () => {
    calls += 1;
    return new Response('private-token blocked body', { status: 403 });
  });
  await assert.rejects(fetchBofaConsumerCheckpoint(), /bofa:consumer-checkpoint-landing failed: HTTP 403/u);
  assert.equal(calls, 3); // Existing first attempt + two retries, not a new retry layer.
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /"stage":"landing_fetch"/u);
  assert.match(warnings[0], /"httpStatus":403/u);
  assert.doesNotMatch(warnings[0], /private-token|blocked body/u);

  calls = 0;
  warnings.length = 0;
  mockedFetch.mock.mockImplementation(async () => {
    calls += 1;
    return calls === 1
      ? new Response(`<a href="${report('august')}">Report</a>`)
      : new Response('private-token unavailable', { status: 503 });
  });
  await assert.rejects(fetchBofaConsumerCheckpoint(), /bofa:consumer-checkpoint-report failed: HTTP 503/u);
  assert.equal(calls, 4); // One successful landing request + three report attempts.
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /"stage":"report_fetch"/u);
  assert.match(warnings[0], /"httpStatus":503/u);
  assert.doesNotMatch(warnings[0], /private-token|unavailable/u);
});

test('reviewed August HTML shorthand preserves per-household ratios and report month', () => {
  const value = parse(`${total} ${exGas}`);
  assert.equal(value.bofaCardSpendingYoY, 0.05);
  assert.equal(value.bofaCardSpendingPriorYoY, 0.063);
  assert.equal(value.bofaCardSpendingExGasYoY, 0.043);
  assert.equal(value.bofaReportDate, '2026-08-01T00:00:00.000Z');
  assert.equal(value.bofaReportUrl, report('august'));
  assert.equal(value.bofaPdfUrl, pdf('august'));
  assert.equal(value.bofaStatus, 'live');
  assert.match(value.bofaSummary, /人工核对/u);
  // Source-review profile is semantic only; observations are parsed, not pinned.
  assert.equal(parse(total.replace('5.0%', '4.9%')).bofaCardSpendingYoY, 0.049);
});

test('old explicit per-household wording and Excluding gasoline remain supported', () => {
  const text = 'Total credit and debit card spending per household rose 4.8% YoY in April, from 4.3% in March. Excluding gasoline, spending rose 4.0% YoY.';
  const options = { reportUrl: report('may'), pdfUrl: pdf('may'), nowMs: Date.parse('2026-05-20T00:00:00Z') };
  const value = parse(text, options);
  assert.equal(value.bofaCardSpendingYoY, 0.048);
  assert.equal(value.bofaCardSpendingPriorYoY, 0.043);
  assert.equal(value.bofaCardSpendingExGasYoY, 0.04);
  assert.equal(parse(text, { ...options, pdfUrl: null }).bofaPdfUrl, null);
});

test('unknown shorthand requires semantic review even when a matching official PDF exists', () => {
  assert.throws(() => parse(total.replace('July', 'August').replace('June', 'July'), {
    reportUrl: report('september'), pdfUrl: pdf('september'), nowMs
  }), /unreviewed shorthand/u);
  assert.throws(() => parse(total, { ...august, pdfUrl: null }), /unreviewed shorthand/u);
  assert.throws(() => parse(exGas, { reportUrl: report('september'), pdfUrl: pdf('september'), nowMs }), /per-household basis/u);
});

test('report URL and PDF domain, month and identity are strictly bound', () => {
  for (const options of [
    { ...august, reportUrl: report('august').replace(origin, 'https://example.com') },
    { ...august, reportUrl: report('august').replace('https:', 'http:') },
    { ...august, reportUrl: `${report('august')}?source=other` },
    { ...august, reportUrl: `${report('august')}#old-report` },
    { ...august, reportUrl: report('smarch') },
    { ...august, reportUrl: report('august').replace(origin, 'https://attacker@institute.bankofamerica.com') },
    { ...august, pdfUrl: pdf('august').replace(origin, 'https://example.com') },
    { ...august, pdfUrl: pdf('july') },
    { ...august, pdfUrl: `${pdf('august')}?download=1` },
    { ...august, pdfUrl: '' }
  ]) assert.throws(() => parse(explicit, options));
});

test('aggregate or non-household descriptions cannot be relabeled as per-household', () => {
  for (const text of [
    `${total} This is not per household. ${exGas}`,
    `${total} Overall total card spending includes corporate cards. ${exGas}`,
    `Aggregate card spending rose 5.0% YoY. ${exGas}`,
    `${total} The metric is not on a per-household basis. ${exGas}`
  ]) assert.throws(() => parse(text), /aggregate or explicitly non-household/u);
});

test('YoY parser does not substitute MoM, a prior ex-gas figure or unrelated percentages', () => {
  const value = parse(`Seasonally-adjusted spending fell 0.2% MoM. ${total} ${exGas.replace(/\.$/u, ', down from 5.6% in June.')} Promotions grew 12.0%.`);
  assert.equal(value.bofaCardSpendingYoY, 0.05);
  assert.equal(value.bofaCardSpendingPriorYoY, 0.063);
  assert.equal(value.bofaCardSpendingExGasYoY, 0.043);
  assert.throws(() => parse('Total card spending growth eased to 5.0% MoM. Spending ex-gas rose 4.3% MoM.'));
  const noPrior = parse('Total card spending growth eased to 5.0% YoY. Excluding gasoline, spending rose 4.3% YoY from 5.6% in June.');
  assert.equal(noPrior.bofaCardSpendingPriorYoY, null);
  assert.equal(noPrior.bofaCardSpendingExGasYoY, 0.043);
});

test('partial metrics are null instead of being stitched to another report or cache', () => {
  const onlyExGas = parse(exGas);
  assert.equal(onlyExGas.bofaCardSpendingYoY, null);
  assert.equal(onlyExGas.bofaCardSpendingPriorYoY, null);
  assert.equal(onlyExGas.bofaCardSpendingExGasYoY, 0.043);
  const onlyCurrent = parse('Total card spending growth eased to 5.0% YoY. An unrelated sentence refers to growth from 6.3%.');
  assert.equal(onlyCurrent.bofaCardSpendingPriorYoY, null);
  assert.equal(onlyCurrent.bofaCardSpendingExGasYoY, null);
  const explicitExGas = parse('Excluding gasoline, card spending per household rose 4.3% YoY.', {
    reportUrl: report('september'), pdfUrl: null, nowMs
  });
  assert.equal(explicitExGas.bofaCardSpendingYoY, null);
  assert.equal(explicitExGas.bofaCardSpendingExGasYoY, 0.043);
});

test('conflicting values, wrong observation months, missing text and non-finite numbers are rejected', () => {
  for (const text of [
    `${total} ${total.replace('5.0%', '4.9%')}`,
    `${exGas} ${exGas.replace('4.3%', '4.1%')}`,
    total.replace('in July', 'in May'), total.replace('in June', 'in May'),
    total.replace('in July', 'in Smarch'),
    total.replace('5.0', '9'.repeat(400)), '', 'Consumer spending report', null
  ]) assert.throws(() => parse(text));
  assert.throws(() => parse(exGas.replace('4.3', '1,000.0')));
  assert.throws(() => parse(exGas.replace('4.3', '.5')));
});

test('explicit observation years bind to the report and January supports the previous calendar year', () => {
  assert.equal(parse(total.replace('July', 'July 2026').replace('June', 'June 2026')).bofaCardSpendingPriorYoY, 0.063);
  assert.equal(parse(exGas.replace('YoY.', 'YoY in July 2026.')).bofaCardSpendingExGasYoY, 0.043);
  for (const text of [
    total.replace('July', 'July 2025'), total.replace('June', 'June 2025'),
    total.replace('July', 'July, 2025'), total.replace('June', 'June 2027'),
    exGas.replace('YoY.', 'YoY in July 2025.'), total.replace('July', 'July 20250')
  ]) assert.throws(() => parse(text), /year does not match/u);
  const january = { reportUrl: report('january', 2027), pdfUrl: pdf('january', 2027), nowMs: Date.parse('2027-01-15T00:00:00Z') };
  const yearBoundary = explicit.replace('July', 'December 2026').replace('June', 'November 2026');
  assert.equal(parse(yearBoundary, january).bofaCardSpendingPriorYoY, 0.063);
  assert.throws(() => parse(yearBoundary.replace('December 2026', 'December 2027'), january), /year does not match/u);
  assert.throws(() => parse(yearBoundary.replace('November 2026', 'November 2025'), january), /year does not match/u);
});

test('fresh parsing enforces non-future report month and inclusive 62-day freshness', () => {
  const start = Date.parse('2026-08-01T00:00:00Z');
  assert.doesNotThrow(() => parse(total, { ...august, nowMs: start + 62 * 86400000 }));
  assert.throws(() => parse(total, { ...august, nowMs: start + 62 * 86400000 + 1 }), /stale or future/u);
  assert.throws(() => parse(total, { ...august, nowMs: start - 1 }), /stale or future/u);
  assert.throws(() => parse(total, { ...august, nowMs: NaN }), /invalid observation clock/u);
});

test('landing discovery sorts official report anchors and ignores future or non-report links', () => {
  const html = `<a href="/economic-insights/consumer-checkpoint-may-2026.html">Old</a>
    <a href="${report('october')}">Future</a><a href="${report('august')}">Newest eligible</a>
    <a href="${report('july')}">Older</a><a href="https://example.com/economic-insights/consumer-checkpoint-september-2026.html">Foreign</a>`;
  assert.equal(selectLatestBofaCheckpointUrl(html, nowMs), report('august'));
  assert.equal(selectLatestBofaCheckpointUrl(`<a href="${report('september')}">September</a>${html}`, nowMs), report('september'));
  assert.equal(selectLatestBofaCheckpointUrl(`<script><a href="${report('september')}">Not an anchor</a></script><!-- <a href="${report('september')}">comment</a> -->${html}`, nowMs), report('august'));
});

test('landing discovery rejects stale-only, invalid, absent and future-only report collections', () => {
  for (const html of ['', `<a href="${report('may')}">stale</a>`, `<a href="${report('october')}">future</a>`,
    `<a href="${report('smarch')}">invalid month</a>`, `<a href="${pdf('august')}">not HTML</a>`,
    `<a href="https://example.com/economic-insights/consumer-checkpoint-august-2026.html">foreign</a>`]) {
    assert.throws(() => selectLatestBofaCheckpointUrl(html, nowMs));
  }
  assert.throws(() => selectLatestBofaCheckpointUrl('', NaN));
});
