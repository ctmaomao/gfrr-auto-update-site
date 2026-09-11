import { createHash } from 'node:crypto';
import { isHistoricalDate } from './historical-validation.mjs';

const DAY = 86400000;
const time = date => isHistoricalDate(date) ? Date.parse(`${date}T00:00:00Z`) : NaN;
const dateAt = ms => new Date(ms).toISOString().slice(0, 10);
export const FEATURE_KEYS = ['credit', 'volatility', 'equity', 'rates', 'dollarFunding', 'oil', 'inflation'];
export const CHANNEL_KEYS = ['credit', 'volatility', 'equity', 'rates', 'dollarFunding', 'energyInflation'];
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
export function quantile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), index = (sorted.length - 1) * p;
  return sorted[Math.floor(index)] * (1 - index % 1) + sorted[Math.ceil(index)] * (index % 1);
}
export function correlation(a, b) {
  if (a.length !== b.length || a.length < 3) return null;
  const ma = mean(a), mb = mean(b);
  const aa = a.map(x => x - ma), bb = b.map(x => x - mb);
  const denominator = Math.sqrt(aa.reduce((s, x) => s + x*x, 0) * bb.reduce((s, x) => s + x*x, 0));
  return denominator > 0 ? Math.max(-1, Math.min(1, aa.reduce((s, x, i) => s + x*bb[i], 0) / denominator)) : null;
}

export function validateResearchProtocol(protocol) {
  if (protocol?.productionReplacementEnabled !== false || protocol?.calibratedProbability !== false
    || protocol?.positionSizingValidated !== false || protocol?.evaluation?.historicalResultsAloneCanPromote !== false) throw new Error('Research boundary invalid');
  const inputs = Object.values(protocol.channels || {}).flatMap(channel => channel.inputs || []);
  if (new Set(inputs).size !== inputs.length || inputs.length !== Object.keys(protocol.sources || {}).length
    || inputs.some(key => !protocol.sources[key])) throw new Error('Every input must belong to exactly one channel');
  if (JSON.stringify(Object.keys(protocol.channels)) !== JSON.stringify(CHANNEL_KEYS)) throw new Error('Unknown channel contract');
  const expected={credit:[['baa10y'],'level'],volatility:[['vix'],'log_level'],equity:[['spx'],'drawdown_from_trailing_365_calendar_day_high'],
    rates:[['us10y'],'absolute_28_calendar_day_change'],dollarFunding:[['dxy'],'positive_28_calendar_day_log_change'],
    energyInflation:[['brent','breakeven10y'],'mean_of_scaled_oil_log_change_magnitude_and_breakeven_level']};
  for(const [key,[inputs,transformation]] of Object.entries(expected)) {
    if(JSON.stringify(protocol.channels[key].inputs)!==JSON.stringify(inputs)||protocol.channels[key].transformation!==transformation) throw new Error('Declared channel mapping differs from implemented transformation');
  }
  if(!Number.isFinite(protocol.channels.energyInflation.secondaryMinimumScale)||protocol.channels.energyInflation.secondaryMinimumScale<=0) throw new Error('Invalid secondary scale');
  if (!Number.isInteger(protocol.minimumTrainingWeeks) || protocol.minimumTrainingWeeks < 52) throw new Error('Insufficient training policy');
  if (!protocol.variants?.length || new Set(protocol.variants.map(v=>v.id)).size!==protocol.variants.length) throw new Error('Invalid variant identities');
  for(const policy of Object.values(protocol.sources)) {
    if(!Number.isFinite(policy.assumedReleaseLagDays)||policy.assumedReleaseLagDays<0
      ||!Number.isFinite(policy.maxAgeDays)||policy.maxAgeDays<policy.assumedReleaseLagDays) throw new Error('Invalid source age policy');
  }
  if(Object.values(protocol.channels).some(channel=>!Number.isFinite(channel.minimumScale)||channel.minimumScale<=0)) throw new Error('Invalid scale floor');
  if(!isHistoricalDate(protocol.evaluation.startDate)||!isHistoricalDate(protocol.evaluation.historicalCutoff)
    ||protocol.evaluation.startDate>protocol.evaluation.historicalCutoff) throw new Error('Invalid frozen historical window');
  if(Object.values(protocol.legacyAdditionalAssumedReleaseLagDays||{}).some(lag=>!Number.isInteger(lag)||lag<0)) throw new Error('Invalid legacy lag assumption');
  for (const variant of protocol.variants || []) {
    if (!Number.isInteger(variant.windowWeeks) || variant.windowWeeks < protocol.minimumTrainingWeeks
      || !Number.isFinite(variant.tailBlend) || variant.tailBlend < 0 || variant.tailBlend > 1
      || typeof variant.correlationAdjustment !== 'boolean') throw new Error('Invalid candidate variant');
  }
}

