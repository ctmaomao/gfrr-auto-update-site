import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const FILES = [
  'scripts/app.js',
  'scripts/run-realtime.mjs',
  'scripts/run-daily-pipeline.mjs',
  'scripts/validate-data.mjs',
  'scripts/check-dom-ids.mjs',
  'scripts/check-module-imports.mjs',
  'scripts/modules/realtime.js',
  'scripts/modules/render.js',
  'scripts/modules/renderTables.js',
  'scripts/modules/renderCharts.js',
  'scripts/modules/renderAudit.js',
  'scripts/modules/displayTextBuilders.js',
  'scripts/modules/decision.js',
  'scripts/modules/config.js',
  'scripts/modules/format.js'
];

const failures = [];

for (const file of FILES) {
  if (!fs.existsSync(file)) {
    console.log(`SKIP ${file}`);
    continue;
  }

  const result = spawnSync(process.execPath, ['--check', file], {
    encoding: 'utf8'
  });

  if (result.status === 0) {
    console.log(`OK ${file}`);
    continue;
  }

  failures.push(file);
  console.error(`FAIL ${file}`);
  if (result.stdout) console.error(result.stdout.trimEnd());
  if (result.stderr) console.error(result.stderr.trimEnd());
}

if (failures.length > 0) {
  console.error(`Syntax check failed: ${failures.length} file(s) failed`);
  process.exit(1);
}

console.log('Syntax check passed');
