// check-bubble-watch-dom.mjs — second-page literal DOM id guard.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGE_PATH = path.join(ROOT, 'bubble-watch.html');
const PLAIN_ID = /^[A-Za-z][A-Za-z0-9_-]*$/u;
const html = fs.readFileSync(PAGE_PATH, 'utf8');

const htmlIds = new Set([...html.matchAll(/\bid=(['"])([^'"]+)\1/gu)].map((match) => match[2]));
const writes = [];

function collect(regex, normalize) {
  let match;
  while ((match = regex.exec(html))) {
    const id = normalize(match);
    if (PLAIN_ID.test(id)) {
      const line = html.slice(0, match.index).split('\n').length;
      writes.push({ line, id });
    }
  }
}

collect(/\bdocument\.getElementById\(\s*(['"`])([^'"`]+)\1\s*\)/gu, (match) => match[2]);
collect(/\bquerySelector(All)?\(\s*(['"`])#([A-Za-z][A-Za-z0-9_-]*)\2\s*\)/gu, (match) => match[3]);

const missing = writes.filter((write) => !htmlIds.has(write.id));

if (missing.length) {
  console.error('Bubble Watch DOM id contract: FAIL');
  for (const item of missing) {
    console.error(`- bubble-watch.html:${item.line} writes #${item.id}, but no matching id exists in bubble-watch.html`);
  }
  process.exit(1);
}

console.log(
  `Bubble Watch DOM id contract: PASS (${new Set(writes.map((write) => write.id)).size} literal render ids subset of ${htmlIds.size} page ids)`,
);
