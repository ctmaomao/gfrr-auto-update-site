import { isTransportShockManualArtifactPath, safeRelativePath } from './check-script-helpers.mjs';

export function parseDisplayProjectionArgs(argv, input, output, usage) {
  const options = { input, output, printJson: false, writeOutput: true, strict: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    }
    if (arg === '--json') options.printJson = true;
    else if (arg === '--no-output') options.writeOutput = false;
    else if (arg === '--strict') options.strict = true;
    else if (arg === '--input' || arg === '--output') {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      options[arg === '--input' ? 'input' : 'output'] = value;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!isTransportShockManualArtifactPath(options.input)
    && !safeRelativePath(options.input)?.startsWith('docs/fixtures/transport-shock-confirmation-factor/')) {
    throw new Error(`Refusing to read input outside allowed Transport Shock artifact paths: ${options.input}`);
  }
  if (options.writeOutput && !isTransportShockManualArtifactPath(options.output)) {
    throw new Error(`Refusing to write display projection outside manual-artifacts/transport-shock-confirmation-factor/: ${options.output}`);
  }
  return options;
}
