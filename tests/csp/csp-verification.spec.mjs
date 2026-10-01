import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { computeArtifactFingerprint } from './artifact.mjs';
import { buildCandidate } from './policy.mjs';
import {
  openCollectingPage,
  readBodyDigest,
  readErrors,
  readInlineScriptHashFromDocument,
  readViolations,
  splitNetworkFindings,
  summarizeHeaders,
  waitForStableBody,
  waitForViolation,
} from './helper.mjs';

// Modes are driven by the runner (`tests/csp/index.mjs`), which builds the artifact and sets
// GF_CSP_MODE / GF_CSP_POLICY before invoking Playwright. Nothing here is wired into `check:all`.
//
// The candidate policy string is identical in report-only and enforce; only the response header
// name differs. What each mode can and cannot prove:
//   report-only — the header is delivered, the browser treats it as report disposition, and the
//                 violation collector works. It CANNOT prove the page survives the policy,
//                 because nothing is blocked.
//   enforce     — the same policy actually blocks, so page function under the real policy is
//                 only evidenced here.
const MODE = process.env.GF_CSP_MODE || 'baseline';
const POLICY = process.env.GF_CSP_POLICY || '';
const IS_BASELINE = MODE === 'baseline';
const IS_ENFORCE = MODE === 'enforce';

const ARTIFACT_ROOT = process.env.GF_ARTIFACT_ROOT || resolve(import.meta.dirname, '..', '..', '_site');
const FIXTURE_ROOT = process.env.GF_FIXTURE_ROOT || resolve(import.meta.dirname, 'fixtures');
const FINDINGS_DIR = process.env.GF_FINDINGS_DIR || resolve(import.meta.dirname, '..', '..', 'test-results', 'csp-findings');

const candidate = buildCandidate({ artifactRoot: ARTIFACT_ROOT, fixtureRoot: FIXTURE_ROOT });
const readerPages = [
  { name: 'index', path: '/index.html' },
  { name: 'bubble-watch', path: '/bubble-watch.html' },
];
const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

// Readiness signal per page: `index.html` publishes `gfrr-data-ready` on `<body>` (the same
// signal `tests/e2e/*.spec.mjs` waits for), while `bubble-watch.html` has no state class and
// renders its data-bound content as `ISSUE NO. nnn` instead. Waiting for the real signal is what
// makes this a functional check.
const READINESS = {
  index: () => new Promise((done) => {
    const body = document.body;
    if (body.classList.contains('gfrr-data-ready')) { done(true); return; }
    const observer = new MutationObserver(() => {
      if (body.classList.contains('gfrr-data-ready')) { observer.disconnect(); done(true); }
    });
    observer.observe(body, { attributes: true, attributeFilter: ['class'] });
    setTimeout(() => { observer.disconnect(); done(false); }, 10_000);
  }),
  'bubble-watch': () => new Promise((done) => {
    const deadline = Date.now() + 10_000;
    const check = () => {
      if (/ISSUE NO\.\s*\d{3}/u.test(document.body.innerText)) { done(true); return; }
      if (Date.now() > deadline) { done(false); return; }
      setTimeout(check, 100);
    };
    check();
  }),
};

function recordFindings(name, payload) {
  mkdirSync(FINDINGS_DIR, { recursive: true });
  writeFileSync(resolve(FINDINGS_DIR, `${MODE || 'baseline'}-${name}.json`), `${JSON.stringify(payload, null, 2)}\n`);
}

// Cross-mode comparison input. All three runs execute sequentially in separate Playwright
// processes, so the digest of each rendered body is accumulated here and compared by every run
// against the modes already recorded under the same generation. A generation is bound to BOTH
// fingerprints: the candidate policy string (which covers the inline-block hashes) and the
// content of every served artifact file (which the policy string does not cover at all — an
// external script, stylesheet, entry HTML or JSON change leaves the policy byte-identical).
//
// The fingerprints are derived here rather than read from `GF_CSP_POLICY`: the baseline mode
// sends no policy, so hashing that variable would file baseline digests under the empty-string
// digest and every later mode would overwrite them as a different generation.
const DIGEST_LEDGER = resolve(FINDINGS_DIR, 'body-digests.json');
const POLICY_FINGERPRINT = createHash('sha256').update(candidate.policy).digest('hex').slice(0, 16);
const ARTIFACT_FINGERPRINT = computeArtifactFingerprint(ARTIFACT_ROOT).fingerprint;

function updateDigestLedger(entries) {
  let ledger = {};
  try {
    ledger = JSON.parse(readFileSync(DIGEST_LEDGER, 'utf8'));
  } catch {
    ledger = {};
  }
  for (const entry of entries) {
    const existing = ledger[entry.key];
    const sameGeneration = existing?.__artifactFingerprint === ARTIFACT_FINGERPRINT
      && existing?.__policyFingerprint === POLICY_FINGERPRINT;
    ledger[entry.key] = sameGeneration
      ? { ...existing, [MODE || 'baseline']: entry.sha256 }
      : { __artifactFingerprint: ARTIFACT_FINGERPRINT, __policyFingerprint: POLICY_FINGERPRINT, [MODE || 'baseline']: entry.sha256 };
  }
  mkdirSync(FINDINGS_DIR, { recursive: true });
  writeFileSync(DIGEST_LEDGER, `${JSON.stringify(ledger, null, 2)}\n`);
  return ledger;
}

