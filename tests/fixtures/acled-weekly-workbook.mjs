// Minimal OOXML fixture built without importing the parser outside the sanitizer.
function zip(entries) {
  const locals = [], central = []; let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const n = Buffer.from(name), data = Buffer.from(text), l = Buffer.alloc(30 + n.length), c = Buffer.alloc(46 + n.length);
    l.writeUInt32LE(0x04034b50); l.writeUInt32LE(data.length, 18); l.writeUInt32LE(data.length, 22); l.writeUInt16LE(n.length, 26); n.copy(l, 30);
    c.writeUInt32LE(0x02014b50); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42); n.copy(c, 46);
    locals.push(l, data); central.push(c); offset += l.length + data.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22), count = central.length;
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(count, 8); end.writeUInt16LE(count, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
export function workbook(serial) {
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const header = ['WEEK','REGION','COUNTRY','ADMIN1','EVENT_TYPE','SUB_EVENT_TYPE','EVENTS','FATALITIES','POPULATION_EXPOSURE','DISORDER_TYPE','ID','CENTROID_LATITUDE','CENTROID_LONGITUDE'];
  const row = (values, r) => `<row r="${r}">${values.map((v, i) => typeof v === 'number'
    ? `<c r="${String.fromCharCode(65+i)}${r}"${i===0?' s="1"':''}><v>${v}</v></c>`
    : `<c r="${String.fromCharCode(65+i)}${r}" t="inlineStr"><is><t>${v}</t></is></c>`).join('')}</row>`;
  return zip({
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': `<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml': `<styleSheet xmlns="${ns}"><fonts count="1"><font/></fonts><fills count="1"><fill/></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/></cellXfs></styleSheet>`,
    'xl/worksheets/sheet1.xml': `<worksheet xmlns="${ns}"><dimension ref="A1:M13"/><sheetData>${row(header,1)}${Array.from({length:12},(_,i)=>row([serial-i*7,'fixture','fixture','fixture','Battles','fixture',1,0,0,'fixture',i,0,0],i+2)).join('')}</sheetData></worksheet>`,
  });
}
