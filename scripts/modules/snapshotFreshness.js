// Daily publication cadence (24h) plus a 12h scheduling/recovery grace.
// This is a display policy, never a source/score eligibility override.
export const SNAPSHOT_MAX_AGE_HOURS = 36;

export function snapshotDisplayHealth(radarData, nowMs = Date.now()) {
  const updatedAt=radarData?.updatedAt;
  const at=typeof updatedAt==='string' ? Date.parse(updatedAt) : NaN;
  const datePart=typeof updatedAt==='string' ? updatedAt.slice(0,10) : '';
  const calendar=Date.parse(`${datePart}T00:00:00Z`);
  const valid=Number.isFinite(nowMs) && Number.isFinite(at) && Number.isFinite(calendar)
    && new Date(calendar).toISOString().slice(0,10)===datePart && at<=nowMs+5*60*1000;
  const ageHours=valid ? Math.max(0,(nowMs-at)/3600000) : null;
  const status=!valid?'invalid':ageHours>SNAPSHOT_MAX_AGE_HOURS?'stale':'current';
  const freshnessLabel=!valid?'快照时间无效，当前时效待确认':`${status==='stale'?'更新延迟 · 历史快照':'本期快照'} · 发布${ageHours<1?'不足 1':`已过 ${Math.floor(ageHours)}`}小时`;
  const health=radarData?.dailyRealtimeInput?.healthScore;
  const healthText=typeof health==='number' && Number.isFinite(health) && health>=0 && health<=100 ? `${health}/100` : '未知';
  const collectionLabel=`采集时健康度 ${healthText}`;
  return {status,ageHours,freshnessLabel,collectionLabel,mastheadLabel:`${freshnessLabel} · ${collectionLabel}`,heroLabel:`${freshnessLabel}；${collectionLabel}`};
}
