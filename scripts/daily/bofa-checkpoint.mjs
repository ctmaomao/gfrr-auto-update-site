const ORIGIN = 'https://institute.bankofamerica.com';
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const DAY_MS = 86400000;
const MAX_REPORT_AGE_DAYS = 62;
// This profile records a manual semantic review, not hardcoded observations or
// an automated PDF fetch. Unreviewed shorthand reports must remain unavailable.
const REVIEWED_SHORTHAND = Object.freeze({
  reportUrl: `${ORIGIN}/economic-insights/consumer-checkpoint-august-2026.html`,
  pdfUrl: `${ORIGIN}/content/dam/economic-insights/consumer-checkpoint-august-2026.pdf`,
  measurementBasis: 'per_household',
  evidence: 'August 2026 full analysis, page 1 body and Exhibit 1 identify per-household total and ex-gas card spending.'
});
const NUMBER = '[-+]?\\d+(?:\\.\\d+)?';
const YOY = '(?:year[- ]over[- ]year(?:\\s*\\(YoY\\))?|YoY)';

function fail(message) {
  throw new Error(`bofa:consumer-checkpoint ${message}`);
}

function reportIdentity(value, kind = 'html') {
  if (typeof value !== 'string') fail(`missing ${kind} URL`);
  let url;
  try { url = new URL(value); } catch { fail(`invalid ${kind} URL`); }
  if (url.origin !== ORIGIN || url.username || url.password || url.search || url.hash || url.href !== value) {
    fail(`unexpected ${kind} URL identity`);
  }
  const prefix = kind === 'html' ? '/economic-insights/' : '/content/dam/economic-insights/';
  const match = url.pathname.match(new RegExp(`^${prefix}consumer-checkpoint-([a-z]+)-(\\d{4})\\.${kind}$`, 'u'));
  const month = MONTHS.indexOf(match?.[1]);
  const year = Number(match?.[2]);
  if (!match || month < 0 || !Number.isInteger(year) || year < 2000) fail(`invalid ${kind} report month`);
  const timestamp = Date.UTC(year, month, 1);
  return { url: value, year, month, timestamp, iso: new Date(timestamp).toISOString() };
}

function validateFreshness(report, nowMs) {
  if (!Number.isFinite(nowMs)) fail('invalid observation clock');
  const ageDays = (nowMs - report.timestamp) / DAY_MS;
  if (ageDays < 0 || ageDays > MAX_REPORT_AGE_DAYS) fail('stale or future report month');
}

function percent(value) {
  const number = Number(value);
  if (typeof value !== 'string' || !Number.isFinite(number)) fail('non-finite spending percentage');
  return number / 100;
}

function uniqueMetric(values, label) {
  const known = values.filter(value => value !== null);
  if (new Set(known).size > 1) fail(`conflicting ${label}`);
  return known[0] ?? null;
}

function checkMonthLabel(monthName, yearText, report, monthOffset, label) {
  const expected = new Date(Date.UTC(report.year, report.month + monthOffset, 1));
  if (MONTHS.indexOf(monthName.toLowerCase()) !== expected.getUTCMonth()) fail(`${label} month does not match the report`);
  if (yearText !== undefined && (!/^\d{4}$/u.test(yearText) || Number(yearText) !== expected.getUTCFullYear())) {
    fail(`${label} year does not match the report`);
  }
}

function priorMetric(tail, report) {
  // A preceding percent, ex-gas clause or MoM clause ends this metric's scope.
  const match = tail.match(new RegExp(`^([^%]{0,140}?)\\bfrom\\s+(${NUMBER})\\s*%`, 'iu'));
  if (!match || /ex[- ]gas|excluding\s+gasoline|month[- ]over[- ]month|\bMoM\b|seasonally[- ]adjusted/iu.test(match[1])) return null;
  const priorMonth = tail.slice(match[0].length).match(new RegExp(`^(?:\\s*${YOY})?\\s+in\\s+([A-Za-z]+)(?:\\s*,?\\s*(\\d+))?`, 'iu'));
  if (priorMonth) checkMonthLabel(priorMonth[1], priorMonth[2], report, -2, 'previous YoY');
  return percent(match[2]);
}

function checkObservationMonth(tail, report, label) {
  const prefix = tail.split(/\bfrom\b|[;:]/iu)[0];
  const match = prefix.match(/\bin\s+([A-Za-z]+)(?:\s*,?\s*(\d+))?/iu);
  if (!match) return;
  checkMonthLabel(match[1], match[2], report, -1, label);
}

/** Selects genuine report anchors by month, never by their order on the page. */
export function selectLatestBofaCheckpointUrl(html, nowMs = Date.now()) {
  if (!Number.isFinite(nowMs)) fail('invalid observation clock');
  const clean = String(html ?? '').replace(/<!--[\s\S]*?-->|<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/giu, '');
  const reports = [];
  for (const match of clean.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/giu)) {
    try {
      const report = reportIdentity(new URL(match[1], ORIGIN).href);
      if (report.timestamp <= nowMs) reports.push(report);
    } catch { /* Non-report links and untrusted URLs do not become candidates. */ }
  }
  reports.sort((a, b) => b.timestamp - a.timestamp);
  if (!reports[0]) fail('missing non-future official report link');
  validateFreshness(reports[0], nowMs);
  return reports[0].url;
}

