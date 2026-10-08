import { createHash } from 'node:crypto';
import { parseTimestamp, formatTimestamp } from './events-candidate.mjs';

export const RESEARCH_DEFINITION = 'gdelt-events-research-v2-roots18-20-global';
export const hashResearchPayload = data => createHash('sha256').update(JSON.stringify(data)).digest('hex');
const DAY = 86400000;
const validRoot = value => typeof value === 'string' && /^(?:0[1-9]|1\d|20)$/u.test(value);

// New research-only contract. The original strict parser is deliberately untouched.
// Quarantined rows never enter an event group or become invented zeroes/categories.
export function projectResearchFile(text, timestamp) {
  parseTimestamp(timestamp);
  if (Buffer.byteLength(text) > 16 * 1024 * 1024) throw new Error('events_tsv_too_large');
  const rows = [], rejected = {}, quarantineIds = [];
  let totalRows = 0, quarantinedRows = 0;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    if (++totalRows > 100000) throw new Error('events_row_limit');
    const f = line.replace(/\r$/u, '').split('\t');
    let reason = null;
    if (f.length !== 61 || !/^\d{1,16}$/u.test(f[0]) || !/^[1-4]$/u.test(f[29])
      || !/^[01]$/u.test(f[25]) || !/^(?:[A-Z]{2})?$/u.test(f[53])) reason = 'shape_or_identity';
    if (!reason) {
      try { parseTimestamp(`${f[1]}000000`); } catch { reason = 'occurrence_date'; }
      if (f[59] !== timestamp || f[1] > timestamp.slice(0, 8)) reason = 'ingestion_date';
    }
    if (!reason && (!validRoot(f[28]) || !/^\d{2,4}$/u.test(f[26]) || !/^\d{2,3}$/u.test(f[27])
      || !f[26].startsWith(f[28]) || !f[27].startsWith(f[28]))) reason = 'event_code';
    if (!reason && ![f[7], f[17]].every(value => /^(?:[A-Z]{3})?$/u.test(value))) reason = 'actor_country';
    if (!reason && ((f[29] === '4') !== (Number(f[28]) >= 15))) reason = 'class_root_conflict';
    if (reason) {
      quarantinedRows++; rejected[reason] = (rejected[reason] || 0) + 1;
      if (/^\d{1,16}$/u.test(f[0])) quarantineIds.push(hashResearchPayload(f[0]));
      continue;
    }
    if (Number(f[29]) < 3) continue;
    rows.push({ idHash: hashResearchPayload(f[0]), eventDay: f[1], country: f[53] || null,
      rootCode: f[28], quadClass: Number(f[29]),
      crossActor: Boolean(f[7] && f[17] && f[7] !== f[17]) });
  }
  return { rows, totalRows, quarantinedRows, rejected, quarantineIds };
}

export function buildResearchDay(day, files, provenance = {}) {
  parseTimestamp(`${day}000000`);
  const seenFiles = new Set(), seenIds = new Map(), groups = new Map(), quarantineIds = new Set();
  let totalRows = 0, quarantinedRows = 0, duplicateIds = 0, conflictingIds = 0;
  const rejected = {};
  for (const f of files) {
    if (f.timestamp.slice(0, 8) !== day || seenFiles.has(f.timestamp)) throw new Error('events_research_file_scope');
    seenFiles.add(f.timestamp);
    totalRows += f.projection.totalRows; quarantinedRows += f.projection.quarantinedRows;
    for (const [reason, count] of Object.entries(f.projection.rejected)) rejected[reason] = (rejected[reason] || 0) + count;
    for (const id of f.projection.quarantineIds) quarantineIds.add(id);
    for (const r of f.projection.rows) {
      const key = JSON.stringify([r.eventDay, r.country, r.rootCode, r.quadClass, r.crossActor]);
      if (seenIds.has(r.idHash)) { duplicateIds++; if (seenIds.get(r.idHash) !== key) conflictingIds++; continue; }
      seenIds.set(r.idHash, key);
      if (seenIds.size > 200000) throw new Error('events_research_day_record_budget');
      if (!groups.has(key)) groups.set(key, { eventDay: r.eventDay, country: r.country,
        rootCode: r.rootCode, quadClass: r.quadClass, crossActor: r.crossActor, idHashes: [] });
      groups.get(key).idHashes.push(r.idHash);
    }
  }
  const payload = { definitionId: RESEARCH_DEFINITION, day, expectedFiles: 96, downloadedFiles: files.length,
    totalRows, quarantinedRows, rejected, duplicateIds, conflictingIds,
    quarantineIdHashes: [...quarantineIds], groups: [...groups.values()], provenance,
    productionEligible: false, calibrationApproved: false };
  return { schemaVersion: 'gdelt-events-research-day-v2', digest: hashResearchPayload(payload), payload };
}

