import { createHash } from 'node:crypto';
import { compactNewsStory, needsBlsBodySupplement } from '../lib/editorial-news-hygiene.mjs';

const PRODUCT_TOKEN = 'gfrr-macro-risk-editorial';
const USER_AGENT = 'gfrr-macro-risk-editorial/1.0 (+https://github.com/ctmaomao/gfrr-auto-update-site)';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fail = code => { throw new Error(code); };
const knownFailure = new Set(['robots_denied', 'robots_invalid', 'robots_restriction', 'access_denied', 'rate_limited', 'http_error', 'redirect_rejected', 'content_type', 'response_too_large', 'request_timeout', 'network_error', 'invalid_utf8', 'body_layout', 'body_restricted', 'release_date_mismatch', 'release_time_invalid', 'future_embargo', 'body_excerpt_missing']);

function archiveCandidate(story, window) {
  if (story?.topic !== 'growth_employment_consumer' || !needsBlsBodySupplement(story)) return null;
  try {
    const url = new URL(story.url);
    if (url.protocol !== 'https:' || !['bls.gov', 'www.bls.gov'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.port) return null;
    const match = url.pathname.match(/^\/news\.release\/archives\/empsit_(\d{2})(\d{2})(\d{4})\.htm$/u);
    if (!match) return null;
    const date = `${match[3]}-${match[1]}-${match[2]}`;
    const time = Date.parse(`${date}T00:00:00Z`), published = Date.parse(story.publishedAt), now = Date.parse(window.generatedAt);
    const validDay = day => /^\d{4}-\d{2}-\d{2}$/u.test(day || '') && Number.isFinite(Date.parse(`${day}T00:00:00Z`)) && new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;
    if (!Number.isFinite(now) || !validDay(window.windowStart) || !validDay(window.windowEnd) || window.windowStart > window.windowEnd
      || !Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== date || !Number.isFinite(published)
      || new Date(published).toISOString().slice(0, 10) !== date || published > now
      || date < window.windowStart || date > window.windowEnd || now - time > 7 * 86400000 || time > now) return null;
    return { url: url.href, date, origin: url.origin, pathname: url.pathname };
  } catch { return null; }
}

// Fail closed on malformed/unsupported crawler restrictions. No user-agent
// substitution, host hints, redirects or alternate paths are used to gain access.
export function robotsPermitExcerpt(text, pathname) {
  const groups = []; let agents = [], rules = [], sawRules = false;
  const flush = () => { if (agents.length) groups.push({ agents, rules }); agents = []; rules = []; sawRules = false; };
  for (const raw of text.split(/\r?\n/u)) {
    const line = raw.replace(/#.*$/u, '').trim();
    if (!line) continue;
    const match = line.match(/^([a-z-]+)\s*:\s*(.*)$/iu);
    if (!match) return { allowed: false, reason: 'robots_invalid' };
    const key = match[1].toLowerCase(), value = match[2].trim();
    if (key === 'user-agent') {
      if (!value || value !== '*' && !/^[a-z_-]+$/iu.test(value)) return { allowed: false, reason: 'robots_invalid' };
      if (sawRules) flush();
      agents.push(value.toLowerCase());
    } else if (['allow', 'disallow', 'crawl-delay', 'request-rate'].includes(key)) {
      if (!agents.length) return { allowed: false, reason: 'robots_invalid' };
      // Encoded path matching is deliberately unsupported, never silently ignored.
      if (value.includes('%') || value.length > 2048 || (value.match(/\*/gu) || []).length > 1) return { allowed: false, reason: 'robots_restriction' };
      sawRules = true; rules.push({ key, value });
    } else if (!['sitemap', 'host'].includes(key)) return { allowed: false, reason: 'robots_restriction' };
  }
  flush();
  if (!groups.length) return { allowed: false, reason: 'robots_invalid' };
  const applicable = groups.filter(g => g.agents.some(a => a === '*' || PRODUCT_TOKEN.includes(a)));
  for (const group of applicable) {
    if (group.rules.some(r => ['crawl-delay', 'request-rate'].includes(r.key))) return { allowed: false, reason: 'robots_restriction' };
    const matches = [];
    for (const rule of group.rules) {
      if (!rule.value) continue;
      if (!rule.value.startsWith('/') || /[^\x20-\x7e]/u.test(rule.value)) return { allowed: false, reason: 'robots_invalid' };
      const anchored = rule.value.endsWith('$');
      const value = anchored ? rule.value.slice(0, -1) : rule.value;
      const pattern = '^' + value.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')).join('.*') + (anchored ? '$' : '');
      if (new RegExp(pattern, 'u').test(pathname)) matches.push({ ...rule, length: value.replaceAll('*', '').length });
    }
    matches.sort((a, b) => b.length - a.length || Number(b.key === 'allow') - Number(a.key === 'allow'));
    if (matches[0]?.key === 'disallow') return { allowed: false, reason: 'robots_denied' };
  }
  return { allowed: true, reason: null };
}

async function boundedGet(url, { fetchImpl, maxBytes, timeoutMs, html }) {
  const controller = new AbortController();
  let reader, timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('request_timeout')); }, timeoutMs); });
  try {
    return await Promise.race([timeout, (async () => {
      let response;
      try { response = await fetchImpl(url, { method: 'GET', redirect: 'error', credentials: 'omit', cache: 'no-store', signal: controller.signal,
        headers: { Accept: html ? 'text/html' : 'text/plain', 'User-Agent': USER_AGENT } }); }
      catch { fail(controller.signal.aborted ? 'request_timeout' : 'network_error'); }
      if (response.status === 403 || response.status === 401) fail('access_denied');
      if (response.status === 429) fail('rate_limited');
      if (response.redirected || response.status >= 300 && response.status < 400 || response.url !== url) fail('redirect_rejected');
      if (response.status !== 200) fail('http_error');
      if (/noai|noarchive|\bnone\b/iu.test(response.headers.get('x-robots-tag') || '')) fail('body_restricted');
      if (!(html ? /^text\/html(?:\s*;|$)/iu : /^text\/plain(?:\s*;|$)/iu).test(response.headers.get('content-type') || '')) fail('content_type');
      const declared = response.headers.get('content-length');
      if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > maxBytes)) fail('response_too_large');
      if (!response.body?.getReader) fail('body_layout');
      reader = response.body.getReader();
      const chunks = []; let bytes = 0;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > maxBytes) fail('response_too_large');
        chunks.push(part.value);
      }
      const buffer = Buffer.concat(chunks.map(c => Buffer.from(c)));
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); } catch { fail('invalid_utf8'); }
      return { text, bytes, sha256: createHash('sha256').update(buffer).digest('hex') };
    })()]);
  } finally {
    clearTimeout(timer); controller.abort();
    if (reader) void reader.cancel().catch(() => {});
  }
}

