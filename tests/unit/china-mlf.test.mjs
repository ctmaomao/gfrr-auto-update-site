import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMlfOperation, isFreshMlfDates, findMlfCandidate } from '../../scripts/daily/china-mlf.mjs';

const nowMs = Date.parse('2026-09-05T10:00:00Z');
const link = { publishedAt: '2026-09-05T08:00:00+08:00' };
const operation = '2026年8月25日，央行开展5000亿元1年期MLF操作。';
const parse = (plain, candidate = link, options = { nowMs }) => parseMlfOperation(plain, candidate, options);
const row = (id, summaryText = '买断式逆回购新闻，背景提到MLF到期。', title = '逆回购消息') => ({
  code: `20260905${String(id).padStart(8, '0')}`, url: `https://finance.eastmoney.com/a/20260905${String(id).padStart(8, '0')}.html`,
  title, summaryText, publishedAt: link.publishedAt, dateRaw: '2026-09-05 08:00:00'
});
const parseCandidate = (text, candidate) => ({ ...parse(text, candidate), sourceStatus: 'live' });

test('gross MLF amount, inline term and nullable rate preserve the display contract', () => {
  const value = parse(`${operation}当月MLF到期4000亿元，实现净投放1000亿元。`);
  assert.deepEqual(value, { opDate: '2026-08-25', publishedAt: link.publishedAt, updatedAt: link.publishedAt,
    operationAmountYi: 5000, termMonths: 12, mlfRate: null });
  assert.equal(parse(operation.replace('5000亿元1年期MLF', '0.5万亿元一年期中期借贷便利（MLF）')).operationAmountYi, 5000);
  assert.equal(parse(operation.replace('1年期', '六个月期')).termMonths, 6);
  assert.throws(() => parse('2026年8月25日，MLF到期5000亿元，实现净投放1000亿元，期限1年。'));
});

test('explicit adjoining term/rate continuations are allowed but limited to this operation', () => {
  const value = parse('2026年8月25日，央行开展5000亿元MLF操作。期限为1年。中标利率为1.75%。');
  assert.equal(value.termMonths, 12);
  assert.equal(value.mlfRate, 0.0175);
  assert.equal(parse('2026年8月25日，央行开展5000亿元MLF操作。本次操作期限为一年，中标利率1.75%。').mlfRate, 0.0175);
  assert.throws(() => parse('2026年8月25日，央行开展5000亿元MLF操作。另有市场分析。期限为1年。'));
  assert.equal(parse(`${operation}期限为1年。中标利率未披露。操作利率2.0%。`).mlfRate, null);
});

test('other monetary tools and new operations cut term and rate extraction immediately', () => {
  for (const text of [
    '2026年8月25日，央行开展5000亿元MLF操作。另开展2000亿元买断式逆回购，期限6个月，中标利率1.4%。',
    '2026年8月25日，央行开展5000亿元MLF操作，另开展2000亿元6个月期买断式逆回购。',
    '2026年8月25日，央行开展5000亿元MLF操作，SLF期限1年，中标利率1.4%。',
    '2026年8月25日，央行开展5000亿元MLF操作，另有6个月期逆回购，中标利率1.4%。'
  ]) assert.throws(() => parse(text));
  const value = parse('2026年8月25日，央行开展5000亿元1年期MLF操作，同时开展2000亿元6个月期逆回购，中标利率1.4%。');
  assert.equal(value.termMonths, 12);
  assert.equal(value.mlfRate, null);
  assert.equal(parse(`${operation}随后国债买卖中标利率为2.0%。`).mlfRate, null);
  const separate = parse('2026年8月25日，央行开展5000亿元MLF操作，期限为1年，中标利率为1.75%，另有6个月期逆回购，中标利率1.4%。');
  assert.equal(separate.termMonths, 12);
  assert.equal(separate.mlfRate, 0.0175);
  assert.equal(parse(`${operation.slice(0, -1)}，另有6个月期逆回购，中标利率1.4%。`).mlfRate, null);
});

