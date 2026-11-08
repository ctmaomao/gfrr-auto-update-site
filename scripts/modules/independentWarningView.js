import { snapshotDisplayHealth } from './snapshotFreshness.js?v=macro-budget-integration-20261108';
import { strictEvidenceDate } from './evidenceAge.js?v=macro-budget-integration-20261108';

// Qualification of independent published records; no contribution to OFR.
export function worldOrderWarningView(data, nowMs = Date.now()) {
  const health = snapshotDisplayHealth(data, nowMs);
  const score = Number.isFinite(data?.score) && data.score >= 0 && data.score <= 100 ? data.score : null;
  const events = data?.externalSources?.gdeltEvents;
  const day = value => typeof value === 'string' && /^\d{8}$/.test(value) ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}` : null;
  const start = day(events?.summary?.windowStartDay), end = day(events?.summary?.windowEndDay);
  const windowText = strictEvidenceDate(start) && strictEvidenceDate(end) && start <= end ? `${start} → ${end}` : '窗口日期待核验';
  const state = !data ? '记录缺失' : health.status === 'invalid' ? '日期无效 · 资格待核验'
    : health.status === 'stale' ? '历史快照' : data.freshness !== 'fresh' ? '部分来源或时效待核验' : '本期快照';
  return `${score === null ? '分值缺失' : `${score} · 已发布记录`} · ${state} · 发布 ${health.status === 'invalid' ? '日期待核验' : data.updatedAt}；Events ${({ ok: '可用', partial: '部分可用', stale: '已过期', error: '抓取失败', unavailable: '不可用', missing: '缺失', publication_hold: '发布暂缓' }[events?.status] ?? '状态待核验')} · ${windowText}；独立观察，不升档OFR`;
}
export function tailWarningView(shock, radarData) {
  const missing = !shock.tailKnown;
  const invalid = !missing && shock.tailRecordCount > shock.tail.length;
  const qualification = shock.snapshotStatus === 'invalid' ? '日期无效 · 资格待核验'
    : shock.snapshotStatus === 'stale' ? '历史快照记录' : '本期快照记录';
  const record = missing ? '尾部记录缺失' : invalid ? `尾部记录部分或全部无效${shock.tail.length ? ` · ${shock.tail.map(t => t.label).join(' / ')}` : ''}`
    : shock.tail.length ? shock.tail.map(t => t.label).join(' / ') : '快照未记录尾部触发';
  const date = typeof radarData?.updatedAt === 'string' && strictEvidenceDate(radarData.updatedAt.slice(0, 10)) ? radarData.updatedAt : '日期待核验';
  return { status: `${qualification} · ${record}`,
    detail: `记录对应雷达快照 ${date}；运输：${shock.transport.status}${shock.transport.expired && !shock.transport.status.includes('过期') ? ' · 过期' : ''}。尾部有效期未登记。独立观察，不加分OFR；未触发不等于没有风险。` };
}
