import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const pw=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/billk_clb/.t3/worktrees/terrio-wasm-viewer-20261102/feat-wasm-viewer-contributions/target/validation-tools/node_modules/playwright');
const root=process.env.VIEWER_ROOT||'D:/CLB-Dev/wt/ras2fim-viewer-terrio-20261102';
const site=resolve(process.env.DIAGNOSTIC_SITE || resolve(root,'.terrio-validation/pilot-site'));
const workerFile=fileURLToPath(new URL('./worker.js',import.meta.url));
const fixture=resolve(root,'.terrio-validation/fixtures/receding.nc');
const out=resolve(process.env.DIAGNOSTIC_OUT||'.terrio-validation/retention-diagnostics');mkdirSync(out,{recursive:true});
const cycles=Number(process.env.CYCLES||20),engine=process.env.ENGINE||'webkit';
const pins={};for(const file of [fixture,...['netcdf.js','terrio-adapter.js','vendor/h5wasm.js','vendor/terrio/terrio.js','vendor/terrio/terrio_bg.wasm'].map(p=>resolve(site,p)),workerFile]){let b=readFileSync(file);pins[file]={bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')};}
const report={completed:false,started:new Date().toISOString(),engine,cycles,pins,forcedGC:false,routing:false,headless:true,runs:[]};
function rss(pid){let rows=JSON.parse(execFileSync('powershell',['-NoProfile','-Command',`$p=@(Get-CimInstance Win32_Process); $ids=@(${pid}); do {$more=@($p | Where-Object {$_.ParentProcessId -in $ids -and $_.ProcessId -notin $ids} | ForEach-Object ProcessId); $ids+=$more} while ($more.Count); ConvertTo-Json -Compress -InputObject @(Get-Process -Id $ids -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,WorkingSet64)`],{encoding:'utf8'}));return {at:new Date().toISOString(),processes:rows,sumMiB:rows.reduce((s,p)=>s+p.WorkingSet64,0)/1048576};}
const server=createServer((req,res)=>{try{let path=new URL(req.url,'http://local').pathname;if(path==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Isolated worker diagnostic</title>');return;}let file=path==='/worker.js'?workerFile:path==='/fixture.nc'?fixture:resolve(site,'.'+path);assert.ok(file.startsWith(site)||file===fixture||file===workerFile);res.setHeader('Content-Type',extname(file)==='.js'?'text/javascript':extname(file)==='.wasm'?'application/wasm':'application/octet-stream');res.setHeader('Cache-Control','public,max-age=3600');res.end(readFileSync(file));}catch(e){res.writeHead(404);res.end(String(e));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let bs,browser;
try{
 bs=await pw[engine].launchServer({headless:true});browser=await pw[engine].connect(bs.wsEndpoint());report.version=browser.version();
 for(const decoder of (process.env.DECODERS||'terrio-slices,h5wasm').split(','))for(const mode of (process.env.MODES||'reuse-decode,fresh-init,fresh-decode').split(',')){
  const run={decoder,mode,samples:[],rss:[]};report.runs.push(run);
  const context=await browser.newContext();const page=await context.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(async()=>{window.input=await(await fetch('/fixture.nc')).arrayBuffer();window.liveWorker=null;window.run=async(decoder,mode)=>{if(!window.liveWorker)window.liveWorker=new Worker('/worker.js');const worker=window.liveWorker;const result=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('worker timeout')),60000);worker.onmessage=e=>{clearTimeout(timeout);resolve(e.data);};worker.onerror=e=>{clearTimeout(timeout);reject(Error(e.message));};worker.postMessage({decoder,initOnly:mode==='fresh-init',buffer:window.input});});if(mode!=='reuse-decode'){worker.terminate();window.liveWorker=null;}return {...result,liveWorkers:window.liveWorker?1:0,retainedInputBytes:window.input.byteLength};};});
  run.rss.push({phase:'before',...rss(bs.process().pid)});
  for(let cycle=0;cycle<cycles;cycle++){
   const sample=await page.evaluate(({decoder,mode})=>window.run(decoder,mode),{decoder,mode});assert.ok(!sample.error,sample.error);run.samples.push({cycle,...sample});
   if(cycle%5===4){await page.waitForTimeout(300);run.rss.push({phase:'cycle',cycle,...rss(bs.process().pid)});}
   writeFileSync(resolve(out,'raw.json'),JSON.stringify(report,null,2));
  }
  if(mode!=='fresh-init')assert.equal(new Set(run.samples.map(s=>`${s.layers}/${s.bytes}/${s.checksum}`)).size,1);
  await page.evaluate(()=>{window.liveWorker?.terminate();window.liveWorker=null;window.input=null;});await page.waitForTimeout(1500);run.rss.push({phase:'terminated-input-cleared',...rss(bs.process().pid)});
  await context.close();run.rss.push({phase:'context-closed',...rss(bs.process().pid)});
  console.log(decoder,mode,JSON.stringify(run.rss.map(({phase,cycle,sumMiB})=>({phase,cycle,sumMiB}))));
 }
 report.completed=true;
}catch(e){report.error=e.stack;process.exitCode=1;}finally{await browser?.close();await bs?.close();await new Promise(r=>server.close(r));report.finished=new Date().toISOString();report.durationSeconds=(Date.parse(report.finished)-Date.parse(report.started))/1000;writeFileSync(resolve(out,'raw.json'),JSON.stringify(report,null,2));}
