export const EXTERNAL_AI_LEGACY_PRODUCTION_CONTRACT = {
  schemaVersion: 'v28.0L-external-ai-production-1',
  sourceMode: 'manual_local_compact',
  inputSource: 'local_compact',
  sourceSemantics: 'site_structured_data_compact_summary',
  requiredAuditFlags: ['site_structured_data_only'],
};

export const EXTERNAL_AI_ANALYST_PRODUCTION_CONTRACT = {
  schemaVersion: 'v28.0L-external-ai-production-analyst-1',
  sourceMode: 'manual_analyst_compact_v1',
  inputSource: 'analyst_compact_v1',
  sourceSemantics: 'site_structured_analyst_evidence_pack_v1',
  requiredAuditFlags: ['site_structured_data_only', 'analyst_compact_v1'],
  maxConfidenceScore: 45,
};

export const EXTERNAL_AI_PRODUCTION_MODEL = 'deepseek-v4-flash';

export const EXTERNAL_AI_PRODUCTION_CONTRACTS = [
  EXTERNAL_AI_LEGACY_PRODUCTION_CONTRACT,
  EXTERNAL_AI_ANALYST_PRODUCTION_CONTRACT,
];

export const ALLOWED_EXTERNAL_AI_PRODUCTION_SCHEMA_VERSIONS = new Set(
  EXTERNAL_AI_PRODUCTION_CONTRACTS.map((contract) => contract.schemaVersion),
);

export const ALLOWED_EXTERNAL_AI_PRODUCTION_SOURCE_MODES = new Set([
  'manual_artifact',
  EXTERNAL_AI_LEGACY_PRODUCTION_CONTRACT.sourceMode,
  EXTERNAL_AI_ANALYST_PRODUCTION_CONTRACT.sourceMode,
  'disabled',
]);

export const ALLOWED_EXTERNAL_AI_PRODUCTION_INPUT_SOURCES = new Set([
  EXTERNAL_AI_LEGACY_PRODUCTION_CONTRACT.inputSource,
  EXTERNAL_AI_ANALYST_PRODUCTION_CONTRACT.inputSource,
  'fixture_sample',
  null,
]);

export const ALLOWED_EXTERNAL_AI_PRODUCTION_SOURCE_SEMANTICS = new Set([
  EXTERNAL_AI_LEGACY_PRODUCTION_CONTRACT.sourceSemantics,
  EXTERNAL_AI_ANALYST_PRODUCTION_CONTRACT.sourceSemantics,
  'sample_fixture',
  null,
]);

export function isAnalystExternalAiProductionLayer(layer) {
  if (!layer || typeof layer !== 'object') return false;
  const auditFlags = Array.isArray(layer.auditFlags) ? layer.auditFlags : [];
  return (
    layer.schemaVersion === EXTERNAL_AI_ANALYST_PRODUCTION_CONTRACT.schemaVersion ||
    layer.sourceMode === EXTERNAL_AI_ANALYST_PRODUCTION_CONTRACT.sourceMode ||
    layer.inputSource === EXTERNAL_AI_ANALYST_PRODUCTION_CONTRACT.inputSource ||
    layer.sourceSemantics === EXTERNAL_AI_ANALYST_PRODUCTION_CONTRACT.sourceSemantics ||
    auditFlags.includes('analyst_compact_v1')
  );
}

export function resolveExternalAiProductionContract(layer) {
  for (const contract of EXTERNAL_AI_PRODUCTION_CONTRACTS) {
    if (
      layer?.schemaVersion === contract.schemaVersion &&
      layer?.sourceMode === contract.sourceMode &&
      layer?.inputSource === contract.inputSource &&
      layer?.sourceSemantics === contract.sourceSemantics
    ) {
      return contract;
    }
  }
  return null;
}

export function validateExternalAiProductionContractCoherence(layer) {
  const analystLike = isAnalystExternalAiProductionLayer(layer);
  const localLike =
    layer?.sourceMode === EXTERNAL_AI_LEGACY_PRODUCTION_CONTRACT.sourceMode ||
    layer?.inputSource === EXTERNAL_AI_LEGACY_PRODUCTION_CONTRACT.inputSource ||
    layer?.sourceSemantics === EXTERNAL_AI_LEGACY_PRODUCTION_CONTRACT.sourceSemantics;

  if (!analystLike && !localLike) return [];

  const expected = analystLike
    ? EXTERNAL_AI_ANALYST_PRODUCTION_CONTRACT
    : EXTERNAL_AI_LEGACY_PRODUCTION_CONTRACT;
  const errors = [];

  for (const field of ['schemaVersion', 'sourceMode', 'inputSource', 'sourceSemantics']) {
    if (layer?.[field] !== expected[field]) {
      errors.push(`${field} must be ${expected[field]} for ${expected.inputSource}`);
    }
  }

  return errors;
}
