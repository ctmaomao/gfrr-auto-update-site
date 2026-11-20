import process from 'node:process';
import { isManualArtifactPath } from './check-script-helpers.mjs';

export function parseHistoryArchiveArgs(argv, defaults, printUsage, validateWindow) {
  const options = { ...defaults, overwrite: false, allowEmpty: false, dryRun: false, printJson: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
    if (arg === '--overwrite') options.overwrite = true;
    else if (arg === '--allow-empty') options.allowEmpty = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--json') options.printJson = true;
    else if (arg === '--output-dir' || arg === '--max-commits' || arg === '--max-samples') {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      if (arg === '--output-dir') options.outputDir = value;
      else if (arg === '--max-commits') options.maxCommits = Number(value);
      else options.maxSamples = Number(value);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  validateWindow(options.maxCommits, options.maxSamples);
  if (!isManualArtifactPath(options.outputDir)) {
    throw new Error(`Refusing to write outside manual-artifacts/: ${options.outputDir}`);
  }
  return options;
}
