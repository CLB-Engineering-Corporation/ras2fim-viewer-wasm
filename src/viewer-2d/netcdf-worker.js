/* Decode and prepare ras2fim-2d NetCDF off the main thread.
 *
 * Protocol
 * --------
 *
 *   main -> worker   { type: "load", epoch, url }
 *                    { type: "prioritize", epoch, index }
 *                    { type: "cancel", epoch } (optional, cancels that epoch)
 *
 *   worker -> main   { type: "progress", epoch, phase, ms }
 *                    { type: "meta",  epoch, meta }
 *                    { type: "layer", epoch, index, offsets, depths,
 *                                     bbox, stats, remaining }
 *                    { type: "done",  epoch, timings }
 *                    { type: "error", epoch, phase, url, message }
 *
 * `meta` always precedes any `layer`, so the client can size its canvas before
 * anything needs painting. Layers arrive one message each, with `offsets` and
 * `depths` transferred rather than copied.
 *
 * Two rules this file exists to enforce:
 *
 * The dense arrays never cross the boundary. `wsel` alone is 78 MB, and posting
 * it is a structured clone -- a silent copy that presents as unexplained
 * main-thread jank. The worker owns them for their whole lifetime and sends only
 * per-layer products, which is also why the main thread ends up holding ~20 MB
 * instead of ~84 MB.
 *
 * The queue is reorderable. Layers are prepared one per task so a `prioritize`
 * message can jump the queue when someone drags the slider somewhere that is
 * not ready yet.
 */
"use strict";

importScripts("vendor/h5wasm.js", "netcdf.js");

var PROTOCOL_VERSION = 1;

/* Started at load, before any message can arrive. Declared here rather than at
   the foot of the file so load() does not depend on hoisting for correctness. */
var readyStart = performance.now();
var ready = self.h5wasm.ready.then(function () {
  post({ type: "progress", epoch: -1, phase: "ready", ms: performance.now() - readyStart });
});

var state = {
  epoch: -1,
  stack: null,
  queue: [],
  timings: {},
  verify: false,
  ramp: null,
  maxDepth: 1,
  reference: null
};
var loadGeneration = 0;
var fetchController = null;

/* A task boundary that survives background-tab throttling.
   setTimeout(fn, 0) is clamped to ~1000 ms in a throttled context; a
   MessageChannel round trip is not. */
var yieldChannel = new MessageChannel();
var yieldQueue = [];
yieldChannel.port1.onmessage = function () {
  var fn = yieldQueue.shift();
  if (fn) fn();
};

function yieldThen(fn) {
  yieldQueue.push(fn);
  yieldChannel.port2.postMessage(0);
}

function post(message, transfer) {
  self.postMessage(message, transfer || []);
}

/** Everything the client needs about a stack, minus the arrays. */
function metaOf(stack) {
  var meta = {};
  for (var key in stack) {
    if (!Object.prototype.hasOwnProperty.call(stack, key)) continue;
    // wsel and terrain are the two that must never be posted.
    if (key === "wsel" || key === "terrain") continue;
    meta[key] = stack[key];
  }
  meta.protocol = PROTOCOL_VERSION;
  return meta;
}

function prepareNext(generation) {
  if (generation !== loadGeneration) return;
  if (!state.stack || !state.queue.length) {
    if (state.stack) {
      // Every layer is indexed; the dense arrays have no further use. Dropping
      // them here is what keeps a long-lived worker from holding 84 MB per
      // stream it has ever opened.
      state.stack.wsel = null;
      state.stack.terrain = null;
      state.reference = null;
      post({ type: "done", epoch: state.epoch, timings: state.timings });
    }
    return;
  }

  var index = state.queue.shift();
  var t0 = performance.now();
  var layer = R2F2D.buildIndex(state.stack, index);
  state.timings.prepare = (state.timings.prepare || 0) + (performance.now() - t0);

  /* The differential oracle lives here because this is where the dense arrays
     are. It paints the layer both ways into scratch buffers and reports any
     disagreement; the client only has to surface it. */
  if (state.verify) {
    var report = verifyLayer(index, layer);
    if (!report.ok) post({ type: "verify", epoch: state.epoch, index: index, report: report });
  }

  post({
    type: "layer",
    epoch: state.epoch,
    index: index,
    offsets: layer.offsets,
    depths: layer.depths,
    bbox: layer.bbox,
    stats: layer.stats,
    painted: layer.painted,
    remaining: state.queue.length
  }, [layer.offsets.buffer, layer.depths.buffer]);

  // One layer per task, so a prioritize message is serviced between layers
  // rather than after all of them -- but NOT via setTimeout. A worker owned by a
  // background tab has its timers clamped to roughly a second, which turns
  // fifteen layers into fifteen seconds. Message events are not clamped that
  // way, so a MessageChannel is the yield that actually yields.
  yieldThen(function () { prepareNext(generation); });
}

