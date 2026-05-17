import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const errors = [];
function fail(msg) { errors.push(msg); }

const backlogPath = resolve('docs/PROJECT_BACKLOG.md');

if (!existsSync(backlogPath)) {
  fail('M-57: docs/PROJECT_BACKLOG.md does not exist');
  console.error('Project backlog format check FAILED:');
  errors.forEach((err) => console.error('  -', err));
  process.exit(1);
}

const content = readFileSync(backlogPath, 'utf8');

const expectedSections = [
  '## Section 1',
  '## Section 2',
  '## Section 3',
  '## Section 4',
  '## Section 5',
  '## Section 6',
];

for (const section of expectedSections) {
  if (!content.includes(section)) {
    fail(`M-57 project-backlog: missing section header "${section}"`);
  }
}

for (let i = 0; i < expectedSections.length; i += 1) {
  const startMarker = expectedSections[i];
  const endMarker = i < expectedSections.length - 1 ? expectedSections[i + 1] : null;
  const startIdx = content.indexOf(startMarker);
  const endIdx = endMarker ? content.indexOf(endMarker) : content.length;

  if (startIdx === -1) continue;

  const sectionContent = content.substring(startIdx + startMarker.length, endIdx);
  if (sectionContent.trim().length < 50) {
    fail(`M-57 project-backlog: section "${startMarker}" appears empty or too short`);
  }
}

if (content.trim().length < 500) {
  fail('M-57 project-backlog: file is too short, may be a stub');
}

if (errors.length > 0) {
  console.error('Project backlog format check FAILED:');
  errors.forEach((err) => console.error('  -', err));
  process.exit(1);
}

console.log('Project backlog format check: PASS (6 sections present + content valid)');