// Retrieval-date snapshots are not historical release vintages. The lag below
// is explicitly a sensitivity assumption, never a fabricated release timestamp.
export function observationAt(rows, date, policy, extraLagDays = 0) {
  if(!isHistoricalDate(date)||!Number.isFinite(extraLagDays)||extraLagDays<0
    ||!Number.isFinite(policy?.assumedReleaseLagDays)||policy.assumedReleaseLagDays<0
    ||!Number.isFinite(policy?.maxAgeDays)||policy.maxAgeDays<0) throw new Error('Invalid observation policy');
  const now = time(date), cutoff = now - (policy.assumedReleaseLagDays + extraLagDays) * DAY;
  const ordered = Array.isArray(rows) ? rows : [];
  const cutoffDate = dateAt(cutoff);
  let lo=0,hi=ordered.length;
  while(lo<hi) { const mid=(lo+hi)>>>1; if(ordered[mid].date<=cutoffDate) lo=mid+1; else hi=mid; }
  const row = ordered[lo-1];
  if (!row || !isHistoricalDate(row.date) || !Number.isFinite(row.value) || now - time(row.date) > (policy.maxAgeDays + extraLagDays) * DAY) return null;
  return row;
}

export function pressureFeatures(series, date, protocol, extraLagDays = 0) {
  if (!isHistoricalDate(date)) throw new Error('Invalid pressure date');
  const evidence = {}, values = {};
  for (const [key, policy] of Object.entries(protocol.sources)) {
    const row = observationAt(series[key], date, policy, extraLagDays);
    evidence[key] = row ? { observationDate: row.date, value: row.value, assumedReleaseLagDays: policy.assumedReleaseLagDays + extraLagDays } : null;
    values[key] = row?.value ?? null;
  }
  const missing = Object.keys(evidence).filter(key => !evidence[key]);
  if (missing.length) return { date, features: null, evidence, missing };
  for (const key of ['vix', 'spx', 'dxy', 'brent']) if (!(values[key] > 0)) missing.push(`${key}:nonpositive`);
  if (values.baa10y < 0) missing.push('baa10y:negative');
  const lag = {};
  for (const key of ['us10y', 'dxy', 'brent']) {
    // Reference interval ends at the actual current observation, not packet age.
    const refDate = dateAt(time(evidence[key].observationDate) - 28 * DAY);
    lag[key] = observationAt(series[key], refDate, {maxAgeDays: 4, assumedReleaseLagDays: 0});
    if (!lag[key] || (key !== 'us10y' && lag[key].value <= 0)) missing.push(`${key}:28d_reference`);
  }
  const end = time(evidence.spx.observationDate);
  const startDate=dateAt(end-365*DAY), endDate=evidence.spx.observationDate;
  const equityRows = series.spx.filter(row => row.date <= endDate && row.date >= startDate && Number.isFinite(row.value) && row.value > 0);
  if (equityRows.length < 200 || end - time(equityRows[0]?.date) < 330*DAY) missing.push('spx:one_year_history');
  if (missing.length) return { date, features: null, evidence, missing };
  return { date, evidence, references:{...lag,spx:{startDate:equityRows[0].date,endDate:equityRows.at(-1).date,
    observations:equityRows.length,high:Math.max(...equityRows.map(row=>row.value))}}, missing: [], features: {
    credit: values.baa10y,
    volatility: Math.log(values.vix),
    equity: -Math.log(values.spx / Math.max(...equityRows.map(row => row.value))),
    rates: Math.abs(values.us10y - lag.us10y.value),
    dollarFunding: Math.max(0, Math.log(values.dxy / lag.dxy.value)),
    oil: Math.abs(Math.log(values.brent / lag.brent.value)),
    inflation: values.breakeven10y
  }};
}

export function replayPressureInputs(features, parameters, variant) {
  if(FEATURE_KEYS.some(key=>!Number.isFinite(features?.[key])||!Number.isFinite(parameters?.calibration?.[key]?.center)
    ||!Number.isFinite(parameters?.calibration?.[key]?.scale)||parameters.calibration[key].scale<=0)) throw new Error('Invalid replay calibration');
  const weights=CHANNEL_KEYS.map(key=>parameters.weights?.[key]);
  if(weights.some(w=>!Number.isFinite(w)||w<0)||Math.abs(weights.reduce((a,b)=>a+b,0)-1)>1e-9) throw new Error('Invalid replay weights');
  const channels=scaledChannels(features,parameters.calibration);
  const average=CHANNEL_KEYS.reduce((sum,key,i)=>sum+weights[i]*channels[key],0);
  const rms=Math.sqrt(CHANNEL_KEYS.reduce((sum,key,i)=>sum+weights[i]*channels[key]**2,0));
  return (1-variant.tailBlend)*average+variant.tailBlend*rms;
}

