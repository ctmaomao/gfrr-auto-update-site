import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

test('both writers validate after generation before publication with matching source credentials',()=>{
  for(const name of ['build-realtime-market.yml','recover-stale-realtime-market.yml']) {
    const source=fs.readFileSync(new URL(`../../.github/workflows/${name}`,import.meta.url),'utf8');
    const steps=source.split('      - name: ');
    const index=label=>steps.findIndex(step=>step.startsWith(label+'\n')||step.startsWith(label+'\r\n'));
    const baseline=index('Load published realtime baseline'),generate=index('Generate realtime market'),validate=index('Validate realtime payload'),publish=index('Commit updated realtime file to publish branch');
    assert.ok(baseline>0 && baseline<generate && generate<validate && validate<publish);
    assert.ok(steps[generate].includes('FRED_API_KEY: ${{ secrets.FRED_API_KEY }}'));
    assert.match(steps[validate],/run: npm run check:realtime-local-schema/);
    assert.doesNotMatch(steps[validate],/continue-on-error|\|\| true/);
    if(name.startsWith('recover'))for(const i of [baseline,generate,validate,publish])assert.match(steps[i],/if: steps.health.outputs.shouldRecover == 'true'/);
  }
});

test('publication schema gate rejects invalid generated payload before a writer can continue',()=>{
  const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'gfrr-recovery-schema-'));
  try {
    fs.mkdirSync(path.join(fixture,'realtime'));
    const payload=JSON.parse(fs.readFileSync(new URL('../../realtime/market.json',import.meta.url)));
    const dest=path.join(fixture,'realtime/market.json');
    const run=()=>spawnSync(process.execPath,[fileURLToPath(new URL('../../scripts/check-realtime-local-schema.mjs',import.meta.url))],{cwd:fixture,encoding:'utf8',timeout:10000});
    fs.writeFileSync(dest,JSON.stringify(payload));assert.equal(run().status,0);
    const invalid=structuredClone(payload);invalid.values.brent=-1;
    fs.writeFileSync(dest,JSON.stringify(invalid));const result=run();assert.equal(result.status,1);assert.match(result.stderr,/brent must be positive/);
    assert.deepEqual(JSON.parse(fs.readFileSync(dest)),invalid); // The gate is read-only, never silently fixes it.
  } finally { fs.rmSync(fixture,{recursive:true,force:true}); }
});
