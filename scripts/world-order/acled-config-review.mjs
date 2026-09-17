import { createHash } from 'node:crypto';
import { ACLED_WEEKLY_REGIONS } from './acled-weekly-coverage.mjs';
import { ACLED_MONTHLY_SLUGS } from './acled-download-manifest.mjs';

// artifact_sanitizer_layer: comparison of already normalized configurations, NOT
// workbook validation, source permission, a lock or a production admission gate.
export const ACLED_CONFIG_REVIEW_LIMITS = Object.freeze({ configBytes: 1024 * 1024, inputBytes: 5 * 1024 * 1024 });
const kinds = ['weekly', 'monthly'];
const sections = {
  weekly: ['version', 'source', 'sourceName', 'preparedBy', 'latestWeek', 'filesIngested', 'global', 'regionalLast4Weeks', 'hotZonesLast4Weeks', 'quality'],
  monthly: ['version', 'source', 'sourceName', 'preparedBy', 'asOfDate', 'latestFullYear', 'filesIngested', 'global', 'monthlyTrend', 'topEscalatingCountries', 'topFatalitiesCountries', 'quality'],
};
const sha = text => createHash('sha256').update(text).digest('hex');
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const exact = (v, keys) => object(v) && Object.keys(v).sort().join('|') === [...keys].sort().join('|');
function reject() { throw new Error('invalid_config_review_input'); }
function day(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(v)) reject();
  const d = new Date(`${v}T00:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== v) reject();
  return v;
}
function canonical(v, depth = 0) {
  if (depth > 24) reject();
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return v;
  if (typeof v === 'number') { if (!Number.isFinite(v)) reject(); return v; }
  if (Array.isArray(v)) return v.map(item => canonical(item, depth + 1));
  if (!object(v)) reject();
  return Object.fromEntries(Object.keys(v).sort().map(key => [key, canonical(v[key], depth + 1)]));
}
const digest = v => sha(JSON.stringify(canonical(v)));
function parse(text, kind) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > ACLED_CONFIG_REVIEW_LIMITS.configBytes) reject();
  const v = JSON.parse(text);
  if (!exact(v, [...sections[kind], 'preparedAt']) || v.version !== '1.0.0'
    || v.source !== `acled-aggregated-manual-normalized-${kind}`
    || !['manual', 'github-actions-acled-auto'].includes(v.preparedBy)
    || typeof v.preparedAt !== 'string' || !Number.isFinite(Date.parse(v.preparedAt))
    || !object(v.global) || !object(v.quality) || v.quality.isRealData !== true) reject();
  const date = day(v[kind === 'weekly' ? 'latestWeek' : 'asOfDate']);
  const id = kind === 'weekly' ? 'region' : 'slug';
  const identities = kind === 'weekly' ? ACLED_WEEKLY_REGIONS : ACLED_MONTHLY_SLUGS;
  if (!Array.isArray(v.filesIngested) || v.filesIngested.length !== 6) reject();
  const seen = new Set();
  for (const f of v.filesIngested) {
    if (!object(f) || !identities.includes(f[id]) || seen.has(f[id])
      || !Number.isSafeInteger(f.rowCount) || f.rowCount <= 0) reject();
    seen.add(f[id]);
    if (kind === 'weekly') {
      if (!Array.isArray(f.weekRange) || f.weekRange.length !== 2
        || day(f.weekRange[0]) > day(f.weekRange[1]) || f.weekRange[1] < date) reject();
    } else if (day(f.asOfDate) !== date) reject();
  }
  // Ignore only top-level preparation time. Key order is not semantic, while
  // array order remains significant (ranked lists and windows must not be sorted).
  const { preparedAt, ...semantic } = v;
  return { value: v, date, byteSha256: sha(text), semanticSha256: digest(semantic) };
}

export function reviewAcledConfigPair(input) {
  const boundaries = { networkRequests: 0, writesFiles: false, productionEligible: false,
    contentValidated: false, sourceRightsAssessed: false, freshnessAssessed: false,
    concurrencyProtected: false, baselineUpdated: false };
  try {
    if (!exact(input, ['baseline', 'candidate', 'expectedBaselineSha256'])
      || !exact(input.baseline, kinds) || !exact(input.candidate, kinds)) reject();
    const pin = input.expectedBaselineSha256;
    if (pin !== null && (!exact(pin, kinds) || kinds.some(k => typeof pin[k] !== 'string' || !/^[a-f0-9]{64}$/u.test(pin[k])))) reject();
    const reports = {};
    for (const kind of kinds) {
      const old = parse(input.baseline[kind], kind), next = parse(input.candidate[kind], kind);
      const changedSections = sections[kind].filter(key => digest(old.value[key]) !== digest(next.value[key]));
      const metadataChanged = ['version', 'source', 'sourceName', 'preparedBy', 'quality'].some(key => changedSections.includes(key));
      const unchanged = old.semanticSha256 === next.semanticSha256;
      const status = next.date < old.date ? 'date_regression' : unchanged ? 'unchanged'
        : next.date === old.date ? 'same_date_revision' : 'date_advanced';
      reports[kind] = { status, baselineDate: old.date, candidateDate: next.date,
        baselineByteSha256: old.byteSha256, candidateByteSha256: next.byteSha256,
        baselineSemanticSha256: old.semanticSha256, candidateSemanticSha256: next.semanticSha256,
        baselineMatchesPin: pin === null ? null : pin[kind] === old.byteSha256,
        changedSections, metadataChanged,
        rowCountChanges: next.value.filesIngested.filter(f => {
          const id = kind === 'weekly' ? 'region' : 'slug';
          return old.value.filesIngested.find(previous => previous[id] === f[id]).rowCount !== f.rowCount;
        }).length };
    }
    const list = Object.values(reports);
    const status = list.some(r => r.baselineMatchesPin === false) ? 'baseline_changed_hold'
      : list.some(r => r.status === 'date_regression') ? 'date_regression_hold'
        : list.every(r => r.status === 'unchanged') ? 'unchanged' : 'review_required';
    return { schemaVersion: 'acled-config-pair-review-v1', status, ...reports, boundaries };
  } catch {
    return { schemaVersion: 'acled-config-pair-review-v1', status: 'invalid', reason: 'invalid_config_review_input', boundaries };
  }
}
