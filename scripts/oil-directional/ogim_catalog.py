"""Manual, offline, research-only OGIM v3 THREE-TABLE catalog adapter.
Not satellite observations, operating verification, export/crude classification or price input.
"""
import datetime as dt
import hashlib
import json
import math
from pathlib import Path
import re
import sqlite3
import struct
import time

VERSION = 'OGIM_v3.0'
EXPECTED_BYTES = 3422806016
EXPECTED_MD5 = '99d94e96eefe4d7f561d1a2dbcc1a313'
EXPECTED_SHA256 = 'd324540fa13a29ce731aee9753077dffee81470abbe7652c9488b7238e80b04c'
MAX_ROWS = 10000
MAX_OUTPUT_BYTES = 20_000_000
TABLES = ('Crude_Oil_Refineries', 'Petroleum_Terminals', 'Offshore_Platforms')
SCHEMA_HASHES = {
 'Crude_Oil_Refineries':'bd4c78ce73361cb2211712486572c90465b4147a001674e22065c5831c7f52ba',
 'Petroleum_Terminals':'c0f4d23b51e18121463101d960cf266b88b7e2becc8b6562b0984b4839905091',
 'Offshore_Platforms':'c64c804774db8a32a1b5dce928ba37d93d899b5ad6ff6a2a619ccff84fb24548',
 'Data_Catalog':'503f9180f31295534028f1d1fcbb0b775810bf5d34a2d6bde5ce8c9d5be6d1c2',
 'gpkg_geometry_columns':'a6e84774b398911dbc22ef9de9292967a6d870f2ee0e2d78cd8a9b4d96034275',
 'gpkg_contents':'bcc92bf0c2f300bf11f6524cabe819cc742cc7618c277c673f270ece250ec1f3',
}
SELECT_COLUMNS = ('OGIM_ID','geom','COUNTRY','FAC_NAME','CATEGORY','FAC_TYPE','COMMODITY','FAC_STATUS','OGIM_STATUS','SRC_REF_ID','SRC_DATE','LATITUDE','LONGITUDE')


def _text(value):
 if value is None: return None
 if not isinstance(value,str) or len(value)>4096: raise ValueError('Unexpected text type/length')
 return value


def _source_date(raw):
 _text(raw)
 if raw in (None,'','N/A','1900-01-01'): return None,'missing-or-sentinel'
 try:
  if not re.fullmatch(r'\d{4}-\d{2}-\d{2}',raw): raise ValueError()
  parsed=dt.date.fromisoformat(raw)
 except ValueError: return None,'invalid-date'
 # Source publication/update date is distinct from the underlying data period.
 return parsed.isoformat(),'valid-source-publication-or-update-date'


