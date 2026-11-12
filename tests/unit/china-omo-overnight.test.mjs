import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../scripts/run-daily-pipeline.mjs', import.meta.url), 'utf8');
const constant = name => source.match(new RegExp(`const ${name} =\\s+[\\s\\S]*?;\n`))[0];
function fn(name) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf('\nfunction ', start + 1);
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end);
}
const names = ['CHINA_OMO_SOURCE', 'CHINA_OMO_DISPLAY_NOTE', 'CHINA_OMO_FRESH_DAYS', 'CHINA_OMO_RATE_MIN', 'CHINA_OMO_RATE_MAX', 'CHINA_OMO_AMOUNT_MAX_YI', 'CHINA_OMO_OPERATION_RE', 'CHINA_OMO_RATE_RE', 'CHINA_OMO_INTEXT_DATE_RE', 'CHINA_OMO_OPERATION_TYPES'];
const functions = ['dateOnlyIso', 'dateOnlyToIso', 'dateOnlyAgeDays', 'isFreshDateOnly', 'normalizeChinaOmoPlainText', 'chinaOmoDateOnlyFromYmd', 'isPlausibleChinaOmoOperationRate', 'isFreshChinaOmo', 'parseChinaOmoOpDateFromText', 'parseChinaOmoText'];
const parse = vm.runInNewContext(`${names.map(constant).join('\n')}\n${functions.map(fn).join('\n')}\nparseChinaOmoText`, { isoNow: '2026-11-12T09:00:00Z' });
const link = { publishedAt: '2026-11-12T09:22:09+08:00' };

test('explicit overnight reverse repo maps to one-day tenor with gross amount and rate', () => {
  const result = parse('11月12日央行开展3840亿元隔夜逆回购操作，操作利率为1.25%。', link);
  assert.equal(result.termDays, 1);
  assert.equal(result.operationAmount, 3840);
  assert.equal(result.operationRate, 0.0125);
  assert.equal(result.opDate, '2026-11-12');
  assert.equal(result.sourceStatus, 'live');
  assert.equal(result.source, 'EastMoney:OMO-aggregated-news');
});
test('existing numeric terms and unit conversion remain unchanged', () => {
  for (const term of [1, 7, 14, 28]) {
    const result = parse(`央行开展了1.2万亿元${term}天期逆回购操作，中标利率为1.4%。`, link);
    assert.equal(result.termDays, term);
    assert.equal(result.operationAmount, 12000);
    assert.equal(result.operationRate, 0.014);
  }
});
test('no guessed term, unknown instrument or missing rate is accepted', () => {
  for (const text of ['央行开展3840亿元逆回购操作，操作利率为1.25%。', '央行开展3840亿元隔夜MLF操作，操作利率为1.25%。', '央行开展3840亿元隔夜逆回购操作。']) assert.throws(() => parse(text, link));
});
test('overnight does not relax stale-date or plausible-value guards', () => {
  const text = '央行开展3840亿元隔夜逆回购操作，操作利率为1.25%。';
  assert.throws(() => parse(text, { publishedAt: '2026-11-01T09:00:00+08:00' }), /stale/);
  assert.throws(() => parse(text, { publishedAt: '2026-11-13T09:00:00+08:00' }), /stale/);
  assert.throws(() => parse(text.replace('3840', '0'), link), /invalid operationAmount/);
  assert.throws(() => parse(text.replace('1.25%', '99%'), link), /out of plausible range/);
});
