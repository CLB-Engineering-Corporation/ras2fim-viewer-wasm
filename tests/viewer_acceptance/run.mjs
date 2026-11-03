import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,realpathSync} from 'node:fs';
import {resolve,extname,relative} from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {observeBrowserErrors} from './errors.mjs';
import {streams} from './contracts.mjs';
const require=createRequire(import.meta.url);
const pw=require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/billk_clb/.t3/worktrees/terrio-wasm-viewer-20261102/feat-wasm-viewer-contributions/target/validation-tools/node_modules/playwright');
const root=resolve(process.env.VIEWER_ROOT || 'D:/CLB-Dev/wt/ras2fim-viewer-terrio-20261102');
const site=resolve(process.env.ACCEPTANCE_SITE || resolve(root,'.terrio-validation/pilot-site'));
const out=resolve(process.env.ACCEPTANCE_OUT || 'target/viewer-acceptance');mkdirSync(out,{recursive:true});
const postCloseDelayMs=Number(process.env.POST_CLOSE_MS || 0);assert.ok(Number.isInteger(postCloseDelayMs)&&postCloseDelayMs>=0&&postCloseDelayMs<=5000);
const trials=Number(process.env.TRIALS || 3),cycles=Number(process.env.CYCLES || 30), dwell=Number(process.env.DWELL_MS || 500);
for(const n of [trials,cycles,dwell])assert.ok(Number.isInteger(n)&&n>0);
export function summary(values){const a=values.toSorted((a,b)=>a-b);return {count:a.length,median:a.length?(a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2:null,p95:a.length?a[Math.ceil(a.length*.95)-1]:null};}
function instrument(src){
 const changes=[['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', '__ACCEPTANCE_ORIGIN__/acceptance-blank/{z}/{y}/{x}.png'],['  map.addControl(new maplibregl.NavigationControl()', '  window.__acceptance.map=map; map.on("error", function(e){console.error("[acceptance map error]", e.error && e.error.message || "unknown map error");});\n  map.addControl(new maplibregl.NavigationControl()'],['  function byId(id)',`  window.__acceptance = {events:[], done:[], errors:[]};
  window.__acceptance.state = function(){return {generation:generation, transitionFrame:transitionFrame, canvasRevision:canvasRevision, shown:shown && layers.indexOf(shown), sparseBytes:indexBytes(), layers:layers.filter(Boolean).length, worker:!!worker};};
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
 const url=new URL(req.url,'http://local');let name=decodeURIComponent(url.pathname);if(name.startsWith('/acceptance-blank/')){res.setHeader('Cache-Control','public, max-age=3600');res.setHeader('Content-Type','image/png');res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==','base64'));return;}if(name==='/favicon.ico'){res.writeHead(204);res.end();return;}if(name==='/')name='/index.html';
 const base=name.startsWith('/fixtures/')?resolve(root,'.terrio-validation'):site;
 const file=resolve(base,'.'+name);if(relative(base,realpathSync(file)).startsWith('..'))throw Error('containment');
 res.setHeader('Cache-Control','public, max-age=3600');res.setHeader('Content-Type',({'.js':'text/javascript','.wasm':'application/wasm','.html':'text/html','.json':'application/json','.css':'text/css'})[extname(file)]||'application/octet-stream');
 res.end(name==='/app.js'?app.replaceAll('__ACCEPTANCE_ORIGIN__',`http://127.0.0.1:${server.address().port}`):name==='/manifest.json'?JSON.stringify(manifest):readFileSync(file));
 }catch(e){res.writeHead(404);res.end(String(e));}});
function rss(pid){try{return JSON.parse(execFileSync('powershell',['-NoProfile','-Command',`$p = @(Get-CimInstance Win32_Process); $ids = @(${pid}); do { $more = @($p | Where-Object { $_.ParentProcessId -in $ids -and $_.ProcessId -notin $ids } | ForEach-Object ProcessId); $ids += $more } while ($more.Count); $rows = @(Get-Process -Id $ids -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,WorkingSet64); ConvertTo-Json -Compress -InputObject $rows`],{encoding:'utf8'}));}catch(e){return {error:e.message};}}
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const sourcePins=Object.fromEntries(['app.js','netcdf.js','netcdf-worker.js','terrio-adapter.js','vendor/terrio/terrio_bg.wasm'].map(name=>[name,createHash('sha256').update(readFileSync(resolve(site,name))).digest('hex')]));
const report={completed:false,postCloseDelayMs,sourcePins,cacheRouting:false,basemap:'same-origin-transparent',started:new Date().toISOString(),root,trials,cycles,dwell,head:execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),engines:[]};
async function settleMap(page){await page.waitForFunction(()=>{const m=window.__acceptance.map;return m.loaded()&&!m.isMoving()&&m.areTilesLoaded();},null,{timeout:60000});}
async function waitRender(page,start,generation,index){await page.waitForFunction(({start,generation,index})=>window.__acceptance?.events.some(e=>e.at>=start&&e.generation===generation&&(index===null||e.index===index)&&e.layer&&e.sourceLoaded),{start,generation,index},{timeout:60000});return page.evaluate(({start,generation,index})=>window.__acceptance.events.find(e=>e.at>=start&&e.generation===generation&&(index===null||e.index===index)&&e.layer&&e.sourceLoaded),{start,generation,index});}
try{for(const engine of (process.env.ENGINES || 'chromium,firefox,webkit').split(',')){
 const result={engine,samples:[],rss:[],contextClosed:[],errors:[]};report.engines.push(result);let bs,browser;
 try{bs=await pw[engine].launchServer({headless:true});browser=await pw[engine].connect(bs.wsEndpoint());result.version=browser.version();
 for(const decoder of ['h5wasm','terrio-slices']){
 for(let trial=0;trial<trials;trial++){
 const context=await browser.newContext({viewport:{width:1280,height:900}});const page=await context.newPage();const stopObserving=observeBrowserErrors(page,result.errors);
 for(const phase of ['cold','warm']){
 await page.goto(base+'/?verify=1&decoder='+decoder);
 const event=await waitRender(page,0,1,null);
 const firstMax=Number(await page.locator('#flow').getAttribute('max'));
 const firstSample={decoder,trial,phase,kind:'first-render',started:0,generation:1,max:firstMax,ms:event.at,event};result.samples.push(firstSample);
 await page.waitForFunction(()=>window.__acceptance.done.length>0);
 Object.assign(firstSample,await page.evaluate(()=>({done:window.__acceptance.done.at(-1),state:window.__acceptance.state()})));
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
 const state=await page.evaluate(()=>({state:window.__acceptance.state(),done:window.__acceptance.done.at(-1),status:document.querySelector('#status').textContent,hidden:document.hidden}));
 result.samples.push({decoder,trial,cycle,stream,kind:'stream-render',started:start,generation,max,ms:event.at-start,event,...state});
 result.rss.push({decoder,trial,cycle,at:new Date().toISOString(),processes:rss(bs.process().pid)});
 assert.ok(!state.status.startsWith('verify:'));writeFileSync(resolve(out,'raw.json'),JSON.stringify(report,null,2));
 }
 stopObserving();await context.close();
 if(postCloseDelayMs)await new Promise(r=>setTimeout(r,postCloseDelayMs));
 result.contextClosed.push({decoder,trial,at:new Date().toISOString(),processes:rss(bs.process().pid)});
 }
 }
 }catch(e){result.errors.push(e.stack);}
 finally{await browser?.close();await bs?.close();}
 result.summaries={};for(const decoder of ['h5wasm','terrio-slices'])for(const kind of ['first-render','slider-settled-render','stream-render'])for(const phase of kind==='first-render'?['cold','warm']:[null]){result.summaries[[decoder,kind,phase].filter(Boolean).join('/')]=summary(result.samples.filter(x=>x.decoder===decoder&&x.kind===kind&&(!phase||x.phase===phase)).map(x=>x.ms));}
 writeFileSync(resolve(out,'raw.json'),JSON.stringify(report,null,2));console.log(engine,JSON.stringify(result.summaries),result.errors);
 }}finally{await new Promise(r=>server.close(r));}
report.completed=!report.engines.some(e=>e.errors.length);
report.finished=new Date().toISOString();
writeFileSync(resolve(out,'raw.json'),JSON.stringify(report,null,2));
if(!report.completed)process.exitCode=1;
