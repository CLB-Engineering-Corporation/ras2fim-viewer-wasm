/* Closed producer index + bounded asynchronous HTTP206 transport. No HDF5/MEMFS. */
(function (global) {
  "use strict";
  function need(ok, message) { if (!ok) throw new Error(message); }
  function closed(value, keys) {
    need(value && typeof value === "object" && !Array.isArray(value) &&
      Object.keys(value).sort().join() === keys.split(" ").sort().join(), "closed index fields: " + keys);
  }
  function integer(n, min, max) { return Number.isSafeInteger(n) && n >= min && n <= max; }
  function equal(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function validate(text, opts) {
    need(typeof text === "string" && new TextEncoder().encode(text).length <= opts.maxIndexBytes, "index byte budget");
    var x = JSON.parse(text);
    closed(x, "schema object variable filters grid profiles chunks");
    need(x.schema === "ras2cng-depth-stack-ranges/v1", "index schema");
    var o = x.object, v = x.variable, g = x.grid, p = x.profiles, c = x.chunks;
    closed(o, "object_id byte_length witness"); closed(o.witness, "offset length encoding");
    need(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(o.object_id), "UUID4 identity");
    need(integer(o.byte_length, 36, Number.MAX_SAFE_INTEGER) && integer(o.witness.offset, 0, o.byte_length - 36) &&
      o.witness.length === 36 && o.witness.encoding === "ascii", "identity witness bounds");
    closed(v, "name dimensions dtype byteorder shape chunk_shape fill_value units");
    need(v.name === "depth" && equal(v.dimensions, ["flow","y","x"]) && v.dtype === "float32" &&
      v.byteorder === "little" && v.fill_value === "NaN" && ["ft","m"].includes(v.units), "unsupported type/packing");
    need(Array.isArray(v.shape) && v.shape.length === 3 && integer(v.shape[0],1,1024) &&
      integer(v.shape[1],1,32768) && integer(v.shape[2],1,32768), "source shape");
    var P=v.shape[0], H=v.shape[1], W=v.shape[2], CY=Math.min(256,H), CX=Math.min(256,W);
    need(H*W <= opts.maxPlaneCells, "source plane budget");
    need(equal(v.chunk_shape,[1,CY,CX]), "chunk shape");
    need(Array.isArray(x.filters) && x.filters.length === 2, "unsupported filters");
    closed(x.filters[0], "id name element_size"); closed(x.filters[1], "id name level format");
    need(x.filters[0].id===2 && x.filters[0].name==="shuffle" && x.filters[0].element_size===4 && x.filters[1].id===1 &&
      x.filters[1].name==="deflate" && x.filters[1].format==="zlib" && integer(x.filters[1].level,1,9), "unsupported filters");
    closed(g, "crs width height geotransform x_first_center y_first_center");
    var t=g.geotransform;
    need(g.crs==="EPSG:3857" && g.width===W && g.height===H && Array.isArray(t) && t.length===6 &&
      t.every(Number.isFinite) && t[1]>0 && t[5]<0 && t[2]===0 && t[4]===0 &&
      g.x_first_center===t[0]+t[1]/2 && g.y_first_center===t[3]+t[5]/2 &&
      Number.isFinite(t[0]+W*t[1]) && Number.isFinite(t[3]+H*t[5]), "source CF grid");
    closed(p, "labels axis_semantics flows flow_units");
    need(Array.isArray(p.labels) && p.labels.length===P && new Set(p.labels).size===P &&
      p.labels.every(function(s){return typeof s==="string" && s.trim() && new TextEncoder().encode(s).length<=256;}), "profile labels");
    if (p.axis_semantics==="profile_index") need(p.flows===null && p.flow_units===null, "unknown discharge must be null");
    else {
      need(p.axis_semantics==="discharge" && ["cfs","cms"].includes(p.flow_units) && Array.isArray(p.flows) &&
        p.flows.length===P && p.flows.every(Number.isFinite), "discharge axis");
      var direction=P>1 ? Math.sign(p.flows[1]-p.flows[0]) : 1;
      need(direction!==0 && p.flows.every(function(f,i){return i===0 || (f-p.flows[i-1])*direction>0;}), "discharge order");
    }
    closed(c, "grid order decoded_length max_length filter_mask offsets lengths");
    var R=Math.ceil(H/CY), C=Math.ceil(W/CX), N=P*R*C;
    need(N<=opts.maxIndexEntries && equal(c.grid,[P,R,C]) && c.order==="C" && c.filter_mask===0 &&
      c.decoded_length===CY*CX*4 && c.decoded_length<=opts.maxDecodedChunkBytes, "chunk grid/decode budget");
    need(Array.isArray(c.offsets) && Array.isArray(c.lengths) && c.offsets.length===N && c.lengths.length===N, "index entries");
    var spans=[{off:o.witness.offset,len:36}], max=0;
    c.offsets.forEach(function(off,i){
      var len=c.lengths[i];
      need(integer(len,1,Math.min(c.decoded_length+4096,opts.maxResponseBytes)) &&
        integer(off,0,o.byte_length-len), "chunk byte bounds");
      max=Math.max(max,len); spans.push({off:off,len:len});
    });
    need(c.max_length===max, "max chunk length");
    spans.sort(function(a,b){return a.off-b.off;});
    for (var i=1;i<spans.length;i++) need(spans[i].off>=spans[i-1].off+spans[i-1].len,"overlapping chunks/witness");
    return x;
  }
  async function boundedBody(response, limit, exact, signal) {
    need(response.body && response.body.getReader,"streaming body required");
    var reader=response.body.getReader(), out=exact ? new Uint8Array(exact) : null, parts=[], n=0;
    function abort(){ reader.cancel().catch(function(){}); }
    if (signal) signal.addEventListener("abort",abort,{once:true});
    try {
      while(true){
        if(signal) signal.throwIfAborted();
        var step=await reader.read(); if(step.done) break;
        n+=step.value.byteLength; need(n<=limit,"body exceeds byte budget");
        if(out) out.set(step.value,n-step.value.byteLength); else parts.push(step.value);
      }
      if(signal) signal.throwIfAborted();
      need(!exact || n===exact,"truncated body");
      if(!out){out=new Uint8Array(n); var at=0; parts.forEach(function(b){out.set(b,at);at+=b.length;});}
      return out;
    } finally { if(signal) signal.removeEventListener("abort",abort); await reader.cancel().catch(function(){}); }
  }
  function rejectBody(response) { if(response.body) response.body.cancel().catch(function(){}); }
  function unencoded(response) { return !response.headers.get("Content-Encoding"); }
  async function inflate(bytes, expected, signal) {
    need(typeof DecompressionStream==="function","DecompressionStream deflate unavailable");
    // RFC1950, not raw deflate. Streaming output is capped before accumulation.
    var stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
    var shuffled=await boundedBody({body:stream},expected,expected,signal);
    var result=new Uint8Array(expected), N=expected/4;
    for(var k=0;k<4;k++) for(var i=0;i<N;i++) result[4*i+k]=shuffled[k*N+i];
    return new DataView(result.buffer);
  }
  async function open(url, indexUrl, options, signal) {
    var opts=R2F2D.indexedRangeOptions(options);
    var response=await fetch(indexUrl,{signal:signal,cache:"no-store",credentials:"omit"});
    try {
      need(response.status===200 && unencoded(response),"index HTTP/encoding");
      var length=response.headers.get("Content-Length");
      need(length===null || (/^\d+$/.test(length) && Number(length)<=opts.maxIndexBytes),"index byte budget");
    } catch(e){rejectBody(response);throw e;}
    var indexBytes=await boundedBody(response,opts.maxIndexBytes,0,signal);
    var x=validate(new TextDecoder("utf-8",{fatal:true}).decode(indexBytes),opts), o=x.object, c=x.chunks;
    var etag=null, disposed=false, metrics={requests:0, fetchedBytes:0, indexBytes:indexBytes.length, gapBytes:0};
    var controllers=new Set(), activeReads=0, waiting=[];
    function acquire(signal) {
      signal.throwIfAborted();
      if(activeReads<opts.concurrency){activeReads++;return Promise.resolve();}
      return new Promise(function(resolve,reject){
        var item={resolve:resolve,reject:reject,signal:signal};
        item.abort=function(){var i=waiting.indexOf(item);if(i!==-1)waiting.splice(i,1);reject(signal.reason);};
        signal.addEventListener("abort",item.abort,{once:true});waiting.push(item);
      });
    }
    function release() {
      activeReads--;
      while(waiting.length){
        var item=waiting.shift();item.signal.removeEventListener("abort",item.abort);
        if(item.signal.aborted){item.reject(item.signal.reason);continue;}
        activeReads++;item.resolve();break;
      }
    }
    async function range(off,len,outerSignal) {
      need(!disposed,"range reader disposed");
      need(len<=opts.maxResponseBytes,"response byte budget");
      if(outerSignal) outerSignal.throwIfAborted();
      var ctrl=new AbortController(), acquired=false; controllers.add(ctrl);
      function abort(){ctrl.abort();}
      if(outerSignal){outerSignal.addEventListener("abort",abort,{once:true});}
      try {
        await acquire(ctrl.signal); acquired=true;
        ctrl.signal.throwIfAborted();
        var headers={Range:"bytes="+off+"-"+(off+len-1)}; if(etag) headers["If-Match"]=etag;
        metrics.requests++;
        var r=await fetch(url,{signal:ctrl.signal,headers:headers,cache:"no-store",credentials:"omit"});
        try {
          need(r.status===206,"range requires HTTP206, received "+r.status);
          need(r.headers.get("Content-Range")==="bytes "+off+"-"+(off+len-1)+"/"+o.byte_length,"wrong Content-Range/total");
          need(r.headers.get("Content-Length")===String(len),"wrong Content-Length");
          need(unencoded(r),"encoded range response");
          var tag=r.headers.get("ETag");
          need(typeof tag==="string" && /^"[\x21\x23-\x7e]*"$/.test(tag),"strong ETag required");
          need(!etag || tag===etag,"ETag changed");
          if(!etag) etag=tag;
        } catch(e){rejectBody(r);throw e;}
        var b=await boundedBody(r,len,len,ctrl.signal); metrics.fetchedBytes+=b.length; return b;
      } finally {if(acquired)release();controllers.delete(ctrl);if(outerSignal) outerSignal.removeEventListener("abort",abort);}
    }
    var witness=await range(o.witness.offset,36,signal);
    need(new TextDecoder("ascii").decode(witness)===o.object_id,"UUID witness mismatch");
    var H=x.grid.height,W=x.grid.width, CY=x.variable.chunk_shape[1],CX=x.variable.chunk_shape[2],R=c.grid[1],C=c.grid[2];
    // Fit the display to both dimensions and the cell cap. Sample destination
    // cell centres with floor((d+.5)*source/display), using original CF extent.
    var factor=Math.min(1,opts.maxDisplayWidth/W,opts.maxDisplayHeight/H,Math.sqrt(opts.maxDisplayCells/(W*H)));
    var DW=Math.max(1,Math.floor(W*factor)),DH=Math.max(1,Math.floor(H*factor));
    need(DW*DH<=opts.maxDisplayCells,"display budget");
    var t=x.grid.geotransform;
    var corners=[[t[0],t[3]],[t[0]+W*t[1],t[3]],[t[0]+W*t[1],t[3]+H*t[5]],[t[0],t[3]+H*t[5]]];
    var meta={protocol:3,onDemand:true,transport:"http206",nx:W,ny:H,nFlow:x.variable.shape[0],
      flows:x.profiles.flows || x.profiles.labels.map(function(){return null;}), flowUnits:x.profiles.flow_units,
      axisSemantics:x.profiles.axis_semantics,profileNames:x.profiles.labels,units:x.variable.units,depthUnits:x.variable.units,
      crs:x.grid.crs,geoTransform:t,coordinates:corners.map(function(p){return R2F2D.mercatorToLonLat(p[0],p[1]);}),
      maskPolicy:"finite positive depth",displayGrid:{nx:DW,ny:DH,resampling:"nearest",sourceNx:W,sourceNy:H,
        mapping:"floor((displayIndex+0.5)*sourceSize/displaySize)",geoTransform:[t[0],W*t[1]/DW,0,t[3],0,H*t[5]/DH]}};
    async function readLayer(profile, selectionSignal) {
      need(!disposed,"range reader disposed");
      need(integer(profile,0,meta.nFlow-1),"profile index out of range");
      if(selectionSignal) selectionSignal.throwIfAborted();
      var ctrl=new AbortController(); controllers.add(ctrl);
      function abort(){ctrl.abort();}
      if(selectionSignal){selectionSignal.addEventListener("abort",abort,{once:true});}
      try {
        var plane=new Float32Array(W*H), selected=[];
        for(var i=profile*R*C;i<(profile+1)*R*C;i++) selected.push({i:i,off:c.offsets[i],len:c.lengths[i]});
        selected.sort(function(a,b){return a.off-b.off;});
        var groups=[];
        selected.forEach(function(e){
          var last=groups[groups.length-1],end=e.off+e.len;
          if(last && e.off-last.end<=opts.coalesceGapBytes && end-last.off<=opts.maxResponseBytes){
            metrics.gapBytes+=e.off-last.end; last.end=end;last.entries.push(e);
          } else groups.push({off:e.off,end:end,entries:[e]});
        });
        var next=0;
        async function consume(){
          while(next<groups.length){
            ctrl.signal.throwIfAborted(); var group=groups[next++];
            var bytes=await range(group.off,group.end-group.off,ctrl.signal);
            for(var entry of group.entries){
              ctrl.signal.throwIfAborted();
              var values=await inflate(bytes.subarray(entry.off-group.off,entry.off-group.off+entry.len),c.decoded_length,ctrl.signal);
              var position=entry.i-profile*R*C, row=Math.floor(position/C), col=position%C;
              for(var y=0;y<Math.min(CY,H-row*CY);y++) for(var z=0;z<Math.min(CX,W-col*CX);z++) {
                var value=values.getFloat32((y*CX+z)*4,true);
                need(Number.isFinite(value) || Number.isNaN(value),"infinite depth");
                plane[(row*CY+y)*W+col*CX+z]=value;
              }
            }
          }
        }
        try { await Promise.all(Array.from({length:Math.min(opts.concurrency,groups.length)},consume)); }
        catch(e){ctrl.abort();throw e;}
        ctrl.signal.throwIfAborted();need(!disposed,"range reader disposed");
        return plane;
      } finally {controllers.delete(ctrl);if(selectionSignal) selectionSignal.removeEventListener("abort",abort);}
    }
    return {meta:meta,readLayer:readLayer,metrics:metrics,close:function(){disposed=true;controllers.forEach(function(c){c.abort();});controllers.clear();}};
  }
  global.R2FRange={validate:validate,open:open,inflate:inflate};
})(typeof self!=="undefined"?self:this);
