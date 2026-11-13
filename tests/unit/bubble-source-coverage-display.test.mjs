import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const page = fs.readFileSync(new URL('../../bubble-watch.html', import.meta.url), 'utf8');
const code = page.slice(page.indexOf('function strictEvidenceDate('), page.indexOf('function evidenceFreshnessAtAudit('))
  + page.slice(page.indexOf('function sourceCoverageNotice('), page.indexOf('function buildBubbleFreshnessView('));
const notice = vm.runInNewContext(`${code}; sourceCoverageNotice`);
const now = Date.parse('2026-11-13T23:00:00Z');
const fixture = id => ({ id, as_of: '2026-11-08', status: 'green', value_display: '0 项已确认事件',
  provenance: { mode: 'auto_fallback', evidenceGate: { policy: 'bubble-evidence-gap-v1',
    reasonCode: id === 'vc_ai_share' ? 'vc_current_period_unconfirmed' : 'neocloud_current_coverage_unconfirmed',
    checkedAt: '2026-11-10', checks: [{ source: 'registered source', status: 'ok' }] } } });

test('retained Neocloud zero visibly discloses incomplete current coverage without rewriting the record', () => {
  const item = fixture('neocloud_credit'), before = structuredClone(item);
  assert.match(notice(item, now), /更新核验 2026-11-10/);
  assert.match(notice(item, now), /未取得完整的近期公司覆盖/);
  assert.match(notice(item, now), /0 项不代表当前已确认没有信用事件/);
  assert.match(notice(item, now), /灯色与分数保留发布口径/);
  assert.deepEqual(item, before);
});
test('VC fallback explains period coverage instead of claiming a broken source', () => {
  assert.match(notice(fixture('vc_ai_share'), now), /同一期间的合格全球 AI 创投占比/);
  assert.doesNotMatch(notice(fixture('vc_ai_share'), now), /故障|HTTP|hybrid_live/);
});
test('normal auto and curated observations do not acquire fallback warnings', () => {
  for (const mode of ['auto', 'curated', undefined]) {
    const item = fixture('neocloud_credit'); item.provenance.mode = mode;
    assert.equal(notice(item, now), '');
  }
  assert.equal(notice(null, now), '');
});
test('unknown, mismatched or failed-source diagnostics use safe generic wording', () => {
  for (const mutate of [
    item => { item.provenance.evidenceGate.reasonCode = '<script>secret</script>'; },
    item => { item.provenance.evidenceGate.policy = 'unexpected'; },
    item => { item.id = 'vc_ai_share'; },
    item => { item.provenance.evidenceGate.checks[0].status = 'fetch_failed'; },
    item => { delete item.provenance.evidenceGate; }
  ]) {
    const item = fixture('neocloud_credit'); mutate(item);
    item.provenance.reason = 'HTTP 403 private URL secret';
    const text = notice(item, now);
    assert.match(text, /本轮未取得合格更新/);
    assert.doesNotMatch(text, /完整的近期公司覆盖|script|secret|HTTP|403/);
  }
});
test('missing, impossible, future or contradictory verification dates never appear verified', () => {
  for (const checkedAt of [null, '', '2026-02-30', '2026-11-14', '2026-11-07']) {
    const item = fixture('neocloud_credit'); item.provenance.evidenceGate.checkedAt = checkedAt;
    assert.match(notice(item, now), /更新核验日期待确认/);
  }
  assert.match(notice(fixture('neocloud_credit'), NaN), /更新核验日期待确认/);
});
test('diagnostic is escaped visible card prose, not a hover-only label', () => {
  assert.match(page, /class="note source-coverage-notice">\$\{escapeHtml\(coverageNotice\)\}/);
});
