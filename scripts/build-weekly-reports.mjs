import { readFileSync, readdirSync, writeFileSync, renameSync, existsSync, linkSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateOriginal } from './weekly-original.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = p => readFileSync(resolve(root, p), 'utf8');
export function splitIssues(names, limit = 52) {
  const issues = names.filter(n => /^\d{4}-\d{2}-\d{2}\.html$/.test(n)).sort().reverse();
  return { recent: issues.slice(0, limit), archived: issues.slice(limit) };
}
export function archiveHtml(names, prefix = 'reports/') {
  return names.map(name => '<li><time datetime="' + name.slice(0,10) + '">' + name.slice(0,10) + '</time><a href="' + prefix + name + '">阅读固定期次全文</a></li>').join('\n');
}
export function expectedWeeklyPages({ names = readdirSync(resolve(root, 'reports')), readFile = read } = {}) {
  const { recent, archived } = splitIssues(names);
  if (!recent.length) throw new Error('No dated weekly report exists');
  const latest = readFile('reports/' + recent[0]);
  const archive = '<section class="weekly-archive" id="history"><h2>历史周报</h2><p>最近52期列于此处。更早期次转入历史归档目录，原固定链接和正文继续保留，不自动永久删除。</p><ol>' + archiveHtml(recent) + '</ol><p><a href="reports/archive.html">查看更早期次</a></p></section>';
  // Current navigation belongs to generated entry pages, not immutable dated issues.
  const weeklyNavigation = '<nav class="page-bookmarks" aria-label="站内页面切换"><a class="pbm pbm-weekly pbm-active" href="weekly-reports.html" aria-current="page">每周周报</a><a class="pbm pbm-radar" href="index.html?view=radar">全球雷达</a><a class="pbm pbm-bubble" href="bubble-watch.html">AI泡沫</a><a class="pbm pbm-oil" href="oil-market.html">油市观察</a></nav>';
  const current = latest.replace(/<nav class="page-bookmarks"[^>]*>[\s\S]*?<\/nav>/, weeklyNavigation.replaceAll('href="', 'href="../'));
  const home = current.replaceAll('href="../', 'href="').replace(/<\/main\s*>/i, archive + '</main>');
  const bodyTag = /<body\b[^>]*>/i.exec(latest);
  if (!bodyTag) throw new Error('Weekly report has no body tag');
  const older = latest.slice(0, bodyTag.index + bodyTag[0].length).replace(/<title>[\s\S]*?<\/title>/, '<title>历史周报归档｜GFRR</title>') + weeklyNavigation.replaceAll('href="', 'href="../') + '<main class="archive-container"><section class="weekly-archive"><h1>更早期次归档</h1><p>超过最近52期的正文保留固定日期链接，不自动删除。当前共有 ' + archived.length + ' 期。</p><ol>' + archiveHtml(archived, '') + '</ol><p><a href="../weekly-reports.html#history">返回最近52期</a></p></section></main></body></html>';
  const result = new Map([['weekly-reports.html', home], ['weekly-reports/index.html', home.replaceAll('href="reports/', 'href="../reports/').replaceAll('href="index.html', 'href="../index.html').replaceAll('href="bubble-watch.html', 'href="../bubble-watch.html').replaceAll('href="oil-market.html', 'href="../oil-market.html').replaceAll('href="weekly-reports.html', 'href="../weekly-reports.html')], ['reports/archive.html', older]]);
  // Compatibility copies are deterministic; canonical dated reports are NEVER rewritten here.
  for (const name of [...recent, ...archived]) result.set('weekly-reports/' + name, readFile('reports/' + name));
  return result;
}
export function buildWeeklyReports({ check = false } = {}) {
  // The existing 2026-11-09 fixed report predates original retention; its bytes
  // remain in Git. New reports must carry a matching content-addressed original.
  for (const name of splitIssues(readdirSync(resolve(root, 'reports'))).recent.concat(splitIssues(readdirSync(resolve(root, 'reports'))).archived)) {
    if (name === '2026-11-09.html') continue;
    const date = name.slice(0, 10);
    const sha = read(`weekly-originals/${date}/identity.sha256`).trim();
    if (!/^[a-f0-9]{64}$/.test(sha)) throw new Error('Invalid weekly original identity: ' + name);
    const original = readFileSync(resolve(root, `weekly-originals/${date}/${sha}.html`));
    validateOriginal(original, date, sha);
    if (!readFileSync(resolve(root, `reports/${name}`)).equals(original)) throw new Error('Fixed weekly report differs from original: ' + name);
  }
  const pages = expectedWeeklyPages();
  // Dated compatibility pages are immutable. Preflight all before touching any entry page.
  for (const [path, expected] of pages) {
    if (/^weekly-reports\/\d{4}-\d{2}-\d{2}\.html$/.test(path) && existsSync(resolve(root, path)) && read(path) !== expected) throw new Error('Refusing to overwrite fixed weekly page: ' + path);
  }
  for (const [path, expected] of pages) {
    if (check) { if (read(path) !== expected) throw new Error('Stale generated weekly page: ' + path); }
    else if (/^weekly-reports\/\d{4}-\d{2}-\d{2}\.html$/.test(path)) {
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
