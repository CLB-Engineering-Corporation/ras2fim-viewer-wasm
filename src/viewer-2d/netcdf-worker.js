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
 * Session contract: successful module initialization is cached until worker
 * termination. Loads supersede the previous private generation, abort its
 * fetch, and serialize decode access. Cancellation is silent; synchronous
 * native decode/prepare cannot be interrupted within a task. Preparation yields
 * between layers. Done/error/cancel release the source and verification cache.
 * Consumers must discard old epochs and old worker instances after a crash.
 * No protocol changes or decoder-default changes are required by reuse.
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

importScripts("netcdf.js", "terrio-adapter.js");
var terrioReady = null;
function decoder(backend) {
  if (backend === "h5wasm") {
    if (!ready) {
      importScripts("vendor/h5wasm.js");
      ready = self.h5wasm.ready.then(function (module) {
        post({ type: "progress", epoch: -1, phase: "ready", ms: performance.now() - readyStart });
        return module;
      }).catch(function (error) { ready = null; throw error; });
    }
    return ready;
  }
  if (backend !== "terrio" && backend !== "terrio-slices") return Promise.reject(new Error("unknown decoder backend"));
  if (!terrioReady) terrioReady = import("./vendor/terrio/terrio.js").then(async function (t) {
    await t.default({ module_or_path: new URL("vendor/terrio/terrio_bg.wasm", self.location.href) });
    post({ type: "progress", epoch: -1, phase: "ready", ms: performance.now() - readyStart });
    return t;
  }).catch(function (error) { terrioReady = null; throw error; });
  return terrioReady;
}
function disposeStack() {
  var stack = state.stack;
  state.stack = null;
  state.reference = null;
  state.queue = [];
  state.heapCapacity = null;
  if (stack && stack.dispose) stack.dispose();
}
function layerStack(stack, index) {
  if (!stack.readLayer) return { stack: stack, index: index };
  return { stack: Object.assign({}, stack, { wsel: stack.readLayer(index), nFlow: 1 }), index: 0 };
}
function heapCapacityFor(backend, module) {
  if (backend === "h5wasm") return function () { return module && module.HEAPU8 ? module.HEAPU8.buffer.byteLength : null; };
  return function () { return module.features().memory; };
}

var PROTOCOL_VERSION = 1;

/* Started at load, before any message can arrive. Declared here rather than at
   the foot of the file so load() does not depend on hoisting for correctness. */
var readyStart = performance.now();
var ready = null;

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
var loadTail = Promise.resolve();

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
    if (key === "wsel" || key === "terrain" || key === "readLayer" || key === "dispose") continue;
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
      disposeStack();
      post({ type: "done", epoch: state.epoch, timings: state.timings });
    }
    return;
  }

  var index = state.queue.shift();
  var t0 = performance.now();
  var selected = layerStack(state.stack, index);
  state.timings.peakDecodedBytes = Math.max(state.timings.peakDecodedBytes || 0,
    selected.stack.wsel.byteLength + (selected.stack.terrain ? selected.stack.terrain.byteLength : 0));
  var heap = state.heapCapacity && state.heapCapacity();
  if (typeof heap === "number") state.timings.wasmCapacityBytes = Math.max(state.timings.wasmCapacityBytes || 0, heap);
  var layer = R2F2D.buildIndex(selected.stack, selected.index);
  if (state.timings.firstPreparedMs === undefined) state.timings.firstPreparedMs = performance.now() - state.started;
  state.timings.prepare = (state.timings.prepare || 0) + (performance.now() - t0);

  /* The differential oracle lives here because this is where the dense arrays
     are. It paints the layer both ways into scratch buffers and reports any
     disagreement; the client only has to surface it. */
  if (state.verify) {
    var report = verifyLayer(selected.index, layer, selected.stack);
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
  yieldThen(function () {
    try { prepareNext(generation); } catch (e) {
      if (generation !== loadGeneration) return;
      disposeStack();
      state.queue = [];
      post({ type: "error", epoch: state.epoch, phase: "prepare", message: String(e) });
    }
  });
}