test.describe(`CSP verification · mode=${MODE}`, () => {
  test('server sends the expected CSP response headers', async ({ request }) => {
    const headers = (await request.get('/')).headers();
    if (IS_BASELINE) {
      expect(headers['content-security-policy']).toBeUndefined();
      expect(headers['content-security-policy-report-only']).toBeUndefined();
      return;
    }
    // Same policy string, different header name — assert both sides of that.
    if (IS_ENFORCE) {
      expect(headers['content-security-policy']).toBe(POLICY);
      expect(headers['content-security-policy-report-only']).toBeUndefined();
      return;
    }
    expect(headers['content-security-policy-report-only']).toBe(POLICY);
    expect(headers['content-security-policy']).toBeUndefined();
  });

  // Confirms the hash formula itself: the hash derived from the artifact bytes must equal the
  // hash the browser computes over the element's parsed text content.
  test('derived inline-script hash matches the browser digest', async ({ browser }) => {
    test.skip(!IS_BASELINE, 'hash formula is mode-independent; verified once without a policy');
    const context = await browser.newContext();
    const { page } = await openCollectingPage(context, '/bubble-watch.html');
    const browserHash = await readInlineScriptHashFromDocument(page, 'script:not([src])');
    expect(browserHash).toBeTruthy();
    expect(candidate.scriptHashes).toContain(browserHash);
    recordFindings('hash-formula', { mode: MODE, browserHash, inCandidate: candidate.scriptHashes.includes(browserHash) });
    await context.close();
  });

  // A hashed inline script and a hashed inline style block must be allowed in BOTH modes, which
  // is what makes the derived digests trustworthy: a wrong digest would violate here.
  test('hashed inline script and style are allowed', async ({ browser }) => {
    test.skip(IS_BASELINE, 'needs a policy to be meaningful');
    const context = await browser.newContext();
    const { page } = await openCollectingPage(context, '/__fixtures/allowed-inline.html');
    const ran = await page.evaluate(() => window.__cspAllowedInlineRan === true);
    const text = (await page.textContent('#marker-allowed')).trim();
    const styleApplied = await page.evaluate(() => {
      const node = document.getElementById('marker-allowed-style');
      return node ? getComputedStyle(node).display === 'none' : false;
    });
    const violations = await readViolations(page);
    recordFindings('control-allowed-inline', { mode: MODE, ran, text, styleApplied, violations });
    expect(ran).toBe(true);
    expect(text).toBe('allowed-inline-ran');
    expect(styleApplied).toBe(true);
    expect(violations).toEqual([]);
    await context.close();
  });

  // Unhashed inline script: reported in report-only (and still executed), blocked in enforce.
  test('unhashed inline script is reported and its execution outcome follows the mode', async ({ browser }) => {
    test.skip(IS_BASELINE, 'needs a policy to violate');
    const context = await browser.newContext();
    const { page, response } = await openCollectingPage(context, '/__fixtures/throw-inline.html');
    expect(summarizeHeaders(response).reportOnly ?? summarizeHeaders(response).enforced).toBeTruthy();
    const wait = await waitForViolation(page, (violation) => (violation.effectiveDirective ?? '').startsWith('script-src-elem'));
    const ran = await page.evaluate(() => window.__cspUnhashedInlineRan === true);
    const text = (await page.textContent('#marker-inline-script')).trim();
    recordFindings('control-unhashed-inline', { mode: MODE, wait, ran, text });
    expect(wait.found).toBe(true);
    expect(wait.violation.disposition).toBe(IS_ENFORCE ? 'enforce' : 'report');
    expect(ran).toBe(!IS_ENFORCE);
    expect(text).toBe(IS_ENFORCE ? 'waiting' : 'unhashed-inline-ran');
    await context.close();
  });

  // Unhashed style block: reported in report-only (and still applied), blocked in enforce.
  test('unhashed inline style block is reported and its application follows the mode', async ({ browser }) => {
    test.skip(IS_BASELINE, 'needs a policy to violate');
    const context = await browser.newContext();
    const { page, response } = await openCollectingPage(context, '/__fixtures/throw-style.html');
    expect(summarizeHeaders(response).reportOnly ?? summarizeHeaders(response).enforced).toBeTruthy();
    const wait = await waitForViolation(page, (violation) => (violation.effectiveDirective ?? '').startsWith('style-src-elem'));
    const hidden = await page.evaluate(() => getComputedStyle(document.getElementById('marker-style-block')).display === 'none');
    recordFindings('control-unhashed-style', { mode: MODE, wait, hidden });
    expect(wait.found).toBe(true);
    expect(wait.violation.disposition).toBe(IS_ENFORCE ? 'enforce' : 'report');
    expect(hidden).toBe(!IS_ENFORCE);
    await context.close();
  });

  // Inline event handler under `script-src-attr 'none'`. Both modes carry the same policy, so the
  // handler must be reported in both; only the execution outcome differs. The violation event is
  // awaited with a bounded window rather than read immediately, so a timing artefact cannot be
  // mistaken for "no violation was raised".
  test('inline event handler is reported in both modes, execution blocked only when enforced', async ({ browser }) => {
    test.skip(IS_BASELINE, 'needs a policy to violate');
    const context = await browser.newContext();
    const { page, response, collectors } = await openCollectingPage(context, '/__fixtures/throw-attr.html');
    expect(summarizeHeaders(response).reportOnly ?? summarizeHeaders(response).enforced).toBeTruthy();
    await page.click('#marker-attr');
    const wait = await waitForViolation(page, (violation) => (violation.effectiveDirective ?? '').startsWith('script-src-attr'));
    const ran = await page.evaluate(() => window.__cspAttrHandlerRan === true);
    const text = (await page.textContent('#marker-attr')).trim();
    const cspConsole = collectors.consoleMessages.filter((message) => /Content Security Policy/u.test(message.text));
    recordFindings('control-inline-handler', { mode: MODE, wait, ran, text, cspConsole });
    expect(wait.found).toBe(true);
    expect(wait.violation.disposition).toBe(IS_ENFORCE ? 'enforce' : 'report');
    expect(ran).toBe(!IS_ENFORCE);
    expect(text).toBe(IS_ENFORCE ? 'click' : 'attr-ran');
    await context.close();
  });

  for (const target of readerPages) {
    test(`${target.name} loads under the candidate policy`, async ({ browser }) => {
      const results = [];
      for (const viewport of viewports) {
        const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
        const { page, response, collectors } = await openCollectingPage(context, target.path);
        const becomeReady = await page.evaluate(READINESS[target.name]).catch(() => false);
        // Readiness is not the same as settled: some renderers fill secondary values a tick later.
        const stabilize = await waitForStableBody(page);
        const digest = await readBodyDigest(page);
        const violations = await readViolations(page);
        const pageErrors = await readErrors(page);
        const network = splitNetworkFindings(collectors);
        const horizontalOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
        );
        results.push({
          target: target.name,
          viewport: viewport.name,
          headers: summarizeHeaders(response),
          becomeReady,
          stabilize,
          bodyLength: digest.length,
          bodySha256: digest.sha256,
          bodyPreview: digest.text.slice(0, 400),
          violations,
          pageErrors,
          network,
          horizontalOverflow,
        });
        await context.close();
      }
      recordFindings(target.name, { mode: MODE, policy: POLICY, results });

      const ledgerEntries = [];
      for (const finding of results) {
        const where = `${target.name}/${finding.viewport}`;
        if (!IS_BASELINE) expect(finding.headers.reportOnly ?? finding.headers.enforced).toBeTruthy();
        // Every recorded risk signal is asserted, not merely collected.
        expect.soft(finding.becomeReady, `${where}: page never reached its ready state`).toBe(true);
        expect.soft(finding.stabilize, `${where}: body text never stabilised`).toBe(true);
        expect.soft(finding.violations, `${where}: unexpected CSP violations`).toEqual([]);
        expect.soft(finding.pageErrors, `${where}: page errors`).toEqual([]);
        expect.soft(finding.horizontalOverflow, `${where}: horizontal overflow`).toBe(false);
        expect.soft(finding.network.otherRequestFailures, `${where}: non-font request failures`).toEqual([]);
        expect.soft(finding.network.otherHttpErrors, `${where}: non-font HTTP errors`).toEqual([]);
        // The network collector records only FAILED requests, so an empty font bucket means
        // neither "loaded" nor "attempted". Font compatibility therefore stays unverified: what
        // is missing is evidence of a successful font load and actual use, not proof of absence.
        expect.soft(finding.bodyLength, `${where}: body text suspiciously short`).toBeGreaterThan(150);
        ledgerEntries.push({ key: where, sha256: finding.bodySha256, length: finding.bodyLength });
      }
      const ledger = updateDigestLedger(ledgerEntries);
      // Cross-mode equality: the candidate policy must not change what the page renders.
      // Report-Only cannot block anything, so a difference there points at the harness rather
      // than the policy; a difference under enforce is exactly what this check exists to catch.
      for (const entry of ledgerEntries) {
        const recorded = ledger[entry.key] ?? {};
        const sameGeneration = recorded.__artifactFingerprint === ARTIFACT_FINGERPRINT
          && recorded.__policyFingerprint === POLICY_FINGERPRINT;
        if (!sameGeneration) continue;
        for (const mode of ['baseline', 'report-only', 'enforce']) {
          const digest = recorded[mode];
          if (typeof digest !== 'string') continue;
          expect.soft(digest, `${entry.key}: ${MODE} rendered differently from ${mode}`).toBe(entry.sha256);
        }
      }
      expect(results.length).toBe(viewports.length);
    });
  }
});
