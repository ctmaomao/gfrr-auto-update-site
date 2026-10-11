import test from 'node:test';
import assert from 'node:assert/strict';
import { freightSourceString, freightProvidersFromSource, isFreightSource } from '../../scripts/daily/freight-source-contract.mjs';

test('all eight exact aggregate origin combinations round-trip; legacy snapshots remain valid', () => {
  for (let bits = 0; bits < 8; bits++) {
    const providers = Array.from({ length: 3 }, (_, i) => (bits >> i) & 1 ? 'BalticExchangePublicTicker' : 'StockQ');
    const source = freightSourceString(providers);
    assert.equal(isFreightSource(source), true);
    assert.deepEqual(freightProvidersFromSource(source), providers);
  }
  assert.equal(isFreightSource('StockQ:BDTI; StockQ:BCTI; StockQ:BDI'), true);
});

test('unknown origins, reordered symbols, extra fields and loose matching fail closed', () => {
  for (const source of [null, {}, '', 'StockQ',
    'Other:BDTI; StockQ:BCTI; StockQ:BDI',
    'StockQ:BCTI; StockQ:BDTI; StockQ:BDI',
    'StockQ:BDTI; StockQ:BCTI; StockQ:BDI; Other:TD3C',
    'StockQ:BDTI; StockQ:BCTI; StockQ:BDI ',
    'BalticExchangePublicTicker:TD3C; StockQ:BCTI; StockQ:BDI']) {
    assert.equal(isFreightSource(source), false);
    assert.throws(() => freightProvidersFromSource(source), /freight_source_invalid/u);
  }
  for (const providers of [null, ['StockQ'], ['Other', 'StockQ', 'StockQ']]) {
    assert.throws(() => freightSourceString(providers), /freight_source_invalid/u);
  }
});
