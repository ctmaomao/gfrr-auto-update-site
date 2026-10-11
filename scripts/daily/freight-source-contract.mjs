// ADR-0067: exact aggregate-index origins; this never grants route-level rights.
export const FREIGHT_SYMBOLS = Object.freeze(['BDTI', 'BCTI', 'BDI']);
export const FREIGHT_PROVIDERS = Object.freeze(['StockQ', 'BalticExchangePublicTicker']);

export function freightSourceString(providers) {
  if (!Array.isArray(providers) || providers.length !== 3
      || !providers.every(provider => FREIGHT_PROVIDERS.includes(provider))) {
    throw new Error('freight_source_invalid');
  }
  return FREIGHT_SYMBOLS.map((symbol, index) => `${providers[index]}:${symbol}`).join('; ');
}

const approvedSources = new Set(Array.from({ length: 8 }, (_, bits) =>
  freightSourceString(FREIGHT_SYMBOLS.map((_, i) => FREIGHT_PROVIDERS[(bits >> i) & 1]))));

export function isFreightSource(value) {
  return typeof value === 'string' && approvedSources.has(value);
}

export function freightProvidersFromSource(value) {
  if (!isFreightSource(value)) throw new Error('freight_source_invalid');
  return value.split('; ').map(part => part.split(':')[0]);
}
