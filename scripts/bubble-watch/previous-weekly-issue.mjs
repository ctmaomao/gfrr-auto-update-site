import { validateWeeklyEditorialProduction } from './weekly-editorial-production.mjs';
import { createHash } from 'node:crypto';
import { previousIssueMetadataValid } from '../modules/bubblePreviousIssue.js';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function validatePreviousWeeklyIssue(issue, currentDate, nowMs = Date.now()) {
  if (!previousIssueMetadataValid(issue, currentDate, nowMs)) return false;
  if (digest(issue.editorial.output) !== issue.editorial.provenance.artifactDigest
    || digest(issue.sourceData) !== issue.sourceDataDigest) return false;
  return validateWeeklyEditorialProduction(issue.editorial, issue.sourceData).ok;
}

// Only the previous published data file is supplied by the builder. Never read
// manual artifacts, regenerate prose, refresh timestamps, or bind old scores to
// the new issue. Keep one immutable original issue, including its scoring proof.
export function preservePreviousWeeklyIssue(next, previous, nowMs = Date.now()) {
  const candidates = [previous?.summary?.previous_weekly_editorial];
  if (previous?.summary?.weekly_editorial) {
    const sourceData = structuredClone(previous);
    delete sourceData.summary.weekly_editorial;
    delete sourceData.summary.previous_weekly_editorial;
    // Rendering and validation need only the original issue's structured data.
    for (const key of Object.keys(sourceData)) {
      if (!['contractVersion', 'as_of_date', 'summary', 'scoring', 'indicators'].includes(key)) delete sourceData[key];
    }
    candidates.push({schemaVersion:'bubble-watch-previous-weekly-issue-v1',
      editorial:structuredClone(previous.summary.weekly_editorial), sourceData,
      sourceDataDigest:digest(sourceData)});
  }
  const valid = candidates.filter(issue => validatePreviousWeeklyIssue(issue, next.as_of_date, nowMs));
  valid.sort((a,b) => b.editorial.asOfDate.localeCompare(a.editorial.asOfDate)
    || Date.parse(b.editorial.generatedAt) - Date.parse(a.editorial.generatedAt));
  if (valid.length) next.summary.previous_weekly_editorial = structuredClone(valid[0]);
  else delete next.summary.previous_weekly_editorial;
  return valid.length > 0;
}
