importScripts('/netcdf.js','/terrio-adapter.js');
let moduleReady;
self.onmessage=async({data})=>{try{
 const t=performance.now();
 if(!moduleReady) moduleReady=data.decoder==='terrio-slices' ? import('/vendor/terrio/terrio.js').then(async m=>{await m.default({module_or_path:'/vendor/terrio/terrio_bg.wasm'});return m;}) : (importScripts('/vendor/h5wasm.js'),self.h5wasm.ready);
 const m=await moduleReady;
 let result={initOnly:data.initOnly};
 if(!data.initOnly){
  let stack=data.decoder==='terrio-slices'?R2FTerrio.readStack(m,data.buffer,true):R2F2D.readStack(self.h5wasm,data.buffer,'input.nc');
  let bytes=0,checksum=0;
  for(let i=0;i<stack.nFlow;i++){
   let selected=stack.readLayer?Object.assign({},stack,{wsel:stack.readLayer(i),nFlow:1}):stack;
   let layer=R2F2D.buildIndex(selected,stack.readLayer?0:i);
   bytes+=layer.offsets.byteLength+layer.depths.byteLength;
   for(const v of layer.depths)checksum+=v;
  }
  result={layers:stack.nFlow,bytes,checksum};
  if(stack.dispose)stack.dispose();
  stack=null;
 }
 result.capacity=data.decoder==='terrio-slices'?m.features().memory:m.HEAPU8?.buffer.byteLength;
 result.ms=performance.now()-t;
 self.postMessage(result);
}catch(e){self.postMessage({error:e.stack||String(e)});}};
