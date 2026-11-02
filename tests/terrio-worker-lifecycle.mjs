// Real WASM handle tracking and failure injection, confined to this test server.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,relative,extname} from 'node:path';
import {createRequire} from 'node:module';
const root=resolve('.');
const require=createRequire(resolve('package.json'));
const {chromium}=require(process.env.PLAYWRIGHT_MODULE??'playwright');
const instrumentation=`
if(new URLSearchParams(self.location.search).get('fault')==='init')throw new Error('injected init failure');
const tracked=new Set();
const originalOpen=openMultidim;
openMultidim=(...args)=>{const h=originalOpen(...args);tracked.add(h);return h;};
for(const [Class,names] of [[MultidimDataset,['array']],[MultidimArray,['iselAxis','isel','slice','transpose']]]){
 for(const name of names){const original=Class.prototype[name];Class.prototype[name]=function(...args){const h=original.apply(this,args);tracked.add(h);return h;};}
 const free=Class.prototype.free;Class.prototype.free=function(){tracked.delete(this);return free.call(this);};
}
const read=MultidimArray.prototype.read;let sliceReads=0;
MultidimArray.prototype.read=function(){
 if(new URLSearchParams(self.location.search).get('fault')==='slice'&&this.path==='/wsel'&&this.shape.length===2&&++sliceReads===2)throw new Error('injected slice read failure');
 return read.call(this);
};
const post=self.postMessage.bind(self);
self.postMessage=(message,transfer)=>{if(message.type==='error'||message.type==='done')message.testLiveHandles=tracked.size;post(message,transfer??[]);};
`;
const server=createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/'){res.end('<!doctype html><title>Worker lifecycle</title>');return;}
 const path=resolve(root,'.'+decodeURIComponent(pathname));
 if(relative(root,path).startsWith('..')){res.writeHead(403);res.end();return;}
 try{
  res.setHeader('Content-Type',({'.js':'text/javascript','.wasm':'application/wasm'})[extname(path)]??'application/octet-stream');
  let body=readFileSync(path);
  if(pathname.endsWith('/vendor/terrio/terrio.js'))body=Buffer.concat([body,Buffer.from(instrumentation)]);
  res.end(body);
 }catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch();
try{
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/`);
 const results=await page.evaluate(async()=>{
  const run=async(mode)=>{
   const worker=new Worker('/src/viewer-2d/netcdf-worker.js?fault='+(mode==='failure'?'slice':mode));
   try{return await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('lifecycle timeout')),30000);
    let superseded=false;
    worker.onerror=e=>{clearTimeout(timer);reject(new Error(e.message));};
    worker.onmessage=({data:m})=>{
     if(mode==='supersede'&&m.type==='layer'&&m.epoch===1&&!superseded){
      superseded=true;
      worker.postMessage({type:'cancel',epoch:1});
      worker.postMessage({type:'load',epoch:2,backend:'terrio-slices',url:'/.terrio-validation/fixtures/wsel.nc'});
     }
     if(m.type==='error'){
      clearTimeout(timer);
      const expected={failure:'prepare',init:'init',fetch:'fetch',decode:'decode'}[mode];
      if(expected&&m.phase===expected&&(m.testLiveHandles===0||mode==='init'||mode==='fetch'))resolve({mode,phase:m.phase,live:m.testLiveHandles??null});
      else reject(new Error(JSON.stringify(m)));
     }
     if(m.type==='done'&&(mode!=='supersede'||m.epoch===2)){
      clearTimeout(timer);
      if(mode==='failure'||m.testLiveHandles!==0)reject(new Error('unexpected done or retained source handles'));
      else resolve({mode,live:m.testLiveHandles,epoch:m.epoch});
     }
    };
    worker.postMessage({type:'load',epoch:1,backend:'terrio-slices',url:mode==='fetch'?'/missing.nc':mode==='decode'?'/.terrio-validation/fixtures/truncated.nc':'/.terrio-validation/fixtures/wsel.nc'});
   });}finally{worker.terminate();}
  };
  const results=[];for(const mode of ['failure','supersede','init','fetch','decode'])results.push(await run(mode));return results;
 });
 assert.equal(results.length,5);console.log(JSON.stringify(results));
}finally{await browser.close();await new Promise(r=>server.close(r));}
