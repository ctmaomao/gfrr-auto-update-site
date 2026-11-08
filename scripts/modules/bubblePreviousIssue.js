const dateOnly = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);

// Browser-safe, original-clock checks. This is history eligibility only, never
// current-issue freshness. The Node preservation path additionally replays the
// full production output contract against sourceData.
export function previousIssueMetadataValid(issue, currentDate, nowMs = Date.now()) {
  try {
    const l = issue?.editorial, source = issue?.sourceData;
    if (issue?.schemaVersion !== 'bubble-watch-previous-weekly-issue-v1' || !l || !source) return false;
    if (!dateOnly(currentDate) || !dateOnly(l.asOfDate) || l.asOfDate > currentDate || source.as_of_date !== l.asOfDate) return false;
    if (!['bubble-watch-v2','bubble-watch-v3'].includes(source.contractVersion)) return false;
    if (source.summary?.weekly_editorial || source.summary?.previous_weekly_editorial) return false;
    if (l.provenance?.generatedBy !== 'github_actions_workflow' || !/^[a-f0-9]{40}$/u.test(l.provenance.sourceCommit || '')
      || !/^[1-9]\d*$/u.test(String(l.provenance.runId || ''))) return false;
    if (!sha(l.provenance.inputDigest) || !sha(l.provenance.artifactDigest)
      || l.validation?.artifactDigest !== l.provenance.artifactDigest || !sha(issue.sourceDataDigest)) return false;
    if (l.output?.asOfDate !== l.asOfDate || l.freshness?.sourceAsOfDate !== l.asOfDate
      || l.freshness?.artifactGeneratedAt !== l.output?.generatedAt || l.freshness?.maxAgeHours !== 240) return false;
    const generated = Date.parse(l.generatedAt), artifact = Date.parse(l.output.generatedAt), asOf = Date.parse(l.asOfDate);
    if (![generated,artifact,nowMs].every(Number.isFinite) || generated > nowMs || artifact > generated
      || artifact < asOf || generated - asOf > 240 * 3600000 || generated - artifact > 240 * 3600000) return false;
    return true;
  } catch { return false; }
}

export async function verifyPreviousIssueDigests(issue, currentDate, nowMs = Date.now(), subtle = globalThis.crypto?.subtle) {
  if (!previousIssueMetadataValid(issue, currentDate, nowMs) || !subtle) return false;
  try {
    const digest = async value => [...new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))]
      .map(byte=>byte.toString(16).padStart(2,'0')).join('');
    return await digest(issue.editorial.output) === issue.editorial.provenance.artifactDigest
      && await digest(issue.sourceData) === issue.sourceDataDigest;
  } catch { return false; }
}