function verifyLayer(index, layer) {
  var n = state.stack.ny * state.stack.nx;
  if (!state.reference || state.reference.dense.data.length !== n * 4) {
    state.reference = {
      dense: { data: new Uint8ClampedArray(n * 4) },
      sparse: new Uint8ClampedArray(n * 4)
    };
  }
  var dense = state.reference.dense;
  var sparseBytes = state.reference.sparse;
  sparseBytes.fill(0);
  var sparsePx = new Uint32Array(sparseBytes.buffer);

  var densePainted = R2F2D.paintDense(state.stack, index, dense, state.ramp, state.maxDepth);
  var sparsePainted = R2F2D.paintSparse(sparsePx, layer, state.rampU32, state.maxDepth);

  var differing = 0, maxDelta = 0;
  for (var i = 0; i < sparseBytes.length; i += 1) {
    var delta = Math.abs(sparseBytes[i] - dense.data[i]);
    if (delta) { differing += 1; if (delta > maxDelta) maxDelta = delta; }
  }
  return {
    ok: differing === 0 && densePainted === sparsePainted,
    densePainted: densePainted,
    sparsePainted: sparsePainted,
    differing: differing,
    maxDelta: maxDelta
  };
}

function load(epoch, url, indexUrl) {
  var generation = ++loadGeneration;
  if (fetchController) fetchController.abort();
  fetchController = new AbortController();
  state.epoch = epoch;
  state.stack = null;
  state.queue = [];
  state.timings = {};
  state.reference = null;
  var phase = "fetch";

  var t0 = performance.now();
  /* h5wasm initialises asynchronously. Waiting on it alongside the fetch rather
     than before it means the two overlap -- and reading the file without waiting
     at all leaves h5.FS null, which surfaces as a bare "cannot read properties
     of null" a long way from the cause. */
  rangeReader = null;
  if (indexUrl) {
    loadPacked(epoch,url,generation,indexUrl).catch(function(e) {
      if(generation===loadGeneration) post({type:"error",epoch:epoch,phase:"range-open",message:e.message});
    });
    return;
  }
  Promise.all([
    fetch(url, { signal: fetchController.signal }).then(function (response) {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.arrayBuffer();
    }),
    ready
  ])
    .then(function (results) {
      if (!results) return;
      var buffer = results[0];
      if (generation !== loadGeneration) return;
      phase = "decode";
      state.timings.fetch = performance.now() - t0;
      post({ type: "progress", epoch: epoch, phase: "decode", ms: state.timings.fetch });

      var stack = R2F2D.readStack(self.h5wasm, buffer, "stream.nc");
      if (generation !== loadGeneration) return;
      state.stack = stack;
      state.timings.decode = stack.decodeMs;
      state.timings.bytes = buffer.byteLength;

      var meta = metaOf(stack);
      meta.fetchMs = state.timings.fetch;
      post({ type: "meta", epoch: epoch, meta: meta });

      /* Top layer first, always. It fixes maxDepth for the whole library, and
         every other layer is coloured against it -- prepare a middle layer
         first and the ramp restretches the moment the top one arrives. */
      var last = stack.nFlow - 1;
      if (state.verify) {
        // The ramp must be settled before any layer is checked, and it comes
        // from the top layer, so that one is prepared up front.
        var top = R2F2D.buildIndex(stack, last);
        state.maxDepth = Math.max(1, Math.ceil(top.stats.max || 1));
        state.ramp = R2F2D.buildRamp(state.rampStops);
        state.rampU32 = R2F2D.buildRampU32(state.ramp);
      }
      state.queue.push(last);
      for (var i = last - 1; i >= 0; i -= 1) state.queue.push(i);
      phase = "prepare";
      prepareNext(generation);
    })
    .catch(function (error) {
      if (generation !== loadGeneration) return;
      // A cross-origin failure surfaces here as an opaque "Failed to fetch";
      // phase and url are what let the client say something useful about CORS.
      post({
        type: "error",
        epoch: epoch,
        phase: phase,
        url: url,
        message: (error && error.message) || String(error)
      });
    });
}