function plainText(html) {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
  return html.replace(/<!--[^]*?-->/gu, '').replace(/<(script|style|nav|footer|header|aside)\b[^>]*>[^]*?<\/\1\s*>/giu, ' ')
    .replace(/<[^>]*>/gu, tag => /^<\/?(?:address|article|blockquote|br|dd|div|dl|dt|h[1-6]|hr|li|ol|p|pre|section|table|tbody|td|th|thead|tr|ul)\b/iu.test(tag) ? ' ' : '').replace(/&(#x[\da-f]+|#\d+|[a-z]+);/giu, (_all, entity) => {
      if (entity[0] !== '#') return entities[entity.toLowerCase()] ?? fail('body_layout');
      const n = entity[1].toLowerCase() === 'x' ? Number.parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      if (!Number.isSafeInteger(n) || n < 32 || n > 0x10ffff || n >= 0xd800 && n <= 0xdfff) fail('body_layout');
      return String.fromCodePoint(n);
    }).replace(/\s+/gu, ' ').trim();
}

function bodyContainers(html) {
  const excluded = new Set(['script', 'style', 'nav', 'footer', 'header', 'aside', 'template', 'noscript', 'textarea', 'title', 'xmp', 'iframe']);
  const rawText = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe']);
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  const stack = [], pres = [], bodies = [];
  let pos = 0, tokens = 0;
  while (pos < html.length) {
    if (++tokens > 20000 || stack.length > 128) fail('body_layout');
    const start = html.indexOf('<', pos);
    if (start < 0) break;
    if (html.startsWith('<!--', start)) {
      const end = html.indexOf('-->', start + 4);
      if (end < 0) fail('body_layout');
      pos = end + 3; continue;
    }
    let end = start + 1, quote = null;
    for (; end < html.length; end++) {
      const c = html[end];
      if (quote) { if (c === quote) quote = null; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === '>') break;
    }
    if (end === html.length || quote) fail('body_layout');
    const token = html.slice(start + 1, end);
    pos = end + 1;
    if (/^!doctype\s+html\s*$/iu.test(token)) continue;
    const match = token.match(/^(\/)?([a-z][\w:-]*)([^]*)$/iu);
    if (!match) fail('body_layout');
    const tag = match[2].toLowerCase();
    if (match[1]) {
      if (match[3].trim() || stack.at(-1)?.tag !== tag) fail('body_layout');
      const entry = stack.pop();
      if (!entry.blocked && !entry.tainted && tag === 'pre') pres.push(html.slice(entry.start, start));
      if (!entry.blocked && !entry.tainted && tag === 'div' && entry.attrs.id === 'bodytext') bodies.push(html.slice(entry.start, start));
      continue;
    }
    const attrs = {}; let rest = match[3];
    while (rest.trim()) {
      const attr = rest.match(/^\s+([a-z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/iu);
      if (!attr) fail('body_layout');
      const name = attr[1].toLowerCase();
      if (Object.hasOwn(attrs, name)) fail('body_layout');
      attrs[name] = attr[2] ?? attr[3] ?? attr[4] ?? '';
      // The final minimal text projection is not a general HTML serializer.
      // Reject attribute angle brackets rather than risk leaking them as text.
      if (/[<>]/u.test(attrs[name])) fail('body_layout');
      rest = rest.slice(attr[0].length);
    }
    if (tag === 'meta' && (attrs.name?.includes('&') || ['robots', PRODUCT_TOKEN].includes(attrs.name?.toLowerCase()) && /&|noai|noarchive|\bnone\b/iu.test(attrs.content || ''))) fail('body_restricted');
    const blocked = Boolean(stack.at(-1)?.blocked) || excluded.has(tag) || Object.hasOwn(attrs, 'hidden') || Object.hasOwn(attrs, 'inert')
      || /^(?:true|1)$/iu.test(attrs['aria-hidden'] || '') || /(?:display\s*:\s*none|visibility\s*:\s*hidden)/iu.test(attrs.style || '');
    if (blocked) for (const ancestor of stack) ancestor.tainted = true;
    if (tag === 'pre' && stack.some(e => e.tag === 'pre')) fail('body_layout');
    if (rawText.has(tag)) {
      const closing = new RegExp('</' + tag + '\\s*>', 'giu'); closing.lastIndex = pos;
      const close = closing.exec(html);
      if (!close) fail('body_layout');
      pos = closing.lastIndex; continue;
    }
    if (!voidTags.has(tag)) stack.push({ tag, attrs, blocked, start: pos });
  }
  if (stack.length) fail('body_layout');
  const releasePres = pres.filter(fragment => /^Transmission of material in this news release is embargoed until\b/iu.test(plainText(fragment)));
  return releasePres.length ? releasePres : bodies;
}

function headerReleaseTime(text, date, generatedAt) {
  const match = text.match(/^Transmission of material in this news release is embargoed until\b.{0,80}?(\d{1,2}):(\d{2})\s*([ap])\.?m\.?\s*\(ET\)\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/iu);
  if (!match) fail('release_time_invalid');
  const month = MONTHS.findIndex(m => m.toLowerCase() === match[5].toLowerCase()) + 1;
  const headerDate = `${match[7]}-${String(month).padStart(2, '0')}-${match[6].padStart(2, '0')}`;
  if (headerDate !== date) fail('release_date_mismatch');
  const h = Number(match[1]), min = Number(match[2]);
  if (h < 1 || h > 12 || min > 59) fail('release_time_invalid');
  const hour = h % 12 + (match[3].toLowerCase() === 'p' ? 12 : 0);
  const format = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'long' });
  const wall = Date.parse(`${date}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00Z`);
  const times = [4, 5].map(offset => wall + offset * 3600000).filter(time => {
    const parts = Object.fromEntries(format.formatToParts(time).map(p => [p.type, p.value]));
    return `${parts.year}-${parts.month}-${parts.day}` === date && Number(parts.hour) === hour && Number(parts.minute) === min && parts.weekday.toLowerCase() === match[4].toLowerCase();
  });
  if (times.length !== 1) fail('release_time_invalid');
  if (times[0] > Date.parse(generatedAt)) fail('future_embargo');
  return new Date(times[0]).toISOString();
}

