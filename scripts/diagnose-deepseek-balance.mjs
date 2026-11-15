import { runBalanceDiagnostic } from './lib/deepseek-balance-diagnostics.mjs';

// Always fail closed, including a successful shape read: this is never an
// editorial success or permission to generate, reserve, retry, or deploy.
try {
  console.log(JSON.stringify(await runBalanceDiagnostic(process.argv.slice(2), process.env)));
} catch {
  console.log(JSON.stringify({ schemaVersion: 'deepseek-balance-shape-v1', admission: 'hold', diagnostic: 'unavailable' }));
}
process.exitCode = 1;
