import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { GAP_REASONS, replayEvidenceScores } from '../../scripts/bubble-watch/evidence-score-contract.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const checkerUrl = new URL('../../scripts/check-bubble-watch.mjs', import.meta.url);
const checker = fs.readFileSync(checkerUrl, 'utf8');
const bundle = JSON.parse(fs.readFileSync(new URL('../../docs/fixtures/bubble-watch/legacy-contract-bundle.json', import.meta.url)));
const bindings = {};
for (const match of checker.matchAll(/import\s+([\s\S]*?)\s+from\s+'([^']+)';/gu)) {
  const module = await import(match[2].startsWith('.') ? new URL(match[2], checkerUrl).href : match[2]);
  if (match[1].trim().startsWith('{')) {
    for (const key of match[1].replace(/[{}]/gu, '').split(',').map(s => s.trim()).filter(Boolean)) { const [original, alias = original] = key.split(/\s+as\s+/u); bindings[alias] = module[original]; }
  } else bindings[match[1].trim()] = module.default;
}
function run(files, config = { contractVersion: 'bubble-qualified-methods-v1', activeRevision: 0, approvedAbsSourceReviews: [], absObservation: null }) {
  const logs = [];
  const RealDate = globalThis.Date;
  class FrozenDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : ['2026-10-13T12:00:00Z'])); }
    static now() { return RealDate.parse('2026-10-13T12:00:00Z'); }
  }
  const fakeFs = { ...fs, readFileSync(file, ...args) {
    const relative = path.relative(root, file).replaceAll('\\', '/');
    if (relative === 'config/bubble-watch-methods.json') return JSON.stringify(config);
    if (Object.hasOwn(files, relative)) return JSON.stringify(files[relative]);
    return fs.readFileSync(file, ...args);
  } };
  let code = 0;
  try {
    globalThis.Date = FrozenDate;
    vm.runInNewContext(checker.replace(/import\s+[\s\S]*?\s+from\s+'[^']+';\s*/gu, '').replaceAll('import.meta.url', JSON.stringify(checkerUrl.href)), {
      ...bindings, fs: fakeFs, Date: FrozenDate, Buffer, URL,
      console: { log: line => logs.push(line), error: line => logs.push(line) },
      process: { env: {}, exit(value) { code = value; throw new Error('checker_exit'); } }
    }, { timeout: 10000 });
  } catch (error) { if (error.message !== 'checker_exit') throw error; }
  finally { globalThis.Date = RealDate; }
  return { code, logs: logs.join('\n') };
}
function pendingFiles() {
  const files = structuredClone(bundle.files);
  const data = files['data/bubble-watch.json'];
  const abs = data.indicators.find(i => i.id === 'dc_abs_spread');
  Object.assign(abs, { status: 'unknown', as_of: null, stale: false,
    evidence_gap: { reasonCode: GAP_REASONS.dc_abs_spread, policy: 'bubble-qualified-evidence-v1', checkedDate: data.as_of_date },
    provenance: { mode: 'auto', checkedAt: `${data.as_of_date}T13:22:04.262Z` } });
  const r = replayEvidenceScores(data.indicators, 1);
  data.contractVersion = 'bubble-watch-v3';
  Object.assign(data.summary, {
    primary_score_pct: r.primary, red_pct: r.primary, weighted_risk_score: r.pressure,
    primary_score_range_pct: r.primaryRange, weighted_risk_score_range: r.pressureRange,
    stage_score: r.stage, trigger_score: r.trigger, stage_score_range: r.stageRange, trigger_score_range: r.triggerRange,
    scoring_unknown_count: 1, unknown_count: 1, display_red_pct: null, display_weighted_risk_score: null,
    yellow_count: data.summary.yellow_count - 1, scoring_yellow_count: r.counts.yellow,
    category_scores: Object.fromEntries(Object.entries(r.categories).map(([k,v]) => [k,v.point])),
    category_score_ranges: Object.fromEntries(Object.entries(r.categories).map(([k,v]) => [k,{lower:v.lower,upper:v.upper}])),
    trigger_label: '待确认', trigger_label_en: 'Pending', momentum: { deteriorated:0, improved:0, net:0 }
  });
  data.summary.narrative_plan.evidenceGaps = r.unknownIds;
  data.summary.narrative_plan.evidenceHighlights = data.summary.narrative_plan.evidenceHighlights.filter(item=>!r.unknownIds.includes(item.id));
  data.summary.verdict_desc = '数据中心利差待确认。' + data.summary.verdict_desc;
  delete data.summary.weekly_editorial;
  Object.assign(data.scoring, { model_version:r.modelVersion, base_tier:r.baseTier, effective_tier:r.effectiveTier,
    override_active:r.overrideActive, two_axis_upgrade:r.twoAxisUpgrade, tier_range:r.tierRange, unknown_core_ids:r.unknownIds });
  const history = files['data/bubble-watch-history.json'];
  history.contractVersion = 'bubble-watch-history-v3';
  const last = structuredClone(history.entries.at(-1));
  Object.assign(last, { scoring_model_version:r.modelVersion, red_pct:null, risk_score:null, core_red_pct:null, core_risk_score:null,
    display_red_pct:null, display_risk_score:null, statuses:Object.fromEntries(data.indicators.map(i=>[i.id,i.status])) });
  Object.assign(last, { score_bounds: { primary:r.primaryRange, pressure:r.pressureRange, stage:r.stageRange, trigger:r.triggerRange },
    effective_tier:r.effectiveTier, tier_range:r.tierRange, unknown_core_ids:r.unknownIds,
    gap_metadata:{ dc_abs_spread: { as_of:abs.as_of, stale:abs.stale, evidence_gap:abs.evidence_gap, provenance:abs.provenance } } });
  history.entries.push(last);
  data.history_seed = [];
  return files;
}

test('real checker retains frozen v2 baseline and rejects changed score/shadow contracts', () => {
  const baseline = run(bundle.files);
  assert.equal(baseline.code, 0, baseline.logs);
  for (const mutate of [d => { d.summary.red_pct = 0; }, d => { d.scoring.shadow_policy = 'core'; }]) {
    const files = structuredClone(bundle.files); mutate(files['data/bubble-watch.json']);
    assert.equal(run(files).code, 1);
  }
});

test('real checker accepts registered v3 pending bounds and rejects false point/config/gap', () => {
  const files = pendingFiles();
  const config = { contractVersion:'bubble-qualified-methods-v1', activeRevision:1, approvedAbsSourceReviews:[], absObservation:null };
  const baseline = run(files, config);
  assert.equal(baseline.code, 0, baseline.logs);
  for (const mutate of [d=>{d.summary.narrative_plan.evidenceGaps=[];}, d=>{d.summary.primary_score_pct=0;}, d=>{d.summary.scoring_total_indicators=22;},
    d=>{d.summary.primary_score_range_pct.upper=30.4;}, d=>{d.indicators.find(i=>i.status==='unknown').as_of=d.as_of_date;}]) {
    const changed = structuredClone(files); mutate(changed['data/bubble-watch.json']);
    assert.equal(run(changed, config).code,1);
  }
  assert.equal(run(files).code,1);
  for (const mutate of [row=>{row.gap_metadata.dc_abs_spread.status='red';}, row=>{row.statuses.cape='green';}, row=>{row.score_bounds.primary.upper=0;}, row=>{row.gap_metadata.dc_abs_spread.provenance.checkedAt='2026-10-13T00:00:00Z';}]) {
    const changed=structuredClone(files); mutate(changed['data/bubble-watch-history.json'].entries.at(-1));
    assert.equal(run(changed,config).code,1);
  }
});