def _point(blob, lat, lon):
 """Validate standard GPKG header + little/big-endian 2-D WKB POINT, not geolocation truth."""
 if blob is None: return None,'missing-geometry'
 if not isinstance(blob,bytes) or len(blob)<29 or blob[:2]!=b'GP' or blob[2]!=0: raise ValueError('Malformed GPKG geometry')
 flags=blob[3]
 if flags & 0xe0: raise ValueError('Extended/reserved GPKG flags unsupported')
 endian='<' if flags&1 else '>'
 if struct.unpack(endian+'i',blob[4:8])[0]!=4326: raise ValueError('Unexpected point SRID')
 envelope=(flags>>1)&7
 sizes={0:0,1:32,2:48,3:48,4:64}
 if envelope not in sizes: raise ValueError('Invalid geometry envelope')
 offset=8+sizes[envelope]
 if len(blob)!=offset+21: raise ValueError('Unexpected POINT geometry size')
 if blob[offset] not in (0,1): raise ValueError('Malformed WKB byte order')
 wkb='<' if blob[offset] else '>'
 if struct.unpack(wkb+'I',blob[offset+1:offset+5])[0]!=1: raise ValueError('Expected 2-D WKB POINT')
 x,y=struct.unpack(wkb+'dd',blob[offset+5:offset+21])
 if flags&16:
  if not (math.isnan(x) and math.isnan(y)): raise ValueError('Invalid empty point')
  return None,'empty-geometry'
 if not math.isfinite(x) or not math.isfinite(y) or abs(x)>180 or abs(y)>90: raise ValueError('Invalid geometry coordinate')
 if envelope:
  vals=struct.unpack(endian+'d'*(sizes[envelope]//8),blob[8:offset])
  if not all(math.isfinite(v) for v in vals) or not(vals[0]<=x<=vals[1] and vals[2]<=y<=vals[3]): raise ValueError('Invalid POINT envelope')
 if lat in (None,-999) or lon in (None,-999): return None,'missing-coordinate-attributes'
 if type(lat) not in (float,int) or type(lon) not in (float,int) or not math.isfinite(lat) or not math.isfinite(lon) or abs(lat)>90 or abs(lon)>180: return None,'invalid-coordinate-attributes'
 if abs(x-lon)>1e-7 or abs(y-lat)>1e-7: return None,'geometry-attribute-mismatch'
 return {'longitude':x,'latitude':y,'crs':'EPSG:4326','representation':'POINT_NOT_BOUNDARY'},'geometry-attributes-consistent-not-location-verified'


def _source_link(raw, catalog):
 _text(raw)
 if raw is None or not re.fullmatch(r'[1-9]\d{0,8}(?:\s*,\s*[1-9]\d{0,8}){0,31}',raw): return None,'missing-or-ambiguous-reference'
 identities=[int(value.strip()) for value in raw.split(',')]
 if len(set(identities))!=len(identities): return None,'duplicate-reference-ids'
 if any(len(catalog.get(identity,[]))!=1 for identity in identities): return None,'unmatched-or-nonunique-reference'
 sources=[{'sourceId':identity,'sourceNameRaw':catalog[identity][0][0],'sourceUrlRaw':catalog[identity][0][1]} for identity in identities]
 return {'sources':sources, 'meaning':'structural-link-only-not-source-reverification'},('unique-structural-match' if len(sources)==1 else 'unambiguous-composite-structural-match')


def _map_row(table, row, catalog):
 if table not in TABLES: raise ValueError('Table not allowed')
 record=dict(zip(SELECT_COLUMNS,row))
 identity=record['OGIM_ID']
 if type(identity) is not int or identity<=0: raise ValueError('Invalid OGIM_ID')
 for col in SELECT_COLUMNS:
  if col not in ('OGIM_ID','geom','LATITUDE','LONGITUDE'): _text(record[col])
 date,date_status=_source_date(record['SRC_DATE'])
 coordinates,coordinate_status=_point(record['geom'],record['LATITUDE'],record['LONGITUDE'])
 link,link_status=_source_link(record['SRC_REF_ID'],catalog)
 return {
  'sourceRecordKey':f'{VERSION}:{table}:{identity}', 'sourceTable':table,'sourceId':identity,
  'countryRaw':record['COUNTRY'],'facilityNameRaw':record['FAC_NAME'],
  'categoryRaw':record['CATEGORY'],'facilityTypeRaw':record['FAC_TYPE'],'commodityRaw':record['COMMODITY'],
  'coordinates':coordinates,'coordinateCheck':coordinate_status,
  'facilityStatusRaw':record['FAC_STATUS'],'ogimStatusRaw':record['OGIM_STATUS'],'verifiedOperating':None,
  'sourceDateRaw':record['SRC_DATE'],'sourcePublishedOrUpdatedAt':date,'sourceDateCheck':date_status,
  'sourceRefRaw':record['SRC_REF_ID'],'sourceLink':link,'sourceLinkCheck':link_status,
  'coverage':{'catalog':'directory-record-only','verifiedOperating':'unknown','qualifiedObservation':'unknown','comparableHistory':'unknown','independentTruth':'unknown'},
 }


def _validate_schema(con):
 if con.execute('PRAGMA application_id').fetchone()[0] != 1196444487: raise ValueError('Not GPKG application ID')
 for name,digest in SCHEMA_HASHES.items():
  records=con.execute('SELECT type,sql FROM sqlite_schema WHERE name=?',(name,)).fetchall()
  if len(records)!=1 or records[0][0]!='table' or not records[0][1] or not records[0][1].upper().startswith('CREATE TABLE ') or hashlib.sha256(records[0][1].encode()).hexdigest()!=digest: raise ValueError('Pinned schema mismatch: '+name)
 for table in TABLES:
  if con.execute('SELECT column_name,geometry_type_name,srs_id,z,m FROM gpkg_geometry_columns WHERE table_name=?',(table,)).fetchall()!=[('geom','POINT',4326,0,0)]: raise ValueError('Geometry metadata mismatch')
  if con.execute('SELECT data_type,srs_id FROM gpkg_contents WHERE table_name=?',(table,)).fetchall()!=[('features',4326)]: raise ValueError('GPKG metadata mismatch')


def _read_catalog(con):
 rows=con.execute('SELECT SRC_ID,SRC_NAME,SRC_URL FROM Data_Catalog LIMIT 1001').fetchall()
 if len(rows)>1000: raise ValueError('Source catalog bound exceeded')
 catalog={}
 for identity,name,url in rows:
  if type(identity) is not int or identity<=0: raise ValueError('Invalid catalog source ID')
  catalog.setdefault(identity,[]).append((_text(name),_text(url)))
 return catalog


def _extract(con):
 _validate_schema(con)
 catalog=_read_catalog(con)
 output=[]; counts={}; keys=set(); output_bytes=0
 for table in TABLES:
  count=0
  # Only constants above are used as SQL identifiers. No source SQL/view executes.
  cursor=con.execute('SELECT '+','.join('"'+c+'"' for c in SELECT_COLUMNS)+' FROM "'+table+'" ORDER BY OGIM_ID LIMIT 10001')
  for row in cursor:
   if len(output)>=MAX_ROWS: raise ValueError('Record bound exceeded')
   mapped=_map_row(table,row,catalog)
   if mapped['sourceRecordKey'] in keys: raise ValueError('Duplicate version-scoped record key')
   output_bytes+=len(json.dumps(mapped,ensure_ascii=False,allow_nan=False).encode())
   if output_bytes>MAX_OUTPUT_BYTES-10000: raise ValueError('Output byte bound exceeded')
   keys.add(mapped['sourceRecordKey']);output.append(mapped);count+=1
  counts[table]=count
 return output,counts


def import_verified_local(path, *, version):
 """Only public entry: exact official file/version pin; no bypass, network or activation."""
 if version!=VERSION: raise ValueError('Unsupported version')
 path=Path(path).resolve(strict=True)
 before=path.stat()
 if not path.is_file() or before.st_size!=EXPECTED_BYTES: raise ValueError('Pinned file size mismatch')
 md5=hashlib.md5();sha=hashlib.sha256()
 with path.open('rb') as stream:
  header=stream.read(100)
  if header[:16]!=b'SQLite format 3\0' or int.from_bytes(header[68:72],'big')!=1196444487: raise ValueError('Bad SQLite/GPKG header')
  stream.seek(0)
  total=0
  while total<EXPECTED_BYTES:
   chunk=stream.read(min(1024*1024,EXPECTED_BYTES-total))
   if not chunk: break
   total+=len(chunk);md5.update(chunk);sha.update(chunk)
  if total!=EXPECTED_BYTES or stream.read(1): raise ValueError('Input byte bound mismatch')
 if md5.hexdigest()!=EXPECTED_MD5 or sha.hexdigest()!=EXPECTED_SHA256: raise ValueError('Pinned file checksum mismatch')
 con=sqlite3.connect(path.as_uri()+'?mode=ro&immutable=1',uri=True)
 try:
  con.enable_load_extension(False)
  con.execute('PRAGMA query_only=ON');con.execute('PRAGMA trusted_schema=OFF')
  if hasattr(con,'setconfig'): con.setconfig(sqlite3.SQLITE_DBCONFIG_DEFENSIVE,True)
  con.setlimit(sqlite3.SQLITE_LIMIT_LENGTH,1_000_000)
  con.setlimit(sqlite3.SQLITE_LIMIT_SQL_LENGTH,100_000)
  start=time.monotonic();con.set_progress_handler(lambda:int(time.monotonic()-start>120),10000)
  if con.execute('PRAGMA quick_check').fetchall()!=[('ok',)]: raise ValueError('SQLite quick_check failed')
  rows,counts=_extract(con)
 finally: con.close()
 after=path.stat()
 if (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns)!=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns): raise ValueError('Source changed during read')
 result={'schema':'gfrr-ogim-three-table-research-catalog-v1','researchOnly':True,'productionEligible':False,'activationAllowed':False,
  'scope':'THREE_TABLE_CATALOG_SUBSET_NOT_GLOBAL_OIL_OR_SATELLITE_COVERAGE',
  'source':{'version':VERSION,'metadataUrl':'https://zenodo.org/api/records/22835235','license':'CC-BY-4.0',
   'attribution':'Environmental Defense Fund and MethaneSAT LLC; OGIM v3.0, DOI 10.5281/zenodo.22835235',
   'publicationDate':'2026-09-18','sourceDataPeriod':'2025 or earlier','md5':EXPECTED_MD5,'sha256':EXPECTED_SHA256,
   'citation':'O’Brien et al., OGIM v3.0 (2026); Omara et al. (2023), doi:10.5194/essd-15-3761-2023',
   'modificationNotice':'Selected three tables; normalized source dates and point coordinates; source labels preserved. No capacity/throughput interpretation.',
   'capacitySemanticDictionary':'UNVERIFIED'},
  'tableCounts':counts,'recordCount':len(rows),'globalCoverageDenominator':None,'operationalCoveragePercent':None,'records':rows}
 encoded=json.dumps(result,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode()
 if len(encoded)>MAX_OUTPUT_BYTES: raise ValueError('Output byte bound exceeded')
 return encoded
