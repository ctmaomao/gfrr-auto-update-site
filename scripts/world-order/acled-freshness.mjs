// Reliability weights, not probabilities; thresholds retain the existing ACLED cadence policy.
export function acledFreshness(date, cadence, nowMs = Date.now()) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'expired';
  const at=Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(at) || new Date(at).toISOString().slice(0,10)!==date) return 'expired';
  const age=Math.floor(nowMs/86400000)-Math.floor(at/86400000);
  if (age<0) return 'expired';
  if (cadence==='weekly') return age<14?'fresh':age<=30?'aging':age<=90?'stale':'expired';
  return age<=35?'fresh':age<=60?'aging':age<=120?'stale':'expired';
}
export const acledFreshnessWeight = status => ({fresh:1,aging:0.75,stale:0.35,expired:0}[status] ?? 0);
export function acledExpiryBlocks(ageDays, cadence, runtimeHistory = false) {
  // Runtime history is retained only as history; publication still checks its structure and the runtime decay gate.
  return ageDays>(cadence==='weekly'?90:180) && !runtimeHistory;
}
export function applyAcledFreshness(source, nowMs = Date.now()) {
  if (!['ok','partial'].includes(source.status)) return source;
  const result=structuredClone(source), summary=result.summary||{}, weights=[];
  result.warnings=Array.isArray(result.warnings)?result.warnings:[];
  for(const [key,field,cadence] of [['latestWeek','sourceFreshness','weekly'],['monthlyAsOfDate','monthlySourceFreshness','monthly']]) {
    if(!summary[key]) continue;
    summary[field]=acledFreshness(summary[key],cadence,nowMs);
    weights.push(acledFreshnessWeight(summary[field]));
    if(summary[field]!=='fresh') result.warnings.push(`ACLED ${cadence==='weekly'?'周表':'月表'}${({aging:'偏旧',stale:'过期',expired:'已失效'})[summary[field]]}，保留历史日期并降低置信度。`);
  }
  if(weights.length && Math.min(...weights)<1) {
    result.status='partial';
    result.confidence=(Number.isFinite(result.confidence)?result.confidence:0)*Math.min(...weights);
    result.evidence=(result.evidence||[]).map(e=>({...e,confidence:Math.min(e.confidence||0,result.confidence)}));
    summary.noteZh=`${summary.noteZh||''} 数据已偏旧或过期，当前仅作有时效限制的历史参考。`;
  }
  return result;
}
