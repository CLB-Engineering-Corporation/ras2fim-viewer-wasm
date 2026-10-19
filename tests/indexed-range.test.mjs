import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {Worker} from 'node:worker_threads';
import vm from 'node:vm';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
for(const name of ['src/viewer-2d/netcdf.js','src/viewer-2d/indexed-range.js','tests/indexed-range-runtime.js']) vm.runInThisContext(readFileSync(path.join(root,name),'utf8'));
class RangeWorker {
  constructor(){
    this.worker=new Worker(`const {parentPort}=require('node:worker_threads');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');global.self=global;global.importScripts=(...names)=>names.forEach(n=>vm.runInThisContext(fs.readFileSync(path.join(${JSON.stringify(root)},'src/viewer-2d',n),'utf8')));global.postMessage=(m,t)=>parentPort.postMessage(m,t);vm.runInThisContext(fs.readFileSync(path.join(${JSON.stringify(root)},'src/viewer-2d/indexed-range-worker.js'),'utf8'));parentPort.on('message',data=>self.onmessage({data}));`,{eval:true});
    this.worker.on('message',data=>this.onmessage?.({data}));this.worker.on('error',e=>this.onerror?.(e));
  }
  postMessage(m){this.worker.postMessage(m);}terminate(){this.worker.terminate();}
}
test('exact producer HTTP206 fixture: Node worker, all source pixels, rejection matrix, session RGBA and cancellation', {timeout:30000},async()=>{
  const server=spawn('python',[path.join(root,'tests/indexed_range_server.py')],{stdio:['ignore','pipe','inherit']});
  try{
    const port=await new Promise((resolve,reject)=>{server.stdout.once('data',b=>resolve(Number(b.toString().trim())));server.once('error',reject);});
    const result=await runRangeSuite('http://127.0.0.1:'+port,()=>new RangeWorker());
    console.log(JSON.stringify(result));assert.ok(result.checks.length>=40);
  }finally{server.kill();}
});
test('200 rejected at headers without reading body',async()=>{
  const original=global.fetch;let bodyReads=0,cancelled=0;
  const fixture=readFileSync(path.join(root,'tests/fixtures/indexed-range/tiny-depth-stack.ranges.json'));
  global.fetch=async url=>String(url).endsWith('index')?new Response(fixture):{status:200,headers:new Headers(),body:{getReader(){bodyReads++;throw Error('must not read');},cancel(){cancelled++;return Promise.resolve();}}};
  try{await assert.rejects(()=>R2FRange.open('object','index',{displayMaxDepth:8,resampling:'nearest'}),/HTTP206/);assert.equal(bodyReads,0);assert.equal(cancelled,1);}finally{global.fetch=original;}
});
