import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { repairCurrentBubbleEvidenceCopy } from '../../scripts/bubble-watch/evidence-copy-migration.mjs';
import { buildEditorialScoringSnapshot } from '../../scripts/bubble-watch/editorial-score-snapshot.mjs';
const read = () => JSON.parse(fs.readFileSync(new URL('../../data/bubble-watch.json', import.meta.url)));
// Reconstruct only legacy display text in a synthetic test copy, so a repaired
// production snapshot cannot turn the migration regression into a no-op.
function legacyCopy() {
  const input = read();
  const spread = input.indicators.find(row => row.id === 'spy_vs_rsp_6m');
  const oldSpread = `${spread.provenance.detail.spread > 0 ? '+' : ''}${spread.provenance.detail.spread.toFixed(1)}%`;
  input.summary.verdict_desc = input.summary.verdict_desc.replace(`${spread.name_zh}为${spread.value_display}`, `${spread.name_zh}为${oldSpread}`);
  spread.value_display = oldSpread;
  spread.threshold_text = '差值绝对值:>10% 红 / 5-10% 黄 / <5% 绿';
  input.indicators.find(row => row.id === 'cloud_rpo_growth').name_zh = '云厂商递延收入增速';
  input.indicators.find(row => row.id === 'ai_ipo_pipeline').name_zh = 'AI 一级市场发行';
  return input;
}
const affected = new Set(['spy_vs_rsp_6m', 'cloud_rpo_growth', 'ai_ipo_pipeline', 'hy_oas']);

function protectedValues(value, path = '', out = {}) {
  if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) protectedValues(child, `${path}/${key}`, out);
  else if (typeof value !== 'string' || /(?:[Dd]ate|[Aa]t|as_of|status|stale|score|axis|category|id)(?:\/|$)/u.test(path)) out[path] = value;
  return out;
}

test('bounded copy repair preserves every numeric value, scoring, observation clock and historical issue', () => {
  const input = legacyCopy();
  // Test-only isolation models the coordinator’s separately reviewed quarantine.
  delete input.summary.weekly_editorial;
  input.summary.previous_weekly_editorial = { output: { detailZh: '原始历史正文：递延收入 -6.5%' }, sourceSnapshotDigest: 'unchanged historical identity' };
  const before = structuredClone(input);
  const output = repairCurrentBubbleEvidenceCopy(input);
  assert.deepEqual(input, before);
  assert.deepEqual(protectedValues(output), protectedValues(before));
  assert.deepEqual(buildEditorialScoringSnapshot(output), buildEditorialScoringSnapshot(before));
  assert.deepEqual(output.summary.previous_weekly_editorial, before.summary.previous_weekly_editorial);
  for (const row of output.indicators) {
    const old = before.indicators.find(other => row.id === other.id);
    assert.deepEqual(row.provenance, old.provenance);
    if (!affected.has(row.id)) assert.deepEqual(row, old);
  }
  const spread = output.indicators.find(row => row.id === 'spy_vs_rsp_6m');
  assert.ok(output.summary.verdict_desc.includes(`${spread.name_zh}为${spread.value_display}`));
  assert.match(spread.value_display, /个百分点$/u);
  assert.match(output.indicators.find(row => row.id === 'cloud_rpo_growth').name_zh, /剩余履约义务/u);
  assert.deepEqual(repairCurrentBubbleEvidenceCopy(output), output);
});

test('copy repair refuses active AI issue and inconsistent return provenance', () => {
  const input = read();
  input.summary.weekly_editorial ||= { output: {} };
  assert.throws(() => repairCurrentBubbleEvidenceCopy(input), /quarantined/u);
  delete input.summary.weekly_editorial;
  input.indicators.find(row => row.id === 'spy_vs_rsp_6m').provenance.detail.spread = 999;
  assert.throws(() => repairCurrentBubbleEvidenceCopy(input), /signed return/u);
});
