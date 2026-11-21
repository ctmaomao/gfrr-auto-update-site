import { parseObservationDate, reserveBalanceChange } from './source-observation.mjs';

// Carry only evidence still tied to the retained level and exact comparison.
function matchesEndpoint(endpoint, date, value, nowIso) {
  if (!endpoint || endpoint.value !== value || !Number.isFinite(value) || value < 0
      || endpoint.observationDate !== date || typeof date !== 'string'
      || parseObservationDate(date, nowIso) !== date || new Date(date).getUTCDay() !== 3) return false;
  const { releaseDate, url, scheduledReleaseAt, retrievedAt, bodySha256 } = endpoint;
  const lag = (Date.parse(releaseDate) - Date.parse(date)) / 86_400_000;
  const clock = (time) => typeof time === 'string' && Number.isFinite(Date.parse(time))
    && new Date(time).toISOString() === time;
  return typeof releaseDate === 'string' && parseObservationDate(releaseDate, nowIso) === releaseDate
    && lag >= 1 && lag <= 6
    && url === `https://www.federalreserve.gov/releases/h41/${releaseDate.replaceAll('-', '')}/`
    && typeof bodySha256 === 'string' && /^[a-f0-9]{64}$/.test(bodySha256)
    && clock(scheduledReleaseAt) && clock(retrievedAt)
    && Date.parse(scheduledReleaseAt) <= Date.parse(retrievedAt)
    && Date.parse(retrievedAt) <= Date.parse(nowIso);
}

export function matchingH41Receipt(name, receipt, { value, date, change, reference, nowIso }) {
  const current = receipt?.current;
  if (!matchesEndpoint(current, date, value, nowIso) || (name === 'walcl' && value <= 0)) return null;
  const prior = receipt.reference;
  if (prior && (name === 'walcl' || (reference?.value === prior.value && reference?.date === prior.observationDate))
      && matchesEndpoint(prior, prior.observationDate, prior.value, nowIso)
      && reserveBalanceChange([{ date: prior.observationDate, value: prior.value }, { date, value }], nowIso).change === change
      && Number.isFinite(change)) return { current, reference: prior };
  return name === 'reserveBalances' ? { current } : null;
}
