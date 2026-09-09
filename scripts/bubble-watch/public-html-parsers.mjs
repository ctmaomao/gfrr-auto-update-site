// Pure parsers for existing public HTML sources; no fetching or scoring.
export function stripTags(html) {
  return html.replace(/<script[\s\S]*?<\/script>/giu, ' ').replace(/<[^>]+>/gu, ' ').replace(/\s+/gu, ' ');
}

export function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&#(\d+);/gu, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/giu, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/&amp;/gu, '&')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&#8217;|&rsquo;/gu, "'")
    .replace(/&#8216;|&lsquo;/gu, "'")
    .replace(/&#8220;|&ldquo;/gu, '"')
    .replace(/&#8221;|&rdquo;/gu, '"')
    .replace(/&nbsp;/gu, ' ');
}

export function htmlToText(html) {
  return decodeHtmlEntities(stripTags(String(html || ''))).replace(/\s+/gu, ' ').trim();
}

function extractHtmlRows(html) {
  return [...String(html || '').matchAll(/<tr[\s\S]*?<\/tr>/giu)].map((match) => match[0]);
}

function extractHtmlCells(rowHtml) {
  return [...String(rowHtml || '').matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/giu)]
    .map((match) => htmlToText(match[1]));
}

function parseLooseNumber(value) {
  const match = String(value ?? '').replace(/,/gu, '').match(/[-+]?\d+(?:\.\d+)?/u);
  return match ? Number(match[0]) : null;
}

export function parseFedSepMedians(html, sepUrl, sepDate) {
  const fedFundsRow = extractHtmlRows(html)
    .map(extractHtmlCells)
    .find((cells) => /Federal funds rate/iu.test(cells[0] || ''));
  if (!fedFundsRow) throw new Error('Fed SEP federal funds row missing');
  const dotPlotMedianCurrentYear = parseLooseNumber(fedFundsRow[1]);
  const dotPlotMedianNextYear = parseLooseNumber(fedFundsRow[2]);
  if (!Number.isFinite(dotPlotMedianCurrentYear) && !Number.isFinite(dotPlotMedianNextYear)) {
    throw new Error('Fed SEP federal funds medians unavailable');
  }
  return {
    sepProjectionDate: sepDate?.replace(/^(\d{4})(\d{2})(\d{2})$/u, '$1-$2-$3') || null,
    sepUrl,
    dotPlotMedianCurrentYear: Number.isFinite(dotPlotMedianCurrentYear) ? dotPlotMedianCurrentYear : null,
    dotPlotMedianNextYear: Number.isFinite(dotPlotMedianNextYear) ? dotPlotMedianNextYear : null
  };
}