// Indexed packed-depth delivery bypasses the wasm32 file system entirely.
var rangeReader = null;
var rangeSelection = 0;
async function loadPacked(epoch, url, generation, indexUrl) {
  var response = await fetch(indexUrl || url + ".ranges.json", {signal: fetchController.signal});
  if (response.status === 404 && !indexUrl) return false;
  if (!response.ok) throw new Error("range index HTTP " + response.status);
  var api = await import("./packed-stack.mjs");
  var index = api.validatePackedIndex(await response.json());
  if (!Array.isArray(index.flows_cfs) || index.flows_cfs.length !== index.shape[0]
      || !index.flows_cfs.every(function(v,i,a){return Number.isFinite(v) && (i===0 || v>a[i-1]);})
      || !["feet","ft","foot"].includes(index.depth_units)
      || !/3857/.test(index.crs)) throw new Error("unsupported packed CRS, units or flows");
  if (generation !== loadGeneration) return true;
  var gt = R2F2D.parseGeoTransform(index.geotransform);
  if (!gt || gt.rotX || gt.rotY || gt.pixelW <= 0 || gt.pixelH >= 0) throw new Error("unsupported packed grid");
  var ny = index.shape[1], nx = index.shape[2];
  function ll(x,y) { return [x / 20037508.342789244 * 180, (Math.atan(Math.exp(y / 20037508.342789244 * Math.PI))*360)/Math.PI-90]; }
  var nw=ll(gt.originX,gt.originY), ne=ll(gt.originX+nx*gt.pixelW,gt.originY);
  var sw=ll(gt.originX,gt.originY+ny*gt.pixelH), se=ll(gt.originX+nx*gt.pixelW,gt.originY+ny*gt.pixelH);
  rangeReader={api:api,index:index,url:new URL(url,self.location.href),generation:generation};
  post({type:"meta",epoch:epoch,meta:{protocol:1,transport:"http206",mode:"depth",streamId:index.stream_id || url.split("/").pop(),nFlow:index.shape[0],ny:ny,nx:nx,flows:index.flows_cfs,flowUnits:"cfs",units:"ft",depthUnits:"ft",geoTransform:gt,crs:index.crs,coordinates:[nw,ne,se,sw],bounds:[sw[0],sw[1],ne[0],ne[1]],fetchMs:0}});
  await selectPacked(index.shape[0]-1);
  return true;
}
async function selectPacked(index) {
  var own=rangeReader, selection=++rangeSelection;
  if (!own) return;
  try {
    var url=own.url, key=decodeURIComponent(url.pathname.split("/").pop());
    var plane=await own.api.readPackedRung(new URL(".",url).href,key,own.index,index,{signal:fetchController.signal});
    if (own.generation !== loadGeneration || selection !== rangeSelection) return;
    var layer=R2F2D.buildIndex({mode:"depth",nx:own.index.shape[2],ny:own.index.shape[1],scale:1,offset:0,hasFill:false,wsel:plane.depths},0);
    post({type:"layer",epoch:state.epoch,index:index,remaining:0,offsets:layer.offsets,depths:layer.depths,bbox:layer.bbox,stats:layer.stats,painted:layer.painted},[layer.offsets.buffer,layer.depths.buffer]);
  } catch(e) { if(own.generation===loadGeneration && selection===rangeSelection) post({type:"error",epoch:state.epoch,phase:"range",message:e.message}); }
}

self.onmessage = function (event) {
  var message = event.data || {};
  if (message.type === "load") {
    state.verify = !!message.verify;
    state.rampStops = message.rampStops || null;
    load(message.epoch, message.url, message.rangeIndexUrl);
  } else if (message.type === "prioritize") {
    if (message.epoch !== state.epoch) return;
    if (rangeReader) { selectPacked(message.index); return; }
    var at = state.queue.indexOf(message.index);
    if (at > 0) {
      state.queue.splice(at, 1);
      state.queue.unshift(message.index);
    }
  } else if (message.type === "cancel" && message.epoch === state.epoch) {
    loadGeneration += 1;
    if (fetchController) fetchController.abort();
    fetchController = null;
    state.stack = null;
    state.queue = [];
    state.reference = null;
  }
};