function verifyLayer(index, layer, stack) {
  var n = stack.ny * stack.nx;
  if (!state.reference || state.reference.dense.data.length !== n * 4) {
    state.reference = {
      dense: { data: new Uint8ClampedArray(n * 4) },
      sparse: new Uint8ClampedArray(n * 4)
    };
  }
  var dense = state.reference.dense;
  dense.data.fill(0);
  var sparseBytes = state.reference.sparse;
  sparseBytes.fill(0);
  var sparsePx = new Uint32Array(sparseBytes.buffer);

  var densePainted = R2F2D.paintDense(stack, index, dense, state.ramp, state.maxDepth);
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

function load(epoch, url, backend, verify, rampStops) {
  var generation = ++loadGeneration;
  if (fetchController) fetchController.abort();
  fetchController = new AbortController();
  state.epoch = epoch;
  disposeStack();
  state.queue = [];
  state.timings = {};
  var timings = state.timings;
  state.reference = null;
  state.verify = verify;
  state.rampStops = rampStops;
  var controller = fetchController;
  var phase = "fetch";

  var t0 = performance.now();
  state.started = t0;
  /* h5wasm initialises asynchronously. Waiting on it alongside the fetch rather
     than before it means the two overlap -- and reading the file without waiting
     at all leaves h5.FS null, which surfaces as a bare "cannot read properties
     of null" a long way from the cause. */
  var requestBytes = null;
  var aborted = new Promise(function (_, reject) {
    controller.signal.addEventListener("abort", function () {
      requestBytes = null;
      reject(new Error("cancelled"));
    }, { once: true });
  });
  aborted.catch(function () {});
  // Native decode is serialized. Superseded fetch/init waits release the lane.
  var request = Promise.race([aborted, Promise.all([
    fetch(url, { signal: controller.signal }).then(function (response) {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.arrayBuffer().then(function (bytes) {
        if (generation !== loadGeneration || controller.signal.aborted) throw new Error("cancelled");
        timings.fetch = performance.now() - t0;
        requestBytes = bytes;
      });
    }),
    Promise.resolve().then(function () { return decoder(backend); })
      .then(function (value) { timings.init = performance.now() - t0; return value; })
      .catch(function (e) { if (generation === loadGeneration) phase = "init"; throw e; })
  ])]);
  request.catch(function () {});
  loadTail = loadTail.then(function () { return request; })
    .then(async function (results) {
      if (!results || generation !== loadGeneration) return;
      var buffer = requestBytes;
      requestBytes = null;
      if (generation !== loadGeneration) return;
      state.heapCapacity = heapCapacityFor(backend, results[1]);
      phase = "decode";
      post({ type: "progress", epoch: epoch, phase: "decode", ms: state.timings.fetch });

      var stack = await (backend === "h5wasm" ? R2F2D.readStack(self.h5wasm, buffer, "stream.nc") :
        R2FTerrio.readStack(results[1], buffer, backend === "terrio-slices"));
      if (generation !== loadGeneration) {
        if (stack && stack.dispose) stack.dispose();
        return;
      }
      state.stack = stack;
      state.timings.decode = stack.decodeMs;
      state.timings.bytes = buffer.byteLength;

      var meta = metaOf(stack);
      meta.fetchMs = state.timings.fetch;
      meta.initMs = state.timings.init;
      post({ type: "meta", epoch: epoch, meta: meta });

      /* Top layer first, always. It fixes maxDepth for the whole library, and
         every other layer is coloured against it -- prepare a middle layer
         first and the ramp restretches the moment the top one arrives. */
      var last = stack.nFlow - 1;
      if (state.verify) {
        // The ramp must be settled before any layer is checked, and it comes
        // from the top layer, so that one is prepared up front.
        var topSelected = layerStack(stack, last);
        var top = R2F2D.buildIndex(topSelected.stack, topSelected.index);
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
      requestBytes = null;
      controller.abort();
      if (generation !== loadGeneration) return;
      disposeStack();
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

self.onmessage = function (event) {
  var message = event.data || {};
  if (message.type === "load") {
    load(message.epoch, message.url, message.backend || "h5wasm",
      !!message.verify, message.rampStops || null);
  } else if (message.type === "prioritize") {
    if (message.epoch !== state.epoch) return;
    var at = state.queue.indexOf(message.index);
    if (at > 0) {
      state.queue.splice(at, 1);
      state.queue.unshift(message.index);
    }
  } else if (message.type === "cancel" && message.epoch === state.epoch) {
    loadGeneration += 1;
    if (fetchController) fetchController.abort();
    fetchController = null;
    disposeStack();
    state.queue = [];
    state.reference = null;
  }
};
