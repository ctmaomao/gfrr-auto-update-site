// Read-only source-clock disclosure. Never reclassifies or recomputes the overlay.
function sourceTime(value, nowMs) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:$|T)/u.test(value)) return null;
  if (value.includes('T') && !/(?:Z|[+-]\d{2}:\d{2})$/u.test(value)) return null;
  const ms = Date.parse(value);
  const day = value.slice(0, 10);
  if (!Number.isFinite(ms) || !Number.isFinite(nowMs) || ms > nowMs
    || new Date(Date.parse(day + 'T00:00:00Z')).toISOString().slice(0, 10) !== day) return null;
  return { day, ms, stamp: new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' };
}

export function worldOrderSourceClock(wo, nowMs = Date.now()) {
  const generated = sourceTime(wo?.updatedAt, nowMs);
  const clock = generated
    ? `本层快照生成：${generated.stamp} · 距读取时已过${Math.floor((nowMs - generated.ms) / 3600000)}小时；不是各源共同观察日。`
    : '本层快照生成时间待核验；不能据此判断当前来源时效。';
  const cloud = sourceTime(wo?.externalSources?.gdelt?.lastFetchedAt, nowMs);
  const cloudText = cloud
    ? `历史 Cloud 摘要最后获取：${cloud.stamp}，距读取时已过${Math.floor((nowMs - cloud.ms) / 86400000)}天；获取日不等于事件观察日。`
    : '历史 Cloud 摘要获取时间待核验。';
  return clock + cloudText;
}

export function worldOrderSourceDisclosure(wo, nowMs = Date.now()) {
  const label = value => ({ fresh: '新鲜', aging: '偏旧', stale: '过期', expired: '已失效', error: '读取失败', not_configured: '未配置', missing: '缺失' })[value] || '待确认';
  const acled = wo?.externalSources?.acled?.summary || {};
  const events = wo?.externalSources?.gdeltEvents;
  const summary = events?.summary;
  const count = value => Number.isFinite(value) && value >= 0 ? Math.round(value).toLocaleString('en-US') : '—';
  const windowDay = value => {
    if (typeof value !== 'string' || !/^\d{8}$/u.test(value)) return '待核验';
    const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}`;
    return sourceTime(iso, nowMs) ? value : '待核验';
  };
  const state = events?.status === 'stale' ? '沿用历史窗口' : events?.status === 'ok' ? '采集时完整七日文件' : '采集状态待确认';
  const eventsText = summary
    ? `免费记录窗口：${windowDay(summary.windowStartDay)}～${windowDay(summary.windowEndDay)}；${state}，未知隔离 ${count(summary.quarantinedRows)} 行，仅计入两个冲突维度；其余三维仍含历史 Cloud 代理。`
    : '';
  return `ACLED 周表时效：${label(acled.sourceFreshness)}；月表时效：${label(acled.monthlySourceFreshness)}。${eventsText}`;
}