test('fresh publication cannot rehabilitate old, impossible or future operation dates', () => {
  for (const date of ['2026年5月25日', '2026年2月30日', '2026年9月25日', '2026年13月25日']) {
    assert.throws(() => parse(operation.replace('2026年8月25日', date)));
  }
  assert.equal(isFreshMlfDates('2026-05-25', link.publishedAt, nowMs), false);
  assert.equal(isFreshMlfDates('2026-02-30', link.publishedAt, nowMs), false);
  assert.equal(isFreshMlfDates('2026-09-25', link.publishedAt, nowMs), false);
  assert.equal(isFreshMlfDates('2026-08-25', '2026-09-06T00:00:00Z', nowMs), false);
  assert.equal(isFreshMlfDates('2026-08-25', '2026-02-30T00:00:00Z', nowMs), false);
  assert.equal(isFreshMlfDates('2026-08-25', '2026-08-25T24:00:00Z', nowMs), false);
  assert.equal(isFreshMlfDates('2026-08-25', null, NaN), false);
  assert.equal(isFreshMlfDates('2026-08-25', null, 1e100), false);
});

test('45-day boundary is based on the Chinese operation calendar date', () => {
  assert.equal(isFreshMlfDates('2026-07-22', null, nowMs), true);
  assert.equal(isFreshMlfDates('2026-07-21', null, nowMs), false);
  assert.equal(isFreshMlfDates('2026-09-06', null, Date.parse('2026-09-05T16:30:00Z')), true);
});

test('publication one day before an announced operation does not incorrectly shift its year', () => {
  const announcement = { publishedAt: '2026-08-24T10:00:00+08:00' };
  assert.equal(parse('8月25日央行将开展5000亿元1年期MLF操作。', announcement).opDate, '2026-08-25');
  assert.throws(() => parse('8月25日央行将开展5000亿元1年期MLF操作。', announcement, { nowMs: Date.parse('2026-08-24T10:00:00Z') }));
});

test('year inference handles December/January and rejects distant ambiguous references', () => {
  const opts = { nowMs: Date.parse('2027-01-05T10:00:00Z') };
  const jan = { publishedAt: '2027-01-04T10:00:00+08:00' };
  assert.equal(parse('12月25日央行开展5000亿元1年期MLF操作。', jan, opts).opDate, '2026-12-25');
  const dec = { publishedAt: '2026-12-31T10:00:00+08:00' };
  assert.equal(parse('1月1日央行开展5000亿元1年期MLF操作。', dec, opts).opDate, '2027-01-01');
  assert.throws(() => parse('5月25日央行开展5000亿元1年期MLF操作。', jan, opts));
  assert.throws(() => parse('8月25日央行开展5000亿元1年期MLF操作。', { publishedAt: null }));
  assert.equal(parse(operation, { publishedAt: null }).updatedAt, '2026-08-25T00:00:00Z');
});

test('dates and today references cannot be borrowed from unrelated sentences or tools', () => {
  assert.throws(() => parse('2026年8月25日发布新闻。央行开展5000亿元1年期MLF操作。'));
  assert.throws(() => parse('今日发布新闻。央行开展5000亿元1年期MLF操作。'));
  assert.throws(() => parse('2026年8月25日开展逆回购，央行开展5000亿元1年期MLF操作。'));
  assert.equal(parse('今日央行开展5000亿元1年期MLF操作。').opDate, '2026-09-05');
});

test('multiple independent MLF observations select latest valid date and reject same-day conflicts', () => {
  assert.equal(parse(`2026年8月1日央行开展4000亿元1年期MLF操作。${operation}`).operationAmountYi, 5000);
  assert.equal(parse(`${operation}2026年5月25日央行开展3000亿元1年期MLF操作。`).opDate, '2026-08-25');
  assert.equal(parse(`${operation}${operation}`).operationAmountYi, 5000);
  for (const other of [operation.replace('5000', '6000'), operation.replace('1年', '6个月'),
    operation.replace('操作。', '操作，中标利率1.75%。')]) assert.throws(() => parse(`${operation}${other}`), /conflicting same-day/u);
});

test('numeric limits, conflicting terms/rates and oversized input fail closed', () => {
  for (const text of [operation.replace('5000', '0'), operation.replace('5000', '100001'),
    operation.replace('1年', '6年'), operation.replace('1年', '0个月'),
    operation.replace('操作。', '操作，期限为6个月。'),
    operation.replace('操作。', '操作，中标利率0.1%。'), operation.replace('操作。', '操作，中标利率9%。'),
    operation.replace('操作。', '操作，中标利率1.75%，操作利率2.0%。'), 'a'.repeat(200001)]) {
    assert.throws(() => parse(text));
  }
  assert.equal(parse(operation.replace('1年', '5年')).termMonths, 60);
});

