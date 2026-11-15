// Source lifecycle only. No scoring or automatic baseline migration.
export const FIRMS_SNPP_RETIRED_AT = '2026-11-02T15:40:00Z';
export const FIRMS_LEGACY_BASELINE_SOURCES = Object.freeze(['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT']);
export function isRetiredFirmsSource(source, atMs = Date.now()) {
  return source === 'VIIRS_SNPP_NRT' && Number.isFinite(atMs) && atMs >= Date.parse(FIRMS_SNPP_RETIRED_AT);
}
export function matchesLegacyThermalSources(sources) {
  return Array.isArray(sources) && sources.length === FIRMS_LEGACY_BASELINE_SOURCES.length
    && new Set(sources).size === sources.length && FIRMS_LEGACY_BASELINE_SOURCES.every(source => sources.includes(source));
}
