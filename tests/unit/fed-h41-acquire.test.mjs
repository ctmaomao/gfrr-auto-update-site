import assert from 'node:assert/strict';
import test from 'node:test';
import { acquireH41 } from '../../scripts/daily/h41-acquire.mjs';
import { fixture } from '../fixtures/h41-release-fixture.mjs';

const origin = 'https://www.federalreserve.gov';
const nov = '/newsevents/2026-november.htm', dec = '/newsevents/2026-december.htm';
const current = '/releases/h41/20261224/', reference = '/releases/h41/20261127/';
// Synthetic calendar markup; offline qualification separately used the official full snapshots.
function calendar(title, path, days) {
  return `<!doctype html><html><head>
  <title>Federal Reserve Board - Calendar: ${title}</title>
  <meta property="og:url" content="${origin}${path}" />
  </head><body><div id="article" class='cal-nojs clearfix'>
  <div class="col-md-8">
    <div class="row-title"><h4 class="text-center">${title}</h4></div>
    <div class="row-header"><div class="prev"></div><div class="next"></div></div>
    <div class="row cal-nojs__rowTitle"><h4 class="col-md-12">Statistical Releases</h4></div>
    <div class="row"><div class="col-xs-2"><h6>Time:</h6></div><div class="col-xs-3"><h6>Release Date(s):</h6></div></div>
    <div class="row"><div class="panel"><div class="panel-body"><div class="row">
      <div class="col-xs-2"><p>4:30 p.m.</p></div>
      <div class="col-xs-7"><p>H.4.1 - Factors Affecting Reserve Balances</p><p></p></div>
      <div class="col-xs-3"><p>${days}</p></div>
    </div></div></div></div>
    <div class="row-footer"><div class="prev"></div><div class="next"></div></div>
  </div><div class="col-md-4"></div></div>
  <div class="row"><div class="lastUpdate" id="lastUpdate">Last Update</div></div>
  </body></html>`;
}
const novHTML = calendar('November 2026', nov, '5, 12, 19, 27');
const decHTML = calendar('December 2026', dec, '3, 10, 17, 24, 31');
const currentHTML = fixture('December 24, 2026', 'Dec 23, 2026');
const referenceHTML = fixture('November 27, 2026', 'Nov 25, 2026').replace('6,741,452', '6,700,000');
const before = '/releases/h41/20261217/';
const published = new Map([[nov, novHTML], [dec, decHTML], [current, currentHTML],
  [reference, referenceHTML], [before, fixture('December 17, 2026', 'Dec 16, 2026')]]);
const failed = { failed: true };
const defaultPrimary = { WALCL: failed, WRESBAL: failed };
const retrieved = Date.parse('2026-12-24T21:31:00.000Z');
const defaultNow = new Date('2026-12-24T21:30:00.000Z');

function response(url, html, options = {}) {
  const response = new Response(html, { status: options.status ?? 200, headers: {
    'content-type':'text/html; charset=utf-8', ...options.headers,
  } });
  Object.defineProperties(response, {
    url: {value: options.url ?? url},
    redirected: {value: options.redirected ?? false},
  });
  return response;
}

function reader(custom = {}) {
  const requests = [];
  const fetchImpl = async (url, options) => {
    const route = url.replace(origin, '');
    requests.push(route);
    assert.equal(options.redirect, 'error');
    assert.equal(options.method, 'GET');
    assert.equal(url, origin + route);
    if (custom[route]) return custom[route](url, options);
    if (!published.has(route)) throw Error('unexpected fetch');
    return response(url, published.get(route));
  };
  return { requests, go: (options = {}) => acquireH41({
    now: defaultNow, primary: defaultPrimary, clock: () => retrieved, fetchImpl, ...options,
  }) };
}

test('healthy or maximum-date usable incumbents require no GET', async () => {
  const { requests, go } = reader();
  assert.deepEqual(await go({ primary: { WRESBAL: {failed:false}, WALCL: {failed:false, usableIncumbentDate:'ignored'} } }), {rows:{},diagnostics:{}});
  assert.deepEqual(await go({ primary: { WALCL: {failed:true, usableIncumbentDate:'2026-12-23'} } }), {rows:{},diagnostics:{WALCL:'usable-incumbent'}});
  assert.deepEqual(requests, []);
});

