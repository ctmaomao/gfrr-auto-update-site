// Four-lane evidence readout. Display-only; reads published snapshot fields and
// never derives a new pressure/fragility total or changes score/decision.
//
// Tail records are kept as records, not as a new score: the floor is the old
// tail-overlay floor and is rendered as such by renderFourLaneReadout. Missing
// or invalid records must stay distinguishable from a valid empty list.

import { snapshotDisplayHealth } from './snapshotFreshness.js?v=matrix-repo-qualification-1';

const NUM = (v) => typeof v === 'number' && Number.isFinite(v);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function validDate(text) {
  if (typeof text !== 'string') return null;
  if (!DATE_RE.test(text)) return null;
  const [y, m, d] = text.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() + 1 !== m || probe.getUTCDate() !== d) return null;
  return text;
}

function parseTimestamp(value) {
  if (typeof value !== 'string' || !ISO_RE.test(value)) return null;
  const date = validDate(value.slice(0, 10));
  if (date === null) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return { ms, date };
}

function sourceDate(value, snapshot, nowMs) {
  if (!Number.isFinite(nowMs)) return null;
  const today = new Date(nowMs).toISOString().slice(0, 10);
  if (DATE_RE.test(value)) {
    const date = validDate(value);
    if (date === null || date > today || (snapshot?.date && date > snapshot.date)) return null;
    return date;
  }
  if (!ISO_RE.test(value)) return null;
  const source = parseTimestamp(value);
  if (source === null || source.ms > nowMs || source.date > today || (snapshot && source.ms > snapshot.ms)) return null;
  return source.date;
}

function creditEvidence(radarData, key, label, format, snapshot, nowMs) {
  const credit = radarData?.macroDrivers?.credit;
  const value = NUM(credit?.[key]) ? credit[key] : null;
  const date = sourceDate(credit?.sourceObservedAt?.[key], snapshot, nowMs);
  return { key, label, value, unit: format, date, dateStatus: date ? 'dated' : 'unknown', status: value === null ? '缺值' : '参考' };
}

