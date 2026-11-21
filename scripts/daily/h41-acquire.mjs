import { createHash } from 'node:crypto';
import { parseH41Calendar } from './h41-calendar.mjs';
import { qualifyH41Dates, qualifyH41Release } from './h41-dates.mjs';
import { extractH41 } from './h41-html.mjs';

const NY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
const origin = 'https://www.federalreserve.gov';
const names = 'january february march april may june july august september october november december'.split(' ');
const dayMs = 86_400_000;
const kinds = { calendar: [3, 500_000], release: [2, 1_048_576] };
const iso = (ms) => new Date(ms).toISOString();
const shift = (d, n) => iso(Date.parse(d) + n * dayMs).slice(0, 10);
const windowMonths = (d) => new Set([shift(d, 1).slice(0, 7), shift(d, 6).slice(0, 7)]);
const monthUrl = (m) => `${origin}/newsevents/${m.slice(0, 4)}-${names[+m.slice(5) - 1]}.htm`;
const releaseUrl = (d) => `${origin}/releases/h41/${d.replaceAll('-', '')}/`;
const insist = (ok) => { if (!ok) throw new Error('Unqualified Fed H.4.1 input'); };
const stop = (body) => { try { Promise.resolve(body?.cancel()).catch(() => {}); } catch {} };

