(function () {
  "use strict";

  var CFG = window.FIMCFG || {};
  var manifest = null;
  var unitById = {};
  var activeUnit = null;
  var activeModel = null;
  var activeProfile = 0;
  var playTimer = null;
  var rasterProbe = { checked: false, ok: false };

  var SIDEBAR_WIDTH_KEY = "fim.sidebar.width";
  var SIDEBAR_CLOSED_KEY = "fim.sidebar.closed";
  var BASEMAP_TRANSPARENCY_KEY = "fim.basemap.transparency";
  var DEPTH_OPACITY_KEY = "fim.depth.opacity";
  var SIDEBAR_MIN_WIDTH = 260;
  var SIDEBAR_MAX_WIDTH = 520;
  var SIDEBAR_DEFAULT_WIDTH = 360;
  var SIDEBAR_MOBILE_DEFAULT_WIDTH = 300;
  var BASEMAP_DEFAULT_TRANSPARENCY = 30;
  var DEPTH_DEFAULT_OPACITY = 85;

  /* Animation cadence. Slow enough to read the extent change between steps and
     fast enough that a 72-profile library plays through in about 20 seconds. */
  var PLAY_INTERVAL_MS = 280;

  /* Vector layers in draw order, bottom first. `source_layer` matches the layer
     names fim1d/pmtiles.py writes; a unit that lacks one simply gets no
     layer rather than an error, because ras2fim's optional steps can be off. */
  var VECTORS = [
    { id: "huc12", label: "HUC12 boundaries", group: "Context", type: "line",
      color: "#8b9aa2", width: 0.9, dash: [3, 2], minzoom: 7 },
    { id: "conflated_domain", label: "Conflated domain", group: "Context", type: "fill",
      color: "#55a96f", opacity: 0.1, minzoom: 5 },
    { id: "ras_model_extents", label: "Model extents", group: "Extents", type: "extent", minzoom: 5 },
    { id: "models_domain", label: "ras2fim model domain", group: "Extents", type: "fill",
      color: "#267043", opacity: 0.14, minzoom: 7 },
    { id: "nwm_streams", label: "NWM flowlines", group: "Conflation", type: "line",
      color: "#1f78b4", width: 1.6, minzoom: 8 },
    { id: "conflated_ras_streams", label: "Conflated RAS streams", group: "Conflation", type: "line",
      color: "#1aa6a0", width: 1.3, dash: [4, 2], minzoom: 8 },
    { id: "ras_streams", label: "RAS stream centerlines", group: "Geometry", type: "line",
      color: "#263f52", width: 1.5, minzoom: 8 },
    { id: "ras_cross_sections", label: "Cross sections", group: "Geometry", type: "line",
      color: "#9c60b7", width: 1.1, minzoom: 10 },
    { id: "ras_snap_points", label: "RAS snap points", group: "Conflation", type: "circle",
      color: "#db7b31", radius: 3, minzoom: 12 },
    { id: "nwm_points_on_xs", label: "NWM points on cross sections", group: "Conflation", type: "circle",
      color: "#c54c45", radius: 4, minzoom: 12 }
  ];

  var enabledVectors = {};
  VECTORS.forEach(function (spec) { enabledVectors[spec.id] = spec.group !== "Conflation"; });

  /* Human labels for the feature-inspection panel. Anything not listed falls
     back to the raw property name, so a new ras2fim column still shows up. */
  var FIELD_LABELS = {
    model_key: "Model", model_name: "Model", has_fim: "Depth library",
    extent_source: "Extent source", num_cross_sections: "Cross sections",
    huc8: "HUC8", HUC_12: "HUC12", HUC_8: "HUC8", NAME: "Name",
    feature_id: "NWM feature", ras_path: "RAS geometry", stream_stn: "Station",
    river: "River", reach: "Reach", max_flow: "Max flow (cfs)",
    profile_index: "Profile", profile_label: "Profile name",
    poly_status: "Polygon status", conflated: "Conflated",
    areasqkm: "Area (km²)", GNIS_NAME: "GNIS name", LENGTHKM: "Length (km)"
  };

  function byId(id) { return document.getElementById(id); }
  function text(value) { return value == null ? "" : String(value); }
  function num(value, digits) {
    if (value == null || value === "" || !isFinite(Number(value))) return "—";
    return Number(value).toLocaleString("en-US", {
      minimumFractionDigits: digits || 0, maximumFractionDigits: digits || 0
    });
  }
  function absoluteUrl(path) { return new URL(path, document.baseURI).toString(); }

  function setMapStatus(message, mode) {
    var node = byId("map-status");
    node.textContent = message;
    node.className = "map-status" + (mode ? " " + mode : "");
  }

  function setCatalogStatus(message, mode) {
    var summary = byId("catalog-summary");
    summary.textContent = message;
    summary.parentElement.className = "catalog-status" + (mode ? " " + mode : "");
  }

  function setNotice(html) {
    var node = byId("map-notice");
    if (!html) { node.hidden = true; node.innerHTML = ""; return; }
    node.innerHTML = html;
    node.hidden = false;
  }

  var protocol = new pmtiles.Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);

  var map = new maplibregl.Map({
    container: "map",
    antialias: true,
    hash: true,
    center: CFG.initialCenter || [-97.23, 30.09],
    zoom: CFG.initialZoom || 9.5,
    maxZoom: 18,
    style: {
      version: 8,
      glyphs: "vendor/fonts/{fontstack}/{range}.pbf",
      sources: {
        satellite: {
          type: "raster",
          tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
          tileSize: 256, maxzoom: 18, attribution: "Imagery © Esri"
        },
        streets: {
          type: "raster",
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256, maxzoom: 19, attribution: "© OpenStreetMap contributors"
        }
      },
      layers: [
        { id: "satellite", type: "raster", source: "satellite", paint: { "raster-opacity": 0.7 } },
        { id: "streets", type: "raster", source: "streets", layout: { visibility: "none" }, paint: { "raster-opacity": 0.7 } }
      ]
    }
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-left");
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: "imperial" }), "bottom-right");

  /* MapLibre reports source and style failures through this event and nowhere
     else. Without a handler it swallows them, and a map that renders nothing
     looks identical to a map with nothing to render. */
  map.on("error", function (event) {
    var message = (event && event.error && event.error.message) || "unknown map error";
    if (window.console && console.warn) console.warn("[fim] map error:", message, event);
    /* A failed basemap or depth tile is noisy but not fatal; a failed vector
       source means the geometry the page is about is missing. */
    if (event && event.sourceId && event.sourceId.indexOf("fimvec-src-") === 0) {
      setMapStatus("Vector geometry failed to load: " + message, "warn");
    }
  });

  /* Controls and the catalog are wired immediately; only work that touches the
     map style waits on this. Gating everything on "load" means a browser that
     has not rendered the map yet -- a background tab, where requestAnimationFrame
     is throttled to zero, or a machine without WebGL -- shows a panel of dead
     controls and a permanent "loading" label with no way to tell why. */
  function whenMapReady(action) {
    if (map.isStyleLoaded()) action();
    else map.once("load", action);
  }

  /* map.getStyle() throws before the style exists, so every helper that walks
     the layer list checks first rather than being wrapped in try/catch. */
  function styleLayers() {
    return map.isStyleLoaded() ? (map.getStyle().layers || []) : [];
  }

  /* ==================================================================
     Depth raster
     ================================================================== */

  /* Two delivery paths, and the manifest -- not this file, and not config.js --
     decides which one a release uses.

     A profile carrying `depth_pmtiles` was baked into a static archive at build
     time. That release needs no tile service at all, which is what lets the
     dashboard be published to plain static hosting. The whole pilot library is
     72 profiles and 4.8 MB, because a flood is a thin corridor inside a much
     larger model bounding box and every transparent tile is skipped.

     A profile without one is tiled on demand from its COG by TiTiler at
     `rasterTileBase`. That stays the right answer for a deployment carrying
     many units, where pre-rendering every profile would be the larger cost.

     How depth arrives is a property of the release that was built, not of the
     machine viewing it, which is why it is recorded in the manifest. */
  function depthSourceSpec(model, profile) {
    var entry = model.fim.profiles[profile];
    if (!entry) return null;

    if (entry.depth_pmtiles) {
      /* The archive's own TileJSON carries bounds and zoom range, so MapLibre
         overzooms past the base zoom instead of requesting tiles that do not
         exist. The ramp is already baked into the pixels. */
      return { kind: "pmtiles", url: "pmtiles://" + absoluteUrl(entry.depth_pmtiles) };
    }

    var base = String(CFG.rasterTileBase || "").replace(/\/+$/, "");
    if (!base) return null;
    /* Rescale is the library maximum, not this profile's maximum: a per-profile
       stretch would render every profile with the same darkest blue and hide
       the very thing the slider exists to show. The baked archives are built
       with the same rule, so the two paths render identical pixels. */
    return {
      kind: "titiler",
      tiles: [base + "/cog/tiles/WebMercatorQuad/{z}/{x}/{y}.png" +
        "?url=" + encodeURIComponent(absoluteUrl(entry.cog)) +
        "&rescale=0," + model.fim.depth_max_ft +
        "&colormap_name=blues&nodata=-9999&resampling=nearest"]
    };
  }

  /* True when every profile of this model was baked, so no tile service is
     needed and the startup probe has nothing to check. */
  function modelIsSelfContained(model) {
    var profiles = (model && model.fim && model.fim.profiles) || [];
    if (!profiles.length) return false;
    for (var i = 0; i < profiles.length; i += 1) {
      if (!profiles[i].depth_pmtiles) return false;
    }
    return true;
  }

  function removeDepthLayer() {
    if (map.getLayer("depth-raster")) map.removeLayer("depth-raster");
    if (map.getSource("depth-tiles")) map.removeSource("depth-tiles");
  }

  function firstVectorLayerId() {
    /* Keeps the raster below every vector overlay but above the basemap, so
       cross sections and extents stay readable over the flood surface. */
    var layers = styleLayers();
    for (var i = 0; i < layers.length; i += 1) {
      if (layers[i].id.indexOf("fimvec-") === 0) return layers[i].id;
    }
    return undefined;
  }

  function updateDepthLayer() {
    if (!map.isStyleLoaded()) { map.once("load", updateDepthLayer); return; }
    removeDepthLayer();
    if (!activeModel || !byId("depth-visible").checked) return;
    var spec = depthSourceSpec(activeModel, activeProfile);
    if (!spec) { showRasterUnavailable(); return; }

    if (spec.kind === "pmtiles") {
      map.addSource("depth-tiles", { type: "raster", url: spec.url, tileSize: 256 });
    } else {
      map.addSource("depth-tiles", {
        type: "raster", tiles: spec.tiles, tileSize: 256,
        bounds: activeModel.bbox || undefined, minzoom: 0, maxzoom: 18
      });
    }
    map.addLayer({
      id: "depth-raster", type: "raster", source: "depth-tiles",
      paint: {
        "raster-opacity": Number(byId("depth-opacity").value) / 100,
        /* The library is a step function in stage, so cross-fading between two
           profiles would render depths that no profile actually produced. */
        "raster-fade-duration": 0
      }
    }, firstVectorLayerId());
  }

  function showRasterUnavailable() {
    setNotice(
      "<strong>Depth tiles unavailable.</strong> Set <code>rasterTileBase</code> in " +
      "<code>config.js</code> to a TiTiler that can read this page's COG URLs. " +
      "For a local preview run <code>python serve/dev_tiles.py</code>."
    );
  }

  /* One probe at startup rather than a per-tile error handler: MapLibre reports
     a failed raster tile as a generic source error with no status, so a missing
     tile server would otherwise look identical to a dry profile. */
  function probeRasterService() {
    /* A release whose profiles were all baked has no tile service to probe, and
       telling the reader to configure one would be wrong as well as alarming. */
    if (modelIsSelfContained(activeModel)) {
      rasterProbe.checked = true;
      rasterProbe.ok = true;
      setNotice("");
      return;
    }
    var base = String(CFG.rasterTileBase || "").replace(/\/+$/, "");
    if (!base || !activeModel) { rasterProbe.checked = true; showRasterUnavailable(); return; }
    var entry = activeModel.fim.profiles[activeModel.fim.profiles.length - 1];
    var url = base + "/cog/info?url=" + encodeURIComponent(absoluteUrl(entry.cog));
    fetch(url, { cache: "no-store" })
      .then(function (response) {
        rasterProbe.checked = true;
        rasterProbe.ok = response.ok;
        if (response.ok) setNotice(""); else showRasterUnavailable();
      })
      .catch(function () {
        rasterProbe.checked = true;
        rasterProbe.ok = false;
        showRasterUnavailable();
      });
  }

  /* ==================================================================
     Vector layers
     ================================================================== */

  function vectorSourceId(unit) { return "fimvec-src-" + unit.unit; }

  function extentLayers(sourceId, spec) {
    /* Extents carry the map's most important distinction -- which models have a
       published depth library and which only have geometry -- so the split is
       in the paint expression rather than in two hand-maintained layers. */
    var hasFim = ["==", ["get", "has_fim"], "yes"];
    return [
      {
        id: "fimvec-" + spec.id + "-fill", type: "fill", source: sourceId,
        "source-layer": spec.id, minzoom: spec.minzoom,
        paint: {
          "fill-color": ["case", hasFim, "#2b6cb0", "#7d8a91"],
          "fill-opacity": ["interpolate", ["linear"], ["zoom"],
            6, ["case", hasFim, 0.28, 0.1],
            11, ["case", hasFim, 0.12, 0.05],
            13, 0.02]
        }
      },
      {
        id: "fimvec-" + spec.id + "-line", type: "line", source: sourceId,
        "source-layer": spec.id, minzoom: spec.minzoom,
        paint: {
          "line-color": ["case", hasFim, "#08519c", "#5b6b73"],
          "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1, 12, 2],
          "line-opacity": 0.85
        }
      },
      {
        id: "fimvec-" + spec.id + "-label", type: "symbol", source: sourceId,
        "source-layer": spec.id, minzoom: 9,
        layout: {
          "text-field": ["get", "model_name"],
          "text-font": ["Open Sans Bold"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 9, 10, 13, 13],
          "text-allow-overlap": false
        },
        paint: {
          "text-color": "#12324a", "text-halo-color": "rgba(255,255,255,0.9)", "text-halo-width": 1.4
        }
      }
    ];
  }

  function vectorLayerDefs(sourceId, spec) {
    if (spec.type === "extent") return extentLayers(sourceId, spec);
    var base = {
      id: "fimvec-" + spec.id, source: sourceId,
      "source-layer": spec.id, minzoom: spec.minzoom
    };
    if (spec.type === "fill") {
      return [Object.assign({}, base, {
        type: "fill",
        paint: { "fill-color": spec.color, "fill-opacity": spec.opacity, "fill-outline-color": spec.color }
      })];
    }
    if (spec.type === "circle") {
      return [Object.assign({}, base, {
        type: "circle",
        paint: {
          "circle-color": spec.color, "circle-radius": spec.radius,
          "circle-stroke-color": "#ffffff", "circle-stroke-width": 1, "circle-opacity": 0.95
        }
      })];
    }
    var paint = {
      "line-color": spec.color,
      "line-width": ["interpolate", ["linear"], ["zoom"], 8, spec.width, 14, spec.width * 2.2],
      "line-opacity": 0.9
    };
    if (spec.dash) paint["line-dasharray"] = spec.dash;
    return [Object.assign({}, base, { type: "line", paint: paint })];
  }

  function boundaryLayerDef(sourceId) {
    /* Outline only. Filling the maximum extent would read as "this is the flood",
       when it is the envelope of the top profile in the library. */
    return {
      id: "fimvec-inundation_boundary", type: "line", source: sourceId,
      "source-layer": "inundation_boundary", minzoom: 8,
      layout: { visibility: "none" },
      paint: {
        "line-color": "#d95f02",
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 1.2, 14, 2.6],
        "line-opacity": 0.95
      }
    };
  }

  function clearVectorLayers() {
    if (!map.isStyleLoaded()) return;
    styleLayers().slice().forEach(function (layer) {
      if (layer.id.indexOf("fimvec-") === 0 && map.getLayer(layer.id)) map.removeLayer(layer.id);
    });
    Object.keys(map.getStyle().sources || {}).forEach(function (id) {
      if (id.indexOf("fimvec-src-") === 0 && map.getSource(id)) map.removeSource(id);
    });
  }

  function loadVectorLayers(unit) {
    /* The controls are built from the unit, not from the map, so they are
       populated now even if the style is not ready to receive layers yet. */
    buildVectorControls(unit);
    if (!map.isStyleLoaded()) {
      map.once("load", function () { loadVectorLayers(unit); });
      return;
    }
    clearVectorLayers();
    var sourceId = vectorSourceId(unit);
    map.addSource(sourceId, { type: "vector", url: "pmtiles://" + absoluteUrl(unit.pmtiles) });

    var available = unit.vector_layers || [];
    VECTORS.forEach(function (spec) {
      /* ras_model_extents is derived by the pipeline and so is never in the
         source list; everything else must actually exist in the unit. */
      if (spec.id !== "ras_model_extents" && available.indexOf(spec.id) === -1) return;
      vectorLayerDefs(sourceId, spec).forEach(function (def) {
        map.addLayer(def);
        if (!enabledVectors[spec.id]) map.setLayoutProperty(def.id, "visibility", "none");
      });
    });
    map.addLayer(boundaryLayerDef(sourceId));
    applyBoundaryVisibility();
  }

  function applyBoundaryVisibility() {
    if (!map.getLayer("fimvec-inundation_boundary")) return;
    map.setLayoutProperty(
      "fimvec-inundation_boundary", "visibility",
      byId("boundary-visible").checked ? "visible" : "none"
    );
  }

  function toggleVector(id, visible) {
    enabledVectors[id] = visible;
    styleLayers().forEach(function (layer) {
      if (layer.id === "fimvec-" + id || layer.id.indexOf("fimvec-" + id + "-") === 0) {
        map.setLayoutProperty(layer.id, "visibility", visible ? "visible" : "none");
      }
    });
  }

  function buildVectorControls(unit) {
    var host = byId("geometry-layers");
    host.innerHTML = "";
    var available = unit.vector_layers || [];
    var groups = {};
    var order = [];

    VECTORS.forEach(function (spec) {
      if (spec.id !== "ras_model_extents" && available.indexOf(spec.id) === -1) return;
      if (!groups[spec.group]) { groups[spec.group] = []; order.push(spec.group); }
      groups[spec.group].push(spec);
    });

    order.forEach(function (groupName) {
      var heading = document.createElement("div");
      heading.className = "subgroup-label";
      heading.textContent = groupName;
      host.appendChild(heading);

      groups[groupName].forEach(function (spec) {
        var row = document.createElement("label");
        row.className = "layer-row";
        row.htmlFor = "vec-" + spec.id;

        var input = document.createElement("input");
        input.type = "checkbox";
        input.id = "vec-" + spec.id;
        input.checked = !!enabledVectors[spec.id];
        input.addEventListener("change", function () {
          toggleVector(spec.id, input.checked);
          syncVectorMaster();
        });

        var swatch = document.createElement("span");
        swatch.className = "swatch";
        if (spec.type === "extent") {
          swatch.style.background = "linear-gradient(90deg, #2b6cb0 0 50%, #7d8a91 50%)";
        } else {
          swatch.style.setProperty("--swatch", spec.color);
          if (spec.type === "circle") { swatch.style.height = "10px"; swatch.style.borderRadius = "50%"; swatch.style.width = "10px"; }
        }

        var name = document.createElement("span");
        name.className = "layer-name";
        name.textContent = spec.label;

        row.appendChild(input);
        row.appendChild(swatch);
        row.appendChild(name);
        host.appendChild(row);
      });
    });
    syncVectorMaster();
  }

  function syncVectorMaster() {
    var boxes = byId("geometry-layers").querySelectorAll("input[type=checkbox]");
    var on = 0;
    boxes.forEach(function (box) { if (box.checked) on += 1; });
    var master = byId("geometry-all");
    master.checked = on > 0;
    master.indeterminate = on > 0 && on < boxes.length;
  }

  /* ==================================================================
     Profile control
     ================================================================== */

  function reachAt(reach, index) {
    var slot = reach.profile_index ? reach.profile_index.indexOf(index) : -1;
    if (slot === -1) return null;
    return {
      stage_ft: reach.stage_ft ? reach.stage_ft[slot] : null,
      discharge_cfs: reach.discharge_cfs ? reach.discharge_cfs[slot] : null,
      wse_ft: reach.wse_ft ? reach.wse_ft[slot] : null
    };
  }

  function renderReachReadouts() {
    var host = byId("reach-readouts");
    host.innerHTML = "";
    if (!activeModel) return;
    (activeModel.fim.reaches || []).forEach(function (reach) {
      var point = reachAt(reach, activeProfile);
      var card = document.createElement("div");
      card.className = "reach-card";

      var head = document.createElement("div");
      head.className = "reach-id";
      var left = document.createElement("span");
      left.textContent = "NWM " + reach.feature_id;
      var right = document.createElement("span");
      right.textContent = reach.xs_us && reach.xs_ds ? "XS " + reach.xs_us + "–" + reach.xs_ds : "";
      head.appendChild(left);
      head.appendChild(right);

      var values = document.createElement("div");
      values.className = "reach-values";
      [
        ["Stage", point ? num(point.stage_ft, 2) + " ft" : "—"],
        ["Discharge", point ? num(point.discharge_cfs, 0) + " cfs" : "—"],
        ["WSE", point ? num(point.wse_ft, 2) + " ft" : "—"]
      ].forEach(function (pair) {
        var cell = document.createElement("div");
        var k = document.createElement("span");
        k.className = "k";
        k.textContent = pair[0];
        var v = document.createElement("span");
        v.className = "v";
        v.textContent = pair[1];
        cell.appendChild(k);
        cell.appendChild(v);
        values.appendChild(cell);
      });

      card.appendChild(head);
      card.appendChild(values);
      host.appendChild(card);
    });
  }

  function setProfile(index, redraw) {
    if (!activeModel) return;
    var profiles = activeModel.fim.profiles;
    var clamped = Math.max(0, Math.min(profiles.length - 1, Number(index) || 0));
    activeProfile = clamped;

    var slider = byId("profile-slider");
    if (Number(slider.value) !== clamped) slider.value = String(clamped);
    byId("profile-prev").disabled = clamped === 0;
    byId("profile-next").disabled = clamped === profiles.length - 1;

    var entry = profiles[clamped];
    byId("profile-readout").textContent =
      (clamped + 1) + " of " + profiles.length + " · max " + num(entry.depth_max_ft, 1) + " ft";
    renderReachReadouts();
    if (redraw !== false) updateDepthLayer();
  }

  function stopPlayback() {
    if (playTimer) { window.clearInterval(playTimer); playTimer = null; }
    byId("profile-play").setAttribute("aria-pressed", "false");
    byId("profile-play").textContent = "▶";
  }

  function togglePlayback() {
    if (playTimer) { stopPlayback(); return; }
    if (!activeModel) return;
    byId("profile-play").setAttribute("aria-pressed", "true");
    byId("profile-play").textContent = "❚❚";
    playTimer = window.setInterval(function () {
      var last = activeModel.fim.profiles.length - 1;
      setProfile(activeProfile >= last ? 0 : activeProfile + 1);
    }, PLAY_INTERVAL_MS);
  }

  /* ==================================================================
     Unit and model selection
     ================================================================== */

  function fitBbox(bbox, maxZoom) {
    if (!bbox || bbox.length !== 4) return;
    if (!map.isStyleLoaded()) { map.once("load", function () { fitBbox(bbox, maxZoom); }); return; }
    map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], {
      padding: 60, maxZoom: maxZoom || 14, duration: 600
    });
  }

  function renderUnitMeta(unit) {
    var host = byId("unit-meta");
    host.innerHTML = "";
    [
      ["HUC8", unit.huc8],
      ["Source", unit.source],
      ["Model CRS", unit.source_crs],
      ["Processed", unit.process_date],
      ["ras2fim", unit.ras2fim_version],
      ["Models", unit.models.length + " mapped of " + (unit.models_cataloged || unit.models.length) + " cataloged"]
    ].forEach(function (pair) {
      if (!pair[1]) return;
      var dt = document.createElement("dt");
      dt.textContent = pair[0];
      var dd = document.createElement("dd");
      dd.textContent = text(pair[1]);
      host.appendChild(dt);
      host.appendChild(dd);
    });
  }

  function renderModelList(unit) {
    var host = byId("model-list");
    host.innerHTML = "";
    if (!unit.models.length) {
      host.innerHTML = '<div class="empty-state">No model in this unit produced a depth library.</div>';
      return;
    }
    unit.models.forEach(function (model) {
      var card = document.createElement("div");
      card.className = "model-card";

      var title = document.createElement("h3");
      title.textContent = model.name;
      card.appendChild(title);

      var meta = document.createElement("div");
      meta.className = "model-meta";
      var badge = document.createElement("span");
      badge.className = "model-badge fim";
      badge.textContent = model.fim.profile_count + " profiles";
      meta.appendChild(badge);
      [
        "id " + model.id,
        model.geometry_type,
        (model.fim.reaches || []).length + " NWM reach" + ((model.fim.reaches || []).length === 1 ? "" : "es"),
        "max " + num(model.fim.depth_max_ft, 1) + " ft"
      ].forEach(function (item) {
        var span = document.createElement("span");
        span.textContent = item;
        meta.appendChild(span);
      });
      card.appendChild(meta);

      var locate = document.createElement("button");
      locate.type = "button";
      locate.className = "locate";
      locate.textContent = "Zoom to model";
      locate.addEventListener("click", function () { fitBbox(model.bbox, 13); });
      card.appendChild(locate);

      host.appendChild(card);
    });
  }

  function selectModel(modelId, fit) {
    if (!activeUnit) return;
    stopPlayback();
    activeModel = activeUnit.models.filter(function (m) { return m.id === modelId; })[0] || activeUnit.models[0];
    if (!activeModel) return;

    var profiles = activeModel.fim.profiles;
    var slider = byId("profile-slider");
    slider.max = String(profiles.length - 1);

    byId("legend-max").textContent = num(activeModel.fim.depth_max_ft, 1);
    byId("legend-unit").textContent = activeModel.fim.depth_unit === "feet" ? "ft" : activeModel.fim.depth_unit;
    byId("profile-min").textContent = profiles[0].label;
    byId("profile-max").textContent = profiles[profiles.length - 1].label;

    var topProfile = profiles[profiles.length - 1];
    byId("boundary-hint").textContent =
      "The inundation boundary ras2fim writes at the top profile (" + topProfile.label + ").";
    applyBoundaryVisibility();

    /* Opens on the top profile: the largest published extent is the one that
       shows what the library covers, and starting at profile 0 shows a channel
       so thin it reads as an empty map. */
    setProfile(profiles.length - 1);
    if (fit) fitBbox(activeModel.bbox, 13);
    if (!rasterProbe.checked) probeRasterService();
  }

  function selectUnit(unitId, fit) {
    activeUnit = unitById[unitId];
    if (!activeUnit) return;
    stopPlayback();

    renderUnitMeta(activeUnit);
    renderModelList(activeUnit);
    loadVectorLayers(activeUnit);

    var select = byId("fim-model");
    select.innerHTML = "";
    activeUnit.models.forEach(function (model) {
      var option = document.createElement("option");
      option.value = model.id;
      option.textContent = model.name;
      select.appendChild(option);
    });
    byId("fim-model-row").hidden = activeUnit.models.length < 2;

    var hasFim = activeUnit.models.length > 0;
    byId("fim-controls").hidden = !hasFim;
    byId("fim-empty").hidden = hasFim;

    if (hasFim) selectModel(activeUnit.models[0].id, false);
    else { activeModel = null; removeDepthLayer(); }

    if (fit) fitBbox(activeUnit.bbox, 12);
    setMapStatus(activeUnit.name + " · " + activeUnit.huc8, "ready");
  }

  /* ==================================================================
     Feature inspection
     ================================================================== */

  function inspectableLayerIds() {
    return styleLayers()
      .filter(function (layer) {
        return layer.id.indexOf("fimvec-") === 0 &&
          layer.type !== "symbol" &&
          (map.getLayoutProperty(layer.id, "visibility") || "visible") === "visible";
      })
      .map(function (layer) { return layer.id; });
  }

  function showFeature(feature) {
    var panel = byId("feature-panel");
    var title = byId("feature-title");
    var list = byId("feature-properties");
    var sourceLayer = feature.sourceLayer || "";
    var spec = VECTORS.filter(function (s) { return s.id === sourceLayer; })[0];

    title.textContent = spec ? spec.label : (sourceLayer === "inundation_boundary" ? "Maximum extent" : sourceLayer);
    list.innerHTML = "";

    var props = feature.properties || {};
    Object.keys(props).sort().forEach(function (key) {
      var value = props[key];
      if (value === null || value === "") return;
      var dt = document.createElement("dt");
      dt.textContent = FIELD_LABELS[key] || key;
      var dd = document.createElement("dd");
      /* ras_path is a full Windows path in some products; only its tail is
         meaningful in a browser panel. */
      dd.textContent = key === "ras_path"
        ? String(value).replace(/\\/g, "/").split("/").pop()
        : text(value);
      list.appendChild(dt);
      list.appendChild(dd);
    });
    panel.hidden = false;
  }

  /* ==================================================================
     Basemap
     ================================================================== */

  function setBasemap(name) {
    if (!map.isStyleLoaded()) { map.once("load", function () { setBasemap(name); }); return; }
    map.setLayoutProperty("satellite", "visibility", name === "satellite" ? "visible" : "none");
    map.setLayoutProperty("streets", "visibility", name === "streets" ? "visible" : "none");
  }

  function setBasemapTransparency(value, persist) {
    var pct = Math.max(0, Math.min(90, Number(value)));
    var opacity = 1 - pct / 100;
    if (map.isStyleLoaded()) {
      ["satellite", "streets"].forEach(function (id) {
        if (map.getLayer(id)) map.setPaintProperty(id, "raster-opacity", opacity);
      });
    }
    byId("basemap-transparency").value = String(pct);
    byId("basemap-transparency-value").textContent = pct + "%";
    if (persist) storeValue(BASEMAP_TRANSPARENCY_KEY, String(pct));
  }

  function setDepthOpacity(value, persist) {
    var pct = Math.max(10, Math.min(100, Number(value)));
    byId("depth-opacity").value = String(pct);
    byId("depth-opacity-value").textContent = pct + "%";
    if (map.isStyleLoaded() && map.getLayer("depth-raster")) {
      map.setPaintProperty("depth-raster", "raster-opacity", pct / 100);
    }
    if (persist) storeValue(DEPTH_OPACITY_KEY, String(pct));
  }

  /* ==================================================================
     Sidebar layout
     ================================================================== */

  function storedValue(key) {
    try { return window.localStorage.getItem(key); } catch (error) { return null; }
  }

  function storeValue(key, value) {
    try { window.localStorage.setItem(key, value); } catch (error) { /* storage is optional */ }
  }

  function sidebarWidthBounds() {
    var mobile = window.matchMedia("(max-width: 820px)").matches;
    var available = window.innerWidth - (mobile ? 52 : 300);
    var minimum = Math.min(SIDEBAR_MIN_WIDTH, Math.max(180, available));
    var maximum = Math.max(minimum, Math.min(SIDEBAR_MAX_WIDTH, available));
    return { min: minimum, max: maximum };
  }

  function setSidebarWidth(width, persist) {
    var bounds = sidebarWidthBounds();
    var next = Math.round(Math.max(bounds.min, Math.min(bounds.max, Number(width) || SIDEBAR_DEFAULT_WIDTH)));
    document.documentElement.style.setProperty("--sidebar-width", next + "px");
    var resizer = byId("sidebar-resizer");
    resizer.setAttribute("aria-valuemin", String(bounds.min));
    resizer.setAttribute("aria-valuemax", String(bounds.max));
    resizer.setAttribute("aria-valuenow", String(next));
    if (persist) storeValue(SIDEBAR_WIDTH_KEY, String(next));
    window.requestAnimationFrame(function () { map.resize(); });
    return next;
  }

  function setSidebarClosed(closed, persist) {
    document.body.classList.toggle("sidebar-closed", closed);
    var toggle = byId("sidebar-toggle");
    toggle.setAttribute("aria-expanded", closed ? "false" : "true");
    toggle.setAttribute("title", closed ? "Show map controls" : "Hide map controls");
    toggle.querySelector(".sidebar-toggle-icon").textContent = closed ? "☰" : "›";
    toggle.querySelector(".sidebar-toggle-label").textContent = closed ? "Layers" : "Hide panel";
    if (persist) storeValue(SIDEBAR_CLOSED_KEY, closed ? "1" : "0");
    setTimeout(function () { map.resize(); }, 220);
  }

  function wireSidebarLayout() {
    var mobile = window.matchMedia("(max-width: 820px)").matches;
    var savedWidth = Number(storedValue(SIDEBAR_WIDTH_KEY));
    setSidebarWidth(savedWidth || (mobile ? SIDEBAR_MOBILE_DEFAULT_WIDTH : SIDEBAR_DEFAULT_WIDTH), false);

    var savedClosed = storedValue(SIDEBAR_CLOSED_KEY);
    setSidebarClosed(savedClosed === null ? mobile : savedClosed === "1", false);

    var resizer = byId("sidebar-resizer");
    var drag = null;
    resizer.addEventListener("pointerdown", function (event) {
      if (document.body.classList.contains("sidebar-closed")) return;
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: parseInt(getComputedStyle(document.documentElement).getPropertyValue("--sidebar-width"), 10)
      };
      resizer.setPointerCapture(event.pointerId);
      document.body.classList.add("sidebar-resizing");
      event.preventDefault();
    });
    resizer.addEventListener("pointermove", function (event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      setSidebarWidth(drag.startWidth + drag.startX - event.clientX, false);
    });
    function finishResize(event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      storeValue(SIDEBAR_WIDTH_KEY, String(parseInt(getComputedStyle(document.documentElement).getPropertyValue("--sidebar-width"), 10)));
      document.body.classList.remove("sidebar-resizing");
      drag = null;
    }
    resizer.addEventListener("pointerup", finishResize);
    resizer.addEventListener("pointercancel", finishResize);
    resizer.addEventListener("dblclick", function () {
      setSidebarWidth(window.matchMedia("(max-width: 820px)").matches ? SIDEBAR_MOBILE_DEFAULT_WIDTH : SIDEBAR_DEFAULT_WIDTH, true);
    });
    resizer.addEventListener("keydown", function (event) {
      var current = Number(resizer.getAttribute("aria-valuenow"));
      var bounds = sidebarWidthBounds();
      if (event.key === "ArrowLeft") setSidebarWidth(current + 16, true);
      else if (event.key === "ArrowRight") setSidebarWidth(current - 16, true);
      else if (event.key === "Home") setSidebarWidth(bounds.min, true);
      else if (event.key === "End") setSidebarWidth(bounds.max, true);
      else return;
      event.preventDefault();
    });
    window.addEventListener("resize", function () {
      setSidebarWidth(Number(resizer.getAttribute("aria-valuenow")), false);
    });
  }

  /* ==================================================================
     Wiring
     ================================================================== */

  function wireControls() {
    wireSidebarLayout();
    setBasemapTransparency(storedValue(BASEMAP_TRANSPARENCY_KEY) || BASEMAP_DEFAULT_TRANSPARENCY, false);
    setDepthOpacity(storedValue(DEPTH_OPACITY_KEY) || DEPTH_DEFAULT_OPACITY, false);

    document.querySelectorAll(".panel-heading").forEach(function (button) {
      button.addEventListener("click", function () {
        var panel = button.closest(".panel");
        var open = panel.classList.toggle("open");
        button.setAttribute("aria-expanded", open ? "true" : "false");
        button.querySelector(".chevron").textContent = open ? "⌄" : "›";
        panel.querySelector(".panel-body").hidden = !open;
      });
    });

    byId("sidebar-toggle").addEventListener("click", function () {
      setSidebarClosed(!document.body.classList.contains("sidebar-closed"), true);
    });

    byId("unit-select").addEventListener("change", function (event) {
      selectUnit(event.target.value, true);
    });
    byId("fim-model").addEventListener("change", function (event) {
      selectModel(event.target.value, true);
    });

    byId("profile-slider").addEventListener("input", function (event) {
      stopPlayback();
      setProfile(event.target.value);
    });
    byId("profile-prev").addEventListener("click", function () { stopPlayback(); setProfile(activeProfile - 1); });
    byId("profile-next").addEventListener("click", function () { stopPlayback(); setProfile(activeProfile + 1); });
    byId("profile-play").addEventListener("click", togglePlayback);

    byId("depth-visible").addEventListener("change", updateDepthLayer);
    byId("depth-opacity").addEventListener("input", function (event) {
      setDepthOpacity(event.target.value, true);
    });
    byId("boundary-visible").addEventListener("change", applyBoundaryVisibility);

    byId("geometry-all").addEventListener("change", function (event) {
      byId("geometry-layers").querySelectorAll("input[type=checkbox]").forEach(function (box) {
        box.checked = event.target.checked;
        toggleVector(box.id.replace(/^vec-/, ""), event.target.checked);
      });
      syncVectorMaster();
    });

    document.querySelectorAll("input[name=basemap]").forEach(function (input) {
      input.addEventListener("change", function () { if (input.checked) setBasemap(input.value); });
    });

    /* Arrow keys step the library whenever focus is not in a form control, so
       the slider does not have to be re-grabbed after every interaction. */
    document.addEventListener("keydown", function (event) {
      if (!activeModel) return;
      var tag = (event.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea") return;
      if (event.key === "ArrowRight") { stopPlayback(); setProfile(activeProfile + 1); }
      else if (event.key === "ArrowLeft") { stopPlayback(); setProfile(activeProfile - 1); }
      else if (event.key === " ") { togglePlayback(); }
      else return;
      event.preventDefault();
    });

    map.on("zoom", function () {
      byId("zoom-readout").textContent = "Zoom " + map.getZoom().toFixed(1);
    });

    map.on("click", function (event) {
      var ids = inspectableLayerIds();
      if (!ids.length) return;
      var hits = map.queryRenderedFeatures(event.point, { layers: ids });
      if (hits.length) showFeature(hits[0]);
      else byId("feature-panel").hidden = true;
    });

    map.on("mousemove", function (event) {
      var ids = inspectableLayerIds();
      var hits = ids.length ? map.queryRenderedFeatures(event.point, { layers: ids }) : [];
      map.getCanvas().style.cursor = hits.length ? "pointer" : "";
    });
  }

  function initializeCatalog(data) {
    manifest = data;
    var select = byId("unit-select");
    select.innerHTML = "";

    (manifest.units || []).forEach(function (unit) {
      unitById[unit.unit] = unit;
      var option = document.createElement("option");
      option.value = unit.unit;
      option.textContent = unit.name + " · " + unit.huc8;
      select.appendChild(option);
    });

    var profiles = (manifest.units || []).reduce(function (total, unit) {
      return total + unit.models.reduce(function (sum, model) { return sum + model.fim.profile_count; }, 0);
    }, 0);
    var models = (manifest.units || []).reduce(function (total, unit) { return total + unit.models.length; }, 0);
    setCatalogStatus(
      manifest.units.length + " unit" + (manifest.units.length === 1 ? "" : "s") +
      " · " + models + " model" + (models === 1 ? "" : "s") + " · " + profiles + " profiles",
      "ready"
    );

    if (manifest.units.length) {
      /* The hash carries the map position, so an incoming deep link already has
         a view; only fit when MapLibre found no hash to restore. */
      selectUnit(manifest.units[0].unit, !window.location.hash);
    } else {
      setMapStatus("Catalog is empty.", "warn");
    }
  }

  wireControls();
  whenMapReady(function () {
    byId("zoom-readout").textContent = "Zoom " + map.getZoom().toFixed(1);
  });

  fetch(CFG.manifest || "manifest.json", { cache: "no-store" })
    .then(function (response) {
      if (!response.ok) throw new Error("manifest " + response.status);
      return response.json();
    })
    .then(initializeCatalog)
    .catch(function (error) {
      setCatalogStatus("Catalog failed to load", "error");
      setMapStatus("Could not load " + (CFG.manifest || "manifest.json") + ": " + error.message, "warn");
    });
})();
