// A bare date is the first edition, never a mutable alias. Revisions keep the same issue date.
export const ISSUE_KEY_PATTERN = String.raw`\d{4}-\d{2}-\d{2}(?:-r(?:[2-9]|[1-9]\d))?`;
const keyPattern = new RegExp(`^(${ISSUE_KEY_PATTERN})$`);

export function parseIssueKey(key) {
  if (typeof key !== 'string' || !keyPattern.test(key)) throw new Error('Expected a real YYYY-MM-DD issue date or YYYY-MM-DD-rN revision');
  const date = key.slice(0, 10);
  if (Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error('Expected a real YYYY-MM-DD issue date');
  return { key, date, revision: key.length === 10 ? 1 : Number(key.slice(12)) };
}

export function compareIssueKeys(a, b) {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : a.revision - b.revision;
}

export function issueKeyFromFilename(name) {
  if (typeof name !== 'string' || !name.endsWith('.html')) return null;
  try { return parseIssueKey(name.slice(0, -5)); } catch { return null; }
}

export function previousIssueKey(issue) {
  if (issue.revision < 2) throw new Error('An initial edition has no predecessor');
  return issue.revision === 2 ? issue.date : `${issue.date}-r${issue.revision - 1}`;
}

export function validateSha(sha) {
  if (typeof sha !== 'string' || !/^[a-f0-9]{64}$/.test(sha)) throw new Error('Expected a lowercase SHA-256 digest');
}

function validateCommit(commit) {
  if (typeof commit !== 'string' || !/^[a-f0-9]{40}$/.test(commit)) throw new Error('A full remote handoff commit is required');
}

function hasFields(value, fields) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === fields;
}

export function validatePredecessor(issue, sha, predecessor) {
  if (issue.revision === 1) {
    if (predecessor !== undefined) throw new Error('An initial edition may not specify a predecessor');
    return;
  }
  if (!hasFields(predecessor, 'handoffCommit,sha256')) throw new Error('Revision requires an explicitly pinned predecessor');
  validateSha(predecessor.sha256);
  validateCommit(predecessor.handoffCommit);
  if (predecessor.sha256 === sha) throw new Error('Revision and predecessor must have different SHA-256 digests');
  return { sha256: predecessor.sha256, handoffCommit: predecessor.handoffCommit };
}

export function samePredecessor(a, b) {
  return a?.sha256 === b?.sha256 && a?.handoffCommit === b?.handoffCommit;
}

export function makeIssueReceipt(issue, sha, commit, predecessor) {
  validateSha(sha);
  validateCommit(commit);
  const prior = validatePredecessor(issue, sha, predecessor);
  if (prior && prior.handoffCommit === commit) throw new Error('Revision and predecessor must have distinct handoff commits');
  if (!prior) return { date: issue.date, sha256: sha, handoffCommit: commit };
  return { date: issue.date, revision: issue.revision, sha256: sha, handoffCommit: commit, predecessor: prior };
}

export function parseIssueReceipt(value) {
  const legacy = hasFields(value, 'date,handoffCommit,sha256');
  if (!legacy && !hasFields(value, 'date,handoffCommit,predecessor,revision,sha256')) throw new Error('Invalid expected issue manifest or handoff receipt');
  if (!legacy && (!Number.isInteger(value.revision) || value.revision < 2)) throw new Error('Invalid revision in handoff receipt');
  if (typeof value.date !== 'string' || value.date.length !== 10) throw new Error('Invalid issue date in handoff receipt');
  const issue = parseIssueKey(legacy ? value.date : `${value.date}-r${value.revision}`);
  return { issue, ...makeIssueReceipt(issue, value.sha256, value.handoffCommit, value.predecessor) };
}
