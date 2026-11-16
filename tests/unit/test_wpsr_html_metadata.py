import hashlib
import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location('wpsr', pathlib.Path(__file__).parents[2] / 'scripts/oil-directional/wpsr_html_metadata.py')
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)
URL = p.ROOT + '2022/example.php'

def receipt(raw, url=p.ROOT):
    return dict(url=url, status=200, bodyReadCompletedAtUTC='2026-11-16T02:22:32.381681+00:00', sha256=hashlib.sha256(raw).hexdigest(), bytes=len(raw))

def archive(row=None, header='2011 - 2012', section='wrong-2010', prefix=''):
    row = row or '<tr><td>January</td><td><a href="/petroleum/supply/weekly/archive/2011/a.php">5</a></td><td>12/31</td><td><a href="/petroleum/supply/weekly/archive/2012/b.php">4</a></td><td>12/30</td></tr>'
    return (prefix + '<table class="contable"><thead id="' + section + '"><tr><td colspan="5">' + header + '</td></tr></thead>' + row + '</table>').encode()

def issue(extra='', release='June 29, 2022', week='June 17, 2022', href='pdf/table11.pdf'):
    return ('多字节\r\n<p>Data for week ending ' + week + '&nbsp;|&nbsp;<strong>Release Date:</strong> ' + release + ' | <a href="pdf/wpsrall.pdf">full report</a></p>\r\n' + '<a href="' + href + '">Table 11</a>' + extra).encode()

def parse_issue(raw):
    return p.parse_issue_bytes(raw, receipt(raw, URL), dict(releaseDate='2022-06-29', dataWeekEnding='2022-06-17'))

