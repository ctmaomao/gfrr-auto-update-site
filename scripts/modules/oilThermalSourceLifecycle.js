// Source lifecycle and display health only. No scoring or automatic baseline migration.
export const FIRMS_SNPP_RETIRED_AT = '2026-11-02T15:40:00Z';
export const FIRMS_LEGACY_BASELINE_SOURCES = Object.freeze(['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT']);
export function isRetiredFirmsSource(source, atMs = Date.now()) {
  return source === 'VIIRS_SNPP_NRT' && Number.isFinite(atMs) && atMs >= Date.parse(FIRMS_SNPP_RETIRED_AT);
}
export function matchesLegacyThermalSources(sources) {
  return Array.isArray(sources) && sources.length === FIRMS_LEGACY_BASELINE_SOURCES.length
    && new Set(sources).size === sources.length && FIRMS_LEGACY_BASELINE_SOURCES.every(source => sources.includes(source));
}
export function thermalObservationHealth(data, nowMs = Date.now()) {
  if (!data || typeof data !== 'object') return { usable: false, reason: 'missing', text: '卫星观察未加载' };
  const generated = typeof data.generatedAt === 'string' ? Date.parse(data.generatedAt) : NaN;
  if (!Number.isFinite(generated) || !Number.isFinite(nowMs) || generated > nowMs) return { usable: false, reason: 'clock', text: '卫星观察时点待核' };
  if (generated >= Date.parse(FIRMS_SNPP_RETIRED_AT)) return { usable: false, reason: 'source_transition', text: 'S-NPP 已停源 · 两源与旧三源基线不可直接比较' };
  if (!matchesLegacyThermalSources(data.sources)) return { usable: false, reason: 'source_set', text: '卫星源组合缺失或改变 · 基线不可比' };
  const window = data.freshness?.windowDays;
  if (!Number.isFinite(window) || window <= 0 || nowMs - generated > window * 86400000) return { usable: false, reason: 'stale', text: '卫星观察已超查询窗口 · 仅作历史参考' };
  if (data.status !== 'ok' || data.sourceStatus?.firms !== 'live' || data.aggregate?.requestErrorCount !== 0) return { usable: false, reason: 'partial', text: '卫星来源不完整 · 不能判断有无异常' };
  return { usable: true, reason: null, text: '卫星观察可读 · 仍非事故确认' };
}
