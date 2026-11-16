// scripts/check-dom.mjs
// check:dom — DOM id 契约守卫。
// 校验:render 层「字面字符串 id」写入必须在所属页面中存在(catch 改名/typo/写到不存在 id)。
// 静态范围:只校验字面 id;模板字面量/变量构造的动态 id(narrative-N / heatmap-cell-* / wo-dim-* /
//   exec-*-N / detail-* 等,集合稳定、已人工验证零失配)不做静态展开。
// 反向(html id 无 render 写入)不校验(静态容器多、噪音大)。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLAIN_ID = /^[A-Za-z][A-Za-z0-9_-]*$/; // 合法 plain id;排除选择器

const pages = ['index.html', 'oil-market.html'];
const pageIds = new Map(pages.map((page) => {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  return [page, new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]))];
}));

// ADR-scoped ownership: sharing a renderer does not allow another page to
// silently satisfy a missing target. Both conclusions must exist independently.
function owners({ file, id }) {
  if (path.basename(file) === 'renderOilDirectional.js') {
    if (id === 'odp-verdict' || id === 'odp-headline') return pages;
    if (id === 'hero-odp-ref-verdict') return ['index.html'];
    if (id.startsWith('odp-')) return ['oil-market.html'];
  }
  if (path.basename(file) === 'oilMarketPage.js') return ['oil-market.html'];
  return ['index.html'];
}

const jsFiles = fs
  .readdirSync(path.join(root, 'scripts', 'modules'))
  .filter((f) => f.endsWith('.js'))
  .map((f) => path.join(root, 'scripts', 'modules', f));
jsFiles.push(path.join(root, 'scripts', 'app.js'));

// 单 id 首参 helper + $()(作 id 用,plain-id token 才算)
const SINGLE = ['setLeafText', 'setExternalAiReferenceListText', 'setToneClass', 'setBadge', 'setMiniCardState', 'updateToneClass', '\\$'];
const writes = []; // { file, line, id }
for (const file of jsFiles) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((ln, i) => {
    for (const h of SINGLE) {
      const re = new RegExp(`${h === '\\$' ? '(?<![\\w$])' : '\\b'}${h}\\(\\s*'([^']+)'`, 'g');
      let m;
      while ((m = re.exec(ln))) if (PLAIN_ID.test(m[1])) writes.push({ file, line: i + 1, id: m[1] });
    }
    const sis = /\bsetIndicatorStatus\(\s*'([^']+)'\s*,\s*'([^']+)'/g;
    let s;
    while ((s = sis.exec(ln))) {
      if (PLAIN_ID.test(s[1])) writes.push({ file, line: i + 1, id: s[1] });
      if (PLAIN_ID.test(s[2])) writes.push({ file, line: i + 1, id: s[2] });
    }
  });
}

const missing = writes.flatMap((w) => owners(w).filter((page) => !pageIds.get(page).has(w.id)).map((page) => ({ ...w, page })));
if (missing.length) {
  console.error('DOM id contract FAIL — render 写入的字面 id 不在所属页面:');
  for (const m of missing) console.error(`  ${path.relative(root, m.file)}:${m.line} -> ${m.page} #${m.id}`);
  process.exit(1);
}
console.log(
  `DOM id contract check: PASS (${new Set(writes.map((w) => w.id)).size} literal render ids subset of ${pages.join(" / ")} page-owned html ids; dynamic-template ids out of static scope)`,
);
