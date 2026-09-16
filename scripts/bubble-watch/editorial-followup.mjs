import { assessWeeklyEditorialNewsReadiness } from './weekly-editorial-news.mjs';
import { validateNewsDiscovery } from './weekly-editorial-contract.mjs';

export const STATUS_SCHEMA = 'bubble-watch-editorial-status-v1';
export const WORKFLOW = 'bubble-watch-weekly-editorial-refresh.yml';
export const STATUS_PATH = 'data/bubble-watch-editorial-status.json';
export const PROVIDER_STEP = 'Run one DeepSeek editorial call';

export function weekStart(now) {
  const date = new Date(now);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

export function hasCurrentEditorial(data, now) {
  const layer = data?.summary?.weekly_editorial;
  // Conservative cost guard: any current-period output blocks a second paid attempt,
  // even if its display validation later fails. Display retains its own stricter gate.
  return Boolean(layer && layer.asOfDate === data.as_of_date);
}

export function classifyRun({ run, steps, discovery, asOfDate }) {
  const provider = steps?.find(step => step.name === PROVIDER_STEP);
  const providerCalled = provider?.conclusion === 'skipped' ? false
    : provider?.started_at && provider.started_at !== '0001-01-01T00:00:00Z' ? true : null;
  const result = { reason: 'unverified', providerCalled, credibleCount: null };
  if (!run || run.status !== 'completed') return { ...result, reason: 'in_progress' };
  if (run.run_attempt !== 1) return result;
  if (!discovery || discovery.windowEnd !== asOfDate || !validateNewsDiscovery(discovery).ok) return result;
  if (providerCalled === true) {
    const published = steps.some(step => step.name === 'Commit refreshed weekly editorial' && step.conclusion === 'success');
    return { ...result, reason: published && run.conclusion === 'success' ? 'published'
      : provider.conclusion !== 'success' ? 'provider_failed' : 'validation_or_publish_failed' };
  }
  const readiness = assessWeeklyEditorialNewsReadiness(discovery);
  result.credibleCount = readiness.credibleCount;
  if (!readiness.searchProvidersHealthy) return { ...result, reason: 'search_failed' };
  const provenSkip = run.conclusion === 'success' && providerCalled === false
    && steps.some(step => step.name === 'Build compact provider input' && step.conclusion === 'success')
    && steps.some(step => step.name === 'Verify expected no-credible-news skip stayed side-effect free' && step.conclusion === 'success');
  return { ...result, reason: provenSkip && readiness.expectedSkip ? 'no_credible_news' : 'input_failed' };
}

export function decideRecheck({ data, state, observation, runs, now, eventName, attempt }) {
  const week = weekStart(now);
  if (eventName !== 'schedule' || attempt !== 1) return 'status_only';
  if (new Date(now).getUTCDay() !== 3) return 'outside_recheck_day';
  if (weekStart(`${data.as_of_date}T00:00:00Z`) !== week) return 'data_not_current_week';
  if (hasCurrentEditorial(data, now)) return 'current_editorial_exists';
  if (state.reservations?.[week]) return 'weekly_slot_used';
  if (!runs.length || runs.some(run => run.status !== 'completed')) return 'other_run_pending';
  // A successful skip is the only allowed predecessor. Failures, reruns and any
  // earlier paid attempt block the slot, not merely the latest run's result.
  if (runs.some(run => run.run_attempt !== 1 || run.evidence?.reason !== 'no_credible_news')) return 'other_attempt_not_safe';
  if (observation.reason !== 'no_credible_news') return 'skip_not_verified';
  return 'reserve';
}

export function admitRecheck({ data, state, runs, now, runId, attempt, week, token, asOfDate }) {
  const reservation = state.reservations?.[week];
  if (attempt !== 1 || week !== weekStart(now) || new Date(now).getUTCDay() !== 3) return false;
  if (!reservation || reservation.token !== token || reservation.asOfDate !== asOfDate) return false;
  if (reservation.admittedRunId || data.as_of_date !== asOfDate || hasCurrentEditorial(data, now)) return false;
  if (state.asOfDate !== asOfDate || reservation.sourceRunId !== state.sourceRunId) return false;
  const predecessors = runs.filter(run => String(run.id) !== String(runId));
  if (!predecessors.some(run => String(run.id) === reservation.sourceRunId)) return false;
  return predecessors.every(run =>
    run.status === 'completed' && run.run_attempt === 1 && run.evidence?.reason === 'no_credible_news');
}
