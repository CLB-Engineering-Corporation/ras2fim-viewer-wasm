import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {audit} from './oracle/audit.mjs';
export function exact(v){
  assert.ok(v && Number.isInteger(v.numericCompared) && v.numericCompared>0,'missing numeric oracle');
  assert.ok(Number.isInteger(v.rgbaBytesCompared)&&v.rgbaBytesCompared>0,'missing RGBA oracle');
  assert.equal(v.numericDifferences,0);assert.equal(v.rgbaDifferences,0);
}
export function reuse(states){
  assert.ok(states.length>1);
  const first=states[0];
  for(const s of states){
    assert.ok(typeof s.workerId==='string'&&s.workerId.length>0);
    assert.ok(typeof s.moduleId==='string'&&s.moduleId.length>0);
    assert.equal(s.workerId,first.workerId,'worker replaced');assert.equal(s.moduleId,first.moduleId,'module replaced');
    assert.equal(s.workerCreates,1);assert.equal(s.moduleInitializations,1);assert.equal(s.liveWorkers,1);assert.equal(s.liveHandles,0);
  }
}
export function recovery(rows,expectedCount){
  assert.equal(rows.length,expectedCount);
  assert.equal(new Set(rows.map(r=>r.iteration)).size,expectedCount);
  for(const r of rows){
    assert.ok(Number.isInteger(r.iteration)&&r.iteration>=0&&r.iteration<expectedCount);
    assert.ok(Number.isInteger(r.failedGeneration)&&r.failedGeneration>0);
    assert.ok(Number.isInteger(r.recoveredGeneration)&&r.recoveredGeneration>r.failedGeneration);
    assert.ok(Number.isFinite(r.started)&&Number.isFinite(r.settled)&&r.settled>=r.started&&r.settled-r.started<=60000);
    assert.equal(r.outcome,r.scenario==='malformed'?'rejected':'cancelled');
    assert.ok(Array.isArray(r.paintedGenerations)&&r.paintedGenerations.length>0);
    assert.ok(!r.paintedGenerations.includes(r.failedGeneration),'stale failed frame');
    assert.equal(r.paintedGenerations.at(-1),r.recoveredGeneration);
    assert.equal(r.liveHandles,0);exact(r.verification);
  }
}
export function adoptionAudit(report,baseline,expectedPins){
  assert.equal(report.adoption?.schema,1,'new adoption evidence required');
  assert.ok(expectedPins && Object.keys(expectedPins).length>=7,'independently freeze candidate pins');
  for(const key of ['vendor/terrio/terrio.js','vendor/h5wasm.js'])assert.ok(expectedPins[key],'missing executable decoder dependency');
  for(const value of Object.values(expectedPins))assert.match(value,/^[a-f0-9]{64}$/,'invalid SHA256 pin');
  assert.deepEqual(report.sourcePins,expectedPins,'candidate artifact mismatch');
  assert.notDeepEqual(report.sourcePins,baseline.baselineSourcePins,'old baseline is not adoption');
  assert.equal(report.adoption.preflight?.length,3,'independent decoder preflight required');
  assert.deepEqual(report.adoption.preflight.map(p=>p.engine).sort(),['chromium','firefox','webkit']);
  const inputs=['data/filter_depth_wb-2427467.nc','data/filter_wsel_wb-2427466.nc','data/filter_wsel_wb-2427467.nc','/fixtures/receding.nc'];
  assert.deepEqual(Object.keys(report.adoption.inputPins).sort(),inputs.toSorted());
  for(const p of report.adoption.preflight){
    assert.equal(p.completed,true);assert.deepEqual(p.sourcePins,expectedPins);
    assert.deepEqual(p.inputPins,report.adoption.inputPins);
    assert.deepEqual(p.rows.map(r=>r.file).sort(),inputs.toSorted());
    for(const r of p.rows){assert.match(r.sha256,/^[a-f0-9]{64}$/);assert.equal(r.sha256,report.adoption.inputPins[r.file]);exact(r);}
  }
  assert.ok(report.trials>=3&&report.cycles>=80,'require three trials, 80 cycles, all engines');
  assert.equal(report.cacheRouting,false);assert.equal(report.basemap,'same-origin-transparent');
  const results=audit(report);
  assert.ok(Array.isArray(report.adoption.stress));
  assert.equal(report.adoption.stress.length,3*2*report.trials*3*20);
  for(const result of results){
    const limit=baseline.thresholds.find(x=>x.engine===result.engine&&x.decoder===result.decoder);assert.ok(limit);
    for(const [key,v] of Object.entries(result.metrics))assert.ok(v.p95<=limit.timings[key].limitMs,`${result.engine}/${key} timing regression: ${v.p95}`);
    const long=baseline.webkitLong.find(x=>x.decoder===result.decoder);
    const rssLimit=result.engine==='webkit'?long.limitBytes:limit.rss.limitBytes;
    assert.ok(result.rssEndpointBytes.max<=rssLimit,`${result.engine}/${result.decoder} RSS regression`);
    const engine=report.engines.find(e=>e.engine===result.engine);
    for(let trial=0;trial<report.trials;trial++){
      const samples=engine.samples.filter(s=>s.decoder===result.decoder&&s.trial===trial);
      const switches=samples.filter(s=>s.kind==='stream-render').sort((a,b)=>a.cycle-b.cycle);
      reuse(switches.map(s=>s.state.reuse));
      for(const s of samples.filter(s=>s.kind!=='slider-settled-render'))exact(s.verification);
      for(const scenario of ['cancel-fetch','cancel-prepare','malformed']){
        const rows=report.adoption.stress.filter(r=>r.engine===result.engine&&r.decoder===result.decoder&&r.trial===trial&&r.scenario===scenario);
        recovery(rows,20);reuse([switches[0].state.reuse,...rows.map(r=>r.reuse)]);
      }
    }
  }
  return {scope:'bounded measured-baseline regression; not operational RAM certification',results};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const load=p=>JSON.parse(readFileSync(p));
  console.log(JSON.stringify(adoptionAudit(load(process.argv[2]),load(process.argv[3]),load(process.argv[4])),null,2));
}
