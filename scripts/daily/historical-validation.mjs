import { createHash } from 'node:crypto';

export function isHistoricalDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function historicalNumber(value) {
  if (value === null || value === undefined || typeof value === 'boolean' || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// Latest-vintage observations and today's rules only support retrospective replay.
// A post-calibration date alone is insufficient evidence of a frozen, unseen test.
export function describeHistoricalValidation(rules, dates) {
  const calibration = rules.riskCalibrations?.dxyBroadDollar;
  const calibrationEnd = isHistoricalDate(calibration?.sampleEnd) ? calibration.sampleEnd : null;
  if (dates.some(date => !isHistoricalDate(date))) throw new Error('Invalid historical evaluation date');
  return {
    method: 'retrospective_latest_vintage_v1',
    predictiveEvidence: false,
    pointInTimeData: false,
    frozenOutOfSample: false,
    rulesSha256: createHash('sha256').update(JSON.stringify(rules)).digest('hex'),
    calibration: { start: calibration?.sampleStart ?? null, end: calibrationEnd },
    evaluatedRows: dates.length,
    rowsAtOrBeforeCalibrationEnd: calibrationEnd ? dates.filter(date => date <= calibrationEnd).length : null,
    rowsAfterCalibrationEnd: calibrationEnd ? dates.filter(date => date > calibrationEnd).length : null,
    blockers: [
      'Historical releases and revision vintages are not available in this replay.',
      'Current rules are reused; a model frozen before an untouched test window is not supplied.',
      'Event windows are retrospective diagnostics, not preregistered predictive targets.'
    ]
  };
}
