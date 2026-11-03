import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exact,reuse,recovery,adoptionAudit} from './audit.mjs';
const verification={numericCompared:10,numericDifferences:0,rgbaBytesCompared:40,rgbaDifferences:0};
const state={workerId:'w1',moduleId:'m1',workerCreates:1,moduleInitializations:1,liveWorkers:1,liveHandles:0};
const row={iteration:0,scenario:'cancel-fetch',outcome:'cancelled',failedGeneration:2,recoveredGeneration:3,started:0,settled:10,paintedGenerations:[3],liveHandles:0,verification};
test('exact gates require actual comparisons and zero differences',()=>{
 exact(verification);
 for(const patch of [{numericCompared:0},{rgbaBytesCompared:0},{numericDifferences:1},{rgbaDifferences:1}])assert.throws(()=>exact({...verification,...patch}));
});
test('reuse requires stable identities, initialization count and freed handles',()=>{
 reuse([state,{...state}]);
 for(const patch of [{workerId:'w2'},{moduleId:'m2'},{workerCreates:2},{moduleInitializations:2},{liveHandles:1},{liveWorkers:2}])assert.throws(()=>reuse([state,{...state,...patch}]));
});
test('recovery rejects stale frames, unbounded waits, missing samples and false success',()=>{
 recovery([row],1);
 for(const patch of [{paintedGenerations:[2,3]},{settled:60001},{outcome:'success'},{liveHandles:1},{recoveredGeneration:2}])assert.throws(()=>recovery([{...row,...patch}],1));
 assert.throws(()=>recovery([row,row],2));assert.throws(()=>recovery([],1));
 recovery([{...row,scenario:'malformed',outcome:'rejected'}],1);
});
test('historical report cannot be relabeled adoption',()=>{
 assert.throws(()=>adoptionAudit({completed:true},{},{}),/new adoption evidence/);
});
import {fixture} from './fixture.mjs';
import {readFileSync} from 'node:fs';
function full(){
 const report=fixture();report.trials=3;
 report.cacheRouting=false;report.basemap='same-origin-transparent';
 report.sourcePins=Object.fromEntries(['app.js','netcdf.js','netcdf-worker.js','terrio-adapter.js','vendor/terrio/terrio_bg.wasm','vendor/terrio/terrio.js','vendor/h5wasm.js'].map(k=>[k,'c'.repeat(64)]));
 const files=['data/filter_depth_wb-2427467.nc','data/filter_wsel_wb-2427466.nc','data/filter_wsel_wb-2427467.nc','/fixtures/receding.nc'];
 report.adoption={schema:1,stress:[],inputPins:Object.fromEntries(files.map(f=>[f,'d'.repeat(64)]))};
 report.adoption.preflight=['chromium','firefox','webkit'].map(engine=>({engine,completed:true,sourcePins:report.sourcePins,inputPins:report.adoption.inputPins,rows:files.map(file=>({file,sha256:'d'.repeat(64),...verification}))}));
 for(const e of report.engines){
  for(const key of ['samples','rss']){const original=e[key];e[key]=[0,1,2].flatMap(trial=>original.map(s=>({...structuredClone(s),trial})));}
  for(const s of e.samples){s.verification=verification;if(s.state)s.state.reuse=state;}
  for(const decoder of ['h5wasm','terrio-slices'])for(let trial=0;trial<3;trial++)for(const scenario of ['cancel-fetch','cancel-prepare','malformed'])for(let iteration=0;iteration<20;iteration++)report.adoption.stress.push({...row,engine:e.engine,decoder,trial,scenario,iteration,outcome:scenario==='malformed'?'rejected':'cancelled',reuse:state});
 }
 return report;
}
test('complete long all-engine audit passes and rejects regression or missing lifecycle evidence',()=>{
 const baseline=JSON.parse(readFileSync(new URL('./baseline.json',import.meta.url)));
 const report=full();assert.equal(adoptionAudit(report,baseline,report.sourcePins).results.length,6);
 for(const mutate of [
  r=>{r.adoption.preflight.pop();},r=>{r.adoption.preflight[0].rows[0].numericDifferences=1;},r=>{r.cycles=4;},r=>{r.adoption.stress.pop();},r=>{r.engines[0].samples.find(s=>s.kind==='stream-render').state.reuse={...state,workerCreates:2};},
  r=>{r.engines[0].rss[0].processes[0].WorkingSet64=10**12;},
  r=>{for(const s of r.engines[0].samples){s.ms+=100000;s.event.at+=100000;}},
  r=>{r.engines[0].samples[0].verification.rgbaDifferences=1;}
 ]){const changed=structuredClone(report);mutate(changed);assert.throws(()=>adoptionAudit(changed,baseline,report.sourcePins));}
});
