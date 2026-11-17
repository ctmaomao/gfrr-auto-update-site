"""Offline metadata for one reviewed STEO correction notice; no historical authenticity claim."""
import datetime
import hashlib
import re
from html.parser import HTMLParser

EXPECTED_PARAGRAPHS = (
    'Released: December 8, 2020',
    'Notice: In the December 2020 STEO, EIA corrected a data error in the Excel version of Table 7d part 2 in this archive that was in the August 2019 STEO through the November 2020 STEO.',
    'The data in Column C of Table 7d part 2, which included data for January 2015 (from the August 2019 STEO to the December 2019 STEO) and data for January 2016 (from the January 2020 STEO to the November 2020 STEO) were not correct. This error did not affect data in the STEO data browser or quarterly tables. For more information, email the STEO team.',
    'EIA corrected the data tables at approximately 12:00 p.m. (Eastern time).',
)

class Notice(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.heading = None
        self.paragraph = None
        self.active = False
        self.count = 0
        self.unscoped_text = False
        self.paragraphs = []
        self.blocked = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        unsafe = any(value != a[key] for key,value in attrs) or tag in ('script','style','template','noscript') or 'hidden' in a or a.get('aria-hidden','').lower() == 'true' or re.search(r'display\s*:\s*none|visibility\s*:\s*hidden', a.get('style',''), re.I)
        if tag not in ('br','img','hr','meta','link','input','wbr','area','base','embed','param','source','track','col'):
            self.blocked.append((tag, bool(unsafe or (self.blocked and self.blocked[-1][1]))))
        if self.blocked and self.blocked[-1][1]:
            return
        if tag in ('h1','h2','h3','h4','h5','h6'):
            if self.heading is not None or self.paragraph is not None: raise ValueError('malformed block')
            self.heading = []
        if tag == 'p' and self.active:
            if self.paragraph is not None:
                self.paragraphs.append(' '.join(''.join(self.paragraph).split()))
            self.paragraph = []
    def handle_data(self, data):
        if self.blocked and self.blocked[-1][1]: return
        if self.heading is not None: self.heading.append(data)
        elif self.paragraph is not None: self.paragraph.append(data)
        elif self.active and data.strip(): self.unscoped_text = True
    def handle_endtag(self, tag):
        blocked = bool(self.blocked and self.blocked[-1][1])
        if not blocked:
            if tag in ('h1','h2','h3','h4','h5','h6') and self.heading is not None:
                value = ' '.join(''.join(self.heading).split())
                self.active = value == 'Short-Term Energy Outlook Notice'
                if self.active: self.count += 1
                self.heading = None
            if tag == 'p' and self.paragraph is not None:
                self.paragraphs.append(' '.join(''.join(self.paragraph).split()))
                self.paragraph = None
        for i in range(len(self.blocked)-1, -1, -1):
            if self.blocked[i][0] == tag:
                del self.blocked[i:]
                break

def parse_notice(raw):
    if type(raw) is not bytes or not 0 < len(raw) <= 1048576: raise ValueError('bounded bytes required')
    parser = Notice(); parser.feed(raw.decode('utf-8')); parser.close()
    if parser.count != 1 or parser.heading is not None or parser.paragraph is not None: raise ValueError('ambiguous notice section')
    if parser.unscoped_text or tuple(p for p in parser.paragraphs if p) != EXPECTED_PARAGRAPHS:
        raise ValueError('unsupported or conflicting correction paragraphs')
    return {'noticeBodyDate':'2020-12-08','inputSha256':hashlib.sha256(raw).hexdigest(),
            'affectedIssueRange':['2019-08','2020-11'],'table':'7d part 2','column':'C',
            'observationMonths':['2015-01','2016-01'],'unaffectedFormats':['data_browser','quarterly_tables'],
            'correctionTimeText':'approximately noon Eastern; not an exact timestamp',
            'inputAuthenticityVerified':False,'historicalRevisionComplete':False,'eligibleForEvaluation':False}

def scope_relation(notice, issue, table, column, observation_month, format_name='archive_excel'):
    # The only supported scope is deliberately recomputed, not trusted from caller flags.
    if notice.get('noticeBodyDate') != '2020-12-08' or notice.get('table') != '7d part 2': raise ValueError('unsupported notice')
    for value in (issue, observation_month):
        if not re.fullmatch(r'\d{4}-\d{2}',value): raise ValueError('invalid month')
        datetime.date.fromisoformat(value+'-01')
    if format_name in ('data_browser','quarterly_tables'): return 'outside_this_notice_not_proof_of_no_revision'
    if format_name != 'archive_excel': return 'unknown_format'
    month = '2015-01' if '2019-08' <= issue <= '2019-12' else '2016-01'
    affected = '2019-08' <= issue <= '2020-11' and table == '7d part 2' and column == 'C' and observation_month == month
    return 'inside_documented_correction_scope' if affected else 'outside_this_notice_not_proof_of_no_revision'
