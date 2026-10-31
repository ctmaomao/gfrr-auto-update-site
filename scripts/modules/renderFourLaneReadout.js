// Dedicated renderer for the Hero four-lane evidence list. Text-only DOM updates.
// No scoring: the tail floor is annotated as the old model's floor, not a new
// pressure score; transport that is not applied is not counted as an alert.

import { buildFourLaneReadout } from './fourLaneReadout.js?v=separated-readout-20261031';

const ROWS = [
  { key: 'continuous', label: '六模块基础读数' },
  { key: 'fragility', label: '结构脆弱性' },
  { key: 'shock', label: '尾部与运输警报' },
  { key: 'credibility', label: '数据可信度' },
];

function numberText(value, unit) {
  if (!Number.isFinite(value)) return '—';
  if (unit === 'percent') return `${value.toFixed(2)}%`;
  if (unit === 'points') return value.toFixed(2);
  return value.toFixed(3);
}

function continuousDetail(lane) {
  const evidence = lane.evidence.map((item) => {
    const value = numberText(item.value, item.unit);
    const date = item.date ? item.date : '观察日未知';
    return `${item.label} ${value}（${date}）`;
  }).join(' · ');
  return `${lane.note} ${evidence}`;
}

function transportKnown(lane) {
  return lane.transport.valid === true && lane.transport.counted === true;
}

function tailPartial(lane) {
  return lane.tailKnown !== true || (lane.tailRecordCount !== null && lane.tailRecordCount > lane.tail.length);
}

function shockStatusText(lane) {
  if (lane.snapshotStatus === 'invalid') return '冲击记录未知';
  const record = lane.scoreRecord;
  if (record.known) {
    const partial = tailPartial(lane) ? ' · 部分记录待核验' : '';
    return `${record.historical ? '历史记录 · ' : ''}尾部保底 +${record.tailAdd} · 运输 +${record.transportAdd}${partial}`;
  }
  const knownTransport = transportKnown(lane);
  const count = lane.tail.length + (knownTransport && lane.transport.applied === true ? 1 : 0);
  const partial = tailPartial(lane) || !knownTransport;
  if (count > 0) return partial ? `${count} 条快照记录 · 部分记录待核验` : `${count} 条快照记录`;
  if (lane.tailKnown !== true) return '冲击记录未知';
  if (!knownTransport) return '冲击记录未知';
  if (lane.tailRecordCount > lane.tail.length) return '记录无法校验';
  return '快照未记录触发';
}

function shockDetail(lane) {
  const parts = lane.tail.map((item) => `${item.label}（综合分下限 ${item.floor}；${item.status}）`);
  if (!lane.tailKnown) {
    parts.push('尾部记录未知');
  } else if (lane.tailRecordCount === 0) {
    parts.push('快照未记录尾部触发');
  } else if (lane.tailRecordCount > lane.tail.length) {
    parts.push(`${lane.tailRecordCount - lane.tail.length} 条尾部记录无法校验`);
  }
  let transport = `运输 ${lane.transport.status}`;
  if (lane.transport.expired) transport += ' · 过期';
  if (lane.snapshotStatus === 'invalid') transport += '（快照无效，未列入警报）';
  else if (lane.transport.counted && lane.transport.applied !== true) transport += ' · 未触发/阻塞，不计入警报';
  else if (!lane.transport.counted) transport += '（未列入警报）';
  parts.push(transport);
  if (lane.tail.length > 1) parts.push('多项条件共用保底，不逐项累加');
  parts.push('加分已包含在综合分中；触发条件不等于实际加分');
  return parts.join(' · ');
}

function credibilityDetail(lane) {
  const unknownDates = lane.sourceDates.filter((item) => !item.date).length;
  return `${lane.coverage.label} · ${lane.snapshot.label} · ${unknownDates} 项源日期未知`;
}

export function renderFourLaneReadout({ radarData, nowMs = Date.now() } = {}) {
  const host = document.getElementById?.('hero-four-lanes');
  if (!host) return;
  host.replaceChildren();
  if (!radarData) {
    host.hidden = true;
    return;
  }
  const readout = buildFourLaneReadout(radarData, nowMs);
  for (const row of ROWS) {
    const wrap = document.createElement('div');
    wrap.className = 'hero-lane-row';
    const dt = document.createElement('dt');
    dt.className = 'hero-lane-label';
    dt.textContent = row.label;
    const dd = document.createElement('dd');
    dd.className = 'hero-lane-status';
    const detail = document.createElement('dd');
    detail.className = 'hero-lane-detail';
    if (row.key === 'continuous') {
      dd.textContent = readout.lanes.continuous.headline;
      detail.textContent = continuousDetail(readout.lanes.continuous);
    } else if (row.key === 'fragility') {
      dd.textContent = readout.lanes.fragility.headline;
      detail.textContent = readout.lanes.fragility.gaps.map((gap) => `${gap.label}：${gap.status}`).join(' · ');
    } else if (row.key === 'shock') {
      dd.textContent = shockStatusText(readout.lanes.shock);
      detail.textContent = shockDetail(readout.lanes.shock);
    } else {
      dd.textContent = readout.lanes.credibility.label;
      detail.textContent = credibilityDetail(readout.lanes.credibility);
    }
    wrap.append(dt, dd, detail);
    host.append(wrap);
  }
  host.hidden = false;
}