class Tests(unittest.TestCase):
    def test_raw_bytes_receipt_utf8_and_time(self):
        raw = archive()
        out = p.parse_archive_bytes(raw, receipt(raw))
        self.assertEqual(out['receipt']['sha256'], hashlib.sha256(raw).hexdigest())
        self.assertFalse(out['inputAuthenticityVerified'])
        for changed in [dict(sha256='0'*64), dict(bytes=True), dict(status=201), dict(bodyReadCompletedAtUTC='2026-02-30T00:00:00Z'), dict(url='https://evil.example/archive/')]:
            with self.assertRaises(ValueError): p.parse_archive_bytes(raw, receipt(raw) | changed)
        bad = b'\xff'
        with self.assertRaises(UnicodeDecodeError): p.parse_archive_bytes(bad, receipt(bad))
        with self.assertRaises(ValueError): p.parse_archive_bytes(b'x'*(p.MAX_BYTES+1), {})

    def test_document_base_href_is_unsupported_not_silently_ignored(self):
        for base in ['<base href="https://example.invalid/">',
                     '<BASE HREF="/petroleum/supply/weekly/archive/2020/">',
                     '<base href="">', '<base href>',
                     '<base hidden href="https://example.invalid/">',
                     '<base href="https://example.invalid/" href="">',
                     '<base href="https://example.invalid/" />']:
            for raw, parse in [(archive(), lambda b: p.parse_archive_bytes(b, receipt(b))),
                               (issue(), parse_issue)]:
                for changed in [base.encode() + raw, raw + base.encode()]:
                    with self.subTest(base=base, parser=parse):
                        with self.assertRaisesRegex(ValueError, 'unsupported document base href'):
                            parse(changed)
        # target-only bases do not alter URL resolution. Literal script/comment
        # text is not a parsed base element and remains compatible.
        for prefix in ['<base target="_blank">', '<!-- <base href="https://example.invalid/"> -->',
                       "<script>const x = '<base href=\"https://example.invalid/\">';</script>"]:
            self.assertFalse(parse_issue(prefix.encode() + issue())['quarantined'])
            raw = prefix.encode() + archive()
            self.assertTrue(p.parse_archive_bytes(raw, receipt(raw))['allObservedIssueAnchorsMapped'])

    def test_visible_year_and_cross_year_week(self):
        raw = archive(); out = p.parse_archive_bytes(raw, receipt(raw))
        self.assertEqual([e['pageAssertsReleaseDate'] for e in out['entries']], ['2011-01-05', '2012-01-04'])
        self.assertEqual(out['entries'][0]['dataWeekEnding'], '2010-12-31')
        self.assertEqual(out['entries'][0]['sourceSection'], 'wrong-2010')
        self.assertFalse(out['currentDirectoryManifestComplete'])

    def test_implicit_recovery_crlf_multibyte_exact_raw_span(self):
        first = '<tr><td>November</td><td></td><td></td><td></td><td></td></tr>'
        orphan = '<td></td>\r\n<td><a href="/petroleum/supply/weekly/archive/2011/a.php">30</a></td><td>25</td>\r\n<td><a href="/petroleum/supply/weekly/archive/2012/b.php">29</a></td><td>24</td></tr>'
        raw = archive(first+orphan, prefix='é汉字\r\n')
        out = p.parse_archive_bytes(raw, receipt(raw)); self.assertEqual(len(out['entries']), 2)
        position = out['entries'][0]['rawPosition']; fragment = raw[position['startByte']:position['endByteExclusive']]
        self.assertEqual(fragment, orphan.encode()); self.assertEqual(position['fragmentSha256'], hashlib.sha256(fragment).hexdigest())
        self.assertEqual(out['entries'][0]['rowRecovery'], 'implicit_row_recovery')
        normalized = raw.replace(b'\r\n', b'\n'); self.assertNotEqual(hashlib.sha256(normalized).hexdigest(), out['receipt']['sha256'])

    def test_invalid_orphan_not_repaired_from_url(self):
        row = '<td><a href="/petroleum/supply/weekly/archive/2022/a.php">29</a></td></tr>'
        raw = archive(row); out = p.parse_archive_bytes(raw, receipt(raw))
        self.assertEqual(out['entries'], []); self.assertEqual(len(out['quarantined']), 1)
        self.assertFalse(out['allObservedIssueAnchorsMapped'])

    def test_same_day_members_and_conflicting_duplicate_url(self):
        row = '<tr><td>June</td><td><a href="/petroleum/supply/weekly/archive/2022/a.php">29</a></td><td>17</td><td></td><td></td></tr>'
        row2 = row.replace('a.php', 'b.php').replace('>17<', '>24<')
        raw = archive(row+row2, header='2022'); out = p.parse_archive_bytes(raw, receipt(raw))
        self.assertEqual(len(out['sameReleaseMembers']['2022-06-29']), 2)
        conflict = archive(row+row.replace('>17<', '>24<'), header='2022')
        self.assertEqual(len(p.parse_archive_bytes(conflict, receipt(conflict))['conflictingURLs']), 1)

    def test_unsafe_unknown_hidden_and_impossible_structure(self):
        for raw in [archive(header='<span hidden>2011</span>'), archive(header='unknown'), archive().replace(b'>5</a>', b'>32</a>')]:
            out = p.parse_archive_bytes(raw, receipt(raw)); self.assertFalse(out['allObservedIssueAnchorsMapped'])
        raw = archive().replace(b'/2011/a.php', b'/2011/a.php?secret=1')
        out = p.parse_archive_bytes(raw, receipt(raw)); self.assertTrue(out['quarantined']); self.assertNotIn('secret', str(out))
        raw = b'<html></html>'; self.assertFalse(p.parse_archive_bytes(raw, receipt(raw))['allObservedIssueAnchorsMapped'])

    def test_issue_explicit_dates_real_href_and_bounded_notice(self):
        raw = issue('<p>Notice: delayed issue; no Brent revision established.</p>')
        out = parse_issue(raw)
        self.assertFalse(out['quarantined']); self.assertEqual(out['pageAssertsReleaseDate'], '2022-06-29')
        self.assertEqual(out['table11LinksNotFetched'][0]['url'], p.ROOT+'2022/pdf/table11.pdf')
        self.assertFalse(out['noticeEstablishesBrentRevision']); self.assertFalse(out['historicalRevisionComplete'])
        span = out['dateEvidence']; fragment = raw[span['startByte']:span['endByteExclusive']]
        self.assertTrue(fragment.startswith(b'<p>')); self.assertTrue(fragment.endswith(b'</p>'))
        self.assertEqual(hashlib.sha256(fragment).hexdigest(), span['fragmentSha256'])

    def test_date_conflicts_ambiguous_missing_or_unsafe_table(self):
        cases = [issue(release='June 28, 2022'), issue(week='June 30, 2022'), issue(href='pdf/not-table11.pdf'),
                 issue(href='https://evil.example/table11.pdf'), issue('<a href="pdf/table11.pdf">second</a>'), issue(href='pdf/table11.pdf?token=x'),
                 issue('<p>Data for week ending June 17, 2022 | Release Date: June 29, 2022</p>')]
        for raw in cases: self.assertTrue(parse_issue(raw)['quarantined'])
        raw = issue('<p>Notice: '+ 'x'*4097 + '</p>')
        with self.assertRaises(ValueError): parse_issue(raw)

    def test_hidden_ancestors_and_duplicate_attributes_cannot_supply_dates_or_links(self):
        raw = issue()
        for changed in [raw.replace(b'<p>', b'<p hidden>', 1), raw.replace(b'<p>', b'<p aria-hidden="true">', 1),
                        raw.replace(b'<p>', b'<div style="display:none"><p>', 1).replace(b'</p>', b'</p></div>', 1),
                        raw.replace(b'<p>', b'<p class="x" class="y">', 1),
                        raw.replace(b'<a href="pdf/table11.pdf">', b'<a hidden href="pdf/table11.pdf">'),
                        raw.replace(b'<a href="pdf/table11.pdf">', b'<div aria-hidden="true"><a href="pdf/table11.pdf">') + b'</div>',
                        raw.replace(b'<a href="pdf/table11.pdf">', b'<a href="ignored" href="pdf/table11.pdf">'),
                        raw.replace(b'<p>', b'<template><p>', 1).replace(b'</p>', b'</p></template>', 1)]:
            self.assertTrue(parse_issue(changed)['quarantined'])
        # Actual official markup has an empty hidden tooltip span inside a visible link.
        visible = raw.replace(b'>Table 11</a>', b'>Table 11<span hidden="Spot Prices"></span></a>')
        self.assertFalse(parse_issue(visible)['quarantined'])
        script = raw.replace(b'<strong>Release Date:</strong>', b'<script>Release Date:</script>')
        self.assertTrue(parse_issue(script)['quarantined'])

    def test_rowspan_hidden_table_and_hidden_header_are_never_recovered(self):
        raw = archive()
        for changed in [raw.replace(b'<table ', b'<table hidden ', 1), raw.replace(b'<thead ', b'<thead aria-hidden="true" ', 1),
                        raw.replace(b'<td>January', b'<td rowspan="2">January'),
                        raw.replace(b'<table ', b'<div style="display:none"><table ', 1) + b'</div>']:
            self.assertFalse(p.parse_archive_bytes(changed, receipt(changed))['allObservedIssueAnchorsMapped'])
        orphan = '<tr><td>November</td><td></td><td></td><td></td><td></td></tr><td></td><td rowspan="2"><a href="/petroleum/supply/weekly/archive/2011/a.php">30</a></td><td>25</td><td><a href="/petroleum/supply/weekly/archive/2012/b.php">29</a></td><td>24</td></tr>'
        bad = archive(orphan)
        self.assertFalse(p.parse_archive_bytes(bad, receipt(bad))['allObservedIssueAnchorsMapped'])

    def test_unclosed_year_header_does_not_supply_context(self):
        raw = archive().replace(b'</td></tr></thead>', b'</td></thead>', 1)
        out = p.parse_archive_bytes(raw, receipt(raw))
        self.assertEqual(out['entries'], [])
        self.assertEqual(len(out['quarantined']), 2)
        self.assertFalse(out['allObservedIssueAnchorsMapped'])

    def test_invalid_rows_cannot_supply_or_preserve_inherited_month(self):
        context = '<tr><td>November</td><td></td><td></td><td></td><td></td></tr>'
        following = '<tr><td></td><td><a href="/petroleum/supply/weekly/archive/2011/a.php">30</a></td><td>25</td><td><a href="/petroleum/supply/weekly/archive/2012/b.php">29</a></td><td>24</td></tr>'
        for invalid in [context.replace('<td>November', '<td rowspan="2">November'),
                        context.replace('<td>November', '<td colspan="2">November'),
                        context.replace('</tr>', ''),
                        context.replace('<tr>', '<tr hidden>'),
                        '<tr><td>November</td><td></td></tr>',
                        '<td></td><td>not-a-date</td><td></td><td></td><td></td></tr>',
                        '<tr hidden></tr>']:
            for prefix in ['', context]:
                raw = archive(prefix + invalid + following)
                out = p.parse_archive_bytes(raw, receipt(raw))
                self.assertEqual(out['entries'], [])
                self.assertEqual(len(out['quarantined']), 2)
                self.assertFalse(out['allObservedIssueAnchorsMapped'])
        # A valid context can be re-established explicitly after a bad row.
        raw = archive(context.replace('<tr>', '<tr hidden>') + context + following)
        self.assertTrue(p.parse_archive_bytes(raw, receipt(raw))['allObservedIssueAnchorsMapped'])

    def test_legacy_release_only_retains_partial_status_and_exact_cell_span(self):
        raw = 'é汉\r\n<table><tr><td class="update">Released: August 3,2011</td></tr></table><a href="pdf/table11.pdf">Table11</a>'.encode()
        expected = dict(releaseDate='2011-08-03', dataWeekEnding='2011-07-29')
        out = p.parse_issue_bytes(raw, receipt(raw, URL), expected)
        self.assertFalse(out['quarantined']); self.assertEqual(out['metadataStatus'], 'partial_legacy_release_only')
        self.assertEqual(out['pageReleaseDate'], '2011-08-03'); self.assertIsNone(out['pageDataWeek'])
        self.assertIsNone(out['pageAssertsDataWeekEnding']); self.assertEqual(out['dataWeekEvidence'], 'index_only')
        self.assertTrue(out['indexReleaseDateAgrees']); self.assertFalse(out['indexDatesAgree']); self.assertFalse(out['pageDataWeekVerified'])
        pos = out['dateEvidence']; fragment = raw[pos['startByte']:pos['endByteExclusive']]
        self.assertEqual(fragment, b'<td class="update">Released: August 3,2011</td>')
        self.assertEqual(pos['fragmentSha256'], hashlib.sha256(fragment).hexdigest())

    def test_legacy_ambiguity_hidden_script_wrong_class_conflict_rejected(self):
        cell = b'<td class="update">Released: August 3, 2011</td>'
        link = b'<a href="pdf/table11.pdf">Table11</a>'
        expected = dict(releaseDate='2011-08-03', dataWeekEnding='2011-07-29')
        for changed in [cell+cell, cell.replace(b'<td ', b'<td hidden '), b'<div aria-hidden="true">'+cell+b'</div>',
                        cell.replace(b'class="update"', b'class="update" class="other"'),
                        cell.replace(b'Released:', b'<script>Released:</script>'), cell.replace(b'update', b'other'),
                        cell.replace(b'August 3', b'August 4'), cell.replace(b'2011</td>', b'2011 extra</td>')]:
            raw = changed+link
            self.assertTrue(p.parse_issue_bytes(raw, receipt(raw, URL), expected)['quarantined'])
        raw = issue()+cell
        self.assertTrue(parse_issue(raw)['quarantined'])

    def test_same_value_duplicate_body_attributes_do_not_change_semantics(self):
        cell = b'<td class="update">Released: August 3, 2011</td><a href="pdf/table11.pdf">PDF</a>'
        expected = dict(releaseDate='2011-08-03', dataWeekEnding='2011-07-29')
        for attributes, eligible in [(b'topMargin=0 topMargin="0"', True), (b'topMargin=0 topMargin="1"', False),
                                     (b'hidden hidden', False), (b'aria-hidden="true" aria-hidden="true"', False),
                                     (b'style="display:none" style="display:none"', False)]:
            raw = b'<body '+attributes+b'>'+cell+b'</body>'
            self.assertEqual(p.parse_issue_bytes(raw, receipt(raw, URL), expected)['quarantined'], not eligible)

    def test_notice_scope_is_incomplete_for_modern_and_legacy(self):
        modern = parse_issue(issue('<p>Notice: visible paragraph.</p>'))
        self.assertEqual(modern['noticeExtractionScope'], 'visible_p_elements_only')
        self.assertFalse(modern['noticeCoverageComplete'])
        raw = b'<td class="update">Released: August 3, 2011</td><td class="infotext">Notice: legacy cell notice.</td><a href="pdf/table11.pdf">PDF</a>'
        legacy = p.parse_issue_bytes(raw, receipt(raw, URL), dict(releaseDate='2011-08-03', dataWeekEnding='2011-07-29'))
        self.assertEqual(legacy['noticeEvidence'], [])
        self.assertEqual(legacy['noticeExtractionScope'], 'visible_p_elements_only')
        self.assertFalse(legacy['noticeCoverageComplete'])
        self.assertEqual(legacy['metadataStatus'], 'partial_legacy_release_only')

    def test_no_file_network_clock_entrypoint_or_input_mutation(self):
        raw = issue(); r = receipt(raw, URL); before = dict(r)
        p.parse_issue_bytes(raw, r, dict(releaseDate='2022-06-29', dataWeekEnding='2022-06-17'))
        self.assertEqual(before, r)
        self.assertFalse(hasattr(p, 'main'))

if __name__ == '__main__': unittest.main()
