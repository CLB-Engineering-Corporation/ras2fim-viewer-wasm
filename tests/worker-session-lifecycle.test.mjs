import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/viewer-2d/netcdf-worker.js',import.meta.url),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=async()=>{for(let i=0;i<25;i++)await Promise.resolve();};
function harness(originalDecoder=false){
 const messages=[],tasks=[],stacks=[];let fail=false,decoding=null,fetching=null;
 const ctx={performance:{now:()=>0},AbortController,URL,Uint8Array,Uint32Array,Uint8ClampedArray,
  importScripts(){},MessageChannel:class{constructor(){this.port1={};this.port2={postMessage:()=>tasks.push(()=>this.port1.onmessage())};}},
  fetch:async(url)=>fetching?fetching.promise:{ok:true,arrayBuffer:async()=>new ArrayBuffer(8)},
  R2F2D:{buildIndex(){if(fail)throw Error('bad prepare');return {offsets:new Uint32Array([0]),depths:new Uint16Array([1]),stats:{max:1},bbox:[0,0,1,1]};}},
  R2FTerrio:{readStack(){if(decoding)return decoding.promise;return stack();}},
  postMessage(m,t){messages.push(structuredClone(m,{transfer:t}));if(m.type==='layer'){assert.equal(m.offsets.byteLength,0);assert.equal(m.depths.byteLength,0);}},
 };
 function stack(){const s={nFlow:2,nx:1,ny:1,wsel:new Uint16Array(2),terrain:new Uint16Array(1),disposed:0,dispose(){this.disposed++;}};stacks.push(s);return s;}
 ctx.self=ctx;vm.createContext(ctx);vm.runInContext(source,ctx);if(!originalDecoder)vm.runInContext('decoder = function () { return testInit; };',ctx);ctx.testInit=Promise.resolve({features:()=>({memory:100})});
 return {ctx,messages,tasks,stacks,stack,send:m=>ctx.onmessage({data:m}),load:(epoch=1)=>ctx.onmessage({data:{type:'load',epoch,url:'a.nc',backend:'terrio-slices'}}),async drain(){await tick();while(tasks.length){tasks.shift()();await tick();}},setFail:v=>fail=v,setDecode:v=>decoding=v,setFetch:v=>fetching=v};
}
test('persistent worker drops source after done, transfers sparse only, reuses module',async()=>{
 const h=harness();let init=0;h.ctx.testInit=Promise.resolve({features:()=>{init++;return {memory:100};}});
 h.load();await h.drain();h.load(2);await h.drain();
 assert.equal(h.messages.filter(m=>m.type==='done').length,2);assert.ok(init>0);
 assert.ok(h.stacks.every(s=>s.disposed===1));assert.equal(h.ctx.state.stack,null);assert.equal(h.ctx.state.reference,null);
 for(const m of h.messages){assert.ok(!('wsel'in m));if(m.meta)assert.ok(!('wsel'in m.meta)&&!('terrain'in m.meta));}
 assert.equal(h.messages.filter(m=>m.type==='layer').length,4);
});
test('supersession during init and late fetch cannot publish stale data',async()=>{
 const h=harness(),init=deferred(),fetch=deferred();h.ctx.testInit=init.promise;h.setFetch(fetch);h.load();await tick();h.setFetch(null);h.load(2);await tick();init.resolve({features:()=>({memory:0})});await h.drain();fetch.resolve({ok:true,arrayBuffer:async()=>new ArrayBuffer(9)});await h.drain();
 assert.ok(h.messages.every(m=>m.epoch===2));assert.equal(h.stacks.length,1);
});
test('async decode serialized, stale returned stack disposed before next decode',async()=>{
 const h=harness(),d=deferred();h.setDecode(d);h.load();await tick();h.load(2);h.setDecode(null);await tick();assert.equal(h.stacks.length,0);const old=h.stack();d.resolve(old);await h.drain();assert.equal(old.disposed,1);assert.equal(h.stacks.length,2);assert.ok(h.messages.filter(m=>m.type!=='progress').every(m=>m.epoch===2));
});
test('cancel between preparation tasks disposes once and suppresses queued output',async()=>{
 const h=harness();h.load();await tick();assert.equal(h.messages.filter(m=>m.type==='layer').length,1);h.send({type:'cancel',epoch:1});await h.drain();assert.equal(h.stacks[0].disposed,1);assert.equal(h.messages.filter(m=>m.type==='done').length,0);h.load(2);await h.drain();assert.equal(h.messages.at(-1).type,'done');
});
test('malformed decode and prepare errors recover on the same worker',async()=>{
 const h=harness();h.setDecode({promise:Promise.reject(Error('malformed'))});h.load();await h.drain();assert.equal(h.messages.at(-1).phase,'decode');h.setDecode(null);h.setFail(true);h.load(2);await h.drain();assert.equal(h.messages.at(-1).phase,'prepare');assert.equal(h.stacks[0].disposed,1);h.setFail(false);h.load(3);await h.drain();assert.equal(h.messages.at(-1).type,'done');
});
test('app reuses workers and restarts after crash; dead instance messages ignored',()=>{
 const app=readFileSync(new URL('../src/viewer-2d/app.js',import.meta.url),'utf8');const start=app.indexOf('  function respawnWorker()'),end=app.indexOf('  function onWorkerMessage',start);let created=0,received=0;
 const c={worker:null,generation:1,layers:[1],stack:{},pendingRender:1,rafPending:0,stopPlay(){},cancelTransition(){},setStatus(){},onWorkerMessage(){received++;},Worker:class{constructor(){created++;}terminate(){this.dead=true;}}};vm.createContext(c);vm.runInContext(app.slice(start,end),c);const a=c.respawnWorker();assert.equal(c.respawnWorker(),a);a.onerror({message:'crash'});assert.equal(c.worker,null);assert.equal(a.dead,true);a.onmessage({});assert.equal(received,0);const b=c.respawnWorker();b.onmessage({});assert.equal(created,2);assert.equal(received,1);assert.equal(c.generation,2);
});

