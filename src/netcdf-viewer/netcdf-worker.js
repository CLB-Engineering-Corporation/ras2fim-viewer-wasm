/* Decode and prepare ras2fim-2d NetCDF off the main thread.
 *
 * Protocol
 * --------
 *
 *   main -> worker   { type: "load", epoch, url }
 *                    { type: "prioritize", epoch, index }
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

function prepareNext() {
  if (!state.stack || !state.queue.length) {
    if (state.stack) {
      // Every layer is indexed; the dense arrays have no further use. Dropping
      // them here is what keeps a long-lived worker from holding 84 MB per
      // stream it has ever opened.
      state.stack.wsel = null;
      state.stack.terrain = null;
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
  // rather than after all of them.
  setTimeout(prepareNext, 0);
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

function load(epoch, url) {
  state.epoch = epoch;
  state.stack = null;
  state.queue = [];
  state.timings = {};

  var t0 = performance.now();
  /* h5wasm initialises asynchronously. Waiting on it alongside the fetch rather
     than before it means the two overlap -- and reading the file without waiting
     at all leaves h5.FS null, which surfaces as a bare "cannot read properties
     of null" a long way from the cause. */
  Promise.all([
    fetch(url).then(function (response) {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.arrayBuffer();
    }),
    ready
  ])
    .then(function (results) {
      var buffer = results[0];
      if (epoch !== state.epoch) return;
      state.timings.fetch = performance.now() - t0;
      post({ type: "progress", epoch: epoch, phase: "decode", ms: state.timings.fetch });

      var stack = R2F2D.readStack(self.h5wasm, buffer, "stream.nc");
      if (epoch !== state.epoch) return;
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
      prepareNext();
    })
    .catch(function (error) {
      if (epoch !== state.epoch) return;
      // A cross-origin failure surfaces here as an opaque "Failed to fetch";
      // phase and url are what let the client say something useful about CORS.
      post({
        type: "error",
        epoch: epoch,
        phase: state.stack ? "decode" : "fetch",
        url: url,
        message: (error && error.message) || String(error)
      });
    });
}

self.onmessage = function (event) {
  var message = event.data || {};
  if (message.type === "load") {
    state.verify = !!message.verify;
    state.rampStops = message.rampStops || null;
    load(message.epoch, message.url);
  } else if (message.type === "prioritize") {
    if (message.epoch !== state.epoch) return;
    var at = state.queue.indexOf(message.index);
    if (at > 0) {
      state.queue.splice(at, 1);
      state.queue.unshift(message.index);
    }
  }
};

