// Board H.4.1 release markup only. A layout change must fail rather than guess.
const T1 = '1. Factors Affecting Reserve Balances of Depository Institutions (continued)';
const T5 = '5. Consolidated Statement of Condition of All Federal Reserve Banks';
const RESERVE = 'Reserve balances with Federal Reserve Banks';
const MONTHS = 'January February March April May June July August September October November December'.split(' ');
const LIMIT = 1024 * 1024;

function requireThat(ok, reason) {
  if (!ok) throw new Error(`Rejected H.4.1: ${reason}`);
}

function only(items, desc) {
  requireThat(items.length === 1, `${desc}: expected one, found ${items.length}`);
  return items[0];
}

function normalized(markup) {
  return markup
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:nbsp|#0*160|#x0*a0);/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}

function attr(attrs, name) {
  // Match full, quoted attributes; no substring matches inside style or data-* attributes.
  const values = [...attrs.matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
    .filter((m) => m[1].toLowerCase() === name);
  requireThat(values.length <= 1, `duplicate ${name} attribute`);
  return values[0] && (values[0][2] ?? values[0][3]);
}

function blocks(markup, tags, strict = false) {
  const re = new RegExp(`<(${tags})(\\s[^>]*)?>([\\s\\S]*?)<\\/\\1\\s*>`, 'gi');
  const matches = [...markup.matchAll(re)];
  if (strict) requireThat(!markup.replace(re, '').trim(), `unexpected markup around ${tags}`);
  return matches;
}

function dateISO(value) {
  const m = /^([A-Z][a-z]+) ([0-9]{1,2}), ([0-9]{4})$/.exec(value);
  requireThat(m, `invalid date: ${value}`);
  const month = MONTHS.findIndex((name) => name === m[1] || name.slice(0, 3) === m[1]) + 1;
  const iso = `${m[3]}-${String(month).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  const date = new Date(iso);
  requireThat(Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso, `invalid date: ${value}`);
  return iso;
}

function cells(markup) {
  return blocks(markup, 'td|th', true).map((m) => ({
    attrs: m[2] ?? '', text: normalized(m[3]),
  }));
}

function tableFor(elements, caption, data) {
  const index = only(elements.flatMap((m, i) => m[1] === 'p' && normalized(m[3]) === caption ? [i] : []), caption);
  const [title, unit, table] = elements.slice(index, index + 3);
  const adjacent = (a, b) => !data.slice(a.index + a[0].length, b.index).trim();
  requireThat(unit?.[1] === 'p' && normalized(unit[3]) === 'Millions of dollars' &&
    table?.[1] === 'table' && adjacent(title, unit) && adjacent(unit, table), `wrong units or detached table: ${caption}`);
  requireThat(!/<\/?table\b/i.test(table[3]), `nested table: ${caption}`);
  const sections = blocks(table[3], 'thead|tbody', true);
  requireThat(sections.length === 2 && sections[0][1] === 'thead' && sections[1][1] === 'tbody', `invalid sections: ${caption}`);
  return sections.map((m) => blocks(m[3], 'tr', true).map((row) => cells(row[3])));
}

function rowContext([heads, body], label, widths, { allowZero = false } = {}) {
  requireThat(heads.length === widths.length && heads.every((r, i) => r.length === widths[i]),
    `invalid header shape: ${label}`);
  const headers = heads.flat().map((c) => ({ ...c, id: attr(c.attrs, 'id') }));
  const ids = new Set(headers.map((c) => c.id));
  requireThat(headers.every((c) => c.id) && ids.size === headers.length, `invalid header IDs: ${label}`);
  const row = only(body.filter((r) => r.some((c) => c.text === label)), label);
  requireThat(row.length === 5 && row[0].text === label && row.slice(1).every((c) => c.text !== label) &&
    row.every((c) => !attr(c.attrs, 'rowspan') && !attr(c.attrs, 'colspan')), `invalid target row: ${label}`);
  // The Board uses each table's first body row label ID as an extra lineage token.
  const anchor = attr(body[0]?.[0]?.attrs ?? '', 'id');
  requireThat(anchor && !ids.has(anchor), `missing body anchor: ${label}`);
  return {
    heading(text, r, c, span, count) {
      const match = only(headers.filter((h) => text.test(h.text)), String(text));
      requireThat(attr(heads[r]?.[c]?.attrs ?? '', 'id') === match.id &&
        attr(match.attrs, span) === count, `unexpected header layout: ${text}`);
      return match;
    },
    value(position, ...lineage) {
      const wanted = [anchor, ...lineage.map((h) => h.id)];
      const positions = row.flatMap((cell, i) => {
        const links = [attr(cell.attrs, 'headers'), attr(cell.attrs, 'header')].filter((s) => s !== undefined);
        requireThat(links.length <= 1, 'ambiguous lineage');
        const relevant = (links[0] ?? '').trim().split(/\s+/);
        return relevant.length === wanted.length && wanted.every((id) => relevant.includes(id)) ? [i] : [];
      });
      requireThat(only(positions, 'column lineage') === position, 'wrong value position');
      const raw = row[position].text;
      requireThat((allowZero && raw === '0') || /^[1-9]\d{0,2}(?:,\d{3})*$/.test(raw), 'invalid level');
      const value = Number(raw.replaceAll(',', ''));
      requireThat(Number.isSafeInteger(value), 'unsafe integer level');
      return value;
    },
  };
}

// expected dates must come from the caller, never from this same response.
export function extractH41(html, { expectedRelease, expectedObservation } = {}) {
  requireThat(typeof html === 'string' && Buffer.byteLength(html) <= LIMIT, 'invalid HTML size');
  requireThat([expectedRelease, expectedObservation].every((date) =>
    typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)), 'both expected ISO dates are required');
  const parts = html.split('<!-- BEGIN DATA HERE -->');
  requireThat(parts.length === 2, 'invalid data start');
  const rest = parts[1].split('<!-- END DATA HERE -->');
  requireThat(rest.length === 2, 'invalid data end');
  const stripComments = (text) => text.replace(/<!--[\s\S]*?-->/g, '');
  const lead = stripComments(parts[0]);
  const banner = only([...lead.matchAll(/<div(\s[^>]*)>/gi)]
    .filter((m) => attr(m[1], 'class')?.split(/\s+/).includes('dates')), 'release date banner');
  const plain = /^([^<]*)<\/div>/i.exec(lead.slice(banner.index + banner[0].length));
  const releaseText = plain && /^Release Date: (.+)$/.exec(normalized(plain[1]));
  requireThat(releaseText, 'invalid release date banner');
  const release = dateISO(releaseText[1]);
  requireThat(release === expectedRelease, 'unexpected release date');

  const data = stripComments(rest[0]);
  const elements = blocks(data, 'table|p');
  const reserve = rowContext(tableFor(elements, T1, data), RESERVE, [3, 2, 2], { allowZero: true });
  const asset = rowContext(tableFor(elements, T5, data), 'Total assets', [4, 2, 2]);
  const group = reserve.heading(/^Averages of daily figures$/, 0, 1, 'colspan', '3');
  const average = reserve.heading(/^Week ended /, 1, 0, 'rowspan', '2');
  const reservePoint = reserve.heading(/^Wednesday /, 0, 2, 'rowspan', '3');
  const assetPoint = asset.heading(/^Wednesday /, 0, 2, 'rowspan', '3');
  const observation = dateISO(average.text.slice('Week ended '.length));
  requireThat([reservePoint, assetPoint].every((h) => dateISO(h.text.slice('Wednesday '.length)) === observation) &&
    new Date(observation).getUTCDay() === 3, 'inconsistent Wednesday observation dates');
  requireThat(observation === expectedObservation && release > observation, 'unexpected observation date or release chronology');
  return {
    release_date: release, observation_date: observation, unit: 'USD million',
    WALCL: asset.value(2, assetPoint), WRESBAL: reserve.value(1, group, average),
    reserve_wednesday_diagnostic: reserve.value(4, reservePoint),
  };
}
