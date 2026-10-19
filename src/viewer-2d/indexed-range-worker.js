/* Protocol 3: dedicated asynchronous indexed-range worker. No WASM dependency. */
"use strict";
importScripts("netcdf.js", "indexed-range.js");
var epoch=-1,generation=0,reader=null,loadController=null,selectionController=null,selection=0,options=null;
function cancelSelection(){selection++;if(selectionController) selectionController.abort();selectionController=null;}
function close(){generation++;cancelSelection();if(loadController)loadController.abort();if(reader)reader.close();reader=null;}
function post(m,transfer){self.postMessage(m,transfer||[]);}
self.onmessage=async function(event){
  var m=event.data||{};
  if(m.type==="load"){
    close();epoch=m.epoch;var gen=generation;loadController=new AbortController();
    try{
      if(m.protocol!==3) throw new Error("indexedRange requires protocol 3");
      options=R2F2D.indexedRangeOptions(m.indexedRange);
      var opened=await R2FRange.open(m.url,m.rangeIndexUrl,options,loadController.signal);
      if(gen!==generation){opened.close();return;}reader=opened;
      post({type:"meta",epoch:epoch,meta:reader.meta});
    }catch(e){if(gen===generation)post({type:"error",epoch:epoch,phase:"range-open",message:e.message});}
  } else if(m.epoch===epoch && m.type==="request" && reader){
    cancelSelection();var seq=selection,gen=generation,own=reader;
    selectionController=new AbortController();
    try{
      var plane=await own.readLayer(m.index,selectionController.signal);
      if(gen!==generation || seq!==selection)return;
      var meta=own.meta,dg=meta.displayGrid;
      var source={mode:"depth",nx:meta.nx,ny:meta.ny,scale:1,offset:0,hasFill:false,wsel:plane};
      var stats=R2F2D.depthStats(source,0), display=new Float32Array(dg.nx*dg.ny);
      for(var y=0;y<dg.ny;y++)for(var x=0;x<dg.nx;x++){
        display[y*dg.nx+x]=plane[Math.floor((y+.5)*meta.ny/dg.ny)*meta.nx+Math.floor((x+.5)*meta.nx/dg.nx)];
      }
      var layer=R2F2D.buildIndex({mode:"depth",nx:dg.nx,ny:dg.ny,scale:1,offset:0,hasFill:false,wsel:display},0);
      if(layer.offsets.byteLength+layer.depths.byteLength>options.maxCacheBytes)throw new Error("selected profile exceeds maxCacheBytes");
      layer.displayCells=R2F2D.layerCells(dg,layer.stats);layer.stats=stats;
      if(gen!==generation || seq!==selection)return;
      post(Object.assign({type:"layer",epoch:epoch,index:m.index,request:m.request,transport:Object.assign({},own.metrics)},layer),[layer.offsets.buffer,layer.depths.buffer]);
    }catch(e){if(gen===generation && seq===selection)post({type:"error",epoch:epoch,phase:"range-layer",message:e.message});}
  } else if(m.epoch===epoch && m.type==="cancelRequest")cancelSelection();
  else if(m.epoch===epoch && m.type==="cancel")close();
};
