(function () {
  "use strict";

  var h5 = null;
  var stack = null;
  var canvas = document.createElement("canvas");
  var ctx = canvas.getContext("2d", { willReadFrequently: false });
  var imageData = null;
  /* Shared with the worker so its verification paints the same colours, and
     mirrored by the .ramp gradient in index.html. */
  var RAMP_STOPS = [
    [0.00, 234, 243, 251],
    [0.25, 158, 202, 225],
    [0.50, 66, 146, 198],
    [0.75, 8, 81, 156],
    [1.00, 8, 48, 107]
  ];
  var ramp = R2F2D.buildRamp(RAMP_STOPS);
  var maxDepth = 1;
  var rampU32 = null;          // ramp as packed RGBA words, built with the stack
  var px = null;               // Uint32Array view over imageData, one word per pixel
  var layers = [];             // prepared layers, by flow index
  var shown = null;            // the layer currently on the canvas
  var verify = /[?&]verify=1/.test(location.search);
  var playTimer = null;
  var timings = {};
  /* Every load carries a generation. An earlier request that finishes after a
     later one must not write `stack`, the panel, the canvas, or the map -- and
     aborting the fetch alone does not achieve that, because a response already
     in flight still resolves and a queued map callback still runs. The check
     happens at every asynchronous commit point, including the error path. */
  var generation = 0;
  var worker = null;
  var pendingRender = null;   // layer index waiting on its prepared data
  var catalogSummary = "";

  function byId(id) { return document.getElementById(id); }
  function fmt(v, d) {
    return v == null || !isFinite(v) ? "—"
      : Number(v).toLocaleString("en-US", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  }
  function setStatus(text, mode) {
    var node = byId("status");
    node.textContent = text;
    node.className = mode || "";
  }
  /* A styled run of text inside a definition-list value. Values reach this
     panel from NetCDF attributes -- 00_stream_id and 09_vertical_filter are
     written by whoever produced the file -- so nothing here may go through
     innerHTML. Callers describe emphasis with seg(); the text itself always
     lands in a text node. */
  function seg(text, className) {
    return { text: text, className: className || null };
  }

  function fillList(id, pairs) {
    var host = byId(id);
    host.textContent = "";
    pairs.forEach(function (pair) {
      if (pair[1] == null) return;
      var dt = document.createElement("dt");
      dt.textContent = pair[0];

      var dd = document.createElement("dd");
      var parts = Array.isArray(pair[1]) ? pair[1] : [seg(pair[1])];
      parts.forEach(function (part) {
        // A bare string is data; only an explicit seg() can carry a class, and
        // the class is ours, never the file's.
        var piece = part && typeof part === "object" ? part : seg(part);
        if (piece.className) {
          var span = document.createElement("span");
          span.className = piece.className;
          span.textContent = String(piece.text);
          dd.appendChild(span);
        } else {
          dd.appendChild(document.createTextNode(String(piece.text)));
        }
      });

      host.appendChild(dt);
      host.appendChild(dd);
    });
  }

  var map = new maplibregl.Map({
    container: "map",
    hash: true,
    center: [-97.4, 30.4],
    zoom: 12,
    maxZoom: 20,
    style: {
      version: 8,
      sources: {
        satellite: {
          type: "raster",
          tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
          tileSize: 256, maxzoom: 18, attribution: "Imagery © Esri"
        }
      },
      layers: [{ id: "satellite", type: "raster", source: "satellite", paint: { "raster-opacity": 0.8 } }]
    }
  });
  map.addControl(new maplibregl.NavigationControl(), "top-right");
  map.addControl(new maplibregl.ScaleControl({ unit: "imperial" }), "bottom-right");

  function whenMapReady(action) {
    if (map.isStyleLoaded()) action(); else map.once("load", action);
  }

  /* The depth layer is a canvas source rather than tiles. The grid is already
     EPSG:3857 and north-up, so its four corners land on MapLibre's own
     projection exactly -- there is nothing to reproject and nothing to tile. */
  var placedCoordinates = null;

  function ensureLayer() {
    whenMapReady(function () {
      if (map.getSource("depth")) {
        // Only when the footprint actually changed. setCoordinates recomputes
        // the source's geometry and fires a content change; calling it on every
        // slider step did that work for nothing.
        if (placedCoordinates !== stack.coordinates) {
          map.getSource("depth").setCoordinates(stack.coordinates);
          placedCoordinates = stack.coordinates;
        }
        return;
      }
      map.addSource("depth", {
        type: "canvas",
        canvas: canvas,
        coordinates: stack.coordinates,
        animate: false
      });
      placedCoordinates = stack.coordinates;
      map.addLayer({
        id: "depth",
        type: "raster",
        source: "depth",
        paint: {
          "raster-opacity": Number(byId("opacity").value) / 100,
          "raster-resampling": "nearest",
          "raster-fade-duration": 0
        }
      });
    });
  }

  /* A canvas source uploads its texture on render. With animate:false MapLibre
     will not do that on its own, so one play/pause cycle pushes exactly one
     frame -- far cheaper than leaving animate:true, which re-uploads 10 MB
     every frame forever. */
  function pushCanvas() {
    var source = map.getSource("depth");
    if (!source) return;
    source.play();
    map.once("render", function () { source.pause(); });
    map.triggerRepaint();
  }

  /** Union of what the previous layer painted and what this one will. */
  function dirtyRect(next) {
    var a = shown && shown.bbox, b = next.bbox;
    var box = !a ? b : !b ? a : {
      x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0),
      x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1)
    };
    if (!box) return null;
    return { x: box.x0, y: box.y0, w: box.x1 - box.x0 + 1, h: box.y1 - box.y0 + 1 };
  }

  /** Bytes of prepared index currently on this thread. */
  function indexBytes() {
    var total = 0;
    for (var i = 0; i < layers.length; i += 1) {
      if (layers[i]) total += layers[i].offsets.byteLength + layers[i].depths.byteLength;
    }
    return total;
  }

  function render(index) {
    if (!stack) return;
    var layer = layers[index];
    if (!layer) {
      // Not prepared yet. Ask the worker to jump the queue and leave the last
      // good frame up -- disabling the slider would read as broken.
      pendingRender = index;
      if (worker) worker.postMessage({ type: "prioritize", epoch: generation, index: index });
      return;
    }

    var t0 = performance.now();
    // Clear what the previous layer painted, then paint this one. Only the
    // previous layer's cells are touched, not all 2.6M -- but the order is
    // load-bearing: a cell wet in both must be zeroed and repainted, and
    // painting first would erase it.
    if (shown) R2F2D.clearSparse(px, shown);
    var painted = R2F2D.paintSparse(px, layer, rampU32, maxDepth);
    shown = layer;
    timings.paint = performance.now() - t0;

    var t1 = performance.now();
    // Only the rectangle that changed: the union of what was cleared and what
    // was drawn.
    var rect = dirtyRect(layer);
    if (rect) ctx.putImageData(imageData, 0, 0, rect.x, rect.y, rect.w, rect.h);
    timings.copy = performance.now() - t1;

    ensureLayer();
    pushCanvas();

    var stats = layer.stats;
    var pct = (100 * painted) / (stack.ny * stack.nx);
    // "Inundated" is what is drawn (depth > 0). The signed statistics below
    // describe every cell with data, including zero and below-terrain, which is
    // a larger population -- labelling both "wet" hid that.
    fillList("stats", [
      ["Inundated", [seg(fmt(painted)), seg(" (" + pct.toFixed(1) + "% of grid)", "muted")]],
      ["Cells with data", fmt(stats.valid)],
      ["Max depth", fmt(stats.max, 2) + " ft"],
      ["Mean depth", fmt(stats.mean, 2) + " ft"],
      ["Min (signed)", [seg(fmt(stats.min, 2) + " ft", stats.min < 0 ? "warn" : null)]],
      ["Below terrain", stats.negative
        ? [seg(fmt(stats.negative) + " cells", "warn")]
        : "0 cells"]
    ]);

    byId("flow-value").textContent = fmt(stack.flows[index]) + " " + stack.flowUnits;
    fillList("timings", [
      ["Download", [seg(fmt(timings.fetch, 0) + " ms", "metric"),
                    seg(" (" + (stack.bytes / 1e6).toFixed(2) + " MB)")]],
      ["h5wasm init", fmt(timings.init, 0) + " ms"],
      ["Decode all", [seg(fmt(stack.decodeMs, 0) + " ms", "metric"),
                      seg(" (" + stack.nFlow + " layers)")]],
      ["Prepare all", [seg(fmt(timings.prepare, 0) + " ms", "metric"),
                       seg(" (" + stack.nFlow + " layers, once)")]],
      ["Paint layer", [seg(fmt(timings.paint, 2) + " ms", "metric"),
                       seg(" per slider step")]],
      ["Canvas copy", fmt(timings.copy, 2) + " ms"],
      ["Held here", [seg(fmt(indexBytes() / 1e6, 1) + " MB", "metric"),
                     seg(" of sparse index (dense arrays stay in the worker)")]]
    ]);
  }

  /** Terminate and respawn rather than trying to cancel.
   *
   * AbortController cannot interrupt a synchronous wasm decode already running,
   * and messages already dispatched still run their handlers. Terminating kills
   * the decode outright and guarantees the 84 MB is freed rather than relying on
   * a dropped reference and GC timing. The replacement is spawned immediately so
   * its h5wasm init overlaps the next fetch.
   */
  function respawnWorker() {
    if (worker) worker.terminate();
    worker = new Worker("netcdf-worker.js");
    worker.onmessage = onWorkerMessage;
    worker.onerror = function (event) {
      setStatus("worker failed: " + (event.message || "unknown"), "error");
    };
    return worker;
  }

  function onWorkerMessage(event) {
    var message = event.data || {};
    // Belt and braces: terminate() does not un-dispatch messages already queued
    // on this thread, so the epoch is checked here too.
    if (message.epoch !== generation && message.type !== "progress") return;

    if (message.type === "progress" && message.phase === "ready") {
      timings.init = message.ms;
      return;
    }
    if (message.type === "meta") {
      timings.fetch = message.meta.fetchMs;
      adoptMeta(message.meta);
    } else if (message.type === "layer") {
      layers[message.index] = {
        offsets: message.offsets,
        depths: message.depths,
        bbox: message.bbox,
        stats: message.stats,
        painted: message.painted
      };
      onLayerReady(message.index, message.remaining);
    } else if (message.type === "done") {
      timings.prepare = message.timings.prepare;
      timings.fetch = message.timings.fetch;
      if (stack) render(Number(byId("flow").value));
      if (stack) setStatus("Read " + stack.streamId + " directly from NetCDF — no server", "done");
    } else if (message.type === "verify") {
      var r = message.report;
      var detail = "layer " + message.index + ": sparse " + r.sparsePainted +
        " vs dense " + r.densePainted + " painted, " + r.differing +
        " differing bytes (max " + r.maxDelta + ")";
      if (window.console) console.error("[verify] MISMATCH  " + detail);
      setStatus("verify: " + detail, "error");
    } else if (message.type === "error") {
      var hint = message.phase === "fetch"
        ? " — if the data is on another origin, that host must send Access-Control-Allow-Origin"
        : "";
      setStatus(message.message + hint, "error");
    }
  }

  function adoptMeta(meta) {
    stack = meta;
    layers = new Array(meta.nFlow);
    shown = null;

    canvas.width = meta.nx;
    canvas.height = meta.ny;      // also zeroes the backing store
    imageData = ctx.createImageData(meta.nx, meta.ny);
    px = new Uint32Array(imageData.data.buffer);
    rampU32 = R2F2D.buildRampU32(ramp);

    var slider = byId("flow");
    slider.max = String(meta.nFlow - 1);
    slider.value = String(meta.nFlow - 1);
    byId("flow-min").textContent = fmt(meta.flows[0]) + " cfs";
    byId("flow-max").textContent = fmt(meta.flows[meta.nFlow - 1]) + " cfs";
    pendingRender = meta.nFlow - 1;

    fillList("meta", [
      ["Stream", meta.streamId],
      ["Variable", meta.mode === "depth" ? meta.variable + " (already depth)" : meta.variable + " → depth"],
      ["Grid", meta.nx + " × " + meta.ny + " @ 3 m"],
      ["Layers", meta.nFlow + " flows"],
      ["Packing", "uint16 × " + meta.scale + (meta.offset ? " + " + meta.offset : "") +
        (meta.hasFill ? ", fill " + meta.fill : ", no fill value")],
      ["Filter", meta.verticalFilter ? meta.verticalFilter + " ft" : "—"],
      ["CRS", [seg("EPSG:3857 "), seg("(native)", "native")]]
    ]);

    var fitTo = meta.bounds.slice();
    var mine = generation;
    whenMapReady(function () {
      if (mine !== generation) return;
      map.fitBounds([[fitTo[0], fitTo[1]], [fitTo[2], fitTo[3]]], { padding: 40, duration: 0 });
    });
  }

  function onLayerReady(index, remaining) {
    // The top layer arrives first and fixes the ramp for the whole library.
    if (index === stack.nFlow - 1) {
      maxDepth = Math.max(1, Math.ceil(layers[index].stats.max || 1));
      byId("ramp-max").textContent = maxDepth + " ft";
    }
    if (pendingRender === index) {
      pendingRender = null;
      render(index);
    }
    setPending(remaining);
  }

  function setPending(remaining) {
    var note = byId("catalog-note");
    if (!note) return;
    note.textContent = remaining
      ? "preparing " + remaining + " more layer" + (remaining === 1 ? "" : "s") + "…"
      : catalogSummary;
  }

  function loadStream(url) {
    setStatus("Fetching " + url.split("/").pop() + "…");
    stopPlay();
    stack = null;
    shown = null;
    layers = [];
    pendingRender = null;
    generation += 1;
    timings = { init: timings.init };
    respawnWorker().postMessage({
      type: "load", epoch: generation, url: url,
      verify: verify, rampStops: RAMP_STOPS
    });
  }

  function stopPlay() {
    if (playTimer) { clearInterval(playTimer); playTimer = null; }
    byId("play").setAttribute("aria-pressed", "false");
    byId("play").textContent = "▶";
  }

  byId("play").addEventListener("click", function () {
    if (playTimer) { stopPlay(); return; }
    if (!stack) return;
    byId("play").setAttribute("aria-pressed", "true");
    byId("play").textContent = "❚❚";
    playTimer = setInterval(function () {
      var slider = byId("flow");
      var next = (Number(slider.value) + 1) % stack.nFlow;
      slider.value = String(next);
      render(next);
    }, 260);
  });

  byId("flow").addEventListener("input", function (event) {
    stopPlay();
    render(Number(event.target.value));
  });
  byId("opacity").addEventListener("input", function (event) {
    if (map.getLayer("depth")) {
      map.setPaintProperty("depth", "raster-opacity", Number(event.target.value) / 100);
    }
  });
  byId("stream").addEventListener("change", function (event) { loadStream(event.target.value); });

  /* The stream list comes from a manifest so the same viewer serves any
     directory of ras2fim-2d output. Everything else about a stream -- grid,
     packing, flows, georeferencing -- is read from the .nc itself on load, so
     the manifest only has to answer "which files exist, and roughly where". */
  function loadCatalog() {
    // The manifest is the freshness anchor -- it changes whenever the site is
    // rebuilt -- so it is always revalidated. "no-cache" still allows a 304,
    // where "no-store" forced a full re-download of a file that rarely differs.
    return fetch("manifest.json", { cache: "no-cache" })
      .then(function (response) {
        if (!response.ok) throw new Error("manifest.json -> HTTP " + response.status);
        return response.json();
      })
      .then(function (manifest) {
        var select = byId("stream");
        select.textContent = "";
        (manifest.streams || []).forEach(function (entry) {
          var option = document.createElement("option");
          option.value = entry.file;
          option.textContent = entry.id + " — " + entry.grid.nx + " × " + entry.grid.ny +
            ", " + entry.flow_count + " flows";
          select.appendChild(option);
        });
        var total = (manifest.total_bytes || 0) / 1e6;
        catalogSummary =
          (manifest.streams || []).length + " stream(s), " + total.toFixed(2) + " MB total.";
        byId("catalog-note").textContent = catalogSummary;
        if (manifest.attribution) byId("attribution").textContent = manifest.attribution;
        if (!select.options.length) throw new Error("manifest lists no streams");
        return select.value;
      });
  }

  /* h5wasm now lives entirely in the worker, so the catalog fetch and the
     decoder's startup overlap instead of queuing behind each other. */
  var initStart = performance.now();
  timings.init = 0;
  loadCatalog()
    .then(function (first) {
      timings.init = performance.now() - initStart;
      loadStream(first);
    })
    .catch(function (error) {
      setStatus("catalog failed to load: " + error.message, "error");
      if (window.console) console.error(error);
    });
})();
