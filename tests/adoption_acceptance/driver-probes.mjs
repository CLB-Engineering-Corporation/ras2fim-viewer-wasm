import assert from 'node:assert/strict';

// Refuse source drift: these are response transformations, never product writes.
export function replaceOnce(source, anchor, replacement) {
  assert.equal(source.split(anchor).length, 2, 'observer anchor drift: '+anchor);
  return source.replace(anchor, replacement);
}
export function instrumentNetcdf(source) {
  source=replaceOnce(source,'file = new h5.File(path, "r");','file = new h5.File(path, "r"); self.__adoptionHandles += 1;');
  return replaceOnce(source,'file.close();','file.close(); self.__adoptionHandles -= 1;');
}
export function instrumentAdapter(source) {
  source=replaceOnce(source,'var handles = new Map();','var handles = new Map(); self.__adoptionHandles += 1;');
  source=replaceOnce(source,'dataset.free();','dataset.free(); self.__adoptionHandles -= 1;');
  source=replaceOnce(source,'if (!handles.has(path)) handles.set(path, dataset.array(path));','if (!handles.has(path)) { handles.set(path, dataset.array(path)); self.__adoptionHandles += 1; }');
  source=replaceOnce(source,'a.free();','a.free(); self.__adoptionHandles -= 1;');
  source=replaceOnce(source,'var view = main.iselAxis(0, index);','var view = main.iselAxis(0, index); self.__adoptionHandles += 1;');
  source=replaceOnce(source,'view.free();','view.free(); self.__adoptionHandles -= 1;');
  return source;
}
export function instrumentWorker(source) {
  source=source.replace(/\r\n/g,'\n');
  source='self.__adoptionHandles=0;\n'+source;
  source=replaceOnce(source,'var readyStart = performance.now();',`var readyStart = performance.now();
var adoptionId=crypto.randomUUID(), adoptionInitializations=0, adoptionModule=null;
var adoptionVerification={numericCompared:0,numericDifferences:0,rgbaBytesCompared:0,rgbaDifferences:0};`);
  source=replaceOnce(source,'  self.postMessage(message, transfer || []);',`  if(message.type==='progress' && message.phase==='ready') {adoptionInitializations++;adoptionModule=crypto.randomUUID();}
  if(message.type==='meta' && ('wsel' in message.meta || 'terrain' in message.meta)) throw Error('dense arrays crossing main');
  message.adoption={workerId:adoptionId,moduleId:adoptionModule,moduleInitializations:adoptionInitializations,liveHandles:self.__adoptionHandles,verifyEnabled:state.verify};
  if(message.type==='done') {if(state.stack || state.reference || self.__adoptionHandles!==0)throw Error('retained decode state');message.verification=adoptionVerification;}
  self.postMessage(message, transfer || []);`);
  source=replaceOnce(source,'  var generation = ++loadGeneration;',`  adoptionVerification={numericCompared:0,numericDifferences:0,rgbaBytesCompared:0,rgbaDifferences:0};
  var generation = ++loadGeneration;`);
  source=replaceOnce(source,'  return {\n    ok: differing === 0 && densePainted === sparsePainted,',`  adoptionVerification.rgbaBytesCompared += sparseBytes.length;
  adoptionVerification.rgbaDifferences += differing;
  var wet=0;
  for(var cell=0;cell<n;cell++) {
    var d=R2F2D.depthAt(stack,index*n,cell);
    // buildIndex's integer fast path is the specified arithmetic order.
    if(stack.mode==='wsel' && stack.fastPath && Number.isFinite(d)) d=(stack.wsel[index*n+cell]-stack.terrain[cell])*stack.scale;
    adoptionVerification.numericCompared++;
    if(Number.isFinite(d) && d>0) {
      if(layer.offsets[wet]!==cell || !Object.is(layer.depths[wet],Math.fround(d))) adoptionVerification.numericDifferences++;
      wet++;
    }
  }
  if(wet!==layer.offsets.length) adoptionVerification.numericDifferences++;
  return {
    ok: differing === 0 && densePainted === sparsePainted,`);
  // A task barrier before any preparation, allowing supersession without a
  // first-layer paint. The barrier only activates for the explicit stress URL.
  source=replaceOnce(source,'      prepareNext(generation);',`      if(new URL(url,self.location.href).searchParams.has('adoptionPrepare')) {
        post({type:'adoption-barrier',epoch:epoch,phase:'prepare'});
      } else prepareNext(generation);`);
  return source;
}