export function buildFourLaneReadout(radarData, nowMs = Date.now()) {
  const snapshot = snapshotDisplayHealth(radarData, nowMs);
  const snapshotTs = parseTimestamp(radarData?.updatedAt);
  const baseline = radarData?.displayInputsBaseline ?? {};
  const energy = radarData?.macroDrivers?.energyTransport ?? {};

  const evidence = [
    creditEvidence(radarData, 'hyOas', '高收益债利差', 'percent', snapshotTs, nowMs),
    creditEvidence(radarData, 'igOas', '投资级利差', 'percent', snapshotTs, nowMs),
    creditEvidence(radarData, 'nfci', '金融条件指数', 'index', snapshotTs, nowMs),
  ];
  const vix = NUM(baseline.vix) ? baseline.vix : null;
  // VIX has no connected source-observation date; do not borrow snapshot.updatedAt.
  evidence.push({ key: 'vix', label: '波动率指数', value: vix, unit: 'points', date: null, dateStatus: 'unknown', status: vix === null ? '缺值' : '参考' });

  const coverage = ['brent', 'dxy', 'vix', 'hyOas', 'us10y', 'real10y', 'breakeven10y', 'gold', 'spx']
    .filter((key) => NUM(baseline[key])).length;

  const tailLabels = {
    systemic_liquidity_credit_shock: '波动率与信用同步冲击',
    systemic_liquidity_credit_watch: '波动率冲击向信用/流动性传导',
    energy_inflation_tail: '能源与通胀尾部冲击',
    banking_curve_stress: '曲线倒挂与银行压力共振',
  };
  const tailFloors = { systemic_liquidity_credit_shock: 82, systemic_liquidity_credit_watch: 72, energy_inflation_tail: 68, banking_curve_stress: 66 };
  const snapshotState = snapshot.status === 'stale' ? '历史快照记录' : snapshot.status === 'invalid' ? '未知' : '快照记录';
  const reasons = radarData?.tailRiskOverlay?.reasons;
  const tailKnown = Array.isArray(reasons);
  const tailRecordCount = tailKnown ? reasons.length : null;
  const tailAlerts = tailKnown
    ? reasons.map((reason) => {
      const key = reason?.key;
      const floor = reason?.floor;
      if (!Object.hasOwn(tailFloors, key) || !Number.isFinite(floor) || floor !== tailFloors[key]) return null;
      return {
        key,
        label: tailLabels[key],
        floor,
        lastRecordedAt: snapshot.status === 'invalid' ? null : (typeof radarData?.updatedAt === 'string' ? radarData.updatedAt : null),
        expiryAt: null,
        expiryBasis: 'unknown',
        status: snapshotState,
      };
    }).filter(Boolean)
    : [];

  const age = NUM(energy.latestAgeDays) ? energy.latestAgeDays : null;
  const transportRaw = radarData?.transportShockScoringImpact;
  const transportValid = Boolean(transportRaw && typeof transportRaw === 'object' && typeof transportRaw.applied === 'boolean' && typeof transportRaw.reason === 'string');
  const contribution = NUM(transportRaw?.contributionPct) ? transportRaw.contributionPct : null;
  const contributionValid = contribution !== null && contribution >= 0 && contribution <= 3;
  const consistent = transportValid && contributionValid && (transportRaw.applied ? contribution > 0 : contribution === 0);
  const transportStale = consistent && (
    (transportRaw.guards?.latestFresh === false && transportRaw.reason === 'candidate_stale_zero_contribution')
    || (Number.isFinite(age) && age >= 0 && age > 7)
  );
  const transportAgeUnknown = consistent && transportRaw.applied && !(Number.isFinite(age) && age >= 0) && !(transportRaw.guards?.latestFresh === false && transportRaw.reason === 'candidate_stale_zero_contribution');
  const transportStatus = !consistent ? '未知'
    : snapshot.status === 'invalid' ? '未知'
      : snapshot.status === 'stale' ? '历史快照记录'
        : transportStale ? '数据质量过期'
          : transportAgeUnknown ? '数据质量未知'
            : transportRaw.applied ? '已记录触发' : '未记录触发/阻塞';
  const transportAlert = {
    key: 'transport_shock',
    valid: consistent,
    applied: consistent ? transportRaw.applied : null,
    contributionPct: consistent ? contribution : null,
    reason: consistent ? transportRaw.reason : null,
    ageDays: age,
    lastRecordedAt: consistent && snapshot.status !== 'invalid' && typeof radarData?.updatedAt === 'string' ? radarData.updatedAt : null,
    expiryAt: null,
    expiryBasis: 'transport_stale_evidence',
    expired: consistent ? (transportStale ? true : transportAgeUnknown ? null : false) : null,
    counted: consistent,
    status: transportStatus,
  };

  return {
    flags: { displayOnly: true, fourTier: null, accuracy: 'not_assessed', productionReplacement: 'HOLD' },
    lanes: {
      continuous: { total: null, headline: '综合读数待验证', evidence },
      fragility: {
        total: null,
        headline: '未建立总分',
        gaps: [
          { key: 'leverage', label: '杠杆', status: '覆盖缺口' },
          { key: 'debtService', label: '偿债', status: '覆盖缺口' },
          { key: 'valuation', label: '估值', status: '覆盖缺口' },
        ],
        localEvidence: [],
      },
      shock: { tail: tailAlerts, tailKnown, tailRecordCount, transport: transportAlert, snapshotStatus: snapshot.status },
      credibility: {
        snapshot: { status: snapshot.status, ageHours: snapshot.ageHours, label: snapshot.freshnessLabel },
        coverage: { present: coverage, total: 9, label: `${coverage}/9 项已发布数值` },
        sourceDates: evidence.map((item) => ({ key: item.key, date: item.date, label: item.date ? item.date : '观察日未知' })),
        label: coverage === 9 ? '主表数值齐全，源日期未齐' : '资料不齐，结论待补证',
      },
    },
  };
}
