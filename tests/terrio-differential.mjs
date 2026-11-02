// Opt-in real decoder differential job; dependency-free node tests stay separate.
// Generate fixtures with tests.fixture_nc; TERRIO_FIXTURES defaults below.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname,relative} from 'node:path';
import {createRequire} from 'node:module';
const root=resolve('.');
const require=createRequire(resolve('package.json'));
const {chromium}=require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const fixtures=process.env.TERRIO_FIXTURES ?? '.terrio-validation/fixtures';
const repeats=Number(process.env.TERRIO_WORKER_REPEATS ?? 2);
assert.ok(Number.isInteger(repeats)&&repeats>=1&&repeats<=20);
const server=createServer((req,res)=>{
 const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(relative(root,path).startsWith('..')){res.writeHead(403);res.end();return;}
 if(req.url==='/'){res.end('<!doctype html><title>Decoder differential</title>');return;}
 try{res.setHeader('Content-Type',({'.js':'text/javascript','.wasm':'application/wasm'})[extname(path)]??'application/octet-stream');res.end(readFileSync(path));}
 catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch();
try{
 const page=await browser.newPage();
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 for(const file of ['vendor/h5wasm.js','netcdf.js','terrio-adapter.js']) await page.addScriptTag({url:'/src/viewer-2d/'+file});
 const result=await page.evaluate(async ({fixtures,names,repeats})=>{
  await h5wasm.ready;
  const t=await import('/src/viewer-2d/vendor/terrio/terrio.js');await t.default();
  const reports=[];
  const json=x=>JSON.stringify(x,(_,v)=>typeof v==='number'&&Number.isNaN(v)?'NaN':v);
  const equal=(a,b,label)=>{
   if(ArrayBuffer.isView(a)&&ArrayBuffer.isView(b)){
    if(a.constructor.name!==b.constructor.name||a.length!==b.length)throw new Error(label+' type/length');
    for(let i=0;i<a.length;i++)if(!Object.is(a[i],b[i]))throw new Error(label+' at '+i);
   }else if(json(a)!==json(b))throw new Error(label);
  };
  for(const name of names){
   const bytes=await(await fetch('/'+fixtures+'/'+name)).arrayBuffer();
   let ref,refError;try{ref=R2F2D.readStack(h5wasm,bytes,name);}catch(e){refError=e.message;}
   for(const slices of [false,true]){
    let candidate,error;try{candidate=R2FTerrio.readStack(t,bytes,slices);}catch(e){error=e.message;}
    if(refError){if(!error)throw new Error(name+' accepted rejected input');continue;}
    if(error)throw new Error(name+': '+error);
    try{
     for(const key of Object.keys(ref))if(!['wsel','terrain','decodeMs'].includes(key))equal(candidate[key],ref[key],name+' metadata '+key);
     equal(candidate.terrain,ref.terrain,name+' terrain');
     if(!slices){equal(candidate.wsel,ref.wsel,'native values');}
     const ramp=R2F2D.buildRamp([[0,234,243,251],[0.25,158,202,225],[0.5,66,146,198],[0.75,8,81,156],[1,8,48,107]]);
     for(let i=ref.nFlow-1;i>=0;i--){
      const layer=slices?Object.assign({},candidate,{wsel:candidate.readLayer(i),nFlow:1}):candidate;
      const at=slices?0:i;
      if(slices)equal(layer.wsel,ref.wsel.subarray(i*ref.ny*ref.nx,(i+1)*ref.ny*ref.nx),'native slice');
      const a=R2F2D.buildIndex(ref,i),b=R2F2D.buildIndex(layer,at);
      for(const k of ['stats','bbox','painted'])equal(a[k],b[k],name+' '+k);
      equal(a.offsets,b.offsets,'offsets');equal(a.depths,b.depths,'depths');
      const x={data:new Uint8ClampedArray(ref.ny*ref.nx*4)},y={data:new Uint8ClampedArray(x.data.length)};
      R2F2D.paintDense(ref,i,x,ramp,100);R2F2D.paintDense(layer,at,y,ramp,100);equal(x.data,y.data,'RGBA');
     }
    }finally{candidate.dispose?.();}
   }
   if(!refError){
    let baselineVerify;
    for(const backend of ['h5wasm','terrio','terrio-slices']){
     const worker=new Worker('/src/viewer-2d/netcdf-worker.js');
     try{
      for(let epoch=1;epoch<=repeats;epoch++)await new Promise((resolve,reject)=>{
       const timeout=setTimeout(()=>reject(new Error('worker timed out')),30000);
       let metadata=false,layers=0,verification=[];
       worker.onerror=e=>{clearTimeout(timeout);reject(new Error(e.message));};
       worker.onmessage=({data:m})=>{
        if(m.epoch!==epoch)return;
        if(m.type==='error'){clearTimeout(timeout);reject(new Error(JSON.stringify(m)));}
        if(m.type==='verify'){clearTimeout(timeout);reject(new Error('exact RGBA verification failed: '+JSON.stringify(m)));}
        if(m.type==='meta'){metadata=true;if(m.meta.wsel||m.meta.terrain)reject(new Error('dense transfer'));}
        if(m.type==='layer'){if(!metadata)reject(new Error('layer before metadata'));layers++;}
        if(m.type==='done'){
         clearTimeout(timeout);
         if(layers!==ref.nFlow)reject(new Error('missing layers'));
         else {
          if(backend==='h5wasm')baselineVerify=verification;
          else equal(verification,baselineVerify,'decoder verification mismatch');
          reports.push({name,backend,epoch,verification,timings:m.timings});resolve();
         }
        }
       };
       worker.postMessage({type:'load',backend,epoch,url:'/'+fixtures+'/'+name,verify:true,rampStops:[[0,234,243,251],[1,8,48,107]]});
      });
     }finally{worker.terminate();}
    }
   }
   reports.push({name,rejected:!!refError});
  }return reports;
 },{fixtures,names:readdirSync(fixtures).filter(n=>n.endsWith('.nc')),repeats});
 assert.ok(result.length);console.log(JSON.stringify(result));
}finally{await browser.close();await new Promise(r=>server.close(r));}
