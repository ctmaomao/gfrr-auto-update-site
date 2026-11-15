import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { goldQuoteRows } from '../../scripts/realtime/gold-quote.mjs';

const src = fs.readFileSync(new URL('../../scripts/run-daily-pipeline.mjs', import.meta.url), 'utf8');
const config = { symbol: 'HG', yahooSymbol: 'HG=F', labelZh: '铜', min: 0.5, max: 20 };
function extract(name) {
  const start = src.search(new RegExp(`(?:async )?function ${name}\\(`));
  const rest = src.slice(start + 10);
  const next = /\n(?:async )?function /.exec(rest);
  assert.ok(start >= 0 && next);
  return src.slice(start, start + 10 + next.index);
}
function load(name, ctx = {}) {
  return vm.runInNewContext(`${extract(name)}\n${name}`, {
    COPPER_GOLD_CHANGE_WINDOW: '1d', ...ctx
  });
}

test('same and changed price across acquisition snapshots both lack a daily comparison', async () => {
  for (const price of [6.22, 6.5]) {
    const fn = load('fetchCopperGoldLeg', {
      fetchGoldApiPrice: async () => ({ price, updatedAt: '2026-11-15T02:00:00Z' }),
      isPlausibleCopperGoldQuote: () => true
    });
    const r = await fn(config, { price: 6.22, source: 'gold-api:HG', updatedAt: '2026-11-14T02:00:00Z' });
    assert.equal(r.changePct, null);
    assert.equal(r.quote.price, price);
  }
});

test('fallback drops unverified legacy return but retains price and timestamp', () => {
  const r = load('normalizePreviousCopperGoldLeg')({
    price: 6.22, changePct: 0.2, updatedAt: '2026-11-14T02:00:00Z'
  }, config);
  assert.equal(r.changePct, null);
  assert.equal(r.price, 6.22);
  assert.equal(r.updatedAt, '2026-11-14T02:00:00Z');
  assert.equal(r.sourceStatus, 'fallback');
});

test('missing copper cannot create zero ratio; real zero is still a number', () => {
  const ratio = load('deriveCopperGoldRatio');
  for (const price of [null, undefined, '', false]) assert.equal(ratio({ price }, { price: 3000 }), null);
  assert.equal(ratio({ price: 0 }, { price: 3000 }), 0);
  assert.equal(ratio({ price: 6 }, { price: 3000 }), 0.002);
  const change = load('deriveCopperGoldRatioChangePct');
  assert.equal(change({ price: 6, changePct: null }, { price: 3000, changePct: 0 }, 0.002), null);
  assert.equal(change({ price: 6, changePct: 0 }, { price: 3000, changePct: 0 }, 0.002), 0);
});

test('actual Gold API adapter preserves acquisition timestamp and rejects missing/invalid/future clocks', async () => {
  const fixed = '2026-11-15T02:00:00Z';
  for (const updatedAt of [fixed, null, 'invalid', '2099-01-01T00:00:00Z']) {
    const fn = load('fetchGoldApiPrice', {
      fetchJsonText: async () => ({ price: 6.22, updatedAt }),
      GOLD_API_PRICE_BASE: 'https://example.invalid', MACRO_FETCH_TIMEOUT_MS: 1000,
      goldQuoteRows: p => goldQuoteRows(p, Date.parse(fixed))
    });
    if (updatedAt === fixed) {
      const q = await fn('HG');
      assert.equal(q.updatedAt, fixed);
      assert.equal(q.changePct, null);
    } else await assert.rejects(() => fn('HG'));
  }
});

test('resolved mixed live/cache and all-failed legs preserve prices but never legacy daily returns', async () => {
  const legs = [{ ...config, key: 'copper' }, { symbol: 'XAU', labelZh: '金', key: 'gold' }];
  for (const liveCopper of [true, false]) {
    const context = {
      COPPER_GOLD_CHANGE_WINDOW: '1d', COPPER_GOLD_SOURCE: 'test',
      COPPER_GOLD_DISPLAY_NOTE: 'unknown daily return', COPPER_GOLD_LEGS: legs,
      COPPER_GOLD_STATUS_RANK: { live: 0, fallback: 1, missing: 2 },
      latestIsoDate: (...dates) => dates.filter(Boolean).sort().at(-1),
      fetchCopperGoldLeg: async cfg => liveCopper && cfg.key === 'copper' ? {
        quote: { price: 6, updatedAt: '2026-11-15T02:00:00Z', source: 'gold-api:HG' },
        sourceStatus: 'live', changePct: null
      } : null
    };
    for (const name of ['normalizePreviousCopperGoldLeg', 'buildMissingCopperGoldLeg',
      'deriveCopperGoldRatio', 'deriveCopperGoldRatioChangePct', 'pickCopperGoldStatus']) {
      context[name] = load(name, context);
    }
    const previous = {
      copper: { price: 6, changePct: 0.2, updatedAt: '2026-11-14T02:00:00Z' },
      gold: { price: 3000, changePct: 0.1, updatedAt: '2026-11-14T02:00:00Z' }
    };
    const r = await load('resolveCopperGold', context)(previous);
    assert.equal(r.copper.changePct, null);
    assert.equal(r.gold.changePct, null);
    assert.equal(r.ratioChangePct, null);
    assert.equal(r.ratio, 0.002);
    assert.equal(r.gold.updatedAt, previous.gold.updatedAt);
    assert.equal(r.sourceStatus.gold, 'fallback');
    assert.equal(r.sourceStatus.copper, liveCopper ? 'live' : 'fallback');
  }
});
