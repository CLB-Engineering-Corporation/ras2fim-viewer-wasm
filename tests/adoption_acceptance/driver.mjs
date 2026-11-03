import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,realpathSync} from 'node:fs';
import {resolve,extname,relative} from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {instrumentWorker, instrumentAdapter, instrumentNetcdf, preflight, stressSession, observeBrowserErrors} from './driver-probes.mjs';
const streams = [{id:'wb-2427467-depth',file:'data/filter_depth_wb-2427467.nc',max:17},{id:'wb-2427466',file:'data/filter_wsel_wb-2427466.nc',max:14},{id:'wb-2427467',file:'data/filter_wsel_wb-2427467.nc',max:17},{id:'synthetic-receding',file:'/fixtures/receding.nc',max:2}];
const require=createRequire(import.meta.url);
export async function runAcceptance(config) {
assert.equal(config.verify,true);

const pw=require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/billk_clb/.t3/worktrees/terrio-wasm-viewer-20261102/feat-wasm-viewer-contributions/target/validation-tools/node_modules/playwright');
const root=resolve(process.env.VIEWER_ROOT || 'D:/CLB-Dev/wt/ras2fim-viewer-terrio-20261102');
const site=resolve(config.site || process.env.ADOPTION_SITE || resolve(root,'.terrio-validation/adoption-site'));
const holds=new Map();
const out=resolve(config.out);mkdirSync(out,{recursive:true});
const postCloseDelayMs=Number(process.env.POST_CLOSE_MS || 0);assert.ok(Number.isInteger(postCloseDelayMs)&&postCloseDelayMs>=0&&postCloseDelayMs<=5000);
const {trials,cycles}=config, dwell=500;
for(const n of [trials,cycles,config.stressIterations])assert.ok(Number.isInteger(n)&&n>0);
function summary(values){const a=values.toSorted((a,b)=>a-b);return {count:a.length,median:a.length?(a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2:null,p95:a.length?a[Math.ceil(a.length*.95)-1]:null};}
function instrument(src){
 src=src.replace(/\r\n/g,'\n');
 const changes=[['    var revision = ++canvasRevision;', '    window.__acceptance.paintEvents.push({at:performance.now(),generation:generation,index:layers.indexOf(shown)});\n    var revision = ++canvasRevision;'],['    var message = event.data || {};', `    var message = event.data || {};
    window.__acceptance.messages.push({at:performance.now(),...message,offsets:undefined,depths:undefined});
    if(message.type==='error' && !(message.epoch===window.__acceptance.expectedMalformed && message.phase==='decode')) console.error('[acceptance worker error]',JSON.stringify(message));
    if(message.adoption) window.__acceptance.reuse=message.adoption;
    if(message.verification) window.__acceptance.verifications[message.epoch]=message.verification;`],['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', '__ACCEPTANCE_ORIGIN__/acceptance-blank/{z}/{y}/{x}.png'],['  map.addControl(new maplibregl.NavigationControl()', '  window.__acceptance.map=map; map.on("error", function(e){console.error("[acceptance map error]", e.error && e.error.message || "unknown map error");});\n  map.addControl(new maplibregl.NavigationControl()'],['  function byId(id)',`  window.__acceptance = {paintEvents:[], events:[], done:[], errors:[], messages:[], verifications:{}, reuse:null};
  window.__acceptance.state = function(){return {generation:generation, transitionFrame:transitionFrame, canvasRevision:canvasRevision, shown:shown && layers.indexOf(shown), sparseBytes:indexBytes(), layers:layers.filter(Boolean).length, worker:!!worker,reuse:window.__acceptance.reuse && {...window.__acceptance.reuse,workerCreates:window.__workerCreates,liveWorkers:window.__liveWorkers},verification:window.__acceptance.verifications[generation]};};
  function byId(id)`],['    map.triggerRepaint();',`    map.once("render", function(){
      if (revision === canvasRevision && !transitionFrame) window.__acceptance.events.push({at:performance.now(),generation:generation,revision:revision,index:layers.indexOf(shown),painted:shown && shown.painted,sourceLoaded:map.isSourceLoaded("depth"),layer:!!map.getLayer("depth")});
    });
    map.triggerRepaint();`],['      timings.prepare = message.timings.prepare;','      window.__acceptance.done.push({generation:generation,timings:message.timings});\n      timings.prepare = message.timings.prepare;']];
 for(const [a,b] of changes){assert.equal(src.split(a).length,2,'instrumentation anchor '+a);src=src.replace(a,b);}return src;
}
const manifest=JSON.parse(readFileSync(resolve(site,'manifest.json')));
manifest.streams.push({id:'synthetic-receding',file:'/fixtures/receding.nc',grid:{nx:3,ny:2},flow_count:3});
assert.deepEqual(manifest.streams.map(s=>({id:s.id,file:s.file,max:s.flow_count-1})),streams);
const app=instrument(readFileSync(resolve(site,'app.js'),'utf8'));
const server=createServer((req,res)=>{try{
 const url=new URL(req.url,'http://local');let name=decodeURIComponent(url.pathname);if(name==='/__hold-status'){res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({arrived:holds.get(url.searchParams.get('path'))?.arrived===true}));return;}if(name==='/__oracle'){res.end('<!doctype html><title>preflight</title>');return;}if(holds.has(name)){const h=holds.get(name);h.arrived=true;h.response=res;req.on('close',()=>{h.closed=true;});return;}if(name.startsWith('/acceptance-blank/')){res.setHeader('Cache-Control','public, max-age=3600');res.setHeader('Content-Type','image/png');res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==','base64'));return;}if(name==='/favicon.ico'){res.writeHead(204);res.end();return;}if(name==='/')name='/index.html';
 const base=name.startsWith('/fixtures/')?resolve(root,'.terrio-validation'):site;
 const file=resolve(base,'.'+name);if(relative(base,realpathSync(file)).startsWith('..'))throw Error('containment');
 res.setHeader('Cache-Control','public, max-age=3600');res.setHeader('Content-Type',({'.js':'text/javascript','.wasm':'application/wasm','.html':'text/html','.json':'application/json','.css':'text/css'})[extname(file)]||'application/octet-stream');
 res.end(name==='/netcdf.js'?instrumentNetcdf(readFileSync(file,'utf8')):name==='/netcdf-worker.js'?instrumentWorker(readFileSync(file,'utf8')):name==='/terrio-adapter.js'?instrumentAdapter(readFileSync(file,'utf8')):name==='/app.js'?app.replaceAll('__ACCEPTANCE_ORIGIN__',`http://127.0.0.1:${server.address().port}`):name==='/manifest.json'?JSON.stringify(manifest):readFileSync(file));
 }catch(e){res.writeHead(404);res.end(String(e));}});
function rss(pid){try{return JSON.parse(execFileSync('powershell',['-NoProfile','-Command',`$p = @(Get-CimInstance Win32_Process); $ids = @(${pid}); do { $more = @($p | Where-Object { $_.ParentProcessId -in $ids -and $_.ProcessId -notin $ids } | ForEach-Object ProcessId); $ids += $more } while ($more.Count); $rows = @(Get-Process -Id $ids -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,WorkingSet64); ConvertTo-Json -Compress -InputObject $rows`],{encoding:'utf8'}));}catch(e){return {error:e.message};}}

const sourcePins=Object.fromEntries(['app.js','netcdf.js','netcdf-worker.js','terrio-adapter.js','vendor/terrio/terrio_bg.wasm','vendor/terrio/terrio.js','vendor/h5wasm.js'].map(name=>[name,createHash('sha256').update(readFileSync(resolve(site,name))).digest('hex')]));
assert.deepEqual(sourcePins,config.expectedPins,'candidate pins differ');
const inputPins=Object.fromEntries(streams.map(s=>[s.file,createHash('sha256').update(readFileSync(s.file.startsWith('/fixtures/')?resolve(root,'.terrio-validation','.'+s.file):resolve(site,s.file))).digest('hex')]));
const report={adoption:{schema:1,stress:[],preflight:[],inputPins,numericScope:'independent exact decoder preflight; per-load sparse versus decoded values'},completed:false,postCloseDelayMs,sourcePins,cacheRouting:false,basemap:'same-origin-transparent',started:new Date().toISOString(),root,trials,cycles,dwell,head:execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),engines:[]};
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
async function settleMap(page){await page.waitForFunction(()=>{const m=window.__acceptance.map;return m.loaded()&&!m.isMoving()&&m.areTilesLoaded();},null,{timeout:60000});}
async function waitRender(page,start,generation,index){await page.waitForFunction(({start,generation,index})=>window.__acceptance?.events.some(e=>e.at>=start&&e.generation===generation&&(index===null||e.index===index)&&e.layer&&e.sourceLoaded),{start,generation,index},{timeout:60000});return page.evaluate(({start,generation,index})=>window.__acceptance.events.find(e=>e.at>=start&&e.generation===generation&&(index===null||e.index===index)&&e.layer&&e.sourceLoaded),{start,generation,index});}
try{for(const engine of config.engines){
 const result={engine,samples:[],rss:[],contextClosed:[],errors:[]};report.engines.push(result);let bs,browser;
 try{bs=await pw[engine].launchServer({headless:true});browser=await pw[engine].connect(bs.wsEndpoint());result.version=browser.version();
 report.adoption.preflight.push({engine,...await preflight(browser,base,streams,sourcePins,inputPins)});
 for(const decoder of config.decoders){
 for(let trial=0;trial<trials;trial++){
 const context=await browser.newContext({viewport:{width:1280,height:900}});await context.addInitScript(()=>{const Native=window.Worker;window.__workerCreates=0;window.__liveWorkers=0;window.Worker=class extends Native {constructor(...args){super(...args);this.__live=String(args[0]).includes("netcdf-worker.js");if(this.__live){window.__workerCreates++;window.__liveWorkers++;}}terminate(){if(this.__live){window.__liveWorkers--;this.__live=false;}return super.terminate();}};});
 const page=await context.newPage();const stopObserving=observeBrowserErrors(page,result.errors);
 for(const phase of ['cold','warm']){
 await page.goto(base+'/?verify=1&decoder='+decoder);
 const event=await waitRender(page,0,1,null);
 const firstMax=Number(await page.locator('#flow').getAttribute('max'));
 const firstSample={decoder,trial,phase,kind:'first-render',started:0,generation:1,max:firstMax,ms:event.at,event};result.samples.push(firstSample);
 await page.waitForFunction(()=>window.__acceptance.done.length>0);
 Object.assign(firstSample,await page.evaluate(()=>({done:window.__acceptance.done.at(-1),state:window.__acceptance.state(),verification:window.__acceptance.verifications[window.__acceptance.state().generation]})));
 await settleMap(page);
 }
 for(let cycle=0;cycle<cycles;cycle++){
 const options=await page.locator('#stream option').evaluateAll(a=>a.map(x=>x.value));
 assert.deepEqual(options,streams.map(s=>s.file));
 const input=streams[cycle%streams.length]; const stream=input.id;
 const start=await page.evaluate(()=>performance.now());
 const generation=await page.evaluate(value=>{const s=document.querySelector('#stream');s.value=value;s.dispatchEvent(new Event('change',{bubbles:true}));return window.__acceptance.state().generation;},input.file);
 const event=await waitRender(page,start,generation,null);
 await page.waitForFunction(g=>window.__acceptance.done.some(d=>d.generation===g),generation);
 await settleMap(page);
 const max=Number(await page.locator('#flow').getAttribute('max'));
 for(const index of [0,max,Math.floor(max/2)]){
 const t=await page.evaluate(index=>{const s=document.querySelector('#flow');const t=performance.now();s.value=String(index);s.dispatchEvent(new Event('input',{bubbles:true}));return t;},index);
 const e=await waitRender(page,t,generation,index);
 result.samples.push({decoder,trial,cycle,stream,index,kind:'slider-settled-render',started:t,generation,max,ms:e.at-t,event:e});
 }
 await settleMap(page);
 await page.waitForTimeout(dwell);
 const state=await page.evaluate(()=>({verification:window.__acceptance.verifications[window.__acceptance.state().generation],state:window.__acceptance.state(),done:window.__acceptance.done.at(-1),status:document.querySelector('#status').textContent,hidden:document.hidden}));
 result.samples.push({decoder,trial,cycle,stream,kind:'stream-render',started:start,generation,max,ms:event.at-start,event,...state});
 result.rss.push({decoder,trial,cycle,at:new Date().toISOString(),processes:rss(bs.process().pid)});
 assert.ok(!state.status.startsWith('verify:'));assert.equal(state.hidden,false);assert.ok(state.verification?.numericCompared>0);assert.equal(state.verification.numericDifferences,0);assert.equal(state.verification.rgbaDifferences,0);assert.equal(state.state.reuse.liveHandles,0);writeFileSync(resolve(out,'raw.json'),JSON.stringify(report,null,2));
 }
 await stressSession({page,holds,base,engine,decoder,trial,config,report,waitRender});
 assert.deepEqual(result.errors,[]);stopObserving();await context.close();
 if(postCloseDelayMs)await new Promise(r=>setTimeout(r,postCloseDelayMs));
 result.contextClosed.push({decoder,trial,at:new Date().toISOString(),processes:rss(bs.process().pid)});
 }
 }
 }catch(e){result.errors.push(e.stack);}
 finally{await browser?.close();await bs?.close();}
 result.summaries={};for(const decoder of ['h5wasm','terrio-slices'])for(const kind of ['first-render','slider-settled-render','stream-render'])for(const phase of kind==='first-render'?['cold','warm']:[null]){result.summaries[[decoder,kind,phase].filter(Boolean).join('/')]=summary(result.samples.filter(x=>x.decoder===decoder&&x.kind===kind&&(!phase||x.phase===phase)).map(x=>x.ms));}
 writeFileSync(resolve(out,'raw.json'),JSON.stringify(report,null,2));console.log(engine,JSON.stringify(result.summaries),result.errors);
 }}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
report.completed=!report.engines.some(e=>e.errors.length);
report.finished=new Date().toISOString();
writeFileSync(resolve(out,'raw.json'),JSON.stringify(report,null,2));
if(!report.completed)throw new Error('Acceptance failed; inspect '+resolve(out,'raw.json'));
return report;
}
