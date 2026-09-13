import { createHash } from 'node:crypto';

export const SITES = Object.freeze([
  { id: 'pages', base: 'https://ctmaomao.github.io/gfrr-auto-update-site/', graceHours: 1 },
  // EdgeOne data-only publication runs every 3h; allow another hour for delivery.
  { id: 'custom', base: 'https://radar.gfrfinradar.uk/', graceHours: 4 }
]);
// These are delivery-age limits, NOT source freshness or scoring thresholds.
export const TARGETS = Object.freeze([
  { path: 'index.html', kind: 'html' },
  { path: 'scripts/app.js', kind: 'script' },
  { path: 'data/radar-data.json', kind: 'radar', clock: 'updatedAt', maxHours: 36 },
  { path: 'data/world-order-stress.json', kind: 'world', clock: 'updatedAt', maxHours: 36 },
  { path: 'data/oil-directional-pressure.json', kind: 'odp', clock: 'builtAt', maxHours: 36 },
  { path: 'data/oil-news-event-watch.json', kind: 'news', clock: 'generatedAt', maxHours: 36 }
]);
const hash = text => createHash('sha256').update(text.replace(/^\uFEFF/u, '').replace(/\r\n/gu, '\n')).digest('hex');
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const status = value => typeof value === 'string' && /^[a-z][a-z0-9_]{0,63}$/u.test(value) ? value : 'unknown';
const date = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/u.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value.slice(0, 10) ? value : null;
};
const hours = (value, now) => value ? (now - Date.parse(value)) / 3600000 : null;

export function inspectContent(target, text, now) {
  const result = { sha256: hash(text), generatedAt: null, version: null, sources: [], errors: [] };
  if (!target.clock) {
    result.version = text.match(target.kind === 'html'
      ? /scripts\/app\.js\?v=([A-Za-z0-9._-]+)/u
      : /APP_VERSION\s*=\s*['"]([A-Za-z0-9._-]+)['"]/u)?.[1] ?? null;
    if (!result.version) result.errors.push('asset_version_missing');
    return result;
  }
  let data;
  try { data = JSON.parse(text.replace(/^\uFEFF/u, '')); } catch { result.errors.push('invalid_json'); return result; }
  if (!record(data)) { result.errors.push('invalid_shape'); return result; }
  const shape = target.kind === 'radar' ? Number.isFinite(data.score) && record(data.modules)
    : target.kind === 'world' ? record(data.externalSources)
      : target.kind === 'odp' ? record(data.evidence)
        : record(data.sourceStatus);
  if (!shape) result.errors.push('invalid_shape');
  result.generatedAt = date(data[target.clock]);
  result.ageHours = hours(result.generatedAt, now);
  if (!result.generatedAt) result.errors.push('generated_time_invalid');
  else if (result.ageHours < -5 / 60) result.errors.push('generated_time_future');
  else if (result.ageHours > target.maxHours) result.errors.push('snapshot_stale');
  const add = (id, state, observedAt, clockKind, maxAgeHours = null) => {
    const observed = date(observedAt), ageHours = hours(observed, now);
    result.sources.push({ id, status: status(state), observedAt: observed, clockKind, ageHours,
      ageExceeded: Number.isFinite(maxAgeHours) && ageHours !== null ? ageHours > maxAgeHours : null });
    if (ageHours !== null && ageHours < -5 / 60) result.errors.push('source_time_future');
  };
  if (target.kind === 'radar') {
    add('daily_realtime', data.dailyRealtimeInput?.sourceMode, data.dailyRealtimeInput?.updatedAt, 'input_snapshot');
    result.editorial = { currentGeneratedAt: date(data.macroRiskEditorialLayer?.generatedAt),
      currentSourceAt: date(data.macroRiskEditorialLayer?.sourceDataUpdatedAt),
      previousGeneratedAt: date(data.macroRiskEditorialPreviousIssue?.generatedAt) };
  } else if (target.kind === 'world') {
    for (const id of ['gdelt', 'ofac', 'sipri', 'acled']) {
      const source = data.externalSources?.[id];
      add(id, source?.status, source?.lastFetchedAt, 'collection_not_observation');
    }
    add('acled_weekly', data.externalSources?.acled?.summary?.sourceFreshness,
      data.externalSources?.acled?.summary?.latestWeek, 'source_week');
    add('acled_monthly', data.externalSources?.acled?.summary?.monthlySourceFreshness,
      data.externalSources?.acled?.summary?.monthlyAsOfDate, 'source_as_of');
  } else if (target.kind === 'odp') {
    for (const [id, source] of Object.entries(data.evidence || {}).slice(0, 64)) {
      // Identifier allowlist prevents arbitrary text from entering public diagnostics.
      if (/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/u.test(id)) add(id, source?.sourceStatus, source?.asOfDate,
        'source_observation', Number.isFinite(source?.maxAgeDays) ? source.maxAgeDays * 24 : null);
    }
  } else {
    for (const [id, key] of [['gdelt_doc', 'gdeltDoc'], ['tavily', 'tavily'], ['brave', 'brave']]) {
      add(id, data.sourceStatus?.[key], data.sourceStatus?.details?.[id]?.availability?.lastLiveSuccessAt, 'last_success_not_publication');
    }
    add('latest_article', 'publication', data.freshness?.latestArticleAt, 'article_publication');
  }
  return result;
}

// Single request, no redirect/retry; deadline covers headers AND streamed body.
export async function readBounded(url, fetchImpl = fetch, timeoutMs = 10000, maxBytes = 2 * 1024 * 1024) {
  const controller = new AbortController();
  let timer, reader;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetchImpl(url, { signal: controller.signal, redirect: 'error' });
        if (!response.ok) return { httpStatus: response.status, error: 'http_error' };
        if (response.url && response.url !== url) return { httpStatus: response.status, error: 'unexpected_url' };
        if (Number(response.headers.get('content-length')) > maxBytes) return { httpStatus: response.status, error: 'body_too_large' };
        if (!response.body) return { httpStatus: response.status, error: 'empty_body' };
        reader = response.body.getReader();
        const chunks = []; let size = 0;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) return { httpStatus: response.status, error: 'body_too_large' };
          chunks.push(Buffer.from(value));
        }
        return { httpStatus: response.status, text: Buffer.concat(chunks).toString('utf8') };
      })(),
      new Promise(resolve => { timer = setTimeout(() => { controller.abort(); resolve({ error: 'request_timeout', httpStatus: null }); }, timeoutMs); })
    ]);
  } catch { return { httpStatus: null, error: 'network_error' }; }
  finally { clearTimeout(timer); controller.abort(); if (reader) void reader.cancel().catch(() => {}); }
}