/** Pure parser: never combines a new report with a previous cached observation. */
export function parseBofaCheckpointMetrics(plain, { reportUrl, pdfUrl = null, nowMs = Date.now() } = {}) {
  const report = reportIdentity(reportUrl);
  validateFreshness(report, nowMs);
  if (pdfUrl !== null) {
    const pdf = reportIdentity(pdfUrl, 'pdf');
    if (pdf.year !== report.year || pdf.month !== report.month) fail('PDF report month mismatch');
  }
  const reviewedShorthand = reportUrl === REVIEWED_SHORTHAND.reportUrl && pdfUrl === REVIEWED_SHORTHAND.pdfUrl;
  if (typeof plain !== 'string') fail('missing report text');
  const text = plain.replace(/[\u2010-\u2014]/gu, '-').replace(/\u2212/gu, '-').replace(/\s+/gu, ' ').trim();
  if (/\b(?:not|rather than)\s+(?:on\s+(?:a\s+)?)?per[- ]household\b|\boverall\s+total\s+card\s+spending\b|\baggregate\s+(?:total\s+)?card\s+spending\b/iu.test(text)) {
    fail('aggregate or explicitly non-household spending basis');
  }
  // Decimal periods are not sentence boundaries. A previous report's sentence
  // must not supply this report's missing current/previous/ex-gas metrics.
  const sentences = text.split(/[.!?](?=\s|$)/u).map(value => value.trim()).filter(Boolean);
  const explicitPattern = new RegExp(`\\b(?:total\\s+)?(?:aggregated\\s+)?(?:credit\\s+and\\s+debit\\s+)?card\\s+spending\\s+per[- ]household\\s+(?:rose|increased|grew)\\s+(?:by\\s+)?(${NUMBER})\\s*%\\s*${YOY}`, 'iu');
  const shorthandPattern = new RegExp(`\\btotal\\s+card\\s+spending\\s+growth\\s+(?:eased|slowed|moderated|accelerated|increased|rose)\\s+to\\s+(${NUMBER})\\s*%\\s*${YOY}`, 'iu');
  const exGasPattern = new RegExp(`\\b(?:excluding\\s+gasoline|spending\\s+ex[- ]gas)\\b([^%\\d]{0,160}?)(?<![\\d.,])(${NUMBER})\\s*%\\s*${YOY}`, 'iu');
  const totals = [];
  const previous = [];
  const exGas = [];
  const hasExplicitBasis = sentences.some(sentence => explicitPattern.test(sentence));
  for (const sentence of sentences) {
    const exGasIndex = sentence.search(/\bexcluding\s+gasoline\b|\bex[- ]gas\b/iu);
    const candidateExplicit = sentence.match(explicitPattern);
    const candidateShorthand = sentence.match(shorthandPattern);
    const explicit = candidateExplicit && (exGasIndex < 0 || candidateExplicit.index < exGasIndex) ? candidateExplicit : null;
    const shorthand = candidateShorthand && (exGasIndex < 0 || candidateShorthand.index < exGasIndex) ? candidateShorthand : null;
    if (shorthand && !reviewedShorthand) fail('unreviewed shorthand spending basis');
    const total = explicit || shorthand;
    if (total) {
      const tail = sentence.slice(total.index + total[0].length);
      checkObservationMonth(tail, report, 'current YoY');
      totals.push(percent(total[1]));
      previous.push(priorMetric(tail, report));
    }
    const ex = sentence.match(exGasPattern);
    if (ex) {
      if (!reviewedShorthand && !hasExplicitBasis && !/\bper[- ]household\b/iu.test(sentence)) {
        fail('ex-gas spending lacks a reviewed per-household basis');
      }
      if (/\bfrom\b|\bprior\b|\bprevious\b|\bMoM\b|month[- ]over[- ]month/iu.test(ex[1])) continue;
      checkObservationMonth(sentence.slice(ex.index + ex[0].length), report, 'ex-gas YoY');
      exGas.push(percent(ex[2]));
    }
  }
  const currentYoY = uniqueMetric(totals, 'current YoY');
  const priorYoY = uniqueMetric(previous, 'previous YoY');
  const exGasYoY = uniqueMetric(exGas, 'ex-gas YoY');
  if (currentYoY === null && exGasYoY === null) fail('missing unambiguous per-household YoY metrics');
  return {
    bofaCardSpendingYoY: currentYoY,
    bofaCardSpendingPriorYoY: currentYoY === null ? null : priorYoY,
    bofaCardSpendingExGasYoY: exGasYoY,
    bofaReportDate: report.iso,
    bofaReportUrl: reportUrl,
    bofaPdfUrl: pdfUrl,
    bofaStatus: 'live',
    bofaSummary: reviewedShorthand
      ? 'BoA Consumer Checkpoint 公开 HTML 同比数据；本期每户口径已由人工核对同月官方 PDF，程序不自动读取 PDF；audit-only / display-only，不等同于原始卡消费数据或 Redbook。'
      : 'BoA Consumer Checkpoint 公开 HTML 明确每户卡消费同比口径；audit-only / display-only，不等同于原始卡消费数据或 Redbook。'
  };
}