export function observeBrowserErrors(page, errors) {
  let active=true;
  const record=x=>{if(active)errors.push(x);};
  page.on('console',m=>{if(m.type()==='error')record('console: '+m.text());});
  page.on('pageerror',e=>record('pageerror: '+e.message));
  page.on('response',r=>{if(r.status()>=400)record('HTTP '+r.status()+': '+r.url());});
  page.on('requestfailed',r=>{
    // Only a request for the exact server-held stress URL may abort.
    if(new URL(r.url()).pathname.startsWith('/__cancel-fetch/') && /abort|cancel|NS_BINDING_ABORTED/i.test(r.failure()?.errorText||''))return;
    record('requestfailed: '+r.url()+': '+r.failure()?.errorText);
  });
  return ()=>{active=false;};
}

export async function preflight(browser,base,streams,sourcePins,inputPins) {
  const context=await browser.newContext();
  try {
    const page=await context.newPage();const errors=[];const stop=observeBrowserErrors(page,errors);
    await page.goto(base+'/__oracle');
    for(const file of ['vendor/h5wasm.js','netcdf.js','terrio-adapter.js'])await page.addScriptTag({url:base+'/'+file});
    const rows=await page.evaluate(async streams=>{
      self.__adoptionHandles=0;
      await h5wasm.ready;
      const t=await import('/vendor/terrio/terrio.js');await t.default();
      const rows=[];
      const compare=(a,b,label)=>{
        if(a.constructor.name!==b.constructor.name || a.length!==b.length)throw Error(label+' type/length');
        for(let i=0;i<a.length;i++)if(!Object.is(a[i],b[i]))throw Error(label+' value '+i);
        return a.length;
      };
      for(const stream of streams) {
        const bytes=await(await fetch(stream.file)).arrayBuffer();
        const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
        const a=R2F2D.readStack(h5wasm,bytes,'oracle.nc');
        const b=R2FTerrio.readStack(t,bytes,true);
        let numericCompared=0,rgbaBytesCompared=0;
        try {
          if(a.nx!==b.nx||a.ny!==b.ny||a.nFlow!==b.nFlow)throw Error('shape');
          for(const key of Object.keys(a).filter(k=>!['wsel','terrain','decodeMs'].includes(k))) {
            const normalize=x=>JSON.stringify(x,(_,v)=>typeof v==='number'&&Number.isNaN(v)?'NaN':v);
            if(normalize(a[key])!==normalize(b[key]))throw Error('metadata '+key);
          }
          if(a.terrain)numericCompared+=compare(a.terrain,b.terrain,'terrain');
          const ramp=R2F2D.buildRamp([[0,234,243,251],[.25,158,202,225],[.5,66,146,198],[.75,8,81,156],[1,8,48,107]]);
          for(let i=0;i<a.nFlow;i++) {
            const c={...b,wsel:b.readLayer(i),nFlow:1};
            numericCompared+=compare(a.wsel.subarray(i*a.nx*a.ny,(i+1)*a.nx*a.ny),c.wsel,'native');
            const x=R2F2D.buildIndex(a,i),y=R2F2D.buildIndex(c,0);
            numericCompared+=compare(x.offsets,y.offsets,'sparse offsets')+compare(x.depths,y.depths,'sparse depths');
            const u={data:new Uint8ClampedArray(a.nx*a.ny*4)},v={data:new Uint8ClampedArray(u.data.length)};
            R2F2D.paintDense(a,i,u,ramp,100);R2F2D.paintDense(c,0,v,ramp,100);
            rgbaBytesCompared+=compare(u.data,v.data,'RGBA');
          }
        } finally {b.dispose();}
        if(self.__adoptionHandles!==0)throw Error('preflight handles');
        rows.push({file:stream.file,sha256,numericCompared,numericDifferences:0,rgbaBytesCompared,rgbaDifferences:0});
      }
      return rows;
    },streams);
    stop();assert.deepEqual(errors,[]);
    for(const row of rows)assert.equal(row.sha256,inputPins[row.file]);
    return {completed:true,sourcePins,inputPins,rows};
  } finally {await context.close();}
}

