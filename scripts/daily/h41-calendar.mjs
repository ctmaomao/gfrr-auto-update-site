// Narrow fail-closed parser for the Fed's server-rendered monthly Calendar.
// No networking, date inference, or fallback to other rows.
const months = 'January February March April May June July August September October November December'.split(' ');
const label = 'H.4.1 - Factors Affecting Reserve Balances';
const hint = /H\s*\.\s*4\s*\.\s*1\b|Factors Affecting Reserve Balances/i;

function check(ok, reason) {
  if (!ok) throw new Error(`Unqualified H.4.1 calendar: ${reason}`);
}

function one(matches, reason) {
  check(matches.length === 1, reason);
  return matches[0];
}

// Parse only explicitly closed divs in the calendar, leaving invalid nested <p>
// tags in unrelated Fed descriptions alone.
function tree(markup) {
  const root = { children: [] };
  const stack = [root];
  for (const match of markup.matchAll(/<div\b([^>]*)>|<\/div\s*>/gi)) {
    if (match[1] !== undefined) {
      const cls = /\bclass\s*=\s*(['"])(.*?)\1/i.exec(match[1])?.[2] ?? '';
      const node = { cls: cls.split(/\s+/), begin: match.index, open: match.index + match[0].length, children: [] };
      stack.at(-1).children.push(node);
      stack.push(node);
    } else {
      check(stack.length > 1, 'unbalanced calendar divs');
      const node = stack.pop();
      node.raw = markup.slice(node.begin, match.index + match[0].length);
      node.content = markup.slice(node.open, match.index);
    }
  }
  check(stack.length === 1, 'unclosed calendar div');
  return root.children;
}

const has = (node, cls) => node?.cls.includes(cls);
const plainP = /^\s*<p>\s*([^<]*?)\s*<\/p>\s*$/;

// transportComplete must mean the caller obtained the full decoded 200 HTML
// body from finalUrl. It does not attest publisher freshness.
export function parseH41Calendar({ month, html, finalUrl, transportComplete } = {}) {
  check(typeof month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && month >= '1900-01', 'invalid requested month');
  const name = months[+month.slice(5) - 1];
  const year = month.slice(0, 4);
  const title = `${name} ${year}`;
  const url = `https://www.federalreserve.gov/newsevents/${year}-${name.toLowerCase()}.htm`;
  check(transportComplete === true && finalUrl === url, 'unattested transport or wrong final URL');
  check(typeof html === 'string' && html.length <= 500_000 && /^\uFEFF?\s*<!doctype html>/i.test(html) &&
    /<\/body>\s*<\/html>\s*$/i.test(html) && !html.includes('\uFFFD'), 'not a whole decoded HTML document');
  const clean = html.replace(/<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '');
  const pageTitle = one([...clean.matchAll(/<title>([^<]*)<\/title>/gi)], 'missing or ambiguous document title')[1].trim();
  const ogUrl = one([...clean.matchAll(/<meta\s+property="og:url"\s+content="([^"]+)"\s*\/?>/gi)], 'missing or ambiguous page URL')[1];
  check(pageTitle === `Federal Reserve Board - Calendar: ${title}` && ogUrl === url, 'wrong calendar document identity');

  const area = one([...clean.matchAll(/(<div id="article" class=(['"])cal-nojs clearfix\2>[\s\S]*?)<div class="row">\s*<div class="lastUpdate" id="lastUpdate">/g)], 'missing or ambiguous complete calendar region');
  const article = one(tree(area[1]), 'ambiguous calendar divs');
  check(article.children.length === 2 && has(article.children[0], 'col-md-8') && has(article.children[1], 'col-md-4'), 'changed calendar layout');
  const rows = article.children[0].children;
  check(has(rows[0], 'row-title') && rows[0].content.trim() === `<h4 class="text-center">${title}</h4>` &&
    has(rows[1], 'row-header') && has(rows.at(-1), 'row-footer') &&
    rows.filter((node) => has(node, 'row-footer')).length === 1 &&
    rows[1].content.replace(/\s+/g, '') === rows.at(-1).content.replace(/\s+/g, ''), 'unattested month heading or end marker');

  const section = one(rows.filter((node) => has(node, 'cal-nojs__rowTitle') &&
    /^\s*<h4 class="col-md-12">Statistical Releases\s*<\/h4>\s*$/.test(node.content)), 'missing or ambiguous Statistical Releases section');
  const start = rows.indexOf(section);
  const end = rows.findIndex((node, i) => i > start && (has(node, 'cal-nojs__rowTitle') || has(node, 'row-footer')));
  const header = rows[start + 1];
  check(header?.children.length === 2 && has(header.children[0], 'col-xs-2') && has(header.children[1], 'col-xs-3') &&
    /^\s*<h6>Time:<\/h6>\s*$/.test(header.children[0].content) &&
    /^\s*<h6>Release Date\(s\):<\/h6>\s*$/.test(header.children[1].content), 'changed Statistical Releases headers');
  const row = one(rows.filter((node) => hint.test(node.raw)), 'missing or duplicate H.4.1 row');
  check(rows.indexOf(row) > start + 1 && rows.indexOf(row) < end && has(row, 'row'), 'H.4.1 outside release rows');

  let branch = row;
  for (const cls of ['panel', 'panel-body', 'row']) {
    check(branch.children.length === 1 && has(branch.children[0], cls) &&
      branch.content.trim() === branch.children[0].raw, 'changed H.4.1 row structure');
    branch = branch.children[0];
  }
  const [timeCol, labelCol, datesCol] = branch.children;
  const expectedLabel = /^\s*<p>([^<]*)<\/p>\s*<p>\s*<\/p>\s*$/.exec(labelCol?.content ?? '')?.[1]?.trim();
  check(branch.children.length === 3 && has(timeCol, 'col-xs-2') && has(labelCol, 'col-xs-7') && has(datesCol, 'col-xs-3') &&
    branch.content.replace(/\s+/g, '') === branch.children.map((node) => node.raw).join('').replace(/\s+/g, '') &&
    expectedLabel === label, 'changed label, qualification note, or column layout');

  const clock = /^(1[0-2]|[1-9]):([0-5]\d) ([ap])\.m\.$/.exec(plainP.exec(timeCol.content)?.[1] ?? '');
  check(clock, 'missing or ambiguous release time');
  const time = `${String(+clock[1] % 12 + (clock[3] === 'p' ? 12 : 0)).padStart(2, '0')}:${clock[2]}`;
  const days = plainP.exec(datesCol.content)?.[1];
  check(days && /^(?:[1-9]|[12]\d|3[01])(?:\s*,\s*(?:[1-9]|[12]\d|3[01]))*$/.test(days), 'missing or malformed release date list');
  const lastDay = new Date(Date.UTC(+year, +month.slice(5), 0)).getUTCDate();
  let previous = 0;
  const releases = days.split(',').map((token) => {
    const day = +token;
    check(day > previous && day <= lastDay, 'duplicate, unsorted or out-of-month date');
    previous = day;
    return { date: `${month}-${String(day).padStart(2, '0')}`, time };
  });
  return { month, complete: true, timeZone: 'America/New_York', releases };
}
