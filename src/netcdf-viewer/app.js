(function () {
  "use strict";

  var h5 = null;
  var stack = null;
  var canvas = document.createElement("canvas");
  var ctx = canvas.getContext("2d", { willReadFrequently: false });
  var imageData = null;
  var ramp = R2F2D.buildRamp([
    [0.00, 234, 243, 251],
    [0.25, 158, 202, 225],
    [0.50, 66, 146, 198],
    [0.75, 8, 81, 156],
    [1.00, 8, 48, 107]
  ]);
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
  var inFlight = null;

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

  /** ?verify=1 -- assert the sparse path draws exactly what the dense one does.
   *
   * The dense renderer is retained for this. An 8x optimisation that quietly
   * changes the picture is worse than no optimisation, and this is the only
   * cheap way to know it did not.
   */
  function verifyAgainstDense(index, painted) {
    var reference = ctx.createImageData(stack.nx, stack.ny);
    var densePainted = R2F2D.paintDense(stack, index, reference, ramp, maxDepth);
    var mine = imageData.data, theirs = reference.data;
    var differing = 0, maxDelta = 0;
    for (var i = 0; i < mine.length; i += 1) {
      var delta = Math.abs(mine[i] - theirs[i]);
      if (delta) { differing += 1; if (delta > maxDelta) maxDelta = delta; }
    }
    var ok = differing === 0 && painted === densePainted;
    var message = "layer " + index + ": sparse " + painted + " vs dense " + densePainted +
      " painted, " + differing + " differing bytes (max " + maxDelta + ")";
    if (ok) { if (window.console) console.log("[verify] OK  " + message); }
    else {
      if (window.console) console.error("[verify] MISMATCH  " + message);
      setStatus("verify: " + message, "error");
    }
    return ok;
  }

  function render(index) {
    if (!stack) return;
    var layer = layers[index];
    if (!layer) return;

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

    if (verify) verifyAgainstDense(index, painted);

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
      ["In memory", fmt((stack.wsel.byteLength + (stack.terrain ? stack.terrain.byteLength : 0)) / 1e6, 1) + " MB uint16"]
    ]);
  }

  function loadStream(url) {
    setStatus("Fetching " + url.split("/").pop() + "…");
    stopPlay();
    var t0 = performance.now();

    var mine = ++generation;
    if (inFlight) inFlight.abort();
    // Releases the socket promptly. It is an optimisation, not the correctness
    // mechanism -- that is the generation check below.
    var controller = new AbortController();
    inFlight = controller;

    // Published NetCDF objects do not change under their URL, so ordinary HTTP
    // caching applies. "no-store" re-downloaded the whole file on every revisit.
    fetch(url, { signal: controller.signal })
      .then(function (response) {
        if (!response.ok) throw new Error(url + " → HTTP " + response.status);
        return response.arrayBuffer();
      })
      .then(function (buffer) {
        if (mine !== generation) return;
        timings.fetch = performance.now() - t0;
        setStatus("Decoding HDF5…");
        stack = R2F2D.readStack(h5, buffer, url.split("/").pop());

        // Setting width/height also zeroes the backing store, which is the
        // initial clear the sparse painter would otherwise have to do.
        canvas.width = stack.nx;
        canvas.height = stack.ny;
        imageData = ctx.createImageData(stack.nx, stack.ny);
        px = new Uint32Array(imageData.data.buffer);
        rampU32 = R2F2D.buildRampU32(ramp);
        shown = null;

        // One dense pass per layer, here, instead of two per slider step
        // forever. The top layer goes first because it fixes maxDepth for the
        // whole library, and every other layer is coloured against it.
        var tPrep = performance.now();
        layers = new Array(stack.nFlow);
        var lastIndex = stack.nFlow - 1;
        layers[lastIndex] = R2F2D.buildIndex(stack, lastIndex);
        maxDepth = Math.max(1, Math.ceil(layers[lastIndex].stats.max || 1));
        for (var li = 0; li < lastIndex; li += 1) layers[li] = R2F2D.buildIndex(stack, li);
        timings.prepare = performance.now() - tPrep;

        byId("ramp-max").textContent = maxDepth + " ft";

        var slider = byId("flow");
        slider.max = String(stack.nFlow - 1);
        slider.value = String(stack.nFlow - 1);
        byId("flow-min").textContent = fmt(stack.flows[0]) + " cfs";
        byId("flow-max").textContent = fmt(stack.flows[stack.nFlow - 1]) + " cfs";

        // stack.streamId, stack.variable and stack.verticalFilter come from the
        // file's own attributes. They are data, so they go through fillList as
        // plain strings and land in text nodes.
        fillList("meta", [
          ["Stream", stack.streamId],
          ["Variable", stack.mode === "depth" ? stack.variable + " (already depth)" : stack.variable + " → depth"],
          ["Grid", stack.nx + " × " + stack.ny + " @ 3 m"],
          ["Layers", stack.nFlow + " flows"],
          ["Packing", "uint16 × " + stack.scale + (stack.offset ? " + " + stack.offset : "") +
            (stack.hasFill ? ", fill " + stack.fill : ", no fill value")],
          ["Filter", stack.verticalFilter ? stack.verticalFilter + " ft" : "—"],
          ["CRS", [seg("EPSG:3857 "), seg("(native)", "native")]]
        ]);

        render(stack.nFlow - 1);
        // Capture the bounds now: by the time the map is ready this stream may
        // no longer be the selected one.
        var fitTo = stack.bounds.slice();
        whenMapReady(function () {
          if (mine !== generation) return;
          map.fitBounds([[fitTo[0], fitTo[1]], [fitTo[2], fitTo[3]]],
            { padding: 40, duration: 0 });
        });
        setStatus("Read " + stack.streamId + " directly from NetCDF — no server", "done");
      })
      .catch(function (error) {
        if (error && error.name === "AbortError") return;
        if (mine !== generation) return;
        setStatus(error.message, "error");
        if (window.console) console.error(error);
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
        byId("catalog-note").textContent =
          (manifest.streams || []).length + " stream(s), " + total.toFixed(2) + " MB total.";
        if (manifest.attribution) byId("attribution").textContent = manifest.attribution;
        if (!select.options.length) throw new Error("manifest lists no streams");
        return select.value;
      });
  }

  var initStart = performance.now();
  /* `ready` resolves to the emscripten Module (FS plus the low-level bindings),
     but the high-level API -- File, Group, Dataset -- hangs off the h5wasm
     namespace itself. Await the one, then use the other. */
  h5wasm.ready
    .then(function () {
      h5 = h5wasm;
      timings.init = performance.now() - initStart;
      return loadCatalog();
    })
    .then(function (first) {
      loadStream(first);
    })
    .catch(function (error) {
      setStatus("h5wasm failed to initialize: " + error.message, "error");
      if (window.console) console.error(error);
    });
})();
