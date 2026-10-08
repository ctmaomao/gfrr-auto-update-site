const QUARTER = 15 * 60 * 1000;
export const EVENTS_CANDIDATE_POLICY = Object.freeze({
  schemaVersion: 'gdelt-events-candidate-v1', windowDays: 7, expectedFiles: 672,
  countUnit: 'unique_news_coded_event_records', countrySystem: 'FIPS_ActionGeo',
  dateBasis: 'DATEADDED_ingestion_window_with_SQLDATE_in_same_calendar_window',
  physicalViolenceConfirmed: false, materialConflictQuadClass: 4, verbalConflictQuadClass: 3,
  sourceKey: 'world_order_gdelt_events_candidate', assignedLayer: 'artifact_sanitizer_layer',
  affectsScoring: false, productionDataWriteApproved: false
});
export function parseTimestamp(value) {
  if (!/^\d{14}$/u.test(value)) throw new Error('events_timestamp_invalid');
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(8, 10)}:${value.slice(10, 12)}:${value.slice(12)}Z`;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().replace(/[-:T]/gu, '').slice(0, 14) !== value) throw new Error('events_timestamp_invalid');
  return ms;
}
export const formatTimestamp = ms => new Date(ms).toISOString().replace(/[-:T]/gu, '').slice(0, 14);
export function planEventsWindow(nowMs = Date.now(), endTimestamp) {
  if (!Number.isFinite(nowMs)) throw new Error('events_now_invalid');
  const end = endTimestamp ? parseTimestamp(endTimestamp) : Math.floor(nowMs / 86400000) * 86400000 - QUARTER;
  if (end >= nowMs || end % QUARTER !== 0) throw new Error('events_window_invalid');
  const start = end - (EVENTS_CANDIDATE_POLICY.expectedFiles - 1) * QUARTER;
  return { start: formatTimestamp(start), end: formatTimestamp(end),
    completeUtcDays: new Date(end).getUTCHours() === 23 && new Date(end).getUTCMinutes() === 45,
    timestamps: Array.from({ length: EVENTS_CANDIDATE_POLICY.expectedFiles }, (_, i) => formatTimestamp(start + i * QUARTER)) };
}
export function parseEventsTsv(text, timestamp) {
  parseTimestamp(timestamp);
  if (Buffer.byteLength(text) > 16 * 1024 * 1024) throw new Error('events_tsv_too_large');
  const records = [];
  // V2.0 is exactly 61 tab-separated fields. Never retain names, coordinates or SOURCEURL.
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const f = line.replace(/\r$/u, '').split('\t');
    if (f.length !== 61 || !/^\d{1,16}$/u.test(f[0]) || !/^[1-4]$/u.test(f[29])
      || !/^(?:0[1-9]|1\d|20)$/u.test(f[28]) || !/^[01]$/u.test(f[25])
      || !/^(?:[A-Z]{2})?$/u.test(f[53])) throw new Error('events_row_invalid');
    parseTimestamp(`${f[1]}000000`);
    if (f[59] !== timestamp || f[1] > timestamp.slice(0, 8)) throw new Error('events_date_invalid');
    records.push({ id: f[0], eventDay: f[1], country: f[53] || null, quadClass: Number(f[29]), rootCode: f[28] });
    if (records.length > 100000) throw new Error('events_row_limit');
  }
  return records;
}
export function aggregateEventsFiles(files, window, { latestTimestamp = null, nowMs = Date.now(), diagnostics = {} } = {}) {
  const expected = new Set(window.timestamps), seenFiles = new Set(), ids = new Map();
  const days = {}, eventDays = {}, countries = {}, rootCodes = {};
  let duplicateRecords = 0, invalidFiles = 0, conflictingDuplicateIds = 0, outsideEventDateWindow = 0;
  let materialConflictRecords = 0, verbalConflictRecords = 0, unknownCountryRecords = 0;
  for (const file of files) {
    if (!expected.has(file.timestamp) || seenFiles.has(file.timestamp)) throw new Error('events_file_scope_invalid');
    seenFiles.add(file.timestamp);
    if (!Array.isArray(file.records)) { invalidFiles++; continue; }
    const day = file.timestamp.slice(0, 8);
    days[day] ||= { files: 0, materialConflictRecords: 0, verbalConflictRecords: 0 };
    days[day].files++;
    for (const r of file.records) {
      if (ids.has(r.id)) {
        duplicateRecords++;
        if (JSON.stringify(ids.get(r.id)) !== JSON.stringify(r)) conflictingDuplicateIds++;
        continue;
      }
      ids.set(r.id, r);
      if (ids.size > 2000000) throw new Error('events_window_record_limit');
      if (r.eventDay < window.start.slice(0, 8) || r.eventDay > window.end.slice(0, 8)) { outsideEventDateWindow++; continue; }
      eventDays[r.eventDay] ||= { materialConflictRecords: 0, verbalConflictRecords: 0 };
      if (r.quadClass === 3) { verbalConflictRecords++; days[day].verbalConflictRecords++; eventDays[r.eventDay].verbalConflictRecords++; }
      if (r.quadClass !== 4) continue;
      materialConflictRecords++; days[day].materialConflictRecords++;
      eventDays[r.eventDay].materialConflictRecords++;
      rootCodes[r.rootCode] = (rootCodes[r.rootCode] || 0) + 1;
      if (!r.country) { unknownCountryRecords++; continue; }
      countries[r.country] = (countries[r.country] || 0) + 1;
    }
  }
  const successfulFiles = seenFiles.size - invalidFiles;
  const latestMs = latestTimestamp ? parseTimestamp(latestTimestamp) : null;
  const sourceFresh = latestMs !== null && nowMs >= latestMs && nowMs - latestMs <= 3 * 3600000 && latestTimestamp >= window.end;
  const windowCurrent = window.end === formatTimestamp(Math.floor(nowMs / 86400000) * 86400000 - QUARTER);
  const complete = successfulFiles === expected.size && invalidFiles === 0 && conflictingDuplicateIds === 0;
  return { ...EVENTS_CANDIDATE_POLICY, generatedAt: new Date(nowMs).toISOString(),
    status: complete && sourceFresh && windowCurrent && window.completeUtcDays ? 'candidate_complete_unapproved' : 'candidate_incomplete',
    window: { start: window.start, end: window.end, completeUtcDays: window.completeUtcDays },
    coverage: { expectedFiles: expected.size, successfulFiles, missingFiles: expected.size - successfulFiles,
      ratio: successfulFiles / expected.size, sourceFresh, windowCurrent, latestTimestamp, conflictingDuplicateIds },
    observedSubset: { materialConflictRecords, verbalConflictRecords, unknownCountryRecords,
      countries, rootCodes, byIngestionDay: days, byEventDay: eventDays, duplicateRecords, outsideEventDateWindow },
    qualifiedSevenDayMaterialConflictCount: complete && sourceFresh && windowCurrent && window.completeUtcDays ? materialConflictRecords : null,
    fatalities: null, score: null, calibrationApproved: false,
    diagnostics,
    limitations: ['新闻机器编码记录不等于实际冲突次数；按 ID 去重不等于真实世界事件合并。',
      '物质冲突包含多种 CAMEO 行为，不等于已确认武装冲突；国家为发生地 FIPS，不能用媒体来源国替代。',
      '只统计此采集窗口新收录且事件日期在窗口内的记录，不声称实际冲突完整覆盖。',
      '部分文件计数仅为已下载子集；缺失不等于零。原 Cloud 尺度不得复用。'] };
}