test('both failures share one current body; both retain separately qualified exact comparison; WRESBAL uses average', async () => {
  const { requests, go } = reader();
  const { rows, diagnostics } = await go();
  assert.deepEqual(diagnostics, {});
  assert.deepEqual(requests, [dec, current, nov, reference]);
  assert.equal(rows.WRESBAL.value, 2979656);
  assert.equal(rows.WRESBAL.baseline.observationDate, '2026-11-25');
  assert.equal(rows.WALCL.value, 6741452);
  assert.equal(rows.WALCL.baseline.value, 6700000);
  assert.equal(rows.WALCL.baseline.observationDate, '2026-11-25');
  assert.equal(rows.WALCL.baseline.receipt.releaseDate, '2026-11-27');
  assert.equal(rows.WALCL.receipt.scheduledReleaseAt, '2026-12-24T21:30:00.000Z');
  assert.equal(rows.WALCL.receipt.retrievedAt, '2026-12-24T21:31:00.000Z');
  assert.match(rows.WALCL.receipt.bodySha256, /^[a-f0-9]{64}$/);
});

test('only failed WRESBAL requests only its exact comparison and ignores healthy WALCL', async () => {
  const { requests, go } = reader();
  const { rows } = await go({primary:{ WRESBAL:failed, WALCL:{failed:false,usableIncumbentDate:'nonsense'} }});
  assert.deepEqual(Object.keys(rows), ['WRESBAL']);
  assert.deepEqual(requests, [dec, current, nov, reference]);
});

test('pre-cutoff selection uses prior release and does not adopt an equal incumbent', async () => {
  const now = new Date('2026-12-24T21:29:59Z');
  const { requests, go } = reader();
  const { rows, diagnostics } = await go({ now, primary: { WRESBAL:failed, WALCL:{failed:true,usableIncumbentDate:'2026-12-16'} } });
  assert.deepEqual(requests, [dec, before, nov, '/releases/h41/20261119/']);
  assert.deepEqual(diagnostics, {WALCL:'usable-incumbent', WRESBAL:'reference-release-unqualified'});
  assert.deepEqual(Object.keys(rows), ['WRESBAL']);
  assert.equal(rows.WRESBAL.observationDate, '2026-12-16');
});

test('only-WALCL failure does not emit WRESBAL', async () => {
  const { requests, go } = reader();
  const { rows, diagnostics } = await go({ primary: { WALCL:failed }});
  assert.deepEqual(requests, [dec, current, nov, reference]);
  assert.deepEqual(diagnostics, {});
  assert.deepEqual(Object.keys(rows), ['WALCL']);
});

test('reference calendar or receipt rejection preserves independently valid WRESBAL; never probes neighboring release', async () => {
  for (const [route, rejected, code, expected] of [
    [nov, (u) => response(u, 'broken'), 'reference-calendar-unqualified', [dec,current,nov]],
    [reference, (u) => response(u, currentHTML), 'reference-release-unqualified', [dec,current,nov,reference]],
    [reference, (u) => response(u, referenceHTML.replaceAll('Nov 25, 2026', 'Nov 18, 2026')), 'reference-release-unqualified', [dec,current,nov,reference]],
  ]) {
    const { requests, go } = reader({[route]:rejected});
    const { rows, diagnostics } = await go();
    assert.deepEqual(Object.keys(rows), ['WRESBAL']);
    assert.deepEqual(diagnostics, {WALCL:code,WRESBAL:code});
    assert.deepEqual(requests,expected);
  }
});

const transportCases = {
  '206': (u) => response(u, currentHTML,{status:206}),
  'redirect response': (u) => response(u, currentHTML,{status:302}),
  '200 redirected': (u) => response(u, currentHTML,{redirected:true}),
  'wrong final URL': (u) => response(u + '?different', currentHTML),
  'content range': (u) => response(u, currentHTML,{headers:{'content-range':'bytes 0-22/23'}}),
  'wrong content type': (u) => response(u, currentHTML,{headers:{'content-type':'text/csv'}}),
  'unsupported charset': (u) => response(u, currentHTML,{headers:{'content-type':'text/html; charset=ISO-8859-1'}}),
  'declared oversize': (u) => response(u, currentHTML,{headers:{'content-length':'1048577'}}),
  'declared mismatch': (u) => response(u, currentHTML,{headers:{'content-length':'1'}}),
  'streamed oversize': (u) => response(u, 'a'.repeat(1_048_577)),
  'bad UTF8': (u) => response(u, Buffer.concat([Buffer.from(currentHTML),Buffer.from([255])])),
  'truncated': (u) => response(u, currentHTML.replace('</body></html>', '')),
};
for (const [name, rejectCurrent] of Object.entries(transportCases)) {
  test(`rejects current transport: ${name}, one request and no reference`, async () => {
    const { requests, go } = reader({ [current]:rejectCurrent });
    assert.deepEqual(await go(), {rows:{},diagnostics:{ WALCL:'current-release-unqualified',WRESBAL:'current-release-unqualified' }});
    assert.deepEqual(requests, [dec,current]);
  });
}

