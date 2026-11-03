/** Real MapLibre wet -> dry -> wet rendering against a published static release. */
import {createServer} from 'node:http';
import {readFileSync,realpathSync,writeFileSync} from 'node:fs';
import {resolve,relative,extname} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const pw=require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/billk_clb/.t3/worktrees/terrio-wasm-viewer-20261102/feat-wasm-viewer-contributions/target/validation-tools/node_modules/playwright');
const root=resolve(process.env.EMPTY_SITE || '.terrio-validation/empty-site');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==','base64');
let app=readFileSync(resolve(root,'app.js'),'utf8');
assert.equal(app.split('    antialias: true,').length,2);
app=app.replace('    antialias: true,','    antialias: true, preserveDrawingBuffer: true,');
assert.equal(app.split('  map.addControl(new maplibregl.NavigationControl').length,2);
app=app.replace('  map.addControl(new maplibregl.NavigationControl','  window.__emptyTest={map:map,state:function(){return {profile:activeProfile,displayed:displayedDepth && displayedDepth.profile,pending:!!pendingDepth};}};\n  map.addControl(new maplibregl.NavigationControl');
const server=createServer((req,res)=>{try{
 let name=decodeURIComponent(new URL(req.url,'http://local').pathname);if(name==='/')name='/index.html';
 const file=realpathSync(resolve(root,'.'+name));assert.ok(!relative(root,file).startsWith('..'));
 const body=name==='/app.js'?Buffer.from(app):readFileSync(file);
 res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json'})[extname(file)]||'application/octet-stream');
 res.setHeader('Accept-Ranges','bytes');
 if(req.headers.range){const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);assert.ok(match);const start=Number(match[1]),end=Math.min(Number(match[2]||body.length-1),body.length-1);res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${body.length}`});res.end(body.subarray(start,end+1));}else res.end(body);
 }catch(error){res.writeHead(404);res.end(String(error));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const results=[];
try{for(const engine of ['chromium','firefox','webkit']){
 const browser=await pw[engine].launch({headless:true});
 try{const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='warning'&&m.text().includes('[fim] map error'))errors.push(m.text());});
 await page.route('https://**/*',r=>r.fulfill({status:200,contentType:'image/png',headers:{'access-control-allow-origin':'*'},body:png}));
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 await page.waitForFunction(()=>window.__emptyTest?.state().displayed!==null&&!window.__emptyTest.state().pending);
 await page.evaluate(()=>{const map=window.__emptyTest.map;for(const layer of map.getStyle().layers)if(!layer.id.startsWith('depth-raster-'))map.setLayoutProperty(layer.id,'visibility','none');map.jumpTo({center:[-97.23,30.09],zoom:11});});
 const frames=[];
 for(const index of [0,1,0]){
 await page.locator('#profile-slider').evaluate((slider,index)=>{slider.value=String(index);slider.dispatchEvent(new Event('input',{bubbles:true}));},index);
 await page.waitForFunction(index=>{const s=window.__emptyTest.state();return s.displayed===index&&!s.pending;},index);
 const frame=await page.evaluate(async()=>{const map=window.__emptyTest.map;await new Promise(resolve=>{map.once('idle',resolve);map.triggerRepaint();});const canvas=map.getCanvas();const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');const pixels=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let painted=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i])painted++;return {painted,state:window.__emptyTest.state(),sources:Object.keys(map.getStyle().sources).filter(x=>x.startsWith('depth-tiles-'))};});
 assert.equal(frame.sources.length,1,'previous hydraulic state source must be removed');
 assert.ok(index===1?frame.painted===0:frame.painted>0,JSON.stringify(frame));frames.push(frame);
 }
 assert.deepEqual(errors,[]);results.push({engine,version:browser.version(),frames,errors});
 }finally{await browser.close();}
}}finally{await new Promise(r=>server.close(r));}
writeFileSync('.terrio-validation/empty-browser.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
