import { weeklyCoverageFailures, ACLED_WEEKLY_REGIONS } from './acled-weekly-coverage.mjs';

function weekMs(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0,10) === value ? ms : NaN;
}
function grid(latestWeek) {
  const end = weekMs(latestWeek);
  if (!Number.isFinite(end)) throw new Error('ACLED common window has invalid date');
  return Array.from({length:12}, (_,i)=>new Date(end-(11-i)*7*86400000).toISOString().slice(0,10));
}

export function buildCommonWeeklyWindow(aggregates) {
  const failures = weeklyCoverageFailures(aggregates, 'common weekly window');
  if (failures.length) throw new Error(failures.join('; '));
  const sets = aggregates.map(item => new Set(item.rows.map(row => row.week)));
  if (sets.some(weeks => !weeks.size || [...weeks].some(week=>!Number.isFinite(weekMs(week))))) {
    throw new Error('ACLED common window has missing or invalid weeks');
  }
  const latestWeek = sets.map(weeks=>[...weeks].sort().at(-1)).sort()[0];
  const weeks12 = grid(latestWeek);
  for (let i=0;i<sets.length;i++) {
    if (weeks12.some(week=>!sets[i].has(week))) {
      throw new Error(`ACLED ${aggregates[i].region}: common window requires 12 consecutive observed weeks; existing config preserved`);
    }
  }
  return {version:'common-week-grid-v1',latestWeek,weeks4:weeks12.slice(-4),weeks12,regions:[...ACLED_WEEKLY_REGIONS]};
}

// Old aggregates cannot prove continuous, shared observation windows. Retain them
// as history until the local sanitizer can recompute from the original rows.
export function weeklyWindowProblem(weekly) {
  const window = weekly?.quality?.weeklyWindow;
  if (!window) return 'missing common-week-grid evidence';
  if (window.version !== 'common-week-grid-v1' || window.latestWeek !== weekly.latestWeek) return 'window version/date mismatch';
  let expected;
  try { expected=grid(window.latestWeek); } catch { return 'invalid window date'; }
  if (JSON.stringify(window.weeks12)!==JSON.stringify(expected) || JSON.stringify(window.weeks4)!==JSON.stringify(expected.slice(-4))) return 'non-contiguous weekly grid';
  if (!Array.isArray(window.regions) || weeklyCoverageFailures(window.regions.map(region=>({region})), 'window').length
    || weeklyCoverageFailures(weekly.filesIngested, 'files').length
    || weeklyCoverageFailures(weekly.regionalLast4Weeks, 'regional').length) return 'incomplete regional coverage';
  if (weekly.filesIngested.some(file => !Number.isFinite(weekMs(file.weekRange?.[0])) || !Number.isFinite(weekMs(file.weekRange?.[1]))
    || file.weekRange[0]>expected[0] || file.weekRange[1]<window.latestWeek)) return 'window outside source coverage';
  return null;
}

export function applyAcledWeeklyWindowGuard(source, weekly) {
  if (!['ok','partial'].includes(source?.status)) return source;
  const result=structuredClone(source);
  result.summary ||= {};
  const problem=weeklyWindowProblem(weekly);
  result.summary.weeklyWindowAligned=!problem;
  if (!problem) return result;
  const note='ACLED 周度历史汇总缺少可验证的六区域同窗证据；周度指标暂不可比，不参与本轮评分。需以原始周表重新标准化。';
  result.status='partial';
  result.confidence=0;
  result.summary.reportedLatestWeek=result.summary.latestWeek ?? null;
  result.summary.latestWeek=null;
  result.summary.sourceFreshness='expired';
  for(const key of ['eventsLast4Weeks','eventsLast12Weeks','eventsDelta4Vs12','fatalitiesLast4Weeks','fatalitiesLast12Weeks','civilianTargetingShareLast4Weeks','hotZonesTopCount']) result.summary[key]=null;
  result.summary.noteZh=note;
  result.warnings=[...(result.warnings||[]),note];
  result.evidence=(result.evidence||[]).filter(item=>!String(item.source).includes('(weekly)')).map(item=>({...item,confidence:0}));
  return result;
}
