// Read-only display qualification. No source selection, scoring or freshness thresholds.
const finite = value => typeof value === 'number' && Number.isFinite(value);
const ISO = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/;
export function provenanceDate(value, nowMs = Date.now()) {
  if (typeof value !== 'string' || !ISO.test(value) || !finite(nowMs)) return null;
  if (value.includes('T')) {
    const parts = /T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
    if (!parts || +parts[1] > 23 || +parts[2] > 59 || +parts[3] > 59
      || (parts[4] !== 'Z' && (+parts[5] > 14 || +parts[6] > 59 || (+parts[5] === 14 && +parts[6] !== 0)))) return null;
  }
  const day = value.slice(0, 10);
  const midnight = Date.parse(`${day}T00:00:00Z`);
  const at = Date.parse(value);
  if (!finite(at) || !finite(midnight) || new Date(midnight).toISOString().slice(0, 10) !== day || at > nowMs) return null;
  return day;
}
export function provenanceTime(value, nowMs = Date.now()) {
  if (!provenanceDate(value, nowMs) || !value.includes('T')) return '未记录或待核验';
  return `${new Date(value).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}
const price = value => finite(value) ? `$${value.toFixed(2)}` : '—';
const dayLabel = (value, nowMs) => provenanceDate(value, nowMs) ?? '观察日未核实';
const month = value => typeof value === 'string' && /^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\d{2}$/.test(value) ? value : null;
export function buildBrentProvenanceView(layer = {}, selectedValue = null, nowMs = Date.now()) {
  const selected = layer.selectedBrent ?? {};
  const spot = layer.publicSpotProxy ?? {};
  const futures = layer.futuresProxy ?? {};
  const eia = layer.eiaBrentSpotProxy ?? {};
  const ice = layer.iceFuturesPriceCurve ?? {};
  const iceFront = ice.contracts?.[0];
  const iceMatched = finite(ice.frontPrice) && ice.frontPrice === iceFront?.price;
  const selectedMatches = selectedValue === selected.value && finite(selectedValue);
  const futuresIsYahoo = /yahoo|bz=f/i.test(futures.source ?? '');
  const futuresSource = futuresIsYahoo ? 'Yahoo' : /tradingeconomics|brent-crude-oil/i.test(futures.source ?? '') ? 'Trading Economics' : '来源待核验';
  const selectedIsSpot = /fred|dcoilbrenteu/i.test(selected.source ?? '');
  const selectedIsYahoo = /yahoo|bz=f/i.test(selected.source ?? '');
  // Older snapshots mislabeled selectedBrent.observedAt with generation time.
  // Recover only from a matching priced source observation, never from a clock.
  const selectedObservation = selectedMatches
    ? selectedIsSpot && /fred|dcoilbrenteu/i.test(spot.source ?? '') && selectedValue === spot.value ? provenanceDate(spot.observedAt, nowMs)
      : selectedIsYahoo && futuresIsYahoo && selectedValue === futures.value ? provenanceDate(futures.observedAt, nowMs) : null
    : null;
  const kind = !selectedMatches ? '来源口径待核验' : selectedIsSpot ? 'FRED 现货代理' : selectedIsYahoo ? 'Yahoo 期货代理' : '来源口径待核验';
  const futureMonth = month(futures.contractMonth);
  const spotDay = provenanceDate(spot.observedAt, nowMs), futureDay = provenanceDate(futures.observedAt, nowMs);
  const comparable = finite(spot.value) && finite(futures.value) && spotDay !== null && spotDay === futureDay && futureMonth !== null;
  const spread = comparable && finite(layer.proxySpread?.spotMinusFutures) ? layer.proxySpread.spotMinusFutures : null;
  return {
    selected: `${kind} · ${selectedObservation ?? '观察日未核实'}`,
    eia: `${price(eia.price)} · ${dayLabel(eia.updatedAt, nowMs)}`,
    futures: `${price(futures.value)} · ${futuresSource} · ${futureMonth ?? (futuresIsYahoo ? '连续近月，合约月未核实' : '口径与合约月未核实')} · ${dayLabel(futures.observedAt, nowMs)}`,
    ice: `${price(ice.frontPrice)} · ${iceMatched ? month(iceFront.contract) ?? '合约月未核实' : '合约月未核实'} · ${dayLabel(iceMatched ? iceFront.updatedAt : null, nowMs)}`,
    spread: spread === null ? '— · 日期或合约未对齐' : `${spread >= 0 ? '+' : '-'}$${Math.abs(spread).toFixed(2)} · 同日代理差，非实物溢价`,
    divergence: '跨口径，非同一价格偏离',
    note: '现货代理、连续近月和指定月份期货分别阅读；不同观察日或未核实合约月份不作直接价差比较。ICE为延迟报价，不是官方结算价；公开现货代理不是Platts Dated Brent。',
  };
}
