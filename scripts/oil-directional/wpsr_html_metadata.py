"""Offline bounded WPSR HTML metadata parser. Bytes in; no network/file/clock I/O.
Caller receipts establish consistency only, never network or historical authenticity.
"""
import datetime as dt
import hashlib
import re
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit

ROOT = 'https://www.eia.gov/petroleum/supply/weekly/archive/'
MAX_BYTES = 1048576
MONTHS = {name: i for i, name in enumerate(('January February March April May June July August September October November December').split(), 1)}


def _date(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
        raise ValueError('invalid calendar date')
    return dt.date.fromisoformat(value)


def _url(value):
    if not isinstance(value, str) or len(value) > 2048 or any(ord(c) < 33 for c in value):
        raise ValueError('invalid official URL')
    p = urlsplit(value)
    if p.scheme != 'https' or p.netloc != 'www.eia.gov' or p.query or p.fragment or not p.path.startswith('/petroleum/supply/weekly/archive/') or '..' in p.path or '%' in p.path or '\\' in p.path:
        raise ValueError('invalid official URL')
    return value


def _input(raw, receipt):
    if type(raw) is not bytes or not 0 < len(raw) <= MAX_BYTES:
        raise ValueError('invalid bounded bytes')
    fields = {'url', 'status', 'bodyReadCompletedAtUTC', 'sha256', 'bytes'}
    if type(receipt) is not dict or set(receipt) != fields:
        raise ValueError('invalid receipt schema')
    _url(receipt['url'])
    timestamp = receipt['bodyReadCompletedAtUTC']
    if not isinstance(timestamp, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)', timestamp):
        raise ValueError('invalid receipt UTC')
    dt.datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
    digest = hashlib.sha256(raw).hexdigest()
    if type(receipt['status']) is not int or receipt['status'] != 200 or type(receipt['bytes']) is not int or receipt['bytes'] != len(raw) or receipt['sha256'] != digest:
        raise ValueError('receipt does not match input')
    return raw.decode('utf-8', errors='strict'), dict(receipt)


def _flags():
    return dict(inputAuthenticityVerified=False, currentDirectoryManifestComplete=False,
                historicalPublicationComplete=False, historicalRevisionComplete=False,
                archiveImmutabilityVerified=False, intradayOrderVerified=False,
                eligibleForEvaluation=False, eligibleForMainScore=False, eligibleForPublicProbability=False)


class _Document(HTMLParser):
    def __init__(self, text, raw):
        super().__init__(convert_charrefs=True)
        self.text, self.raw = text, raw
        self.line_starts = [0] + [m.end() for m in re.finditer('\n', text)]
        self.byte_offsets = [0]
        for char in text:
            self.byte_offsets.append(self.byte_offsets[-1] + len(char.encode('utf-8')))
        self.rows, self.links, self.paragraphs, self.update_cells = [], [], [], []
        self.update_cell = None
        self.inside = False
        self.section = None
        self.row = self.cell = self.anchor = self.paragraph = None
        self.context = []

    def position(self):
        line, column = self.getpos()
        return self.line_starts[line - 1] + column

    def tag_end(self):
        end = self.text.find('>', self.position())
        return end + 1 if end >= 0 else len(self.text)

    def span(self, start, end):
        a, b = self.byte_offsets[start], self.byte_offsets[end]
        return dict(startChar=start, endCharExclusive=end, startByte=a, endByteExclusive=b,
                    fragmentSha256=hashlib.sha256(self.raw[a:b]).hexdigest())

    def finish_row(self, closed=False):
        if self.row is not None:
            self.row.update(closed=closed, end=self.tag_end() if closed else self.position())
            if self.cell is not None:
                self.row['invalid'] = True
                self.cell = None
            self.rows.append(self.row)
            if len(self.rows) > 3000:
                raise ValueError('row limit')
            self.row = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        # Preserve inherited visibility without treating an empty hidden decorative
        # child as hiding its visible parent link. No CSS/layout inference is made.
        # HTMLParser normalizes attribute names. Repeated identical values do not
        # change that attribute's semantics; conflicting values remain ambiguous.
        conflicting_attributes = any(value != a[name] for name, value in attrs)
        own_blocked = (conflicting_attributes or 'hidden' in a or a.get('aria-hidden', '').lower() == 'true'
                       or re.search(r'(?:display\s*:\s*none|visibility\s*:\s*hidden)', a.get('style', ''), re.I)
                       or tag in ('script', 'style', 'template', 'noscript'))
        blocked = bool(own_blocked or (self.context and self.context[-1][1]))
        if tag not in ('area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'):
            self.context.append((tag, blocked))
        if tag == 'table' and 'contable' in a.get('class', '').split():
            if self.inside:
                raise ValueError('nested archive table')
            self.inside = True
        if self.inside and tag == 'thead':
            self.section = a.get('id')
        if self.inside and tag == 'tr':
            self.finish_row()
            self.row = dict(section=self.section, start=self.position(), cells=[], implicit=False, invalid=blocked)
        if self.inside and tag in ('td', 'th'):
            if self.row is None:
                self.row = dict(section=self.section, start=self.position(), cells=[], implicit=True, invalid=blocked)
            if self.cell is not None:
                self.row['invalid'] = True
            self.cell = dict(text='', links=[], tag=tag, colspan=a.get('colspan', '1'), rowspan=a.get('rowspan', '1'))
            if blocked or self.cell['rowspan'] != '1':
                self.row['invalid'] = True
        if tag == 'a':
            if self.anchor is not None:
                raise ValueError('nested anchor')
            self.anchor = dict(href=a.get('href'), text='', start=self.position(), blocked=blocked)
        if tag == 'td' and 'update' in a.get('class', '').split():
            if self.update_cell is not None:
                raise ValueError('nested legacy release cell')
            self.update_cell = dict(text='', start=self.position(), blocked=blocked)
        if tag == 'p':
            if self.paragraph is not None:
                raise ValueError('unclosed paragraph')
            self.paragraph = dict(text='', start=self.position(), blocked=blocked)

    def handle_data(self, data):
        if self.context and self.context[-1][1]:
            return
        for item in (self.cell, self.anchor, self.paragraph, self.update_cell):
            if item is not None:
                item['text'] += data

    def handle_endtag(self, tag):
        if tag == 'a' and self.anchor is not None:
            self.anchor['text'] = ' '.join(self.anchor['text'].split())
            self.anchor['end'] = self.tag_end()
            self.links.append(self.anchor)
            if len(self.links) > 5000:
                raise ValueError('anchor limit')
            if self.cell is not None:
                self.cell['links'].append(self.anchor)
            self.anchor = None
        if tag in ('td', 'th') and self.cell is not None:
            self.cell['text'] = ' '.join(self.cell['text'].split())
            self.row['cells'].append(self.cell)
            self.cell = None
        if tag == 'td' and self.update_cell is not None:
            self.update_cell.update(text=' '.join(self.update_cell['text'].split()), end=self.tag_end())
            self.update_cells.append(self.update_cell)
            if len(self.update_cells) > 16:
                raise ValueError('legacy date cell limit')
            self.update_cell = None
        if tag == 'tr':
            self.finish_row(True)
        if tag == 'table':
            self.finish_row()
            self.inside = False
        if tag == 'p' and self.paragraph is not None:
            self.paragraph.update(text=' '.join(self.paragraph['text'].split()), end=self.tag_end())
            self.paragraphs.append(self.paragraph)
            if len(self.paragraphs) > 3000:
                raise ValueError('paragraph limit')
            self.paragraph = None
        for i in range(len(self.context) - 1, -1, -1):
            if self.context[i][0] == tag:
                del self.context[i:]
                break


def _document(text, raw):
    document = _Document(text, raw)
    document.feed(text)
    document.close()
    document.finish_row()
    return document


def _issue_link(link, source):
    href = link.get('href')
    if not isinstance(href, str):
        return None
    resolved = urljoin(source, href)
    if re.search(r'\.(?:php|html)$', urlsplit(resolved).path) and '/petroleum/supply/weekly/archive/' in resolved:
        try:
            return _url(resolved)
        except ValueError:
            return None
    return None


def parse_archive_bytes(raw, receipt):
    text, provenance = _input(raw, receipt)
    if receipt['url'] != ROOT:
        raise ValueError('archive index URL required')
    doc = _document(text, raw)
    entries, quarantined, assigned = [], [], set()
    years, month, section = [], None, None
    for index, row in enumerate(doc.rows):
        if row['section'] != section:
            section, years, month = row['section'], [], None
        cells = row['cells']
        if len(cells) == 1:
            years, month = [], None
            if re.fullmatch(r'\d{4}(?:\s*-\s*\d{4})?', cells[0]['text']) and row['closed'] and not row['invalid']:
                years = [int(v) for v in re.findall(r'\d{4}', cells[0]['text'])]
        if not cells:
            month = None
            continue
        shape = len(cells) == 5 and row['closed'] and not row['invalid'] and all(c['tag'] == 'td' and c['colspan'] == '1' for c in cells)
        # Context is evidence too: an unsupported/hidden/malformed row must not
        # supply a month to, or preserve it for, a later blank-month row.
        if not shape:
            month = None
        elif cells[0]['text'] in MONTHS:
            month = MONTHS[cells[0]['text']]
        elif cells[0]['text']:
            month = None
        if row['implicit']:
            shape = shape and len(years) == 2 and years[1] == years[0] + 1 and not cells[0]['text'] and not cells[0]['links']
            shape = shape and all(len(cells[i]['links']) == 1 and re.fullmatch(r'\d{1,2}', cells[i]['text']) and cells[i]['links'][0]['text'] == cells[i]['text'] and not cells[i + 1]['links'] and re.fullmatch(r'(?:\d{1,2}/)?\d{1,2}', cells[i + 1]['text']) for i in (1, 3))
        if not shape:
            month = None
        for column, cell in enumerate(cells):
            for link in cell['links']:
                url = _issue_link(link, ROOT)
                if not url:
                    continue
                assigned.add(link['start'])
                evidence = doc.span(row['start'], row['end'])
                try:
                    if link['blocked'] or not shape or not month or column not in (1, 3) or len(cell['links']) != 1 or cell['text'] != link['text'] or not re.fullmatch(r'\d{1,2}', cell['text']):
                        raise ValueError('row structure')
                    year = years[0 if column == 1 else 1]
                    release = dt.date(year, month, int(cell['text']))
                    adjacent = cells[column + 1]
                    if adjacent['links'] or not re.fullmatch(r'(?:\d{1,2}/)?\d{1,2}', adjacent['text']):
                        raise ValueError('data week cell')
                    end_month, end_day = map(int, adjacent['text'].split('/')) if '/' in adjacent['text'] else (month, int(adjacent['text']))
                    week = dt.date(year - (end_month > month), end_month, end_day)
                    if week > release:
                        raise ValueError('week after release')
                    entries.append(dict(url=url, pageAssertsReleaseDate=release.isoformat(), dataWeekEnding=week.isoformat(), sourceSection=section,
                                        tableRowIndex=index, rowRecovery='implicit_row_recovery' if row['implicit'] else 'explicit_row', rawPosition=evidence))
                except (ValueError, IndexError):
                    quarantined.append(dict(url=url, reason='unresolved_row_structure_or_date', rawPosition=evidence))
    for link in doc.links:
        url = _issue_link(link, ROOT)
        if not url and isinstance(link.get('href'), str) and re.search(r'\.(?:php|html)(?:[?#].*)?$', link['href']) and 'archive/' in link['href']:
            quarantined.append(dict(reason='unsafe_issue_anchor', rawPosition=doc.span(link['start'], link['end'])))
        if url and link['start'] not in assigned:
            quarantined.append(dict(url=url, reason='unmapped_issue_anchor', rawPosition=doc.span(link['start'], link['end'])))
    groups = {}
    conflicts = []
    seen = {}
    for entry in entries:
        groups.setdefault(entry['pageAssertsReleaseDate'], []).append(entry['url'])
        identity = (entry['pageAssertsReleaseDate'], entry['dataWeekEnding'])
        if entry['url'] in seen and seen[entry['url']] != identity:
            conflicts.append(entry['url'])
        seen[entry['url']] = identity
    return dict(parserVersion='wpsr-html-metadata-v1', kind='archive_index', receipt=provenance, entries=entries,
                quarantined=quarantined, conflictingURLs=sorted(set(conflicts)), sameReleaseMembers={d: list(dict.fromkeys(urls)) for d, urls in groups.items()},
                allObservedIssueAnchorsMapped=bool(entries) and not quarantined and not conflicts, **_flags())


def _english_date(value):
    match = re.fullmatch(r'([A-Za-z]+) (\d{1,2}), (\d{4})', value)
    if not match or match[1] not in MONTHS:
        raise ValueError('invalid explicit date')
    return dt.date(int(match[3]), MONTHS[match[1]], int(match[2])).isoformat()


def parse_issue_bytes(raw, receipt, expected_index_dates):
    text, provenance = _input(raw, receipt)
    if not re.search(r'\.(?:php|html)$', urlsplit(receipt['url']).path):
        raise ValueError('issue URL required')
    if type(expected_index_dates) is not dict or set(expected_index_dates) != {'releaseDate', 'dataWeekEnding'}:
        raise ValueError('invalid index date schema')
    for value in expected_index_dates.values():
        _date(value)
    doc = _document(text, raw)
    paragraphs = [p for p in doc.paragraphs if 'Data for week ending' in p['text'] or p['blocked']]
    # Hidden date-bearing content is not evidence. Ambiguous hidden paragraphs
    # conservatively quarantine this metadata-only parser rather than infer dates.
    reasons, release, week, date_evidence = [], None, None, None
    legacy = not paragraphs and bool(doc.update_cells)
    if legacy:
        if len(doc.update_cells) != 1:
            reasons.append('ambiguous_legacy_release_cells')
        else:
            cell = doc.update_cells[0]
            match = re.fullmatch(r'Released:\s*([A-Za-z]+ \d{1,2},\s*\d{4})', cell['text'])
            try:
                if not match or cell['blocked']:
                    raise ValueError('invalid legacy release cell')
                release = _english_date(re.sub(r',\s*', ', ', match[1]))
                date_evidence = doc.span(cell['start'], cell['end'])
                if release != expected_index_dates['releaseDate'] or expected_index_dates['dataWeekEnding'] > release:
                    reasons.append('index_page_release_disagreement')
            except ValueError:
                reasons.append('invalid_legacy_release_cell')
    elif len(paragraphs) != 1:
        reasons.append('missing_or_ambiguous_explicit_date_paragraph')
    else:
        if doc.update_cells:
            reasons.append('ambiguous_modern_and_legacy_date_claims')
        p = paragraphs[0]
        match = re.fullmatch(r'Data for week ending ([A-Za-z]+ \d{1,2}, \d{4})\s*\|\s*Release Date:\s*([A-Za-z]+ \d{1,2}, \d{4})(?:\s*\|\s*full report)?', p['text'])
        try:
            if not match or p['blocked']:
                raise ValueError('date paragraph')
            week, release = _english_date(match[1]), _english_date(match[2])
            if week > release or release != expected_index_dates['releaseDate'] or week != expected_index_dates['dataWeekEnding']:
                reasons.append('index_page_date_disagreement')
            date_evidence = doc.span(p['start'], p['end'])
        except ValueError:
            reasons.append('invalid_explicit_date_paragraph')
    pdf_links = []
    for link in doc.links:
        href = link['href']
        if isinstance(href, str) and re.search(r'(?:^|/)table11\.pdf(?:[?#].*)?$', href, re.I):
            try:
                if link['blocked']:
                    raise ValueError('hidden table11 href')
                resolved = _url(urljoin(receipt['url'], href))
                if urlsplit(resolved).path.rsplit('/', 1)[-1] != 'table11.pdf':
                    raise ValueError('table11 path')
                pdf_links.append(dict(url=resolved, rawPosition=doc.span(link['start'], link['end'])))
            except ValueError:
                reasons.append('unsafe_table11_href')
    if len(pdf_links) != 1:
        reasons.append('missing_or_ambiguous_table11_href')
    notices = []
    for p in doc.paragraphs:
        if 'Notice:' in p['text'] and not p['blocked']:
            if len(notices) >= 16 or len(p['text']) > 4096:
                raise ValueError('notice limit')
            notices.append(dict(text=p['text'], rawPosition=doc.span(p['start'], p['end'])))
    result = dict(parserVersion='wpsr-html-metadata-v1', kind='issue', receipt=provenance,
                pageAssertsReleaseDate=release, pageAssertsDataWeekEnding=week, dateEvidence=date_evidence,
                table11LinksNotFetched=pdf_links, noticeEvidence=notices, noticeEstablishesBrentRevision=False,
                noticeExtractionScope='visible_p_elements_only', noticeCoverageComplete=False,
                indexDatesAgree=not reasons and not legacy, quarantined=bool(reasons), reasons=reasons, **_flags())
    if legacy:
        result.update(metadataStatus='quarantined' if reasons else 'partial_legacy_release_only',
                      pageReleaseDate=release, pageDataWeek=None, dataWeekEvidence='index_only',
                      pageDataWeekVerified=False,
                      indexReleaseDateAgrees=release == expected_index_dates['releaseDate'] if release else False)
    return result