function scaleFor(key, history, protocol) {
  const values = history.map(row => row.features[key]);
  const center = quantile(values, 0.5), mad = quantile(values.map(value => Math.abs(value-center)), 0.5);
  const floor = key === 'inflation' ? protocol.channels.energyInflation.secondaryMinimumScale : protocol.channels[key === 'oil' ? 'energyInflation' : key].minimumScale;
  const scale = Math.max(1.4826*mad, (quantile(values, 0.75)-quantile(values, 0.25))/1.349, floor);
  return { center, scale, minimumScaleApplied: scale === floor };
}
function scaledChannels(features, calibration) {
  const scaled = Object.fromEntries(FEATURE_KEYS.map(key => [key, 100*(0.5 + Math.atan((features[key]-calibration[key].center)/calibration[key].scale)/Math.PI)]));
  return Object.fromEntries(CHANNEL_KEYS.map(key => [key, key === 'energyInflation' ? (scaled.oil+scaled.inflation)/2 : scaled[key]]));
}

export function scorePressure(current, allHistory, protocol, variant = protocol.variants[0]) {
  validateResearchProtocol(protocol);
  if(!protocol.variants.some(item=>digest(item)===digest(variant))) throw new Error('Variant is not in frozen research protocol');
  const base = { modelId: protocol.modelId, variant: variant.id, date: current.date,
    productionReplacementEnabled: false, calibratedProbability: false, positionSizingValidated: false };
  if (!isHistoricalDate(current.date) || !current.features || FEATURE_KEYS.some(key => !Number.isFinite(current.features[key]))) {
    return { ...base, status: 'unavailable', score: null, reasons: current.missing || ['invalid_features'] };
  }
  const now = time(current.date), cutoff = now-variant.windowWeeks*7*DAY;
  const dates = new Set();
  const history = allHistory.filter(row => {
    const t = time(row.date);
    if (!Number.isFinite(t) || t >= now || t < cutoff || !row.features || FEATURE_KEYS.some(key => !Number.isFinite(row.features[key]))) return false;
    if(new Date(t).getUTCDay()!==5) throw new Error('Calibration requires weekly Friday observations');
    if (dates.has(row.date)) throw new Error('Ambiguous duplicate calibration date');
    dates.add(row.date); return true;
  }).sort((a,b)=>a.date.localeCompare(b.date));
  if (history.length < protocol.minimumTrainingWeeks || time(history.at(-1).date)-time(history[0].date)<(protocol.minimumTrainingWeeks-1)*7*DAY) return { ...base, status: 'warming_up', score: null, trainingWeeks: history.length };
  const calibration = Object.fromEntries(FEATURE_KEYS.map(key=>[key,scaleFor(key,history,protocol)]));
  const channels = scaledChannels(current.features,calibration), prior = history.map(row=>scaledChannels(row.features,calibration));
  const correlations = CHANNEL_KEYS.map(a=>CHANNEL_KEYS.map(b=>a===b ? 1 : correlation(prior.map(row=>row[a]),prior.map(row=>row[b])) ?? 0));
  const rawWeights = CHANNEL_KEYS.map((_,i)=>variant.correlationAdjustment ? 1/(1+correlations[i].reduce((s,r,j)=>s+(i===j ? 0 : Math.max(0,r)),0)) : 1);
  const total = rawWeights.reduce((a,b)=>a+b,0), weights=rawWeights.map(w=>w/total);
  const average = CHANNEL_KEYS.reduce((sum,key,i)=>sum+weights[i]*channels[key],0);
  const rms = Math.sqrt(CHANNEL_KEYS.reduce((sum,key,i)=>sum+weights[i]*channels[key]**2,0));
  const score=(1-variant.tailBlend)*average+variant.tailBlend*rms;
  return { ...base, status:'research_only', score, channels, weights:Object.fromEntries(CHANNEL_KEYS.map((key,i)=>[key,weights[i]])),
    average, smoothTailContribution:score-average, calibration, trainingWeeks:history.length,
    calibrationStart:history[0].date, calibrationEnd:history.at(-1).date,
    reliability: { defaultsUsed: false, allChannelsPresent: true, truePointInTimeHistory: false,
      weightEffectiveCount:1/weights.reduce((s,w)=>s+w*w,0),
      correlationParticipationRatio:CHANNEL_KEYS.length**2/correlations.flat().reduce((s,r)=>s+r*r,0),
      independenceProven:false, correlations } };
}
