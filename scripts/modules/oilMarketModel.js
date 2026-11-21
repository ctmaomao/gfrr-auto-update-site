// Read-only view of published evidence. No score, forecast or production writer.
import { oilEvidenceNumber as number, oilObservation, qualifyOdpDisplay } from './oilEvidenceQuality.js?v=qqq-signal-copy-20261121';
export const BIAS_LABELS = Object.freeze({strong_bullish:'美国周度供需明显偏紧',moderate_bullish:'美国周度供需偏紧',neutral_range:'美国周度供需中性',bearish:'美国周度供需偏松',false_down_physical_stress:'价格下跌 · 美国周度供需仍紧',false_up_unconfirmed:'价格上涨 · 美国周度供需偏松',product_crisis:'美国成品油库存压力较高',insufficient_data:'数据不足 · 暂不判断'});
const ROUTES = {hormuz:'霍尔木兹海峡',babElMandeb:'曼德海峡',suez:'苏伊士运河',capeGoodHope:'好望角',malacca:'马六甲海峡',gibraltar:'直布罗陀海峡',bosporus:'博斯普鲁斯海峡',panama:'巴拿马运河'};
const THERMAL_COMPARISON_REASONS = new Set(['within_baseline_or_not_repeated','above_baseline_repeated','above_baseline_repeated_elevated']);
function summarizeThermalComparison(thermal,facilities) {
 const areas=thermal.aggregate?.facilityCount;
 const ids=new Set(facilities.map(row=>row.id).filter(id=>typeof id==='string' && id.trim()===id && id.length>0));
 if (!Number.isSafeInteger(areas) || areas<1 || areas!==thermal.facilities?.length || areas!==ids.size) return null;
 const baselineStatus=thermal.baseline?.status;
 let compared=0,paused=0;
 for (const {baselineComparison:c} of facilities) {
  if (c?.reason==='source_coverage_incomplete_or_changed') paused++;
  else if (c?.status==='established' && ['established','partial'].includes(baselineStatus) && THERMAL_COMPARISON_REASONS.has(c.reason)) compared++;
  else if (!(c?.reason==='baseline_missing_or_insufficient_samples' && ['not_established','insufficient_samples'].includes(c.status))) return null;
 }
 return {areas,compared,paused};
}
export function buildOilMarketView({radar=null,oil=null,thermal=null}={},now=Date.now()) {
 const qualified=qualifyOdpDisplay(oil,radar,now);
 const freight=radar?.macroDrivers?.shippingFreight || {};
 const transport=radar?.macroDrivers?.energyTransport || {};
 const thermalClock=oilObservation(thermal?.aggregate?.rowCount,thermal?.generatedAt,1,now,'live');
 const thermalObservation=oilObservation(thermal?.aggregate?.rowCount,thermal?.aggregate?.latestAcqAt,1,now,'live');
 const curve=radar?.brentPricingLayer?.iceFuturesPriceCurve || {};
 const facilities=Array.isArray(thermal?.facilities)?thermal.facilities.filter(row=>row && typeof row==='object'):[];
 return {qualified,verdict:!oil || typeof oil!=='object' ? '数据不可用' : qualified.physicalUsable && !qualified.priceUsable ? '油价方向暂不足判断' : BIAS_LABELS[qualified.displayBias] || BIAS_LABELS.insufficient_data,
 physicalSummary:qualified.physicalUsable ? BIAS_LABELS[oil?.interpretation?.physicalBias] || '美国周度供需状态未知' : '美国周度供需数据不足或已超龄',
 radarAt:radar?.updatedAt || null,oilAt:oil?.builtAt || null,
 brent:qualified.evidence.brentPrice,
 curve:(Array.isArray(curve.contracts)?curve.contracts:[]).filter(row=>row && typeof row==='object').map(row=>({...oilObservation(row.price,row.updatedAt,4,now,curve.curveStatus==='live_delayed_priced'?'live':'missing'),label:row.contract})),
 freight:[['balticDirtyTanker','dirtyTanker','BDTI · 原油等脏油轮'],['balticCleanTanker','cleanTanker','BCTI · 成品油轮'],['balticDry','dryBulk','BDI · 干散货']].map(([prefix,key,label],i)=>({label,source:(freight.source || '').split(';')[i]?.trim() || null,...oilObservation(freight[prefix+'Index'],freight[prefix+'UpdatedAt'],7,now,freight.sourceStatus?.[key])})),
 // PortWatch capacity_tanker is estimated trade volume in metric tons, not available vessel capacity.
 routes:Object.entries(ROUTES).map(([key,label])=>{const row=transport.chokepoints?.[key] || {};const estimatedTradeVolume=number(row.latest?.capacityTanker);return {label,...oilObservation(row.latest?.nTanker,row.latest?.date,10,now,row.sourceStatus),average:number(row.avg30d?.nTanker),estimatedTradeVolume,tradeEstimateState:estimatedTradeVolume===null?'missing':estimatedTradeVolume===0?'zero':'reported'};}),
 transportFetchedAt:transport.fetchedAt || null,
 thermal:thermal && thermal.module==='oil-thermal-watch'?{clockStatus:thermalClock.sourceStatus,observationStatus:thermalObservation.sourceStatus,sources:Array.isArray(thermal.sources)?thermal.sources:[],generatedAt:thermal.generatedAt,latest:thermal.aggregate?.latestAcqAt || null,rows:number(thermal.aggregate?.rowCount),areas:number(thermal.aggregate?.facilityCount),detectedAreas:number(thermal.aggregate?.facilitiesWithDetections),status:thermal.status,baselineStatus:thermal.baseline?.status,baselineComparison:summarizeThermalComparison(thermal,facilities),retired:number(thermal.aggregate?.requestDiagnostics?.failuresByCategory?.source_retired)>0,baselineAt:thermal.baseline?.sourceReview?.lastSampleAt || null,facilities}:null};
}
