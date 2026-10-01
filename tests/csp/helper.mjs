// Shared helpers for the isolated CSP verification.
//
// The violation accessor is installed with `page.addInitScript`, i.e. before any navigation,
// so inline-block violations raised while the first document parses are captured. Network
// failures are kept in a separate channel from CSP violations: a font request that cannot be
// reached is an environment fact, not a policy finding, and the two must never be merged.
export const CSP_COLLECTOR_INIT = `
  window.__cspViolations = [];
  window.__cspErrors = [];
  document.addEventListener('securitypolicyviolation', (event) => {
    window.__cspViolations.push({
      disposition: event.disposition,
      violatedDirective: event.violatedDirective,
      effectiveDirective: event.effectiveDirective,
      blockedURI: event.blockedURI,
      sourceFile: event.sourceFile,
      lineNumber: event.lineNumber,
      statusCode: event.statusCode,
      at: Date.now(),
    });
  });
  window.addEventListener('error', (event) => {
    window.__cspErrors.push(String((event && event.message) || 'unknown error'));
  });
`;

export function createCollectors(page) {
  const requestFailures = [];
  const httpErrors = [];
  const consoleMessages = [];
  page.on('console', (message) => consoleMessages.push({ type: message.type(), text: message.text() }));
  page.on('requestfailed', (request) => {
    requestFailures.push({
      url: request.url(),
      resourceType: request.resourceType(),
      failure: request.failure()?.errorText ?? null,
    });
  });
  page.on('response', (response) => {
    if (response.status() >= 400) httpErrors.push({ url: response.url(), status: response.status() });
  });
  return { requestFailures, httpErrors, consoleMessages };
}

export async function openCollectingPage(context, url) {
  const page = await context.newPage();
  await page.addInitScript(CSP_COLLECTOR_INIT);
  const collectors = createCollectors(page);
  const response = await page.goto(url, { waitUntil: 'load' });
  return { page, response, collectors };
}

export function summarizeHeaders(response) {
  const headers = response ? response.headers() : {};
  return {
    status: response ? response.status() : null,
    reportOnly: headers['content-security-policy-report-only'] ?? null,
    enforced: headers['content-security-policy'] ?? null,
    cacheControl: headers['cache-control'] ?? null,
  };
}

export async function readViolations(page) {
  return page.evaluate(() => window.__cspViolations ?? []);
}

export async function readErrors(page) {
  return page.evaluate(() => window.__cspErrors ?? []);
}

/**
 * Waits for a violation matching `predicate`, polling the in-page collector for up to
 * `timeoutMs`. A violation event is delivered asynchronously, so reading the array immediately
 * after the triggering action can miss it and would make a collection failure indistinguishable
 * from "no violation happened".
 */
export async function waitForViolation(page, predicate, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const violations = await readViolations(page);
    const match = violations.find(predicate);
    if (match) return { found: true, violation: match, violations };
    if (Date.now() > deadline) return { found: false, violation: null, violations };
    await page.waitForTimeout(50);
  }
}

/** Full normalized body text plus its digest, so modes can be compared without truncation. */
export async function readBodyDigest(page) {
  return page.evaluate(async () => {
    const text = document.body.innerText.replace(/\s+/gu, ' ').trim();
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return { text, length: text.length, sha256: hex };
  });
}

/** Waits until the normalized body text stops changing, so snapshots are not taken mid-render. */
export async function waitForStableBody(page, timeoutMs = 10_000) {
  return page
    .evaluate((budget) => new Promise((done) => {
      const read = () => document.body.innerText.replace(/\s+/gu, ' ').trim();
      let previous = read();
      let stableTicks = 0;
      const deadline = Date.now() + budget;
      const tick = () => {
        const current = read();
        stableTicks = current === previous && current.length > 0 ? stableTicks + 1 : 0;
        previous = current;
        if (stableTicks >= 2) { done(true); return; }
        if (Date.now() > deadline) { done(false); return; }
        setTimeout(tick, 150);
      };
      tick();
    }), timeoutMs)
    .catch(() => false);
}

export async function readInlineScriptHashFromDocument(page, selector) {
  return page.evaluate((query) => {
    const node = document.querySelector(query);
    if (!node) return null;
    const text = node.textContent.replace(/\r\n/g, '\n');
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then((digest) => {
      const bytes = new Uint8Array(digest);
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return `'sha256-${btoa(binary)}'`;
    });
  }, selector);
}

export function violationKey(violation) {
  return `${violation.effectiveDirective || violation.violatedDirective} <- ${violation.blockedURI}`;
}

export function splitNetworkFindings({ requestFailures, httpErrors }) {
  const isFontHost = (url) => /fonts\.(googleapis|gstatic)\.com/u.test(url);
  return {
    fontRequestFailures: requestFailures.filter((entry) => isFontHost(entry.url)),
    otherRequestFailures: requestFailures.filter((entry) => !isFontHost(entry.url)),
    fontHttpErrors: httpErrors.filter((entry) => isFontHost(entry.url)),
    otherHttpErrors: httpErrors.filter((entry) => !isFontHost(entry.url)),
  };
}
