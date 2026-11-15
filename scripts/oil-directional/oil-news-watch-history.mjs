// Read-only Git history shared by offline oil-news reviews. No sampling policy or writes.
import { spawnSync } from 'node:child_process';

export const WATCH_PATH = 'data/oil-news-event-watch.json';

function runGit(args) {
  const result = spawnSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });
  if (result.error) throw new Error(`Failed to run git ${args.join(' ')}: ${result.error.message}`);
  if (result.status !== 0) {
    const stderr = String(result.stderr ?? '').trim();
    throw new Error(`git ${args.join(' ')} failed: ${stderr || `exit ${result.status}`}`);
  }
  return String(result.stdout ?? '');
}

export function readCommitRows(maxCommits) {
  const output = runGit(['log', `--max-count=${maxCommits}`, '--format=%H%x09%ct%x09%s', '--', WATCH_PATH]);
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [hash, epochText, ...subjectParts] = line.split('\t');
      const epochSeconds = Number(epochText);
      return {
        hash,
        committedAt: Number.isFinite(epochSeconds) ? new Date(epochSeconds * 1000).toISOString() : null,
        subject: subjectParts.join('\t')
      };
    });
}

export function readWatchAtCommit(commit) {
  return {
    text: runGit(['show', `${commit.hash}:${WATCH_PATH}`]),
    source: {
      type: 'git_history',
      path: WATCH_PATH,
      commitHash: commit.hash,
      committedAt: commit.committedAt,
      commitSubject: commit.subject
    }
  };
}
