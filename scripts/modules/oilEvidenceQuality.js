// Existing ODP evidence only: observation clocks and qualifications, never a new score.
const DAY_MS = 86400000;
export const ODP_PHYSICAL_KEYS = Object.freeze(['crudeStocksExSpr','sprStocks','distillateStocks','gasolineStocks','refineryUtilization','refinerCrudeInputs','demandGasolineSupplied','demandDistillateSupplied']);
export function oilEvidenceNumber(value) {
  if (!['number', 'string'].includes(typeof value) || (typeof value === 'string' && !value.trim())) return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}
export function oilObservationMillis(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return NaN;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return NaN;
  return Date.parse(value);
}
export function oilObservation(value, asOfDate, maxAgeDays, nowMs = Date.now(), status = 'missing') {
  const number = oilEvidenceNumber(value);
  const observedMs = oilObservationMillis(asOfDate);
  const age = Number.isFinite(observedMs) && observedMs <= nowMs ? (nowMs - observedMs) / DAY_MS : null;
  const ageDays = age === null ? null : Math.ceil(age * 1000) / 1000;
  return { value:number, asOfDate:Number.isFinite(observedMs) ? asOfDate : null, ageDays, maxAgeDays,
    sourceStatus:number === null ? 'missing' : age === null || age > maxAgeDays || !['live','ok'].includes(status) ? 'stale' : 'live' };
}
export function resolveOdpPriceEvidence(radar, nowMs = Date.now()) {
  const bp = radar?.brentPricingLayer || {};
  const selected = bp.selectedBrent || {};
  const spot = bp.publicSpotProxy || {};
  const eia = bp.eiaBrentSpotProxy || {};
  const value = oilEvidenceNumber(selected.value);
  const source = typeof selected.source === 'string' ? selected.source : '';
  let observedAt = null;
  let sourceStatus = 'missing';
  if (/fred.*DCOILBRENTEU/i.test(source) && /fred/i.test(spot.source || '') && value !== null && oilEvidenceNumber(spot.value) === value) {
    observedAt = spot.observedAt; sourceStatus = spot.status;
  } else if (/eia/i.test(source) && value !== null && oilEvidenceNumber(eia.price) === value) {
    observedAt = eia.updatedAt; sourceStatus = eia.sourceStatus;
  }
  // A snapshot/capture timestamp is not a dated quote. Unknown provenance stays unknown.
  const brent = oilObservation(value, observedAt, 5, nowMs, sourceStatus);
  const brentAvailable = brent.asOfDate && ['live','ok'].includes(sourceStatus);
  const brentPrice = { ...brent, value:brentAvailable ? brent.value : null, sourceStatus:brentAvailable ? brent.sourceStatus : 'missing', source:'radar-data:brentPricingLayer.selectedBrent', quoteSource:source, unit:'$/bbl' };
  // This legacy field is ULSD change * 42, not the change of a matched two-leg spread.
  // No dated ULSD leg is retained by the current producer, so neither level nor change is qualified.
  const crackSpread = { ...oilObservation(null, null, 10, nowMs), change4w:null, regime:null, unit:'$/bbl', source:'radar-data:brentPricingLayer.crackSpread', note:'未保存同日同口径的两腿报价与ULSD观察日，价差及变化不作论据。' };
  const curveInput = bp.futuresPriceCurve || {};
  const curveHasLegs = [curveInput.frontMinusBack,curveInput.frontPrice,curveInput.backPrice].every(v=>oilEvidenceNumber(v)!==null);
  // The producer's aggregate updatedAt is the newest contract, not both endpoints.
  // Qualify the actual first/last rows and retain the older endpoint clock.
  const contracts = Array.isArray(curveInput.contracts) ? curveInput.contracts : [];
  const endpoints = contracts.length >= 2 ? [contracts[0], contracts.at(-1)] : [];
  const endpointObservations = endpoints.map(row => oilObservation(row?.price, row?.updatedAt, 4, nowMs, 'live'));
  const endpointPricesMatch = endpoints.length === 2 && endpointObservations.every((row, index) =>
    row.sourceStatus === 'live' && row.value === oilEvidenceNumber(index === 0 ? curveInput.frontPrice : curveInput.backPrice));
  const aggregate = oilObservation(curveInput.frontMinusBack, curveInput.updatedAt, 4, nowMs, /^live_/.test(curveInput.curveStatus || '') ? 'live' : 'missing');
  const curveAvailable = curveHasLegs && endpointPricesMatch && aggregate.sourceStatus === 'live'
    && oilEvidenceNumber(curveInput.frontMinusBack) === Number((endpointObservations[0].value - endpointObservations[1].value).toFixed(3));
  const curveDate = curveAvailable ? endpointObservations.reduce((older, row) =>
    oilObservationMillis(row.asOfDate) < oilObservationMillis(older.asOfDate) ? row : older).asOfDate : null;
  const curve = oilObservation(curveAvailable ? curveInput.frontMinusBack : null, curveDate, 4, nowMs, curveAvailable ? 'live' : 'missing');
  return {brentPrice,crackSpread,curve:{...curve,frontMinusBack:curve.value,frontPrice:oilEvidenceNumber(curveInput.frontPrice),backPrice:oilEvidenceNumber(curveInput.backPrice),slopeRegime:curveInput.slopeRegime || null,curveStatus:curveInput.curveStatus || null,source:'radar-data:brentPricingLayer.futuresPriceCurve'}};
}
export function qualifiedBrentHistory(history, brentPrice, nowMs = Date.now()) {
  if (!Array.isArray(history) || brentPrice?.sourceStatus !== 'live') return null;
  // Legacy radar-history dates are publication dates. Do not treat them as quote observations.
  const quoteSource=brentPrice.quoteSource || brentPrice.source;
  const points = history.filter(row=>row && row.brentSource === quoteSource && oilEvidenceNumber(row.brent)>0 && typeof row.brentObservedAt === 'string' && Number.isFinite(oilObservationMillis(row.brentObservedAt)) && oilObservationMillis(row.brentObservedAt)<=nowMs)
    .map(row=>({value:oilEvidenceNumber(row.brent),date:row.brentObservedAt,ms:oilObservationMillis(row.brentObservedAt)})).sort((a,b)=>a.ms-b.ms);
  const byDate = new Map();
  for (const point of points) {
    if (byDate.has(point.ms) && byDate.get(point.ms) !== point.value) return null;
    byDate.set(point.ms, point.value);
  }
  const last=points.at(-1);
  if (!last || last.ms !== oilObservationMillis(brentPrice.asOfDate) || last.value !== brentPrice.value || nowMs-last.ms>5*DAY_MS) return null;
  const target=last.ms-28*DAY_MS;
  const prior=points.filter(p=>p.ms<last.ms).sort((a,b)=>Math.abs(a.ms-target)-Math.abs(b.ms-target))[0];
  if(!prior || Math.abs(prior.ms-target)>10*DAY_MS)return null;
  return {changePct4w:Math.round((last.value/prior.value-1)*10000)/100,startObservedAt:prior.date,endObservedAt:last.date,source:quoteSource};
}
export function qualifyOdpDisplay(oilData, radarData, nowMs = Date.now()) {
  const evidence={...(oilData?.evidence || {})};
  for(const key of ODP_PHYSICAL_KEYS) {const e=evidence[key] || {};evidence[key]={...e,...oilObservation(e.value,e.asOfDate,16,nowMs,e.sourceStatus)};}
  const prices=resolveOdpPriceEvidence(radarData,nowMs);
  for(const key of ['brentPrice','crackSpread','curve']) evidence[key]={...(evidence[key] || {}),...prices[key]};
  const weekly=ODP_PHYSICAL_KEYS.map(key=>evidence[key]);
  const builtMs=oilObservationMillis(oilData?.builtAt);
  const physicalUsable=weekly.every(e=>e.sourceStatus==='live' && oilObservationMillis(e.asOfDate)<=builtMs) && new Set(weekly.map(e=>e.asOfDate)).size===1 && Number.isFinite(oilObservationMillis(oilData?.builtAt)) && oilObservationMillis(oilData.builtAt)<=nowMs;
  const pc=oilData?.signals?.priceContext || {};
  const publishedBrent=oilData?.evidence?.brentPrice || {};
  const brentMatches=oilObservationMillis(publishedBrent.asOfDate)===oilObservationMillis(prices.brentPrice.asOfDate)
    && oilObservationMillis(publishedBrent.asOfDate)<=builtMs && (publishedBrent.quoteSource || publishedBrent.source)===prices.brentPrice.quoteSource
    && oilEvidenceNumber(publishedBrent.value)!==null && oilEvidenceNumber(publishedBrent.value)===prices.brentPrice.value;
  const publishedCurve=oilData?.evidence?.curve || {};
  const curveContracts = radarData?.brentPricingLayer?.futuresPriceCurve?.contracts;
  const curveEndpointsBeforeBuild = Array.isArray(curveContracts) && curveContracts.length >= 2
    && [curveContracts[0], curveContracts.at(-1)].every(row => oilObservationMillis(row?.updatedAt) <= builtMs);
  const curveMatches=curveEndpointsBeforeBuild && oilObservationMillis(publishedCurve.asOfDate)<=builtMs && oilObservationMillis(publishedCurve.asOfDate)===oilObservationMillis(prices.curve.asOfDate)
    && publishedCurve.slopeRegime===prices.curve.slopeRegime && pc.curveSlopeRegime===prices.curve.slopeRegime
    && ['frontMinusBack','frontPrice','backPrice'].every(key=>oilEvidenceNumber(publishedCurve[key])!==null && oilEvidenceNumber(publishedCurve[key])===prices.curve[key]);
  const priceWindowDays=(oilObservationMillis(pc.brentObservedAt)-oilObservationMillis(pc.brentStartObservedAt))/DAY_MS;
  const priceUsable=brentMatches && curveMatches && priceWindowDays>=18 && priceWindowDays<=38 && pc.priceDirectionSource==='dated_same_source_brent_observations' && Number.isFinite(pc.brentChangePct4w) && prices.brentPrice.sourceStatus==='live' && pc.brentSource===prices.brentPrice.quoteSource && oilObservationMillis(pc.brentObservedAt)===oilObservationMillis(prices.brentPrice.asOfDate) && Number.isFinite(oilObservationMillis(pc.brentStartObservedAt)) && oilObservationMillis(pc.brentStartObservedAt)<oilObservationMillis(pc.brentObservedAt) && prices.curve.sourceStatus==='live';
  const priceContext={...pc,brentChangePct4w:priceUsable?pc.brentChangePct4w:null,curveSlopeRegime:prices.curve.sourceStatus==='live'?prices.curve.slopeRegime:null,crackChange4w:null};
  const displayBias=!physicalUsable?'insufficient_data':priceUsable?oilData.finalBias:(oilData?.interpretation?.physicalBias || 'insufficient_data');
  return {evidence,priceContext,physicalUsable,priceUsable,displayBias};
}
