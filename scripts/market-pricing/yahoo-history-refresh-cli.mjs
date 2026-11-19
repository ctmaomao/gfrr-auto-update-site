import path from 'node:path';

const HISTORY_FILE = 'data/market-pricing-history.json';
const ARTIFACT_ROOT = 'manual-artifacts/market-pricing';
const OPTIONS = new Map([['--history-file', 'historyFile'], ['--artifact-path', 'artifactPath']]);
const argumentError = message => Object.assign(new Error(message), { exitCode: 2 });

export function createYahooHistoryRefreshCli({ root, artifactDefault, label }) {
  function parseCliArgs(argv) {
    const options = { historyFile: HISTORY_FILE, artifactPath: artifactDefault, dryRun: true, commitHistory: false, quiet: false };
    for (let index = 0; index < argv.length; index += 1) {
      const arg = argv[index];
      if (arg === '--dry-run' || arg === '--commit-history') {
        options.commitHistory = arg === '--commit-history';
        options.dryRun = !options.commitHistory;
      } else if (arg === '--quiet') {
        options.quiet = true;
      } else {
        const equals = arg.indexOf('=');
        const flag = equals === -1 ? arg : arg.slice(0, equals);
        const key = OPTIONS.get(flag);
        if (!key) throw argumentError(`Unknown ${label} refresh argument: ${arg}`);
        if (equals !== -1) {
          options[key] = arg.slice(equals + 1);
        } else {
          const next = argv[++index];
          if (!next || next.startsWith('--')) throw argumentError(`Missing value for ${flag}`);
          options[key] = next;
        }
      }
    }
    return options;
  }

  function resolveHistoryFile(value) {
    const resolved = path.resolve(root, value || HISTORY_FILE);
    if (resolved !== path.resolve(root, HISTORY_FILE)) throw argumentError(`History file target must be ${HISTORY_FILE}`);
    return resolved;
  }

  function resolveArtifactPath(value) {
    const resolved = path.resolve(root, value || artifactDefault);
    const allowed = path.resolve(root, ARTIFACT_ROOT);
    if (resolved !== allowed && !resolved.startsWith(`${allowed}${path.sep}`)) {
      throw argumentError(`${label} Yahoo artifact path must stay under ${ARTIFACT_ROOT}/.`);
    }
    return resolved;
  }

  return { parseCliArgs, resolveHistoryFile, resolveArtifactPath,
    toProjectRelative: absolutePath => path.relative(root, absolutePath).replace(/\\/g, '/') };
}