test('explicit h5wasm initializes once, retries rejected init, and remains reusable',async()=>{
 const h=harness(true);let imports=0;
 h.ctx.importScripts=()=>{imports++;};h.ctx.R2F2D.readStack=()=>h.stack();
 h.ctx.h5wasm={ready:Promise.reject(Error('init failure'))};
 const load=epoch=>h.send({type:'load',epoch,url:'a.nc',backend:'h5wasm'});
 load(1);await h.drain();assert.equal(h.messages.at(-1).phase,'init');
 h.ctx.h5wasm.ready=Promise.resolve({HEAPU8:new Uint8Array(64)});
 load(2);await h.drain();load(3);await h.drain();
 assert.equal(imports,2);assert.equal(h.messages.filter(m=>m.type==='done').length,2);
 assert.ok(h.stacks.every(s=>s.disposed===1));
});

 test("verification query uses a word boundary, not a control character",()=>{const app=readFileSync(new URL("../src/viewer-2d/app.js",import.meta.url),"utf8");assert.ok(app.includes("verify=1\\b"));assert.ok(!app.includes("\b"));});

test('failed middle request preserves predecessor decode barrier',async()=>{
 const h=harness(),d=deferred();h.setDecode(d);h.load(1);await tick();
 h.setFetch({promise:Promise.reject(Error('fetch failed'))});h.load(2);await tick();
 h.setFetch(null);h.setDecode(null);h.load(3);await tick();
 assert.equal(h.stacks.length,0);assert.ok(!h.messages.some(m=>m.type==='done'));
 const old=h.stack();d.resolve(old);await h.drain();
 assert.equal(old.disposed,1);assert.equal(h.stacks.length,2);
 assert.ok(h.messages.filter(m=>m.type!=='progress').every(m=>m.epoch===3));
});