test('absolute deadline covers a stalled body even when fetch does not heed signal', async () => {
  let signal;
  const { requests, go } = reader({[current]:(u, options) => {
    signal = options.signal;
    return response(u, new ReadableStream({ start(c) { c.enqueue(Buffer.from(currentHTML.slice(0,100))); } }));
  }});
  const { rows, diagnostics } = await go({timeoutMs:50});
  assert.deepEqual(rows,{});
  assert.equal(diagnostics.WRESBAL,'current-release-unqualified');
  assert.equal(signal.aborted,true);
  assert.deepEqual(requests,[dec,current]);
});

test('Wednesday asks for prior window and its own exact comparison, not a future month', async () => {
  const { requests, go } = reader();
  const { rows } = await go({now:new Date('2026-12-30T21:30:00Z'), primary:{WRESBAL:failed}});
  assert.equal(rows.WRESBAL.observationDate,'2026-12-23');
  assert.deepEqual(requests,[dec,current,nov,reference]);
});

test('both exact date windows straddle month ends: shared month fetched once, 3 calendars and 2 bodies total', async () => {
  const nov25 = '/newsevents/2025-november.htm', dec25 = '/newsevents/2025-december.htm', oct25 = '/newsevents/2025-october.htm';
  const release25 = '/releases/h41/20251128/', baseline25 = '/releases/h41/20251030/';
  const nov25HTML = calendar('November 2025', nov25, '6, 13, 20, 28');
  const dec25HTML = calendar('December 2025', dec25, '4, 11, 18, 29');
  const oct25HTML = calendar('October 2025', oct25, '2, 9, 16, 23, 30');
  const map = {
    [nov25]:nov25HTML,[dec25]:dec25HTML,[oct25]:oct25HTML,
    [release25]:fixture('November 28, 2025','Nov 26, 2025'),
    [baseline25]:fixture('October 30, 2025','Oct 29, 2025'),
  };
  const { requests, go } = reader(Object.fromEntries(Object.entries(map).map(([k,v])=>[k,(u)=>response(u,v)])));
  const {rows, diagnostics} = await go({now:new Date('2025-11-28T22:00:00Z')});
  assert.deepEqual(diagnostics,{});
  assert.equal(rows.WALCL.baseline.observationDate,'2025-10-29');
  assert.deepEqual(requests,[nov25,dec25,release25,oct25,baseline25]);
});

test('ambiguous calendar stops before any dated body; no neighboring probing', async () => {
  const {requests,go} = reader({[dec]:(u)=>response(u,decHTML.replace('3, 10, 17, 24, 31</p>', '3, 10, 17, 24, 25, 31</p>'))});
  assert.deepEqual(await go(), {rows:{},diagnostics:{ WALCL:'current-calendar-unqualified',WRESBAL:'current-calendar-unqualified' }});
  assert.deepEqual(requests,[dec]);
});

test('literal zero current reserve is a valid level, zero reserve baseline only suppresses that comparison', async () => {
  const zero = (page) => page.replace('2,979,656', '0');
  const { requests, go } = reader({
    [current]:(u)=>response(u,zero(currentHTML)),
    [reference]:(u)=>response(u,zero(referenceHTML)),
  });
  const { rows, diagnostics } = await go();
  assert.equal(rows.WRESBAL.value,0);
  assert.equal(rows.WRESBAL.baseline,undefined);
  assert.equal(rows.WALCL.baseline.value,6700000);
  assert.deepEqual(diagnostics,{WRESBAL:'reference-level-unqualified'});
  assert.deepEqual(requests,[dec,current,nov,reference]);
});

test('literal zero reserve current can compare against a positive exact reserve baseline', async () => {
  const { go } = reader({ [current]:(u)=>response(u,currentHTML.replace('2,979,656','0')) });
  const { rows, diagnostics } = await go({primary:{WRESBAL:failed}});
  assert.equal(rows.WRESBAL.value,0);
  assert.equal(rows.WRESBAL.baseline.value,2979656);
  assert.deepEqual(diagnostics,{});
});

test('blank, null-like, placeholders, padded zeros and total assets zero are invalid at extraction', async () => {
  for (const html of [
    ...['','null','-', '0,000'].map((raw) => currentHTML.replace('2,979,656', raw)),
    currentHTML.replace('6,741,452','0'),
  ]) {
    const { go, requests } = reader({[current]:(u)=>response(u,html)});
    const { rows, diagnostics } = await go({primary:{WRESBAL:failed}});
    assert.deepEqual(rows,{});
    assert.equal(diagnostics.WRESBAL,'current-release-unqualified');
    assert.deepEqual(requests,[dec,current]);
  }
});