test('primary summary success uses one search and zero article requests', async () => {
  const searched = []; let fetched = 0;
  const result = await findMlfCandidate({ keywords: ['primary', 'fallback'],
    search: async keyword => { searched.push(keyword); return [row(1, operation, 'MLF')]; },
    fetchArticle: async () => { fetched++; throw new Error('should not fetch'); }, parseCandidate });
  assert.equal(result.operationAmountYi, 5000); assert.deepEqual(searched, ['primary']); assert.equal(fetched, 0);
});

test('nonempty invalid primary or primary search failure still allows fallback summary', async () => {
  for (const primaryFails of [false, true]) {
    const searched = []; let fetched = 0;
    const result = await findMlfCandidate({ keywords: ['primary', 'fallback'], search: async keyword => {
      searched.push(keyword); if (keyword === 'primary' && primaryFails) throw new Error('search unavailable');
      return keyword === 'primary' ? Array.from({ length: 10 }, (_, i) => row(i)) : [row(20, operation, 'MLF')];
    }, fetchArticle: async () => { fetched++; throw new Error('should not fetch'); }, parseCandidate });
    assert.equal(result.operationAmountYi, 5000); assert.equal(searched.length, 2); assert.equal(fetched, 0);
  }
});

test('MLF-titled fallback needing article details is prioritized ahead of six primary noise articles', async () => {
  const fetched = []; const genuine = row(30, '8月25日央行开展5000亿元MLF操作。', '央行MLF操作公告');
  const result = await findMlfCandidate({ keywords: ['primary', 'fallback'], search: async keyword => keyword === 'primary'
    ? Array.from({ length: 6 }, (_, i) => row(i)) : [genuine],
  fetchArticle: async candidate => { fetched.push(candidate.url); return candidate.url === genuine.url ? operation : '逆回购无MLF操作'; }, parseCandidate });
  assert.equal(result.operationAmountYi, 5000); assert.deepEqual(fetched, [genuine.url]);
});

test('both searches share a six-article budget and deduplicate URL attempts', async () => {
  let searches = 0; const fetched = [];
  await assert.rejects(findMlfCandidate({ keywords: ['primary', 'fallback'], search: async () => {
    searches++; return [...Array.from({ length: 10 }, (_, i) => row(i)), row(0)];
  }, fetchArticle: async candidate => { fetched.push(candidate.url); throw new Error('no article'); }, parseCandidate }));
  assert.equal(searches, 2); assert.equal(fetched.length, 6); assert.equal(new Set(fetched).size, 6);
});

test('summary review is not capped at six but never examines more than twenty rows per search', async () => {
  const rows = Array.from({ length: 20 }, (_, i) => row(i)); rows[10] = row(10, operation, 'MLF');
  const result = await findMlfCandidate({ keywords: ['primary'], search: async () => rows,
    fetchArticle: async () => { throw new Error('unneeded'); }, parseCandidate });
  assert.equal(result.operationAmountYi, 5000);
  let parsed = 0;
  await assert.rejects(findMlfCandidate({ keywords: ['primary'], search: async () => [...Array.from({ length: 20 }, (_, i) => row(i)), row(99, operation)],
    fetchArticle: async () => { throw new Error('unneeded'); }, maxArticleFetch: 0,
    parseCandidate: () => { parsed++; throw new Error('invalid summary'); } }));
  assert.equal(parsed, 20);
});

test('resolver rejects expanded budgets, unsafe URLs and oversized summaries', async () => {
  const base = { keywords: ['primary'], search: async () => [], fetchArticle: async () => '', parseCandidate };
  await assert.rejects(findMlfCandidate({ ...base, keywords: ['a', 'b', 'c'] }));
  await assert.rejects(findMlfCandidate({ ...base, maxArticleFetch: 7 }));
  await assert.rejects(findMlfCandidate({ ...base, maxArticleFetch: NaN }));
  let fetched = 0;
  await assert.rejects(findMlfCandidate({ ...base, search: async () => [
    { ...row(1), url: 'https://example.com/a/2026090512345678.html' },
    { ...row(2), summaryText: 'x'.repeat(12001) }], fetchArticle: async () => { fetched++; return operation; } }));
  assert.equal(fetched, 0);
  let searched = 0;
  await assert.rejects(findMlfCandidate({ ...base, keywords: ['same', 'same'], search: async () => { searched++; return []; } }));
  assert.equal(searched, 1);
});