export function validateResearchDay(a) {
  if (a?.schemaVersion !== 'gdelt-events-research-day-v2' || a.digest !== hashResearchPayload(a.payload)) throw new Error('events_research_digest');
  const p = a.payload;
  if (p.definitionId !== RESEARCH_DEFINITION || p.productionEligible !== false || p.calibrationApproved !== false
    || p.expectedFiles !== 96 || p.downloadedFiles !== 96 || p.conflictingIds !== 0) throw new Error('events_research_day_incomplete');
  if (typeof p.day !== 'string' || !/^\d{8}$/u.test(p.day)) throw new Error('events_research_day');
  parseTimestamp(`${p.day}000000`);
  for (const key of ['totalRows', 'quarantinedRows', 'duplicateIds', 'conflictingIds']) {
    if (!Number.isSafeInteger(p[key]) || p[key] < 0) throw new Error('events_research_counts');
  }
  if (p.totalRows > 9600000 || p.quarantinedRows > p.totalRows || !Array.isArray(p.groups)
    || !Array.isArray(p.quarantineIdHashes) || p.quarantineIdHashes.length > p.quarantinedRows) throw new Error('events_research_counts');
  if (!p.rejected || Object.entries(p.rejected).some(([key, n]) =>
    !['shape_or_identity', 'occurrence_date', 'ingestion_date', 'event_code', 'actor_country', 'class_root_conflict'].includes(key)
      || !Number.isSafeInteger(n) || n < 1)
    || Object.values(p.rejected).reduce((sum, n) => sum + n, 0) !== p.quarantinedRows
    || new Set(p.quarantineIdHashes).size !== p.quarantineIdHashes.length) throw new Error('events_research_counts');
  let count = 0;
  const hashes = new Set();
  for (const g of p.groups) {
    if (typeof g.eventDay !== 'string' || !/^\d{8}$/u.test(g.eventDay)) throw new Error('events_research_group');
    parseTimestamp(`${g.eventDay}000000`);
    if (g.eventDay > p.day || (g.country !== null && !/^[A-Z]{2}$/u.test(g.country))
      || !validRoot(g.rootCode) || ![3, 4].includes(g.quadClass) || typeof g.crossActor !== 'boolean'
      || (g.quadClass === 4) !== (Number(g.rootCode) >= 15) || !Array.isArray(g.idHashes)) throw new Error('events_research_group');
    for (const h of g.idHashes) {
      if (!/^[a-f0-9]{64}$/u.test(h) || hashes.has(h)) throw new Error('events_research_ids');
      hashes.add(h); if (++count > 200000) throw new Error('events_research_day_record_budget');
    }
  }
  for (const h of p.quarantineIdHashes) if (!/^[a-f0-9]{64}$/u.test(h)) throw new Error('events_research_ids');
  if (count + p.duplicateIds > p.totalRows - p.quarantinedRows) throw new Error('events_research_counts');
  const stamps = p.provenance?.files;
  if (!Array.isArray(stamps) || stamps.length !== 96 || new Set(stamps.map(f => f.timestamp)).size !== 96) throw new Error('events_research_provenance');
  for (let i = 0; i < 96; i++) {
    const expected = formatTimestamp(parseTimestamp(`${p.day}000000`) + i * 900000);
    const f = stamps.find(x => x.timestamp === expected);
    if (!f || !/^[a-f0-9]{64}$/u.test(f.sha256) || !Number.isSafeInteger(f.bytes) || f.bytes < 100 || f.bytes > 2097152) throw new Error('events_research_provenance');
  }
  return p;
}

export function researchWindow(days, endDay) {
  const end = parseTimestamp(`${endDay}000000`), startDay = formatTimestamp(end - 6 * DAY).slice(0, 8);
  const ids = new Map(), quarantine = new Set(), countries = {}, broadCountries = {}, roots = {};
  let files = 0, quarantinedRows = 0, crossDayDuplicates = 0, conflictingIds = 0;
  let broadMaterial = 0, violence = 0, crossActorViolence = 0, verbal = 0, unknownCountry = 0;
  for (let offset = 0; offset < 7; offset++) {
    const day = formatTimestamp(end - (6 - offset) * DAY).slice(0, 8), a = days.get(day);
    if (!a) continue;
    const p = validateResearchDay(a);
    if (p.day !== day) throw new Error('events_research_cache_day');
    files += p.downloadedFiles; quarantinedRows += p.quarantinedRows;
    for (const h of p.quarantineIdHashes) quarantine.add(h);
    for (const g of p.groups) {
      const key = JSON.stringify([g.eventDay, g.country, g.rootCode, g.quadClass, g.crossActor]);
      for (const h of g.idHashes) {
        if (ids.has(h)) { crossDayDuplicates++; if (ids.get(h) !== key) conflictingIds++; continue; }
        ids.set(h, key);
        if (g.eventDay < startDay || g.eventDay > endDay) continue;
        if (g.quadClass === 3) { verbal++; continue; }
        broadMaterial++; roots[g.rootCode] = (roots[g.rootCode] || 0) + 1;
        if (g.country) broadCountries[g.country] = (broadCountries[g.country] || 0) + 1;
        if (!['18', '19', '20'].includes(g.rootCode)) continue;
        violence++; if (g.crossActor) crossActorViolence++;
        if (g.country) countries[g.country] = (countries[g.country] || 0) + 1;
        else unknownCountry++;
      }
    }
  }
  const ambiguousIds = [...quarantine].filter(h => ids.has(h)).length;
  const clean = files === 672 && quarantinedRows === 0 && conflictingIds === 0 && ambiguousIds === 0;
  return { startDay, endDay, downloadedFiles: files, expectedFiles: 672, quarantinedRows,
    crossDayDuplicates, conflictingIds, ambiguousIds, statisticallyQualified: clean,
    validSubsetCounts: { broadMaterial, violence, crossActorViolence, verbal, unknownCountry, countries, broadCountries, roots },
    qualifiedViolenceCount: clean ? violence : null, productionEligible: false };
}

