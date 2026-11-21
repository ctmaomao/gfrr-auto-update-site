// Output is only as authoritative as the caller's complete monthly schedule input.
const NY = 'America/New_York';
const DAY = 86_400_000;
const civil = new Intl.DateTimeFormat('en-CA', {
  timeZone: NY, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function check(ok, reason) {
  if (!ok) throw new Error(`Unqualified H.4.1 schedule: ${reason}`);
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function shift(key, days) {
  return dateKey(new Date(Date.parse(key) + days * DAY));
}

function local(instant) {
  const p = Object.fromEntries(civil.formatToParts(instant).map(({ type, value }) => [type, value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

function scheduledInstant({ date, time }) {
  check(typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time), `undocumented local time for ${date}`);
  const wall = Date.parse(`${date}T${time}:00Z`);
  // The modern Eastern Standard/Daylight offsets are tried, never assumed:
  // a spring gap yields zero matching instants, and a fall fold two.
  const matches = [4, 5].map((hours) => wall + hours * 3_600_000).filter((instant) => {
    const converted = local(instant);
    return converted.date === date && converted.time === time;
  });
  check(matches.length === 1, `ambiguous or nonexistent New York time for ${date}`);
  return matches[0];
}

function releaseFor(wednesday, months) {
  const from = shift(wednesday, 1);
  const until = shift(wednesday, 7);
  const covered = new Set([from.slice(0, 7), shift(until, -1).slice(0, 7)]);
  const eligible = [];
  for (const month of covered) {
    const rows = months.filter((row) => row?.month === month);
    check(rows.length === 1, `missing or duplicate month ${month}`);
    const { complete, timeZone, releases } = rows[0];
    check(complete === true && timeZone === NY && Array.isArray(releases), `unknown coverage or timezone for ${month}`);
    for (const record of releases) {
      const date = record?.date;
      check(typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
        date.slice(0, 7) === month && Number.isFinite(Date.parse(date)) &&
        dateKey(new Date(date)) === date, `invalid or out-of-month release date for ${month}`);
      if (date >= from && date < until) eligible.push(record);
    }
  }
  check(eligible.length === 1, `expected one release after ${wednesday}; found ${eligible.length}`);
  const record = eligible[0];
  return { release: record.date, instant: scheduledInstant(record) };
}

// now is an explicit Date or Unix epoch milliseconds; no implicit clock or networking.
// Each trusted schedule bundle: {month:'YYYY-MM', complete:true, timeZone:'America/New_York',
// releases:[{date:'YYYY-MM-DD', time:'HH:mm'}]}. Missing coverage is never a holiday.
export function qualifyH41Dates({ now, months } = {}) {
  const ms = now instanceof Date ? now.getTime() : now;
  check(typeof ms === 'number' && Number.isFinite(ms) && Number.isFinite(new Date(ms).getTime()) &&
    Array.isArray(months), 'explicit instant and monthly schedule required');
  const today = local(ms).date;
  check(/^\d{4}-\d{2}-\d{2}$/.test(today) && today >= '1900-01-01', 'unsupported civil date');
  const weekday = new Date(today).getUTCDay();
  const wednesday = shift(today, -((weekday + 4) % 7));
  // Strictly following Wednesday means that Wednesday itself cannot be release day
  // for THIS observation. Qualify only last week's pair on Wednesday.
  const latest = today === wednesday ? null : releaseFor(wednesday, months);
  const current = latest !== null && latest.instant <= ms;
  const expectedObservation = current ? wednesday : shift(wednesday, -7);
  const selected = current ? latest : releaseFor(expectedObservation, months);
  check(selected.instant <= ms, 'selected release is still embargoed');
  return {
    expectedRelease: selected.release,
    expectedObservation,
    referenceObservation: shift(expectedObservation, -28),
    releaseAt: new Date(selected.instant).toISOString(),
    selection: current ? 'current' : 'prior',
  };
}

// Resolve an exact prior observation without fabricating a current clock.
// The returned instant is the scheduled wall time, not first availability.
export function qualifyH41Release({ observation, months } = {}) {
  check(typeof observation === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(observation) &&
    observation >= '1900-01-01' && Array.isArray(months), 'explicit Wednesday and monthly schedule required');
  const date = new Date(observation);
  check(date.getUTCDay() === 3 && dateKey(date) === observation, 'invalid Wednesday observation');
  const { release, instant } = releaseFor(observation, months);
  return { observation, release, scheduledReleaseAt: new Date(instant).toISOString() };
}