async function boundedHtml(url, max, fetchImpl, timeoutMs, clock) {
  const controller = new AbortController();
  let timeout;
  let abandoned = false;
  const deadline = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      abandoned = true;
      controller.abort();
      reject(new Error('Fed H.4.1 request exceeded absolute deadline'));
    }, timeoutMs);
  });
  const load = async () => {
    const response = await fetchImpl(url, {
      method: 'GET', redirect: 'error', signal: controller.signal,
      headers: { Accept: 'text/html', 'Accept-Encoding': 'identity' },
    });
    try {
      insist(!abandoned && response.status === 200 && response.url === url && response.redirected === false && response.body);
      const type = response.headers.get('content-type') ?? '';
      insist(/^text\/html(?:\s*;|$)/i.test(type) && !response.headers.get('content-range'));
      const charset = /\bcharset\s*=\s*["']?([^;"'\s]+)/i.exec(type)?.[1];
      insist(!charset || /^utf-8$/i.test(charset));
      const length = response.headers.get('content-length');
      const encoding = response.headers.get('content-encoding');
      if (length !== null) insist(/^\d+$/.test(length) && Number(length) <= max);
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8', { fatal: true });
      const hash = createHash('sha256');
      let size = 0;
      const parts = [];
      try {
        for (;;) {
          const { done, value } = await reader.read();
          insist(!abandoned);
          if (done) break;
          insist(value instanceof Uint8Array && value.byteLength > 0);
          size += value.byteLength;
          insist(size <= max);
          hash.update(value);
          parts.push(decoder.decode(value, { stream: true }));
        }
        if (length !== null && (!encoding || /^identity$/i.test(encoding))) insist(size === Number(length));
        const html = parts.join('') + decoder.decode();
        insist(size > 0 && /<\/body>\s*<\/html>\s*$/i.test(html));
        const at = clock();
        insist(Number.isFinite(at));
        return { html, url, retrievedAt: iso(at), bodySha256: hash.digest('hex') };
      } catch (err) {
        stop(reader);
        throw err;
      }
    } catch (err) {
      stop(response?.body);
      throw err;
    }
  };
  try {
    return await Promise.race([deadline, load()]);
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

function observationFor(now) {
  const parts = Object.fromEntries(NY.formatToParts(now).map(({type, value}) => [type, value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  insist(/^\d{4}-\d{2}-\d{2}$/.test(today) && today >= '1900-02-01');
  return { today, wednesday: shift(today, -((new Date(today).getUTCDay() + 4) % 7)) };
}

function qualifyDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && iso(Date.parse(value)).slice(0, 10) === value;
}

export async function acquireH41({
  now, primary = {}, fetchImpl = globalThis.fetch, timeoutMs = 5_000, clock = Date.now,
} = {}) {
  const rows = {};
  const failed = ['WALCL', 'WRESBAL'].filter((key) => primary[key]?.failed === true);
  const diagnostics = {};
  if (!failed.length) return { rows, diagnostics };
  const hasCandidate = (key, date) => !primary[key].usableIncumbentDate || date > primary[key].usableIncumbentDate;
  const mark = (keys, code) => { for (const key of keys) diagnostics[key] = code; };
  const instant = now instanceof Date ? now.getTime() : now;
  let civil;
  try {
    insist(Number.isFinite(instant) && Number.isFinite(Date.parse(iso(instant))) &&
      Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 5_000 &&
      typeof fetchImpl === 'function' && typeof clock === 'function' &&
      failed.every((key) => primary[key].usableIncumbentDate == null || qualifyDate(primary[key].usableIncumbentDate)));
    civil = observationFor(instant);
  } catch {
    mark(failed, 'invalid-input');
    return { rows, diagnostics };
  }

  const { today, wednesday } = civil;
  const prior = shift(wednesday, -7);
  const pending = failed.filter((key) => hasCandidate(key, today === wednesday ? prior : wednesday));
  mark(failed.filter((key) => !pending.includes(key)), 'usable-incumbent');
  if (!pending.length) return { rows, diagnostics };

  const memo = new Map();
  const count = { calendar: 0, release: 0 };
  const get = (kind, url) => {
    if (!memo.has(url)) {
      const [limit, cap] = kinds[kind];
      memo.set(url, count[kind] < limit
        ? (count[kind]++, boundedHtml(url, cap, fetchImpl, timeoutMs, clock))
        : Promise.reject(new Error('Fed H.4.1 acquisition budget exhausted')));
    }
    return memo.get(url);
  };
  const months = new Map();
  async function ensure(d) {
    const missing = [...windowMonths(d)].filter((m) => !months.has(m));
    // Reserve the entire window before making its first request.
    insist(missing.length <= kinds.calendar[0] - count.calendar);
    for (const month of missing) {
      const { html, url } = await get('calendar', monthUrl(month));
      months.set(month, parseH41Calendar({ month, html, finalUrl: url, transportComplete: true }));
    }
  }
  const schedule = () => [...months.values()];
  const exact = (observation) => qualifyH41Release({ observation, months: schedule() });
  let selected;
  try {
    if (today !== wednesday) await ensure(wednesday);
    if (today === wednesday || Date.parse(exact(wednesday).scheduledReleaseAt) > instant) {
      if (!pending.some((key) => hasCandidate(key, prior))) {
        mark(pending, 'usable-incumbent');
        return { rows, diagnostics };
      }
      await ensure(prior);
    }
    selected = qualifyH41Dates({ now: instant, months: schedule() });
  } catch {
    mark(pending, 'current-calendar-unqualified');
    return { rows, diagnostics };
  }

  const active = pending.filter((key) => hasCandidate(key, selected.expectedObservation));
  mark(pending.filter((key) => !active.includes(key)), 'usable-incumbent');
  if (!active.length) return { rows, diagnostics };

  async function read(observationDate, releaseDate, scheduledReleaseAt) {
    const { html, ...receipt } = await get('release', releaseUrl(releaseDate));
    const data = extractH41(html, { expectedRelease: releaseDate, expectedObservation: observationDate });
    return { data, receipt: { ...receipt, releaseDate, observationDate, scheduledReleaseAt } };
  }
  let current;
  try {
    current = await read(selected.expectedObservation, selected.expectedRelease, selected.releaseAt);
  } catch {
    mark(active, 'current-release-unqualified');
    return { rows, diagnostics };
  }
  function observation(result, key) {
    return { value: result.data[key], unit: result.data.unit, observationDate: result.receipt.observationDate, receipt: result.receipt };
  }
  if (active.includes('WRESBAL')) rows.WRESBAL = observation(current, 'WRESBAL');
  let reference;
  try {
    await ensure(selected.referenceObservation);
    reference = exact(selected.referenceObservation);
    insist(reference.release < selected.expectedRelease && Date.parse(reference.scheduledReleaseAt) <= instant);
  } catch {
    mark(active, 'reference-calendar-unqualified');
    return { rows, diagnostics };
  }
  let comparison;
  try {
    comparison = await read(reference.observation, reference.release, reference.scheduledReleaseAt);
  } catch {
    mark(active, 'reference-release-unqualified');
    return { rows, diagnostics };
  }
  for (const key of active) {
    if (comparison.data[key] > 0) {
      rows[key] = { ...observation(current, key), baseline: observation(comparison, key) };
    } else {
      mark([key], 'reference-level-unqualified');
    }
  }
  return { rows, diagnostics };
}
