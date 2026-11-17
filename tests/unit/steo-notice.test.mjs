import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const python = `
import importlib.util, pathlib, json, sys
sys.dont_write_bytecode=True
p=pathlib.Path('scripts/oil-directional/steo_revision_notice.py')
s=importlib.util.spec_from_file_location('n',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
body='<h1>Short-Term Energy Outlook Notice</h1>'+''.join('<p>'+p+'</p>' for p in m.EXPECTED_PARAGRAPHS)+'<h2>About</h2>'
header='<p>Release Date: November 10, 2026</p><p>Released: January 1, 2099</p>'
r=m.parse_notice((header+body).encode());assert r['noticeBodyDate']=='2020-12-08';assert not r['eligibleForEvaluation'];assert not r['historicalRevisionComplete']
inside='inside_documented_correction_scope';outside='outside_this_notice_not_proof_of_no_revision'
for issue,month in [('2019-08','2015-01'),('2019-12','2015-01'),('2020-01','2016-01'),('2020-11','2016-01')]:assert m.scope_relation(r,issue,'7d part 2','C',month)==inside
for args in [('2019-07','7d part 2','C','2015-01'),('2020-12','7d part 2','C','2016-01'),('2020-01','7d part 2','C','2015-01'),('2020-01','7d part 2','D','2016-01'),('2026-10','3a','BK','2027-01')]:assert m.scope_relation(r,*args)==outside
for fmt in ['data_browser','quarterly_tables']:assert m.scope_relation(r,'2020-01','7d part 2','C','2016-01',fmt)==outside
assert m.scope_relation(r,'2020-01','7d part 2','C','2016-01','unknown')=='unknown_format'
for bad in [body+body,body.replace('December 8, 2020','November 10, 2026'),body.replace('Released: December 8, 2020',''),body.replace('Column C','Column D'),body.replace('<h1>','<h1 hidden>'),body.replace('<p>Released:', '<p hidden>Released:'), '<script>'+body+'</script>',body.replace('January 2016','January 2017'),body.replace('January 2015','TEMP').replace('January 2016','January 2015').replace('TEMP','January 2016'),body.replace('December 2019 STEO','December 2018 STEO'),body.replace('were not correct','were correct'),body.replace('<h2>About</h2>','<p>This correction does not apply.</p><h2>About</h2>'),body.replace('<h2>About</h2>','Conflicting unscoped text<h2>About</h2>')]:
 try:m.parse_notice(bad.encode())
 except ValueError:pass
 else:raise AssertionError('invalid notice accepted')
# Real HTML may omit closing p; the next p implicitly closes the previous one.
assert m.parse_notice(body.replace('</p>','',1).encode())['noticeBodyDate']=='2020-12-08'
for month in ['2020-13','2020-1','2020-00']:
 try:m.scope_relation(r,month,'7d part 2','C','2016-01')
 except ValueError:pass
 else:raise AssertionError('bad month')
print(json.dumps({'synthetic':True,'bodyDate':'2020-12-08','sampleAffected':False,'firstReleaseVerified':False}))
`;
test('STEO body-scoped correction parsing rejects current header and unrelated sample inference',()=>{
 const r=spawnSync('python3',['-c',python],{encoding:'utf8',timeout:15000,maxBuffer:65536});
 assert.equal(r.status,0,r.stderr);const out=JSON.parse(r.stdout);assert.equal(out.synthetic,true);assert.equal(out.sampleAffected,false);assert.equal(out.firstReleaseVerified,false);
});
