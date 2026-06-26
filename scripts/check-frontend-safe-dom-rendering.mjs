import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function readText(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function listActiveFrontendFiles() {
  const moduleDir = path.join(ROOT, 'scripts/modules');
  const moduleFiles = readdirSync(moduleDir)
    .filter((file) => file.endsWith('.js') && file !== 'realtime.js')
    .map((file) => `scripts/modules/${file}`);
  return ['scripts/app.js', ...moduleFiles];
}

const forbiddenPatterns = [
  { label: 'innerHTML', pattern: /\.innerHTML\b/u },
  { label: 'outerHTML', pattern: /\.outerHTML\b/u },
  { label: 'insertAdjacentHTML', pattern: /\.insertAdjacentHTML\s*\(/u },
];

const violations = [];

for (const file of listActiveFrontendFiles()) {
  const lines = readText(file).split(/\r?\n/u);
  lines.forEach((line, index) => {
    for (const forbidden of forbiddenPatterns) {
      if (forbidden.pattern.test(line)) {
        violations.push(`${file}:${index + 1}: forbidden ${forbidden.label}: ${line.trim()}`);
      }
    }
  });
}

if (violations.length > 0) {
  console.error('Frontend safe DOM rendering check FAILED:');
  for (const violation of violations) console.error('  -', violation);
  process.exit(1);
}

console.log(`Frontend safe DOM rendering check: PASS (${listActiveFrontendFiles().length} files)`);
