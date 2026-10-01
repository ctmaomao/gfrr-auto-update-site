#!/usr/bin/env node
// Manual acceptance read-back for the EdgeOne release-channel CSP header.
//
// Deliberately NOT wired into CI: it talks to a live deployment when given a URL, and this working
// range keeps live checks manual. Two input modes:
//
//   --file <path>   local HTTP fixture: a JSON object with a `headers` array of [name, value]
//                   pairs (duplicates preserved), or `--stdin` for the same on stdin
//   --url <url>     live read-back
//
// It preserves EVERY raw CSP header value. Duplicate same-named headers are a valid observation and
// are reported as such, never merged or dropped; a response carrying the enforced
// `Content-Security-Policy` header is always an unexpected finding for a report-only rollout.
import { readFileSync } from 'node:fs';
import { request } from 'node:https';
import { request as httpRequest } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPORT_ONLY_HEADER, parsePolicy } from '../scripts/lib/edgeone-csp-policy.mjs';

const ENFORCED_HEADER = 'Content-Security-Policy';

/** Lower-cased name -> array of raw values, duplicates preserved in arrival order. */
export function normalizeHeaderPairs(pairs) {
  const headers = new Map();
  for (const [name, value] of pairs) {
    const key = String(name).toLowerCase();
    if (!headers.has(key)) headers.set(key, []);
    headers.get(key).push(String(value));
  }
  return headers;
}

function pairsFromHeadersObject(headers) {
  const pairs = [];
  for (const [name, value] of Object.entries(headers)) {
    if (Array.isArray(value)) for (const item of value) pairs.push([name, item]);
    else if (value !== undefined) pairs.push([name, value]);
  }
  return pairs;
}

export function evaluateHeaders(pairs, { expectedState = 'enabled', expectedPolicy = null } = {}) {
  const headers = normalizeHeaderPairs(pairs);
  const reportOnly = headers.get(REPORT_ONLY_HEADER.toLowerCase()) ?? [];
  const enforced = headers.get(ENFORCED_HEADER.toLowerCase()) ?? [];
  const findings = [];
  const notes = [];

  if (enforced.length) findings.push(`unexpected enforced ${ENFORCED_HEADER} header (${enforced.length} value(s))`);

  if (expectedState === 'disabled') {
    if (reportOnly.length) findings.push(`expected no ${REPORT_ONLY_HEADER} header, found ${reportOnly.length}`);
    if (!findings.length) notes.push('header absent as required by the disabled configuration');
    return { ok: findings.length === 0, state: 'disabled', reportOnly, enforced, findings, notes };
  }

  if (!reportOnly.length) findings.push(`missing ${REPORT_ONLY_HEADER} header`);
  if (reportOnly.length > 1) notes.push(`response carries ${reportOnly.length} same-named ${REPORT_ONLY_HEADER} headers (kept and reported, not merged)`);
  for (const [index, value] of reportOnly.entries()) {
    if (expectedPolicy && value !== expectedPolicy) findings.push(`value #${index + 1} differs from the generated policy`);
    try {
      const directives = parsePolicy(value);
      if (!directives.has('default-src')) findings.push(`value #${index + 1} is not a CSP policy string (no default-src)`);
    } catch (error) {
      findings.push(`value #${index + 1} is not parseable: ${error.message}`);
    }
  }
  if (!findings.length) notes.push('report-only header present with the expected value');
  return {
    ok: findings.length === 0,
    state: 'enabled',
    reportOnly,
    enforced,
    findings,
    notes,
    sameNameCount: reportOnly.length,
  };
}

function readPairsFromFile(path) {
  const document = JSON.parse(readFileSync(resolve(path), 'utf8'));
  if (Array.isArray(document.headers)) {
    return document.headers.map((entry) => (Array.isArray(entry) ? entry : [entry.key ?? entry.name, entry.value]));
  }
  return pairsFromHeadersObject(document);
}

function readPairsFromStdin() {
  const raw = readFileSync(0, 'utf8');
  const document = JSON.parse(raw);
  if (Array.isArray(document.headers)) {
    return document.headers.map((entry) => (Array.isArray(entry) ? entry : [entry.key ?? entry.name, entry.value]));
  }
  return pairsFromHeadersObject(document);
}

export function fetchHeaderPairs(url) {
  return new Promise((resolvePromise, rejectPromise) => {
    const client = url.startsWith('https:') ? request : httpRequest;
    const req = client(url, { method: 'GET', headers: { accept: '*/*' } }, (res) => {
      res.resume();
      res.on('end', () => resolvePromise({ status: res.statusCode, pairs: pairsFromHeadersObject(res.headers) }));
      res.on('error', rejectPromise);
    });
    req.on('error', rejectPromise);
    req.setTimeout(30_000, () => req.destroy(new Error('read-back timed out')));
    req.end();
  });
}

function printResult(result, label) {
  console.log(`=== ${label}`);
  console.log(`    state expected : ${result.state}`);
  console.log(`    verdict        : ${result.ok ? 'PASS' : 'FAIL'}`);
  console.log(`    ${REPORT_ONLY_HEADER}: ${result.reportOnly.length} raw value(s)`);
  for (const [index, value] of result.reportOnly.entries()) console.log(`      [${index + 1}] ${value}`);
  console.log(`    ${ENFORCED_HEADER}: ${result.enforced.length} raw value(s)`);
  for (const [index, value] of result.enforced.entries()) console.log(`      [${index + 1}] ${value}`);
  for (const note of result.notes) console.log(`    note: ${note}`);
  for (const finding of result.findings) console.log(`    FINDING: ${finding}`);
}

function main() {
  const argv = process.argv.slice(2);
  const options = { expectedState: 'enabled' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--url') options.url = argv[++index];
    else if (arg === '--file') options.file = argv[++index];
    else if (arg === '--stdin') options.stdin = true;
    else if (arg === '--expect') options.expectedState = argv[++index];
    else if (arg === '--expect-policy') options.expectedPolicy = argv[++index];
    else if (arg === '--json') options.json = true;
    else {
      console.error(`unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  if (!['enabled', 'disabled'].includes(options.expectedState)) {
    console.error('--expect must be "enabled" or "disabled"');
    process.exit(2);
  }
  if (!options.url && !options.file && !options.stdin) {
    console.error('Provide --url <url>, --file <path>, or --stdin.');
    process.exit(2);
  }

  (async () => {
    try {
      if (options.url) {
        const { status, pairs } = await fetchHeaderPairs(options.url);
        console.log(`fetched ${options.url} (status ${status})`);
        const result = evaluateHeaders(pairs, options);
        if (options.json) console.log(JSON.stringify({ url: options.url, status, ...result }, null, 2));
        else printResult(result, options.url);
        process.exit(result.ok ? 0 : 1);
      }
      const pairs = options.stdin ? readPairsFromStdin() : readPairsFromFile(options.file);
      const result = evaluateHeaders(pairs, options);
      if (options.json) console.log(JSON.stringify(result, null, 2));
      else printResult(result, options.file ?? 'stdin');
      process.exit(result.ok ? 0 : 1);
    } catch (error) {
      console.error(`read-back failed: ${error.message}`);
      process.exit(1);
    }
  })();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