export async function stressSession({page,holds,base,engine,decoder,trial,config,report,waitRender}) {
  for(const scenario of config.scenarios)for(let iteration=0;iteration<config.stressIterations;iteration++) {
    const path=`/__cancel-fetch/${engine}/${decoder}/${trial}/${iteration}`;
    if(scenario==='cancel-fetch')holds.set(path,{arrived:false});
    const target=scenario==='cancel-fetch'?path:scenario==='cancel-prepare'?'data/filter_wsel_wb-2427467.nc?adoptionPrepare=1':'/fixtures/badshape.nc';
    const failure=await page.evaluate(target=>{
      const a=window.__acceptance,started=performance.now();
      const s=document.querySelector('#stream');
      const o=new Option('stress',target);s.append(o);s.value=target;s.dispatchEvent(new Event('change',{bubbles:true}));
      if(target==='/fixtures/badshape.nc')a.expectedMalformed=a.state().generation;
      return {started,failedGeneration:a.state().generation,eventStart:a.paintEvents.length};
    },target);
    const g=failure.failedGeneration;
    if(scenario==='cancel-fetch') {
      // Observe arrival at the server. No timing-based cancellation assumption.
      await page.waitForFunction(async url=>{const r=await fetch(url);return (await r.json()).arrived;},base+'/__hold-status?path='+encodeURIComponent(path),{timeout:60000});
    } else await page.waitForFunction(({g,scenario})=>window.__acceptance.messages.some(m=>m.epoch===g&&m.type===(scenario==='malformed'?'error':'adoption-barrier')), {g,scenario},{timeout:60000});
    const recoveredGeneration=await page.evaluate(()=>{
      const s=document.querySelector('#stream');s.value='data/filter_depth_wb-2427467.nc';s.dispatchEvent(new Event('change',{bubbles:true}));return window.__acceptance.state().generation;
    });
    const event=await waitRender(page,failure.started,recoveredGeneration,null);
    await page.waitForFunction(g=>window.__acceptance.done.some(d=>d.generation===g),recoveredGeneration);
    const data=await page.evaluate(({g,eventStart})=>{
      const a=window.__acceptance;
      return {settled:performance.now(),paintedGenerations:a.paintEvents.slice(eventStart).map(e=>e.generation),reuse:a.state().reuse,verification:a.verifications[g],messages:a.messages.filter(m=>m.type==='error')};
    },{g:recoveredGeneration,eventStart:failure.eventStart});
    assert.ok(data.settled-failure.started<=60000);
    assert.ok(!data.paintedGenerations.includes(g));assert.equal(data.paintedGenerations.at(-1),recoveredGeneration);
    assert.equal(data.reuse.liveHandles,0);assert.equal(data.reuse.moduleInitializations,1);
    assert.equal(data.verification.numericDifferences,0);assert.equal(data.verification.rgbaDifferences,0);
    if(scenario==='malformed')assert.ok(data.messages.some(m=>m.epoch===g&&m.phase==='decode'));
    report.adoption.stress.push({engine,decoder,trial,scenario,iteration,...failure,...data,recoveredGeneration,outcome:scenario==='malformed'?'rejected':'cancelled',liveHandles:data.reuse.liveHandles,event});
    await page.evaluate(()=>{document.querySelectorAll('#stream option').forEach(o=>{if(o.textContent==='stress')o.remove();});});
    if(scenario==='cancel-fetch') {const h=holds.get(path);h.response?.destroy();holds.delete(path);}
  }
}
