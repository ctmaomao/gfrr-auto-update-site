import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = p => readFileSync(resolve(root, p), 'utf8');
export function splitIssues(names, limit = 52) {
  const issues = names.filter(n => /^\d{4}-\d{2}-\d{2}\.html$/.test(n)).sort().reverse();
  return { recent: issues.slice(0, limit), archived: issues.slice(limit) };
}
export function archiveHtml(names, prefix = 'reports/') {
  return names.map(name => '<li><time datetime="' + name.slice(0,10) + '">' + name.slice(0,10) + '</time><a href="' + prefix + name + '">阅读固定期次全文</a></li>').join('\n');
}
export function expectedWeeklyPages() {
  const { recent, archived } = splitIssues(readdirSync(resolve(root, 'reports')));
  if (!recent.length) throw new Error('No dated weekly report exists');
  const latest = read('reports/' + recent[0]);
  const archive = '<section class="weekly-archive" id="history"><h2>历史周报</h2><p>最近52期列于此处。更早期次转入历史归档目录，原固定链接和正文继续保留，不自动永久删除。</p><ol>' + archiveHtml(recent) + '</ol><p><a href="reports/archive.html">查看更早期次</a></p></section>';
  const home = latest.replaceAll('href="../', 'href="').replace('</main>', archive + '</main>');
  const older = latest.slice(0, latest.indexOf('<body>') + 6).replace(/<title>[\s\S]*?<\/title>/, '<title>历史周报归档｜GFRR</title>') + '<nav class="page-bookmarks" aria-label="站内页面切换"><a class="pbm pbm-weekly pbm-active" href="../index.html" aria-current="page">每周周报</a><a class="pbm pbm-radar" href="../index.html?view=radar">全球雷达</a><a class="pbm pbm-bubble" href="../bubble-watch.html">AI泡沫</a></nav><main class="archive-container"><section class="weekly-archive"><h1>更早期次归档</h1><p>超过最近52期的正文保留固定日期链接，不自动删除。当前共有 ' + archived.length + ' 期。</p><ol>' + archiveHtml(archived, '') + '</ol><p><a href="../weekly-reports.html#history">返回最近52期</a></p></section></main></body></html>';
  const result = new Map([['weekly-reports.html', home], ['weekly-reports/index.html', home.replaceAll('href="reports/', 'href="../reports/').replaceAll('href="index.html', 'href="../index.html').replaceAll('href="bubble-watch.html', 'href="../bubble-watch.html').replaceAll('href="weekly-reports.html', 'href="../weekly-reports.html')], ['reports/archive.html', older]]);
  // Compatibility copies are deterministic; canonical dated reports are NEVER rewritten here.
  for (const name of [...recent, ...archived]) result.set('weekly-reports/' + name, read('reports/' + name));
  return result;
}
export function buildWeeklyReports({ check = false } = {}) {
  for (const [path, expected] of expectedWeeklyPages()) {
    if (check) { if (read(path) !== expected) throw new Error('Stale generated weekly page: ' + path); }
    else writeFileSync(resolve(root, path), expected);
  }
  console.log(check ? 'Weekly pages: PASS' : 'Weekly pages generated without deleting dated reports');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) buildWeeklyReports({ check: process.argv.includes('--check') });