const median = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), n = sorted.length;
  return n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
};
export function prepareResearchCalibration(days, endDay, cloudSamples = []) {
  const end = parseTimestamp(`${endDay}000000`);
  const sourceDays = Array.from({ length: 49 }, (_, i) => formatTimestamp(end - (48 - i) * DAY).slice(0, 8));
  const available = sourceDays.map(day => days.get(day)?.payload).filter(Boolean);
  // 30 training windows, 6 embargo end dates, 7 holdout windows require 49 source days.
  const windows = Array.from({ length: 43 }, (_, i) => researchWindow(days, formatTimestamp(end - (42 - i) * DAY).slice(0, 8)));
  const training = windows.slice(0, 30), embargo = windows.slice(30, 36), holdout = windows.slice(36);
  const usableTraining = training.filter(w => w.statisticallyQualified), usableHoldout = holdout.filter(w => w.statisticallyQualified);
  const descriptiveMedian = median(training.filter(w => w.downloadedFiles === 672 && w.conflictingIds === 0 && w.ambiguousIds === 0)
    .map(w => w.validSubsetCounts.violence));
  const referenceScale = usableTraining.length === 30 && usableHoldout.length === 7
    ? median(usableTraining.map(w => w.qualifiedViolenceCount)) : null;
  const scale = referenceScale > 0 ? referenceScale : null;
  const holdoutReplay = holdout.map(w => ({ endDay: w.endDay, statisticallyQualified: w.statisticallyQualified,
    violenceCount: w.qualifiedViolenceCount, candidateNormalizedPressure: scale !== null && w.statisticallyQualified
      ? Math.round(100 * w.qualifiedViolenceCount / (w.qualifiedViolenceCount + scale)) : null }));
  const cloudPairs = windows.filter(w => cloudSamples.some(s => s.day.replaceAll('-', '') === w.endDay)).map(w => {
    const c = cloudSamples.find(s => s.day.replaceAll('-', '') === w.endDay);
    return { endDay: w.endDay, cloudConflictCount: c.conflictEvents, eventsValidSubsetViolence: w.validSubsetCounts.violence,
      statisticallyQualified: w.statisticallyQualified, sameCountUnit: false, exactWindowParityVerified: false };
  });
  return { schemaVersion: 'gdelt-events-calibration-research-v2', definitionId: RESEARCH_DEFINITION,
    productionEligible: false, calibrationApproved: false, scoringConnected: false,
    sourceCoverage: { firstDay: sourceDays[0], lastDay: endDay, expectedDays: 49,
      archivedDays: available.length, missingDays: sourceDays.filter(day => !days.has(day)),
      sourceFiles: available.reduce((n, p) => n + p.downloadedFiles, 0),
      sourceRows: available.reduce((n, p) => n + p.totalRows, 0),
      quarantinedRows: available.reduce((n, p) => n + p.quarantinedRows, 0),
      compressedBytes: available.reduce((n, p) => n + p.provenance.files.reduce((s, f) => s + f.bytes, 0), 0) },
    cohort: { sourceDaysRequired: 49, trainingWindows: 30, embargoEndDays: 6, holdoutWindows: 7,
      trainingFirst: training[0].endDay, trainingLast: training.at(-1).endDay,
      holdoutFirst: holdout[0].endDay, holdoutLast: holdout.at(-1).endDay,
      sourcePeriodsDisjoint: training.at(-1).endDay < holdout[0].startDay,
      qualifiedTrainingWindows: usableTraining.length, qualifiedHoldoutWindows: usableHoldout.length },
    readiness: scale === null ? 'hold_missing_or_quarantined_source_data' : 'offline_candidate_ready_for_independent_model_review',
    descriptiveValidSubsetMedian: descriptiveMedian, proposedReferenceScale: scale, holdoutReplay, cloudPairs,
    windows, embargoEndDates: embargo.map(w => w.endDay),
    limitations: ['训练窗口内部重叠，30 个窗口不是 30 个独立样本；六日隔离使训练/检验底层日期不重叠。',
      '18–20 类新闻编码不等于战争或已核实冲突，包含国内暴力事件；跨演员国家仅作敏感性对照。',
      '隔离坏行不构成合格完整统计；有坏行的窗口不能拟合/冻结评分尺度。',
      'Cloud 配对只证明日期重合，不证明分类、七日窗口或国家聚合口径等价。'] };
}
