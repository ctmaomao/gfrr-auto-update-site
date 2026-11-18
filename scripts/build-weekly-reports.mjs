import { readFileSync, readdirSync, writeFileSync, renameSync, existsSync, linkSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_WEEKLY_BYTES, readStoredPredecessor, validateOriginal, weeklyDocumentBoundaries } from './weekly-original.mjs';
import { compareIssueKeys, issueKeyFromFilename, parseIssueKey } from './weekly-issue-identity.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = p => readFileSync(resolve(root, p), 'utf8');
function datedIssue(name) {
  const issue = issueKeyFromFilename(name);
  if (!issue && /^\d{4}-\d{2}-\d{2}(?:-r[^/]*)?\.html$/.test(name)) throw new Error('Invalid dated weekly path: ' + name);
  return issue;
}
export function splitIssues(names, limit = 52) {
  const issues = names.map(datedIssue).filter(Boolean).sort((a, b) => compareIssueKeys(b, a));
  const currentDates = new Set([...new Set(issues.map(issue => issue.date))].slice(0, limit));
  const recent = [], archived = [];
  for (const issue of issues) (currentDates.has(issue.date) ? recent : archived).push(issue.key + '.html');
  return { recent, archived };
}
export function archiveHtml(names, prefix = 'reports/') {
  const grouped = Map.groupBy(names.map(name => parseIssueKey(name.slice(0, -5))), issue => issue.date);
  return [...grouped.entries()].map(([date, [latest, ...older]]) => {
    const revisionLabel = latest.revision === 1 ? '' : '（第' + latest.revision + '版）';
    const revisions = older.map(issue => '<li><a href="' + prefix + issue.key + '.html">第' + issue.revision + '版（已被取代）</a></li>').join('');
    return '<li><time datetime="' + date + '">' + date + '</time><a href="' + prefix + latest.key + '.html">阅读固定期次全文' + revisionLabel + '</a>' + (revisions ? '<ul>' + revisions + '</ul>' : '') + '</li>';
  }).join('\n');
}

// The generated site chrome owns its styles; frozen issues may have different typography or no navigation at all.
// Keep this one inline block identical across the three shells for the static CSP hash inventory.
const shellStyle = `<style>
.weekly-site-shell, .weekly-archive {
  --paper-bg:#FBF7F0; --paper-ink:#1A1815; --paper-line:rgba(26,24,21,.16); --paper-line-strong:#1A1815;
  --font-display:"Playfair Display","Noto Serif SC","Source Han Serif SC","Songti SC",serif;
  --font-serif:"Noto Serif SC","Source Han Serif SC","Songti SC",serif;
  --font-mono:"IBM Plex Mono","SF Mono",Menlo,Consolas,monospace;
  background:var(--paper-bg); color:var(--paper-ink);
}
.weekly-site-shell .page-bookmarks { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:0; position:relative; padding:0; border:0; margin:16px clamp(18px,4vw,48px) 0; }
.weekly-site-shell .page-bookmarks .pbm { display:block; padding:10px 14px; border:1px solid var(--paper-line); border-bottom:2px solid var(--paper-line-strong); background:var(--paper-bg); color:var(--paper-ink); font:13px/1.4 var(--font-serif); text-decoration:none; }
.weekly-site-shell .page-bookmarks .pbm + .pbm { border-left:0; }
.weekly-site-shell .page-bookmarks .pbm[aria-current="page"] { background:var(--paper-ink); color:var(--paper-bg); }
.weekly-site-shell .weekly-shell-actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:0 18px; margin:8px clamp(18px,4vw,48px) 0; border-bottom:1px solid var(--paper-line); }
.weekly-site-shell .weekly-shell-actions a { display:inline-flex; align-items:center; min-height:44px; color:var(--paper-ink); font:13px/1.4 var(--font-mono); text-decoration:underline; text-underline-offset:4px; }
.weekly-site-shell .page-bookmarks .pbm:hover, .weekly-site-shell .weekly-shell-actions a:hover { text-decoration:underline; text-underline-offset:4px; }
.weekly-site-shell a:focus-visible { outline:2px solid var(--paper-line-strong); outline-offset:2px; }
.weekly-archive { margin:42px 0 0; padding:28px 0; border-top:3px double var(--paper-ink); font-family:var(--font-serif); }
.weekly-archive h1, .weekly-archive h2 { font-family:var(--font-display); }
.weekly-archive ol { list-style:none; padding:0; }
.weekly-archive li { border-bottom:1px solid var(--paper-line); padding:12px 0; }
.weekly-archive time { font:12px var(--font-mono); margin-right:14px; }
.weekly-archive p { font-size:14px; }
.archive-container { max-width:960px; margin:auto; padding:40px 20px; }
@media(max-width:600px) {
  .weekly-site-shell .page-bookmarks { margin:12px 18px 0; }
  .weekly-site-shell .page-bookmarks .pbm { padding:9px 11px; font-size:12px; }
}
@media print { .weekly-site-shell { display:none; } }
</style>`;

