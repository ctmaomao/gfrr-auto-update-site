// ADR-0056: only exact GitHub schedule identities select recurring source budgets.
const schedules = Object.freeze({
  '30 0 * * 1': Object.freeze({ day: 1, scope: 'pair', maxAcledRequests: 26 }),
  '30 0 * * 3': Object.freeze({ day: 3, scope: 'weekly', maxAcledRequests: 14 }),
  '30 0 * * 5': Object.freeze({ day: 5, scope: 'weekly', maxAcledRequests: 14 }),
});

export function acledAutoPlan(env, now = new Date()) {
  if (env.GITHUB_EVENT_NAME === 'workflow_dispatch') return { slot: 'initial', scope: 'pair', maxAcledRequests: 26 };
  if (env.GITHUB_EVENT_NAME !== 'schedule' || !Object.hasOwn(schedules, env.ACLED_AUTO_SCHEDULE)) return null;
  const plan = schedules[env.ACLED_AUTO_SCHEDULE], date = new Date(now);
  if (!Number.isFinite(date.getTime()) || date.getUTCDay() !== plan.day
    || date.getUTCHours() * 60 + date.getUTCMinutes() < 30) return null;
  return { slot: date.toISOString().slice(0, 10), scope: plan.scope, maxAcledRequests: plan.maxAcledRequests };
}

export function validAcledScheduledSlot(slot) {
  if (typeof slot !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(slot)) return false;
  const date = new Date(`${slot}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === slot
    && [1, 3, 5].includes(date.getUTCDay());
}