export function extractBlsReleaseExcerpt(html, candidate, generatedAt) {
  const texts = [...new Set(bodyContainers(html).map(plainText).filter(t => /^Transmission of material in this news release is embargoed until\b/iu.test(t)))];
  if (texts.length !== 1) fail('body_layout');
  const releasedAt = headerReleaseTime(texts[0], candidate.date, generatedAt);
  const snippet = compactNewsStory({ url: candidate.url, snippet: texts[0] }, 360).snippet;
  if (!snippet) fail('body_excerpt_missing');
  return { snippet, releasedAt };
}

export async function supplementBlsEmploymentExcerpt({ rawStories, generatedAt, windowStart, windowEnd, fetchImpl = globalThis.fetch, robotsTimeoutMs = 5000, bodyTimeoutMs = 8000 }) {
  const diagnostics = { status: 'not_needed', reason: null, requestCount: 0, robotsAttempted: false, bodyAttempted: false };
  const candidates = rawStories.map(s => archiveCandidate(s, { generatedAt, windowStart, windowEnd })).filter(Boolean)
    .sort((a, b) => b.date.localeCompare(a.date) || a.url.localeCompare(b.url));
  const candidate = candidates[0];
  if (!candidate) return { rawStories, diagnostics };
  try {
    diagnostics.requestCount++; diagnostics.robotsAttempted = true;
    const robots = await boundedGet(candidate.origin + '/robots.txt', { fetchImpl, maxBytes: 64 * 1024, timeoutMs: Number.isFinite(robotsTimeoutMs) && robotsTimeoutMs > 0 ? Math.min(5000, robotsTimeoutMs) : 5000, html: false });
    const permission = robotsPermitExcerpt(robots.text, candidate.pathname);
    if (!permission.allowed) fail(permission.reason);
    diagnostics.requestCount++; diagnostics.bodyAttempted = true;
    const body = await boundedGet(candidate.url, { fetchImpl, maxBytes: 512 * 1024, timeoutMs: Number.isFinite(bodyTimeoutMs) && bodyTimeoutMs > 0 ? Math.min(8000, bodyTimeoutMs) : 8000, html: true });
    const excerpt = extractBlsReleaseExcerpt(body.text, candidate, generatedAt);
    const rows = rawStories.map(story => archiveCandidate(story, { generatedAt, windowStart, windowEnd })?.url === candidate.url ? { ...story, snippet: excerpt.snippet } : story);
    return { rawStories: rows, diagnostics: { ...diagnostics, status: 'available', bodySha256: body.sha256, releasedAt: excerpt.releasedAt } };
  } catch (error) {
    return { rawStories, diagnostics: { ...diagnostics, status: 'held', reason: knownFailure.has(error.message) ? error.message : 'network_error' } };
  }
}