export async function probePublishedSnapshots({ baseline, now = Date.now(), fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  if (!Number.isFinite(now) || !Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 10000) throw new Error('Invalid probe limits');
  // Validate the entire fixed baseline before ANY network access.
  for (const target of TARGETS) {
    const item = baseline?.[target.path];
    if (!item || typeof item.text !== 'string' || !date(item.committedAt) || Date.parse(item.committedAt) > now + 300000) throw new Error('Invalid pinned baseline');
    if (inspectContent(target, item.text, now).errors.some(code => code !== 'snapshot_stale')) throw new Error('Invalid pinned baseline content');
  }
  const jobs = SITES.flatMap(site => TARGETS.map(target => ({ site, target })));
  const rows = new Array(jobs.length); let cursor = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (cursor < jobs.length) {
      const index = cursor++, { site, target } = jobs[index];
      const response = await readBounded(new URL(target.path, site.base).href, fetchImpl, timeoutMs);
      const row = { site: site.id, path: target.path, httpStatus: response.httpStatus, errors: [], warnings: [] };
      rows[index] = row;
      if (response.error) { row.errors.push(response.error); continue; }
      Object.assign(row, inspectContent(target, response.text, now));
      const expected = inspectContent(target, baseline[target.path].text, now);
      row.expectedSha256 = expected.sha256;
      if (row.sha256 !== expected.sha256) {
        const newer = row.generatedAt && expected.generatedAt && Date.parse(row.generatedAt) > Date.parse(expected.generatedAt);
        const grace = now - Date.parse(baseline[target.path].committedAt) <= site.graceHours * 3600000;
        (newer || grace ? row.warnings : row.errors).push(newer ? 'baseline_advanced' : grace ? 'publication_in_progress' : 'baseline_mismatch');
      }
      if (row.sources.some(source => ['error', 'partial', 'missing', 'fallback', 'stale', 'aging', 'manual_required', 'unavailable'].includes(source.status) || source.ageExceeded)) row.warnings.push('source_degraded');
    }
  }));
  for (const target of TARGETS) {
    const pair = rows.filter(row => row.path === target.path);
    if (pair.every(row => row.sha256) && pair[0].sha256 !== pair[1].sha256) {
      const transitional = pair.some(row => row.warnings.some(code => ['baseline_advanced', 'publication_in_progress'].includes(code)));
      for (const row of pair) (transitional ? row.warnings : row.errors).push('cross_site_mismatch');
    }
  }
  for (const site of SITES) {
    const html = rows.find(row => row.site === site.id && row.path === 'index.html');
    const script = rows.find(row => row.site === site.id && row.path === 'scripts/app.js');
    if (html.version && script.version && html.version !== script.version) html.errors.push('asset_version_mismatch');
  }
  return { schemaVersion: 'published-snapshots-v1', checkedAt: new Date(now).toISOString(),
    status: rows.some(row => row.errors.length) ? 'fail' : rows.some(row => row.warnings.length) ? 'warn' : 'pass',
    requestCount: jobs.length, maxRequests: 12, rows,
    boundary: 'read_only_delivery_monitor_no_source_fetch_no_provider_no_production_write' };
}
