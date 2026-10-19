/* Same exact fixture/runtime assertions run in Node and in Chromium. */
async function runRangeSuite(base, makeWorker) {
  const checks=[];
  function check(ok,label){if(!ok)throw new Error(label);checks.push(label);}
  async function rejects(fn,label){let failed=false;try{await fn();}catch(e){failed=true;}check(failed,label);}
  const O={displayMaxDepth:8,resampling:'nearest',maxDisplayWidth:135,maxDisplayHeight:130,maxDisplayCells:17550,cacheSize:2};
  const options=R2F2D.indexedRangeOptions(O);
  const url=(path,mode='ok')=>base+'/'+path+'?mode='+mode;
  const open=(mode='ok',extra={})=>R2FRange.open(url('object',mode),url('index',mode),{...O,...extra});
  const reader=await open();
  check(reader.meta.nx===270 && reader.meta.ny===260 && reader.meta.displayGrid.nx===135,'source/display separation');
  check(reader.meta.profileNames.join()==='p03-low,p01-mid,p02-high' && reader.meta.flows.every(f=>f===null) && reader.meta.flowUnits===null,'ordered profile labels/null CFS');
  function formula(k,r,c){let v=(((7*r+3*c+11*k)%41)-10)*.25;if((r<40&&c<50)||(r+c+k)%17===0)v=NaN;if(r>=100&&r<110&&c<20)v=0;return v;}
  for(const k of [0,2,1]){
    const plane=await reader.readLayer(k);let match=true;
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',plane.buffer)),b=>b.toString(16).padStart(2,'0')).join('');
    check(digest===['511d76fde75e7fed61fc254e7f1b244414a249e1746321c0710d67e9f8c82354','fa95fbafcc390a2112005f8eb22081a0616ddcf7bcf159f4db64ee556a680389','989a107f90afbe12d7ddc1dc733d9ea4c6303414ea9735054139e6c7dc36a8a4'][k],'producer plane raw float32 SHA profile '+k);
    for(let r=0;r<260;r++)for(let c=0;c<270;c++)if(!Object.is(plane[r*270+c],formula(k,r,c)))match=false;
    check(match,'all actual float32 pixels incl edge/NaN/dry/negative profile '+k);
  }
  check(reader.metrics.fetchedBytes+reader.metrics.indexBytes<58126,'all three fixture profiles fetch less than whole object');
  check(reader.metrics.requests<13 && reader.metrics.gapBytes===0,'adjacent coalescing request reduction/no gap bytes');
  const serverNetwork=await (await fetch(base+'/metrics')).json();
  check(serverNetwork.objectRequests===6 && serverNetwork.objectBodyBytes===34314,'server measured object requests and bytes');
  const lowMetrics={...reader.metrics};reader.close();await rejects(()=>reader.readLayer(0),'disposed low-level reader');
  for(const mode of ['200','416','truncated','wrongrange','total','length','uuid','encoding','missingetag','weaketag','etag','bomb']){
    await rejects(async()=>{const r=await open(mode);try{await r.readLayer(0);}finally{r.close();}},'HTTP/decode rejection '+mode);
  }
  for(const mode of ['indexoversize','overlap','outoffile','filter','scale','type','entries','name','crs','axis','fractional','witnessbounds','witnesstouch']) await rejects(()=>open(mode),'index rejection '+mode);
  for(const extra of [{maxPlaneCells:1},{maxIndexEntries:1},{maxIndexBytes:10},{maxDecodedChunkBytes:1},{maxResponseBytes:100}])
    await rejects(()=>open('ok',extra),'numeric budget '+Object.keys(extra)[0]);
  for(const extra of [{maxDisplayCells:0},{maxDisplayWidth:0},{maxDisplayHeight:0},{maxCacheBytes:0},{concurrency:3}])
    await rejects(()=>open('ok',extra),'invalid budget '+Object.keys(extra)[0]);
  // Abort real pending fetch/decompression; no fallback body or full-object allocation.
  const slow=await open('slow'), abort=new AbortController();
  const pending=slow.readLayer(0,abort.signal);abort.abort();await rejects(()=>pending,'AbortController cancels actual selection');await rejects(()=>slow.readLayer(0,abort.signal),'already aborted selection rejected before allocations');slow.close();
  let frames=[],status,resolveWait,rejectWait,timer;
  function waitFor(predicate){if(predicate())return Promise.resolve();return new Promise((resolve,reject)=>{resolveWait=()=>{if(predicate()){clearTimeout(timer);resolveWait=null;resolve();}};rejectWait=reject;timer=setTimeout(()=>reject(new Error('session wait timeout '+JSON.stringify(status))),10000);});}
  const session=R2F2D.createSession({workerFactory:makeWorker,indexedRange:O,onStatus:s=>{status=s;if(s.phase==='error'&&rejectWait)rejectWait(new Error(s.error));if(resolveWait)resolveWait();},onFrame:f=>{frames.push({...f,data:new Uint8ClampedArray(f.data)});if(resolveWait)resolveWait();}});
  session.load(url('object'),{index:0,rangeIndexUrl:url('index')});await waitFor(()=>frames.length===1);
  check(frames[0].data.length===135*130*4 && frames[0].cells.total===270*260 && frames[0].flow===null,'worker frame display RGBA/source cells/null flow');
  const stops=[[0,234,243,251],[.25,158,202,225],[.5,66,146,198],[.75,8,81,156],[1,8,48,107]],ramp=R2F2D.buildRamp(stops);
  function rgba(frame,k,extent=false){for(let y=0;y<130;y++)for(let x=0;x<135;x++){
    const v=formula(k,2*y+1,2*x+1),off=(y*135+x)*4;
    const expected=v>0?(extent?[66,146,198,255]:Array.from(ramp.slice(Math.min(255,Math.floor(v/8*255))*4,Math.min(255,Math.floor(v/8*255))*4+4))):[0,0,0,0];
    for(let c=0;c<4;c++)if(frame.data[off+c]!==expected[c])return false;
  }return true;}
  check(rgba(frames.at(-1),0),'actual worker nearest RGBA matches dense formula');
  session.select(1);await waitFor(()=>frames.at(-1).index===1);
  const requests=frames.at(-1).transport.requests;
  const beforeCache=await (await fetch(base+'/metrics')).json();
  session.select(0);check(frames.at(-1).transport.requests<=requests && status.bounded.cachedBytes<=O.cacheSize*135*130*8,'cache repeat no worker request/cache bytes');
  const afterCache=await (await fetch(base+'/metrics')).json();
  check(beforeCache.objectRequests===afterCache.objectRequests && beforeCache.objectBodyBytes===afterCache.objectBodyBytes,'server confirms cached repeat zero object requests/bytes');
  session.setMode('extent');check(rgba(frames.at(-1),0,true),'extent RGBA/clearing dry negative NaN');session.setMode('depth');
  session.select(2);session.select(1);await waitFor(()=>frames.at(-1).index===1);
  await new Promise(r=>setTimeout(r,350));check(frames.at(-1).index===1 && status.bounded.cached.length<=2,'rapid profile latest wins/cache count');
  session.load(url('object','slow'),{index:2,rangeIndexUrl:url('index')});
  await waitFor(()=>status.meta!==null);
  const oldEpoch=status.epoch;session.load(url('object'),{index:0,rangeIndexUrl:url('index')});
  await waitFor(()=>frames.at(-1).epoch!==oldEpoch && frames.at(-1).index===0);
  await new Promise(r=>setTimeout(r,350));check(frames.at(-1).epoch===status.epoch && frames.at(-1).index===0,'reach replacement suppresses old fetch frame');
  session.load(url('object','slow'),{index:2,rangeIndexUrl:url('index')});
  await waitFor(()=>status.meta!==null);session.cancel();let n=frames.length;
  await new Promise(r=>setTimeout(r,350));check(frames.length===n && status.phase==='idle','cancel no late paint');
  session.load(url('object','slow'),{index:0,rangeIndexUrl:url('index')});session.destroy();n=frames.length;
  await new Promise(r=>setTimeout(r,350));check(frames.length===n && status.phase==='destroyed','destroy no late paint');
  // Actual worker rejects a profile too large for the sparse cache byte cap.
  let errorStatus;
  const small=R2F2D.createSession({workerFactory:makeWorker,indexedRange:{...O,maxCacheBytes:8},onStatus:s=>errorStatus=s});
  small.load(url('object'),{index:0,rangeIndexUrl:url('index')});
  for(let i=0;i<200&&errorStatus?.phase!=='error';i++)await new Promise(r=>setTimeout(r,10));
  check(errorStatus.phase==='error'&&/CacheBytes/.test(errorStatus.error),'actual worker cache oversize rejection');small.destroy();
  return {checks,network:lowMetrics,serverNetwork,fixtureObjectBytes:58126,sessionRequests:requests};
}
globalThis.runRangeSuite=runRangeSuite;
