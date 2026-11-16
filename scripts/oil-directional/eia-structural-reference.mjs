// Structural research reference: manually transcribed, pinned snapshot.
// No I/O, source refresh, route weights, global sum, scoring, or prediction.
const SOURCE = Object.freeze({
  sourceUrl: 'https://www.eia.gov/outlooks/steo/report/energysecurity/article.php',
  snapshotHash: '812535df648559d204165128b3f5f8835c8aab846107feb082670b80d998bd85',
  snapshotBytes: 78814,
  retrievedAt: '2026-11-16T00:29:31.053Z',
  topicReleaseDate: '2026-08-12',
  surroundingSteoReleaseDate: '2026-11-10',
  firstSeenInThisDataset: '2026-11-16T00:29:31.053Z',
  providerFirstPublishedAt: null,
  sourceVintageVerified: false,
  historicalAsOfEligible: false,
  eligibleForEvaluation: false,
  eligibleForMainScore: false
});
const GEOGRAPHIES = new Set(['strait_of_hormuz', 'suez_canal_and_sumed_pipeline', 'turkish_straits_dardanelles', 'strait_of_malacca', 'bab_el_mandeb']);
const OIL_UNIT = 'million barrels per day';
const LNG_UNIT = 'billion cubic feet per day';
const ROUNDING = Object.freeze({
  method: 'assumed_nearest_0.1', step: 0.1, providerRoundingVerified: false,
  boundaryConvention: 'closed_conservative_envelope_not_verified_tie_rule'
});
const TABLE_TITLES = Object.freeze({
  2: 'Table 2. Volume of crude oil and petroleum liquids transported through world chokepoints and the Cape of Good Hope, 1Q25–2Q26',
  3: 'Table 3. Volume of crude oil, condensate, petroleum products, and liquefied natural gas transported through the Strait of Malacca, 1Q25–2Q26',
  4: 'Table 4. Volume of crude oil, condensate, petroleum products, and liquefied natural gas transported through the Strait of Hormuz, 1Q25–2Q26',
  5: 'Table 5. Volume of crude oil, condensate, petroleum products, and liquefied natural gas transported through the Suez Canal and SUMED pipeline, 1Q25–2Q26',
  6: 'Table 6. Volume of crude oil, condensate, petroleum products, and liquefied natural gas transported through the Bab el-Mandeb Strait, 1Q25–2Q26',
  8: 'Table 8. Volume of crude oil, condensate, petroleum products, and liquefied natural gas transported through the Turkish Straits (Dardanelles), 1Q25–2Q26'
});
const ENTRIES = [
  [4, 'Total oil flows through the Strait of Hormuz', '2Q26', '4.9', OIL_UNIT, 'strait_of_hormuz', 'total_oil_flows'],
  [4, 'Crude oil and condensate', '2Q26', '3.7', OIL_UNIT, 'strait_of_hormuz', 'crude_oil_and_condensate'],
  [4, 'Petroleum products', '2Q26', '1.1', OIL_UNIT, 'strait_of_hormuz', 'petroleum_products'],
  [5, 'Total oil flows through the Suez Canal and SUMED pipeline', '2Q26', '5.8', OIL_UNIT, 'suez_canal_and_sumed_pipeline', 'total_oil_flows'],
  [8, 'Total oil flows through the Turkish Straits (Dardanelles)', '2Q26', '4.1', OIL_UNIT, 'turkish_straits_dardanelles', 'total_oil_flows'],
  [2, 'Strait of Malacca', '4Q25', '24.9', OIL_UNIT, 'strait_of_malacca', 'total_oil_flows'],
  [3, 'Total oil flows through the Strait of Malacca', '4Q25', '24.0', OIL_UNIT, 'strait_of_malacca', 'total_oil_flows'],
  [3, 'Crude oil and condensate', '4Q25', '18.0', OIL_UNIT, 'strait_of_malacca', 'crude_oil_and_condensate'],
  [3, 'Petroleum products', '4Q25', '6.9', OIL_UNIT, 'strait_of_malacca', 'petroleum_products'],
  [6, 'LNG flows through the Bab el-Mandeb Strait (billion cubic feet per day)', '2Q26', '-', LNG_UNIT, 'bab_el_mandeb', 'lng']
];
function quarter(column) {
  if (!/^[1-4]Q\d{2}$/.test(column)) throw new Error('Invalid reference quarter');
  const year = 2000 + Number(column.slice(2)), q = Number(column[0]);
  return { label: `${year}Q${q}`, start: new Date(Date.UTC(year, (q - 1) * 3, 1)).toISOString(),
    endExclusive: new Date(Date.UTC(year, q * 3, 1)).toISOString(), observationCoverageVerified: false };
}
function valueOf(raw) {
  if (raw === '-') return null;
  if (typeof raw !== 'string' || !/^\d{1,4}\.\d$/.test(raw)) throw new Error('Invalid reference numeric cell');
  return Number(raw);
}
export function getEiaStructuralReference() {
  return {
    schemaVersion: 'eia-structural-reference-v1', layer: 'research_structural_reference', mode: 'research_only_pinned_reference',
    ...SOURCE, annualOrQuarterlyScale: 'quarterly_estimated_flow_not_live',
    geographicalCoverage: 'selected_table_cells_not_global_inventory',
    independentSourceCount: null, globalOilTotal: null, routeWeights: null, pricePrediction: null,
    limitations: ['topic_date_is_not_verified_cell_vintage', 'first_seen_is_this_dataset_receipt_not_provider_publication',
      'overlapping_routes_must_not_be_summed', 'portwatch_not_used_as_an_independent_source_here',
      'suez_sumed_is_not_suez_only', 'dardanelles_is_not_bosporus', 'rounding_compatibility_does_not_repair_source'],
    records: ENTRIES.map(([table, row, column, rawValue, rawUnit, geographicScope, productScope]) => ({
      recordId: `table-${table}:${geographicScope}:${productScope}:${column}`, ...SOURCE,
      table, tableTitle: TABLE_TITLES[table], row, column, rawValue, rawUnit, value: valueOf(rawValue),
      valueStatus: rawValue === '-' ? 'source_dash_meaning_unspecified' : 'reported_rounded_estimate',
      geographicScope, productScope, period: quarter(column),
      provenance: table === 2 ? 'EIA_STEO_and_EIA_analysis_using_Vortexa_and_Panama_Canal_Authority' : 'EIA_analysis_using_Vortexa',
      unitSource: rawUnit === LNG_UNIT ? 'row_label_overrides_table_header' : 'table_header'
    }))
  };
}
function context(record) {
  if (!record || record.sourceUrl !== SOURCE.sourceUrl || record.snapshotHash !== SOURCE.snapshotHash
      || record.rawUnit !== OIL_UNIT || !['total_oil_flows', 'crude_oil_and_condensate', 'petroleum_products'].includes(record.productScope)) {
    throw new Error('Incompatible reference context');
  }
  if (!GEOGRAPHIES.has(record.geographicScope) || !Number.isInteger(record.table) || record.table < 2 || record.table > 8
      || record.recordId !== `table-${record.table}:${record.geographicScope}:${record.productScope}:${record.column}`) throw new Error('Invalid reference identity');
  const pinned = ENTRIES.find(([table, row, column, rawValue, rawUnit, geographicScope, productScope]) =>
    record.table === table && record.row === row && record.column === column && record.rawValue === rawValue
      && record.rawUnit === rawUnit && record.geographicScope === geographicScope && record.productScope === productScope);
  if (!pinned || record.tableTitle !== TABLE_TITLES[record.table]) throw new Error('Cell does not match the pinned snapshot');
  const period = quarter(record.column);
  if (JSON.stringify(period) !== JSON.stringify(record.period) || valueOf(record.rawValue) !== record.value) throw new Error('Invalid reference cell');
  return JSON.stringify([record.snapshotHash, record.geographicScope, record.column, record.rawUnit]);
}
function interval(record) {
  const value = valueOf(record.rawValue);
  if (value === null) return null;
  // Integer hundredths avoid floating-point false conflicts at decimal boundaries.
  const center = Math.round(value * 10) * 10;
  return { lowerHundredths: Math.max(0, center - 5), upperHundredths: center + 5 };
}
function comparison(records, componentMode, syntheticFixture = false) {
  const base = { syntheticFixtureOnly: syntheticFixture, semanticEquivalenceVerified: false,
    comparisonBasis: componentMode ? 'declared_total_and_components' : 'nominal_oil_totals_preserving_original_table_definitions', roundingAssumption: { ...ROUNDING }, correctedValue: null, eligibleForEvaluation: false,
    eligibleForMainScore: false, result: 'incomparable', intervals: null };
  try {
    if (!Array.isArray(records) || records.length !== (componentMode ? 3 : 2)) return base;
    if (!syntheticFixture) {
      const key = context(records[0]);
      if (!records.every(record => context(record) === key) || new Set(records.map(r => r.recordId)).size !== records.length) return base;
    }
    const products = records.map(r => r.productScope);
    if (!syntheticFixture && (products[0] !== 'total_oil_flows' || (componentMode
      ? products.slice(1).sort().join('|') !== 'crude_oil_and_condensate|petroleum_products'
      : products[1] !== 'total_oil_flows'))) return base;
    const ranges = records.map(interval);
    if (ranges.some(range => range === null)) return { ...base, result: 'unknown_missing_value' };
    const a = ranges[0], b = componentMode
      ? { lowerHundredths: ranges[1].lowerHundredths + ranges[2].lowerHundredths, upperHundredths: ranges[1].upperHundredths + ranges[2].upperHundredths }
      : ranges[1];
    const overlap = Math.max(a.lowerHundredths, b.lowerHundredths) <= Math.min(a.upperHundredths, b.upperHundredths);
    return { ...base, result: overlap ? 'compatible_under_rounding_assumption' : 'conflict_under_rounding_assumption',
      intervals: [a, b].map(r => ({ lower: r.lowerHundredths / 100, upper: r.upperHundredths / 100, unit: OIL_UNIT })) };
  } catch { return base; }
}
export function compareRoundedOilComponents(total, crudeAndCondensate, petroleumProducts) {
  return comparison([total, crudeAndCondensate, petroleumProducts], true);
}
export function compareAlternativeOilTotals(first, second) { return comparison([first, second], false); }

// Arithmetic fixtures are explicitly separate from pinned-source comparisons;
// callers cannot relabel edited cells as evidence from the audited snapshot.
export function compareSyntheticRoundedOilCells(totalRaw, crudeRaw, productsRaw) {
  return comparison([totalRaw, crudeRaw, productsRaw].map(rawValue => ({ rawValue })), true, true);
}
