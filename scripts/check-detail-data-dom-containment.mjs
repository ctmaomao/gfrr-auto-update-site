import fs from 'node:fs';

const INDEX_PATH = 'index.html';
const html = fs.readFileSync(INDEX_PATH, 'utf8');
const errors = [];

const voidTags = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr'
]);

const detailDataScopedIds = [
  'daily-brief-section',
  'daily-brief-state',
  'ai-interpretation-layer-section',
  'ai-interpretation-summary',
  'divergence-layer-section',
  'divergence-layer-summary',
  'brent-pricing-layer-section',
  'brent-selected-value',
  'brent-confirmation-sources',
  'brent-pricing-data-gaps'
];

function fail(message) {
  errors.push(message);
}

function parseIdAncestry(source) {
  const byId = new Map();
  const stack = [];
  const tagPattern = /<\/?([a-z][a-z0-9:-]*)\b([^<>]*)>/giu;
  let match;

  while ((match = tagPattern.exec(source))) {
    const tagSource = match[0];
    if (/^<!--|^<!doctype|^<!\[CDATA\[/iu.test(tagSource)) continue;

    const tagName = match[1].toLowerCase();
    const isClosing = tagSource.startsWith('</');
    if (isClosing) {
      const matchIndex = stack.map((entry) => entry.tagName).lastIndexOf(tagName);
      if (matchIndex >= 0) stack.length = matchIndex;
      continue;
    }

    const idMatch = tagSource.match(/\bid\s*=\s*["']([^"']+)["']/iu);
    const id = idMatch?.[1] || '';
    const node = {
      tagName,
      id,
      ancestors: stack.map((entry) => entry.id).filter(Boolean),
      ancestorTags: stack.map((entry) => entry.tagName),
      source: tagSource
    };

    if (id) {
      if (byId.has(id)) fail(`duplicate id found: ${id}`);
      byId.set(id, node);
    }

    const selfClosing = /\/\s*>$/u.test(tagSource) || voidTags.has(tagName);
    if (!selfClosing) stack.push(node);
  }

  return byId;
}

const byId = parseIdAncestry(html);

function requireId(id) {
  const node = byId.get(id);
  if (!node) fail(`missing id: ${id}`);
  return node;
}

function isInside(parentId, childId) {
  const child = byId.get(childId);
  return Boolean(child?.ancestors.includes(parentId));
}

requireId('detail-data');
requireId('method-evidence');

for (const id of detailDataScopedIds) {
  requireId(id);
  if (!isInside('detail-data', id)) {
    fail(`${id} must be parsed inside detail-data`);
  }
  if (isInside('method-evidence', id)) {
    fail(`${id} must not be parsed inside method-evidence`);
  }
}

for (const id of ['world-order-stress-section', 'external-ai-auxiliary', 'execution-risk-detail']) {
  requireId(id);
  if (isInside('detail-data', id)) fail(`${id} must remain outside detail-data`);
  if (isInside('method-evidence', id)) fail(`${id} must remain outside method-evidence`);
}

if (errors.length) {
  console.error('Detail data DOM containment check: FAIL');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Detail data DOM containment check: PASS (${detailDataScopedIds.length} detail ids)`);
