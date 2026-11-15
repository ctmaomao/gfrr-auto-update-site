import hashlib,json,sqlite3,struct,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import importlib.util
spec = importlib.util.spec_from_file_location('ogim_catalog', Path(__file__).resolve().parents[2] / 'scripts/oil-directional/ogim_catalog.py')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def point(x=12.0,y=3.0):
 return b'GP\x00\x01'+struct.pack('<i',4326)+b'\x01'+struct.pack('<Idd',1,x,y)

def row(**changes):
 value={'OGIM_ID':1,'geom':point(),'COUNTRY':'SYNTHETIC','FAC_NAME':'FIXTURE ONLY','CATEGORY':'SYNTHETIC','FAC_TYPE':'N/A','COMMODITY':'N/A','FAC_STATUS':'ACTIVE','OGIM_STATUS':'ACTIVE','SRC_REF_ID':'1','SRC_DATE':'2025-01-01','LATITUDE':3.0,'LONGITUDE':12.0}
 value.update(changes)
 return tuple(value[k] for k in mod.SELECT_COLUMNS)

class Tests(unittest.TestCase):
 def test_point_is_not_boundary_or_accuracy_claim(self):
  coords,quality=mod._point(point(),3,12)
  self.assertEqual(coords['representation'],'POINT_NOT_BOUNDARY')
  self.assertIn('not-location-verified',quality)
 def test_zero_coordinate_and_missing_mismatch(self):
  self.assertEqual(mod._point(point(0,0),0,0)[0]['latitude'],0)
  for lat,lon,reason in [(None,12,'missing'),(-999,12,'missing'),(4,12,'mismatch'),('3',12,'invalid')]:
   c,q=mod._point(point(),lat,lon);self.assertIsNone(c);self.assertIn(reason,q)
 def test_bad_geometry_rejected(self):
  for b in [b'bad',point()+b'x',point().replace(b'GP',b'XX',1), b'GP\x00\x21'+point()[4:],point()[:4]+struct.pack('<i',3857)+point()[8:],point()[:9]+struct.pack('<I',2)+point()[13:],point(float('inf'),3)]:
   with self.assertRaises(ValueError):mod._point(b,3,12)
 def test_source_dates_not_observation(self):
  for date in [None,'N/A','1900-01-01','2025-02-29']:
   self.assertIsNone(mod._source_date(date)[0])
  self.assertEqual(mod._source_date('2024-02-29')[0],'2024-02-29')
  self.assertEqual(mod._source_date('2026-01-01')[0],'2026-01-01')
 def test_status_raw_only_no_operating_truth(self):
  r=mod._map_row(mod.TABLES[0],row(),{1:[('Synthetic','https://example.invalid')]})
  self.assertEqual(r['facilityStatusRaw'],'ACTIVE');self.assertIsNone(r['verifiedOperating'])
  self.assertNotIn('observedAt',r);self.assertNotIn('capacity',r)
  self.assertEqual(list(r['coverage'].values()),['directory-record-only']+['unknown']*4)
 def test_composite_sources_resolved_only_unambiguously(self):
  catalog={1:[('a','u')],2:[('b','v')]}
  linked,reason=mod._source_link('1, 2',catalog)
  self.assertEqual([x['sourceId'] for x in linked['sources']],[1,2]);self.assertIn('composite',reason)
  for raw in ['1,3','1,1','1;2','1,','N/A',None]:self.assertIsNone(mod._source_link(raw,catalog)[0])
  self.assertIsNone(mod._source_link('1',{1:[('a','u'),('b','v')]})[0])
 def test_record_version_scope_not_crossversion_identity(self):
  r=mod._map_row(mod.TABLES[1],row(),{})
  self.assertEqual(r['sourceRecordKey'],'OGIM_v3.0:Petroleum_Terminals:1')
  self.assertNotIn('export',r);self.assertNotIn('producing',r)
 def test_public_entry_rejects_unknown_version_and_wrong_file(self):
  with self.assertRaises(ValueError):mod.import_verified_local('/absent',version='latest')
  with tempfile.NamedTemporaryFile() as f:
   with self.assertRaises(ValueError):mod.import_verified_local(f.name,version=mod.VERSION)
 def test_synthetic_database_full_secure_flow_and_failure_paths(self):
  with tempfile.TemporaryDirectory() as directory:
   p=Path(directory)/'synthetic.gpkg';c=sqlite3.connect(p)
   c.execute('PRAGMA application_id=1196444487')
   # Test-owned minimal schemas, not SQL copied/executed from the downloaded DB.
   for t in mod.TABLES:
    c.execute('CREATE TABLE "'+t+'" (OGIM_ID INTEGER, geom BLOB, COUNTRY TEXT, FAC_NAME TEXT, CATEGORY TEXT, FAC_TYPE TEXT, COMMODITY TEXT, FAC_STATUS TEXT, OGIM_STATUS TEXT, SRC_REF_ID TEXT, SRC_DATE TEXT, LATITUDE REAL, LONGITUDE REAL)')
    c.execute('INSERT INTO "'+t+'" VALUES('+','.join('?' for _ in mod.SELECT_COLUMNS)+')',row())
   c.execute('CREATE TABLE Data_Catalog (SRC_ID INTEGER,SRC_NAME TEXT,SRC_URL TEXT)');c.execute("INSERT INTO Data_Catalog VALUES(1,'SYNTHETIC','https://example.invalid')")
   c.execute('CREATE TABLE gpkg_geometry_columns (table_name TEXT,column_name TEXT,geometry_type_name TEXT,srs_id INTEGER,z INTEGER,m INTEGER)')
   c.execute('CREATE TABLE gpkg_contents(table_name TEXT,data_type TEXT,srs_id INTEGER)')
   for t in mod.TABLES:
    c.execute('INSERT INTO gpkg_geometry_columns VALUES(?,?,?,?,?,?)',(t,'geom','POINT',4326,0,0));c.execute('INSERT INTO gpkg_contents VALUES(?,?,?)',(t,'features',4326))
   c.commit()
   hashes={n:hashlib.sha256(sql.encode()).hexdigest() for n,sql in c.execute('SELECT name,sql FROM sqlite_schema')}
   c.close();data=p.read_bytes()
   with patch.multiple(mod,EXPECTED_BYTES=len(data),EXPECTED_MD5=hashlib.md5(data).hexdigest(),EXPECTED_SHA256=hashlib.sha256(data).hexdigest(),SCHEMA_HASHES=hashes):
    result=json.loads(mod.import_verified_local(p,version=mod.VERSION))
    self.assertEqual(result['recordCount'],3);self.assertFalse(result['productionEligible'])
    self.assertIsNone(result['globalCoverageDenominator'])
    with patch.object(mod,'MAX_ROWS',2):
     with self.assertRaisesRegex(ValueError,'Record bound'):mod.import_verified_local(p,version=mod.VERSION)
    with patch.object(mod,'MAX_OUTPUT_BYTES',100):
     with self.assertRaisesRegex(ValueError,'Output byte bound'):mod.import_verified_local(p,version=mod.VERSION)
    with patch.object(mod,'SCHEMA_HASHES',{**hashes,mod.TABLES[0]:'bad'}):
     with self.assertRaisesRegex(ValueError,'schema mismatch'):mod.import_verified_local(p,version=mod.VERSION)
    with patch.object(mod,'EXPECTED_MD5','bad'):
     with self.assertRaisesRegex(ValueError,'checksum'):mod.import_verified_local(p,version=mod.VERSION)
   self.assertEqual(p.read_bytes(),data)

if __name__=='__main__':unittest.main()
