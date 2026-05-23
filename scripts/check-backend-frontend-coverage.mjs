import fs from 'node:fs';
import path from 'node:path';

const DATA_PATH = 'data/radar-data.json';
const FRONTEND_SOURCE_FILES = [
  'index.html',
  'scripts/app.js',
  ...fs.readdirSync('scripts/modules')
    .filter((file) => file.endsWith('.js'))
    .map((file) => path.join('scripts/modules', file))
];

const IGNORED_BACKEND_FIELDS = new Map([
  [
    'externalAiInterpretationLayer.provider',
    'External AI raw provenance display guard (AGENTS.md Section 1 K-3A/3B); unlock requires independent reviewed PR + ADR.',
  ],
  [
    'externalAiInterpretationLayer.inputSource',
    'External AI raw provenance display guard (AGENTS.md Section 1 K-3A/3B); unlock requires independent reviewed PR + ADR.',
  ],
  [
    'externalAiInterpretationLayer.sourceSemantics',
    'External AI raw provenance display guard (AGENTS.md Section 1 K-3A/3B); unlock requires independent reviewed PR + ADR.',
  ],
  [
    'externalAiInterpretationLayer.provenance',
    'External AI raw provenance display guard (AGENTS.md Section 1 K-3A/3B); unlock requires independent reviewed PR + ADR.',
  ],
  [
    'externalAiInterpretationLayer.auditFlags',
    'External AI raw provenance display guard (AGENTS.md Section 1 K-3A/3B); unlock requires independent reviewed PR + ADR.',
  ],
]);

const errors = [];

function fail(message) {
  errors.push(message);
}

function typeOf(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function backendFieldPaths(data) {
  const fields = [];
  for (const [top, value] of Object.entries(data)) {
    fields.push({ path: top, top, child: '', type: typeOf(value) });
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [child, childValue] of Object.entries(value)) {
        fields.push({ path: `${top}.${child}`, top, child, type: typeOf(childValue) });
      }
    } else if (Array.isArray(value) && value[0] && typeof value[0] === 'object') {
      for (const [child, childValue] of Object.entries(value[0])) {
        fields.push({ path: `${top}[].${child}`, top, child, type: typeOf(childValue) });
      }
    }
  }
  return fields;
}

function loadFrontendSource() {
  return FRONTEND_SOURCE_FILES.map((file) => {
    if (!fs.existsSync(file)) {
      fail(`frontend source file missing: ${file}`);
      return '';
    }
    return fs.readFileSync(file, 'utf8');
  }).join('\n');
}

function isFieldReferenced(source, field) {
  const exactNeedles = [
    field.path,
    field.path.replace('[]', ''),
    field.path.replace('[]', '?.'),
  ];
  if (exactNeedles.some((needle) => needle && source.includes(needle))) return true;

  const topPattern = new RegExp(`\\b${escapeRegExp(field.top)}\\b`, 'u');
  if (!topPattern.test(source)) return false;
  if (!field.child) return true;

  const childPattern = new RegExp(`(?:\\b|\\.|\\?\\.)${escapeRegExp(field.child)}\\b`, 'u');
  return childPattern.test(source);
}

const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
const fields = backendFieldPaths(data);
const source = loadFrontendSource();
const fieldPathSet = new Set(fields.map((field) => field.path));

for (const ignoredPath of IGNORED_BACKEND_FIELDS.keys()) {
  if (!fieldPathSet.has(ignoredPath)) {
    fail(`ignore list contains stale backend field path: ${ignoredPath}`);
  }
}

const missing = [];
for (const field of fields) {
  if (isFieldReferenced(source, field)) continue;
  if (IGNORED_BACKEND_FIELDS.has(field.path)) continue;
  missing.push(field);
}

if (missing.length) {
  fail([
    'backend fields missing frontend coverage or explicit ignore:',
    ...missing.map((field) => `- ${field.path} (${field.type})`)
  ].join('\n'));
}

if (errors.length) {
  console.error('Backend/frontend coverage check: FAIL');
  for (const error of errors) console.error(error);
  process.exit(1);
}

console.log(`Backend/frontend coverage check: PASS (${fields.length} backend paths, ${IGNORED_BACKEND_FIELDS.size} ignored)`);
