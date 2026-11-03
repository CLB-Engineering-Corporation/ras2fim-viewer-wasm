import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {streams,syntheticStream} from './contracts.mjs';
const decoders = ['h5wasm','terrio-slices'];
function stats(values) {
  for (const n of values) assert.ok(Number.isFinite(n) && n >= 0, 'invalid measurement');
  const a = values.toSorted((a,b)=>a-b);
  return {count:a.length,median:a.length?(a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2:null,p95:a.length?a[Math.ceil(.95*a.length)-1]:null,min:a.length?a[0]:null,max:a.length?a.at(-1):null};
}
function unique(rows, key, expected) {
  assert.equal(rows.length, expected.length, 'missing or extra samples');
  assert.deepEqual(rows.map(key).sort(), expected.toSorted(), 'duplicate or missing sample key');
}
export function audit(report) {
  assert.equal(report.completed,true,'runner cleanup did not complete successfully');
  assert.ok(Number.isFinite(Date.parse(report.finished))&&Date.parse(report.finished)>=Date.parse(report.started),'missing or invalid completion timestamp');
  assert.ok(Number.isInteger(report.trials) && report.trials > 0);
  assert.ok(Number.isInteger(report.cycles) && report.cycles >= 4);
  unique(report.engines,e=>e.engine,['chromium','firefox','webkit']);
  const cycles = Array.from({length:report.trials},(_,t)=>Array.from({length:report.cycles},(_,c)=>`${t}/${c}`)).flat();
  const first = Array.from({length:report.trials},(_,t)=>['cold','warm'].map(p=>`${t}/${p}`)).flat();
  const results = [];
  for (const e of report.engines) {
    assert.deepEqual(e.errors,[],JSON.stringify(e.errors));
    assert.ok(e.samples.every(s=>decoders.includes(s.decoder)), 'unknown decoder');
    assert.ok(e.rss.every(s=>decoders.includes(s.decoder)), 'unknown RSS decoder');
    for (const decoder of decoders) {
      const samples=e.samples.filter(s=>s.decoder===decoder);
      assert.ok(samples.every(s=>['first-render','stream-render','slider-settled-render'].includes(s.kind)), 'unknown metric');
      stats(samples.map(s=>s.ms));
      const initial=samples.filter(s=>s.kind==='first-render');
      const switches=samples.filter(s=>s.kind==='stream-render');
      const sliders=samples.filter(s=>s.kind==='slider-settled-render');
      unique(initial,s=>`${s.trial}/${s.phase}`,first);
      for(const s of initial){assert.equal(s.started,0);assert.equal(s.generation,1);assert.equal(s.done.generation,1);assert.equal(s.state.generation,1);}
      unique(switches,s=>`${s.trial}/${s.cycle}`,cycles);
      assert.equal(sliders.length,cycles.length*3);
      for(const s of switches){
        const expected=streams[s.cycle%streams.length];
        assert.equal(s.stream,expected.id,'wrong stream rotation');
        assert.equal(s.generation,s.cycle+2,'incorrect dispatch generation');
        assert.equal(s.max,expected.max,'incorrect slider bound');
      }
      for (const s of samples) {
        assert.ok(Number.isFinite(s.started)&&s.started>=0);
        assert.ok(Number.isFinite(s.event.at)&&s.event.at>=s.started);
        assert.ok(Math.abs(s.ms-(s.event.at-s.started))<0.00001,'inconsistent timing');
        assert.ok(Number.isInteger(s.event.revision)&&s.event.revision>0);
        assert.ok(Number.isInteger(s.generation)&&s.generation>0);
        assert.equal(s.event.generation,s.generation,'stale render generation');
        assert.ok(Number.isInteger(s.max)&&s.max>=2);
        assert.ok(Number.isInteger(s.event.index)&&s.event.index>=0&&s.event.index<=s.max);
        assert.equal(s.event.layer,true,'depth layer absent');
        assert.equal(s.event.sourceLoaded,true,'depth source incomplete');
        assert.ok(Number.isInteger(s.event.painted)&&s.event.painted>=0);
      }
      for (const s of switches) {
        const rows=sliders.filter(x=>x.trial===s.trial&&x.cycle===s.cycle);
        assert.equal(rows.length,3,'missing slider interaction');
        assert.deepEqual(rows.map(x=>x.index),[0,s.max,Math.floor(s.max/2)],'incorrect slider positions');
        for(const row of rows) {
          assert.equal(row.stream,s.stream);
          assert.equal(row.max,s.max);
          assert.equal(row.generation,s.generation);
          assert.ok(row.event.revision>=s.event.revision);
          assert.ok(row.started>=s.event.at);
          assert.equal(row.event.index,row.index);
        }
        assert.ok(s.done && s.state,'missing worker/memory evidence');
        assert.equal(s.done.generation,s.generation);
        assert.equal(s.state.generation,s.generation);
        assert.ok(s.state.canvasRevision>=s.event.revision);
      }
      const dry=sliders.filter(s=>s.stream===syntheticStream&&s.event.painted===0);
      assert.ok(dry.length,'missing dry rendered frame');
      const memory=e.rss.filter(s=>s.decoder===decoder);
      unique(memory,s=>`${s.trial}/${s.cycle}`,cycles);
      const totals=memory.map(s=>{
        assert.ok(Array.isArray(s.processes)&&s.processes.length,'missing browser processes');
        assert.equal(new Set(s.processes.map(p=>p.Id)).size,s.processes.length);
        for(const p of s.processes)assert.ok(Number.isFinite(p.WorkingSet64)&&p.WorkingSet64>0);
        return s.processes.reduce((n,p)=>n+p.WorkingSet64,0);
      });
      const metrics={};
      for(const kind of ['first-render','slider-settled-render','stream-render'])
        for(const phase of kind==='first-render'?['cold','warm']:[null])
          metrics[[decoder,kind,phase].filter(Boolean).join('/')]=stats(samples.filter(s=>s.kind===kind&&(!phase||s.phase===phase)).map(s=>s.ms));
      results.push({engine:e.engine,decoder,metrics,dryRenderedFrames:dry.length,rssEndpointBytes:stats(totals),rssFirstBytes:totals[0],rssLastBytes:totals.at(-1),wasmCapacityBytes:stats(switches.map(s=>s.done.timings.wasmCapacityBytes)),sparseBytes:stats(switches.map(s=>s.state.sparseBytes))});
    }
  }
  return results;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const file=process.argv[2]||'target/viewer-acceptance/raw.json';
  const results=audit(JSON.parse(readFileSync(file)));
  writeFileSync(file.replace(/\.json$/,'.summary.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify(results,null,2));
}
