import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function review(values, rowCount=1) {
  const dir = mkdtempSync(join(tmpdir(), 'thermal-frp-'));
  try {
    const paths = values.map((maxFrp,i) => {
      const path=join(dir, `sample-${i}.json`);
      writeFileSync(path, JSON.stringify({schemaVersion:'oil-thermal-watch-1',module:'oil-thermal-watch',
        sources:['VIIRS_SNPP_NRT','VIIRS_NOAA20_NRT','VIIRS_NOAA21_NRT'],
        generatedAt:`2026-06-${String(i+1).padStart(2,'0')}T00:00:00Z`,status:'ok',sourceStatus:{firms:'live'},productionImpact:{affectsScoring:false},
        aggregate:{facilityCount:1,requestCount:3,requestErrorCount:0,requestDiagnostics:{policyVersion:'firms-request-policy-1',logicalRequestCount:3,failedRequestCount:0,failuresByCategory:{}}},
        facilities:[{id:'synthetic-only',sourceStatus:'live',requestErrorCount:0,rowCount,maxFrp,highConfidenceCount:0,frpOver50Count:0,frpOver100Count:0,baselineComparison:{sourcesWithDetections:1}}]}));
      return path;
    });
    const run=spawnSync(process.execPath,['scripts/oil-directional/review-oil-thermal-baseline-samples.mjs',...paths.flatMap(p=>['--input',p]),'--min-samples','1','--json','--no-output'],{encoding:'utf8'});
    assert.equal(run.status,0,run.stderr);
    return JSON.parse(run.stdout);
  } finally { rmSync(dir,{recursive:true,force:true}); }
}

test('missing, malformed and negative FRP never become observed zero or candidate', () => {
  for (const value of [null,undefined,'','0',true,-1]) {
    const r=review([value]); const f=r.facilities[0];
    assert.equal(f.metrics.maxFrpP95,null);assert.equal(f.metrics.maxObservedFrp,null);
    assert.equal(f.metrics.measuredFrpSampleCount,0);assert.equal(f.metrics.missingFrpSampleCount,1);
    assert.equal(f.readyForBaseline,false);assert.deepEqual(r.candidateBaseline.facilities,[]);
  }
});
test('real zero remains measured and complete valid cohorts retain existing percentile', () => {
  const r=review([0,2,8]);const f=r.facilities[0];
  assert.equal(f.metrics.maxFrpP95,8);assert.equal(f.metrics.maxObservedFrp,8);
  assert.equal(f.metrics.measuredFrpSampleCount,3);assert.equal(f.metrics.missingFrpSampleCount,0);assert.equal(f.readyForBaseline,true);
  assert.equal(review([0]).facilities[0].metrics.maxFrpP95,0);
});
test('mixed missing/real observations are explicit diagnostics, never conditional baseline promotion', () => {
  const r=review([null,0,8]);const f=r.facilities[0];
  assert.equal(f.metrics.maxFrpP95,8);assert.equal(f.metrics.measuredFrpSampleCount,2);
  assert.equal(f.metrics.missingFrpSampleCount,1);assert.equal(f.readyForBaseline,false);
  assert.deepEqual(r.candidateBaseline.facilities,[]);assert.match(f.warnings.join(' '),/diagnostic only/);
  const empty=review([null],0);assert.equal(empty.facilities[0].metrics.maxObservedFrp,null);assert.equal(empty.facilities[0].readyForBaseline,false);
});