function siteShell(prefix, latest) {
  const navigation = '<nav class="page-bookmarks" aria-label="站内页面切换"><a class="pbm pbm-weekly pbm-active" href="' + prefix + 'weekly-reports.html" aria-current="page">每周周报</a><a class="pbm pbm-radar" href="' + prefix + 'index.html?view=radar">全球雷达</a><a class="pbm pbm-bubble" href="' + prefix + 'bubble-watch.html">AI泡沫</a><a class="pbm pbm-oil" href="' + prefix + 'oil-market.html">油市观察</a></nav>';
  const actions = '<nav class="weekly-shell-actions" aria-label="周报操作"><a href="' + prefix + 'weekly-reports.html#history">历史周报</a><a href="' + prefix + 'reports/' + latest + '" download="GFRR_Weekly_' + latest + '">下载单文件HTML</a></nav>';
  return '<div class="weekly-site-shell">' + navigation + actions + '</div>';
}

export function expectedWeeklyPages({ names = readdirSync(resolve(root, 'reports')), readFile = read } = {}) {
  const { recent, archived } = splitIssues(names);
  if (!recent.length) throw new Error('No dated weekly report exists');
  const latest = readFile('reports/' + recent[0]);
  const { title, headCloseStart, bodyStart, bodyEnd } = weeklyDocumentBoundaries(latest);
  const styledHead = headCloseStart === null ? latest.slice(0, bodyStart) + shellStyle + '</head>' :
    latest.slice(0, headCloseStart) + shellStyle + latest.slice(headCloseStart, bodyStart);
  const bodyTag = latest.slice(bodyStart, bodyEnd);
  const body = latest.slice(bodyEnd)
    .replace(/<nav class="page-bookmarks"[^>]*>[\s\S]*?<\/nav>/i, '');
  // Only the frozen 2026-11-09 edition has these two legacy site actions.
  // Omit their duplicates from its rendered entry, leaving its original, print control and text alone.
  const article = recent[0] === '2026-11-09.html' ? body
    .replace('<a class="btn" href="../reports/2026-11-09.html" download="GFRR_Weekly_2026-11-09.html">下载单文件HTML</a>', '')
    .replace('<a class="btn" href="../weekly-reports.html#history">历史周报</a>', '') : body;
  function entry(prefix) {
    const archive = '<section class="weekly-archive" id="history"><h2>历史周报</h2><p>最近52期列于此处。更早期次转入历史归档目录，原固定链接和正文继续保留，不自动永久删除。</p><ol>' + archiveHtml(recent, prefix + 'reports/') + '</ol><p><a href="' + prefix + 'reports/archive.html">查看更早期次</a></p></section>';
    const content = prefix ? article : article.replaceAll('href="../', 'href="');
    return styledHead + bodyTag + siteShell(prefix, recent[0]) + content.replace(/<\/main\s*>/i, close => archive + close);
  }
  const archiveHead = styledHead.slice(0, title.start) + '<title>历史周报归档｜GFRR</title>' + styledHead.slice(title.end);
  const older = archiveHead + bodyTag + siteShell('../', recent[0]) + '<main class="archive-container"><section class="weekly-archive"><h1>更早期次归档</h1><p>超过最近52期的正文保留固定日期链接，不自动删除。当前共有 ' + new Set(archived.map(name => name.slice(0, 10))).size + ' 期。</p><ol>' + archiveHtml(archived, '') + '</ol><p><a href="../weekly-reports.html#history">返回最近52期</a></p></section></main></body></html>';
  const result = new Map([['weekly-reports.html', entry('')], ['weekly-reports/index.html', entry('../')], ['reports/archive.html', older]]);
  // Compatibility copies are deterministic; canonical dated reports are NEVER rewritten here.
  for (const name of [...recent, ...archived]) result.set('weekly-reports/' + name, readFile('reports/' + name));
  return result;
}
export function checkWeeklyPageSizes(pages) {
  for (const [path, content] of pages) {
    if (Buffer.byteLength(content, 'utf8') > MAX_WEEKLY_BYTES) throw new Error('Weekly page exceeds 2 MiB limit: ' + path);
  }
}
export function buildWeeklyReports({ check = false } = {}) {
  // The existing 2026-11-09 fixed report predates original retention; its bytes
  // remain in Git. New reports must carry a matching content-addressed original.
  const { recent, archived } = splitIssues(readdirSync(resolve(root, 'reports')));
  for (const name of [...recent, ...archived]) {
    if (name === '2026-11-09.html') continue;
    const date = name.slice(0, -5);
    const sha = read(`weekly-originals/${date}/identity.sha256`).trim();
    if (!/^[a-f0-9]{64}$/.test(sha)) throw new Error('Invalid weekly original identity: ' + name);
    readStoredPredecessor(root, parseIssueKey(date), sha);
    const original = readFileSync(resolve(root, `weekly-originals/${date}/${sha}.html`));
    validateOriginal(original, date, sha);
    if (!readFileSync(resolve(root, `reports/${name}`)).equals(original)) throw new Error('Fixed weekly report differs from original: ' + name);
  }
  const pages = expectedWeeklyPages();
  // An orphan compatibility page would otherwise be published by the static allowlist.
  for (const name of readdirSync(resolve(root, 'weekly-reports'))) {
    if (datedIssue(name) && !pages.has('weekly-reports/' + name)) throw new Error('Orphan compatibility weekly page: ' + name);
  }
  checkWeeklyPageSizes(pages);
  // Dated compatibility pages are immutable. Preflight all before touching any entry page.
  for (const [path, expected] of pages) {
    if (path.startsWith('weekly-reports/') && issueKeyFromFilename(path.slice('weekly-reports/'.length)) && existsSync(resolve(root, path)) && read(path) !== expected) throw new Error('Refusing to overwrite fixed weekly page: ' + path);
  }
  for (const [path, expected] of pages) {
    if (check) { if (read(path) !== expected) throw new Error('Stale generated weekly page: ' + path); }
    else if (path.startsWith('weekly-reports/') && issueKeyFromFilename(path.slice('weekly-reports/'.length))) {
      const target = resolve(root, path);
      if (!existsSync(target)) {
        const temp = target + '.' + randomUUID() + '.tmp';
        writeFileSync(temp, expected, { flag: 'wx' });
        try { linkSync(temp, target); }
        catch (error) { if (error.code !== 'EEXIST' || read(path) !== expected) throw error; }
        finally { unlinkSync(temp); }
      }
    } else {
      const target = resolve(root, path);
      const temp = target + '.' + randomUUID() + '.tmp';
      writeFileSync(temp, expected, { flag: 'wx' });
      renameSync(temp, target);
    }
  }
  console.log(check ? 'Weekly pages: PASS' : 'Weekly pages generated without deleting dated reports');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) buildWeeklyReports({ check: process.argv.includes('--check') });
