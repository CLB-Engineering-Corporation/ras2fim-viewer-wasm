import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {audit} from './audit.mjs';
import {observeBrowserErrors} from './errors.mjs';
import {streams} from './contracts.mjs';
const decoders=['h5wasm','terrio-slices'];
function fixture() {
 const baseEvent={layer:true,sourceLoaded:true,painted:10};
 const engine=engine=>({engine,errors:[],summaries:{untrusted:'ignored'},rss:decoders.flatMap(decoder=>Array.from({length:4},(_,cycle)=>({decoder,trial:0,cycle,processes:[{Id:1,WorkingSet64:100}]}))),samples:decoders.flatMap(decoder=>[
 ...['cold','warm'].map(phase=>({decoder,trial:0,kind:'first-render',phase,ms:1,started:0,generation:1,max:17,done:{generation:1},state:{generation:1},event:{...baseEvent,at:1,revision:1,generation:1,index:0}})),
 ...streams.map((stream,cycle)=>({decoder,trial:0,cycle,max:stream.max,generation:cycle+2,started:10+cycle*100,kind:'stream-render',stream:stream.id,done:{generation:cycle+2,timings:{wasmCapacityBytes:65536}},state:{generation:cycle+2,canvasRevision:10+cycle*4,sparseBytes:100},ms:2,event:{...baseEvent,at:12+cycle*100,revision:1+cycle*4,generation:cycle+2,index:0}})),
 ...streams.flatMap((stream,cycle)=>[0,stream.max,Math.floor(stream.max/2)].map((index,slot)=>({decoder,trial:0,cycle,index,max:stream.max,generation:cycle+2,started:20+cycle*100+slot*5,kind:'slider-settled-render',stream:stream.id,event:{...baseEvent,index,at:23+cycle*100+slot*5,revision:2+cycle*4+slot,generation:cycle+2,painted:cycle===3&&index===0?0:10},ms:3})))])});
 return {completed:true,started:'2026-11-02T00:00:00Z',finished:'2026-11-02T00:01:00Z',trials:1,cycles:4,engines:['chromium','firefox','webkit'].map(engine)};
}
test('audit recomputes metrics from complete raw evidence',()=>{
 const results=audit(fixture());assert.equal(results.length,6);assert.equal(results[0].metrics['h5wasm/stream-render'].median,2);assert.equal(results[0].rssEndpointBytes.count,4);
});
test('audit rejects duplicate engines, samples, missing RSS, invalid metrics and errors',()=>{
 for(const mutate of [
 d=>{d.completed=false;},
 d=>{delete d.completed;},
 d=>{delete d.finished;},
 d=>{d.engines[2].engine='chromium';},
 d=>{d.engines[0].samples[1]=d.engines[0].samples[0];},
 d=>{d.engines[0].samples.pop();},
 d=>{d.engines[0].rss.pop();},
 d=>{d.engines[0].rss[1]=d.engines[0].rss[0];},
 d=>{d.engines[0].samples[0].ms=NaN;},
 d=>{d.engines[0].samples[0].event={layer:false};},
 d=>{delete d.engines[0].samples[0].event.at;},
 d=>{d.engines[0].samples[0].event.generation=8;},
 d=>{d.engines[0].samples[2].done.generation=9;},
 d=>{d.engines[0].samples[0].event.revision=0;},
 d=>{d.engines[0].samples[6].index=-1;},
 d=>{d.engines[0].samples[6].index=999;},
 d=>{d.trials=2;},
 d=>{d.engines[0].samples[2].stream='fake-receding';},
 d=>{d.engines[0].samples[2].max=999;},

 d=>{d.engines[0].errors.push('injected non-MISMATCH failure');},
 ]){const d=fixture();mutate(d);assert.throws(()=>audit(d));}
});
test('non-MISMATCH console, HTTP, page and request failures all reject acceptance',()=>{
 const page=new EventEmitter(),errors=[];const stop=observeBrowserErrors(page,errors);
 page.emit('console',{type:()=> 'error',text:()=> 'injected ordinary failure'});
 page.emit('pageerror',new Error('injected exception'));
 page.emit('response',{status:()=>500,url:()=> 'http://local/asset'});
 page.emit('requestfailed',{url:()=> 'http://local/data',failure:()=>({errorText:'failed'})});
 assert.equal(errors.length,4);
 const d=fixture();d.engines[0].errors=errors;assert.throws(()=>audit(d));
 stop();page.emit('pageerror',new Error('teardown'));assert.equal(errors.length,4);
});

test('single-engine stress cannot replace full acceptance or use short smoke evidence',()=>{
 const d=fixture();d.engines=d.engines.filter(e=>e.engine==='webkit');
 assert.throws(()=>audit(d));
 assert.throws(()=>audit(d,'webkit-stress'));
 assert.throws(()=>audit(d,'arbitrary-relaxed-profile'));
});
