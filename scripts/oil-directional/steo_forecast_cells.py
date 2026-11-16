"""Read only the two reviewed STEO byte sequences from stdin; no files/network/writes."""
import hashlib
import io
import json
import sys
import zipfile
import xml.etree.ElementTree as ET

HASHES = {
    '54989362410da4aff5673580396380c3a8f4f111fa6d01c6d4fab05ef90efbf4',
    '7d28012ff726ebeafd584905d842ded42bb3c9922550cb26e005af9cd4e27fb5',
}
NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
RNS = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'
WANTED = {'B1','B2','A3','A4','B5','A6','A10','B6','B10','B18','A19','B19','BK3','BK4','BL4','BM4','B55'} | {f'{c}{r}' for c in ['BK','BL','BM'] for r in [6,10,19]}

def cells(raw):
    if len(raw) > 5242880 or hashlib.sha256(raw).hexdigest() not in HASHES:
        raise ValueError('fixed source bytes differ')
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        infos = archive.infolist()
        if len(infos) > 256 or len({i.filename for i in infos}) != len(infos) or sum(i.file_size for i in infos) > 33554432:
            raise ValueError('ZIP bounds')
        def xml(name):
            data = archive.read(name)
            if len(data) > 16777216 or b'<!DOCTYPE' in data or b'<!ENTITY' in data:
                raise ValueError('XML bounds')
            return ET.fromstring(data)
        workbook = xml('xl/workbook.xml')
        ids = [s.attrib[RNS] for s in workbook.findall('s:sheets/s:sheet', NS) if s.attrib.get('name') == '3atab']
        if len(ids) != 1:
            raise ValueError('sheet identity')
        rels = xml('xl/_rels/workbook.xml.rels')
        targets = [r.attrib.get('Target') for r in rels if r.attrib.get('Id') == ids[0] and r.attrib.get('TargetMode') != 'External']
        if targets != ['worksheets/sheet5.xml']:
            raise ValueError('worksheet target')
        strings = [''.join(e.itertext()) for e in xml('xl/sharedStrings.xml').findall('s:si', NS)]
        result = {}
        for cell in xml('xl/worksheets/sheet5.xml').findall('.//s:sheetData/s:row/s:c', NS):
            address = cell.attrib.get('r')
            if address not in WANTED:
                continue
            if address in result:
                raise ValueError('duplicate selected cell')
            value = cell.find('s:v', NS)
            if value is None:
                raise ValueError('missing selected value')
            kind = cell.attrib.get('t', 'n')
            if kind == 's':
                parsed = strings[int(value.text)]
            elif kind == 'n':
                parsed = float(value.text)
            elif kind == 'str':
                parsed = value.text
                kind = 's'
            else:
                raise ValueError('unsupported selected type')
            record = {'v': parsed, 't': kind}
            if cell.find('s:f', NS) is not None:
                record['f'] = 'source_cached_formula_not_executed'
            result[address] = record
        if set(result) != WANTED:
            raise ValueError('missing selected cells')
        return result

if __name__ == '__main__':
    try:
        print(json.dumps(cells(sys.stdin.buffer.read(5242881)), allow_nan=False))
    except Exception:
        print('STEO fixed XML extraction rejected', file=sys.stderr)
        sys.exit(1)
