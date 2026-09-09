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
  var playTimer = null;
  var timings = {};

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
  function fillList(id, pairs) {
    var host = byId(id);
    host.innerHTML = "";
    pairs.forEach(function (pair) {
      if (pair[1] == null) return;
      var dt = document.createElement("dt"); dt.textContent = pair[0];
      var dd = document.createElement("dd"); dd.innerHTML = pair[1];
      host.appendChild(dt); host.appendChild(dd);
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
  function ensureLayer() {
    whenMapReady(function () {
      if (map.getSource("depth")) {
        map.getSource("depth").setCoordinates(stack.coordinates);
        return;
      }
      map.addSource("depth", {
        type: "canvas",
        canvas: canvas,
        coordinates: stack.coordinates,
        animate: false
      });
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

  function render(index) {
    if (!stack) return;
    var t0 = performance.now();
    var wet = R2F2D.paintDepth(stack, index, imageData, ramp, maxDepth);
    ctx.putImageData(imageData, 0, 0);
    timings.paint = performance.now() - t0;

    ensureLayer();
    pushCanvas();

    var stats = R2F2D.depthStats(stack, index);
    var pct = (100 * wet) / (stack.ny * stack.nx);
    fillList("stats", [
      ["Wet cells", fmt(wet) + " <span style='color:#647683'>(" + pct.toFixed(1) + "% of grid)</span>"],
      ["Max depth", fmt(stats.max, 2) + " ft"],
      ["Mean depth", fmt(stats.mean, 2) + " ft"],
      ["Min (signed)", "<span class='" + (stats.min < 0 ? "warn" : "") + "'>" + fmt(stats.min, 2) + " ft</span>"],
      ["Below terrain", stats.negative
        ? "<span class='warn'>" + fmt(stats.negative) + " cells</span>"
        : "0 cells"]
    ]);

    byId("flow-value").textContent = fmt(stack.flows[index]) + " " + stack.flowUnits;
    fillList("timings", [
      ["Download", "<span class='metric'>" + fmt(timings.fetch, 0) + " ms</span> (" + (stack.bytes / 1e6).toFixed(2) + " MB)"],
      ["h5wasm init", fmt(timings.init, 0) + " ms"],
      ["Decode all", "<span class='metric'>" + fmt(stack.decodeMs, 0) + " ms</span> (" + stack.nFlow + " layers)"],
      ["Paint layer", "<span class='metric'>" + fmt(timings.paint, 1) + " ms</span> per slider step"],
      ["In memory", fmt((stack.wsel.byteLength + stack.terrain.byteLength) / 1e6, 1) + " MB uint16"]
    ]);
  }

  function loadStream(url) {
    setStatus("Fetching " + url.split("/").pop() + "…");
    stopPlay();
    var t0 = performance.now();

    fetch(url, { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error(url + " → HTTP " + response.status);
        return response.arrayBuffer();
      })
      .then(function (buffer) {
        timings.fetch = performance.now() - t0;
        setStatus("Decoding HDF5…");
        stack = R2F2D.readStack(h5, buffer, url.split("/").pop());

        canvas.width = stack.nx;
        canvas.height = stack.ny;
        imageData = ctx.createImageData(stack.nx, stack.ny);

        // One fixed ramp for the whole library, taken from the top flow, so the
        // slider shows the flood rising instead of restretching at every step.
        var top = R2F2D.depthStats(stack, stack.nFlow - 1);
        maxDepth = Math.max(1, Math.ceil(top.max || 1));
        byId("ramp-max").textContent = maxDepth + " ft";

        var slider = byId("flow");
        slider.max = String(stack.nFlow - 1);
        slider.value = String(stack.nFlow - 1);
        byId("flow-min").textContent = fmt(stack.flows[0]) + " cfs";
        byId("flow-max").textContent = fmt(stack.flows[stack.nFlow - 1]) + " cfs";

        fillList("meta", [
          ["Stream", stack.streamId],
          ["Variable", stack.variable + " → depth"],
          ["Grid", stack.nx + " × " + stack.ny + " @ 3 m"],
          ["Layers", stack.nFlow + " flows"],
          ["Packing", "uint16 × " + stack.scale + ", fill " + stack.fill],
          ["Filter", stack.verticalFilter ? stack.verticalFilter + " ft" : "—"],
          ["CRS", "EPSG:3857 <span style='color:#267043'>(native)</span>"]
        ]);

        render(stack.nFlow - 1);
        whenMapReady(function () {
          map.fitBounds([[stack.bounds[0], stack.bounds[1]], [stack.bounds[2], stack.bounds[3]]],
            { padding: 40, duration: 0 });
        });
        setStatus("Read " + stack.streamId + " directly from NetCDF — no server", "done");
      })
      .catch(function (error) {
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
    return fetch("manifest.json", { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("manifest.json -> HTTP " + response.status);
        return response.json();
      })
      .then(function (manifest) {
        var select = byId("stream");
        select.innerHTML = "";
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
