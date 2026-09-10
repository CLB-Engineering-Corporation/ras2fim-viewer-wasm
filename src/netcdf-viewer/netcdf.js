/* Reading a ras2fim-2d NetCDF directly in the browser.
 *
 * A ras2fim-2d NetCDF4 file is an HDF5 container, so h5wasm can open it with no
 * server and no conversion step. What h5wasm does NOT do is apply the CF
 * conventions layered on top -- `scale_factor`, `_FillValue`, and the dimension
 * coordinates are netCDF/xarray ideas, not HDF5 ones, so the raw uint16 comes
 * back exactly as stored and this module applies them.
 *
 * That turns out to be an advantage. Depth is
 *
 *     (wsel_raw - terrain_raw) * scale_factor
 *
 * which stays in integers until the final multiply, so a whole 2.6-megapixel
 * flow layer is one pass over a Uint16Array.
 */
(function (global) {
  "use strict";

  var FILL = 65535;

  /* EPSG:3857 -> WGS84. The file is already in Web Mercator, which is the whole
     reason no reprojection step is needed: an axis-aligned Mercator rectangle
     maps onto MapLibre's own projection exactly, so the four corners are enough
     and nothing in between is interpolated wrongly. */
  var MERCATOR_R = 20037508.342789244;

  function mercatorToLonLat(x, y) {
    return [
      (x / MERCATOR_R) * 180,
      (Math.atan(Math.exp((y / MERCATOR_R) * Math.PI)) * 360) / Math.PI - 90
    ];
  }

  function attrValue(entry) {
    /* h5wasm returns attributes as {value, shape, dtype}; strings can arrive as
       a one-element array. */
    if (entry == null) return null;
    var v = entry.value !== undefined ? entry.value : entry;
    if (Array.isArray(v) || ArrayBuffer.isView(v)) return v.length === 1 ? v[0] : v;
    return v;
  }

  function parseGeoTransform(text) {
    /* "originX pixelW rotX originY rotY pixelH" -- GDAL's order, written by
       rioxarray into spatial_ref. Read it rather than deriving from the x/y
       coordinate vectors: those are cell CENTRES, and using them as an extent
       silently shifts the raster half a cell. */
    var parts = String(text).trim().split(/\s+/).map(Number);
    if (parts.length !== 6 || parts.some(isNaN)) return null;
    return {
      originX: parts[0], pixelW: parts[1], rotX: parts[2],
      originY: parts[3], rotY: parts[4], pixelH: parts[5]
    };
  }

  /** CF packing for one variable: value = raw * scale_factor + add_offset.
   *
   * `_FillValue` is deliberately allowed to be absent rather than defaulted.
   * `Number(undefined)` is NaN and `Number(null)` is 0 -- and 0 is a perfectly
   * valid packed terrain elevation, so defaulting would silently mask real
   * ground as nodata.
   */
  function packing(ds) {
    var rawFill = attrValue(ds.attrs["_FillValue"]);
    return {
      scale: numberOr(attrValue(ds.attrs["scale_factor"]), 1),
      offset: numberOr(attrValue(ds.attrs["add_offset"]), 0),
      hasFill: rawFill !== null && rawFill !== undefined,
      fill: rawFill === null || rawFill === undefined ? NaN : Number(rawFill)
    };
  }

  function numberOr(value, fallback) {
    if (value === null || value === undefined) return fallback;
    var n = Number(value);
    return isFinite(n) ? n : fallback;
  }

  /** Open a ras2fim-2d NetCDF from an ArrayBuffer. Returns a plain object. */
  function readStack(h5, buffer, name) {
    // A name derived from the URL can collide across streams inside the
    // emscripten filesystem; a generated one cannot.
    var path = "/stack-" + (readStack._seq = (readStack._seq || 0) + 1) + ".nc";
    h5.FS.writeFile(path, new Uint8Array(buffer));

    var file = null;
    try {
      // Inside the try: a throw from the File constructor must still unlink.
      file = new h5.File(path, "r");

      var keys = file.keys();
      /* ras2fim-2d names the main variable after its type and records that name
         in 01_type. Both forms are real products and they mean different things:
         a wsel stack needs terrain subtracted, a depth stack is already depth. */
      var type = attrValue(file.attrs["01_type"]) || null;
      var varName = type && keys.indexOf(type) !== -1
        ? type
        : keys.filter(function (k) { return ["wsel", "depth"].indexOf(k) !== -1; })[0];
      if (!varName) throw new Error("no wsel/depth variable; found: " + keys.join(", "));
      if (varName !== "wsel" && varName !== "depth") {
        throw new Error("unsupported variable " + varName + "; expected wsel or depth");
      }

      var mainDs = file.get(varName);
      var shape = mainDs.shape; // [flow, y, x]
      if (!shape || shape.length !== 3) {
        throw new Error(varName + " is " + (shape ? shape.length : 0) + "-D; expected [flow, y, x]");
      }
      var main = packing(mainDs);

      // Terrain is required for wsel and meaningless for depth. Requiring it
      // unconditionally is what made the advertised depth support unusable.
      var isWsel = varName === "wsel";
      var terrainDs = file.get("terrain");
      if (isWsel && !terrainDs) throw new Error("wsel stack has no terrain coordinate");
      var terrainPack = terrainDs ? packing(terrainDs) : null;
      if (isWsel && terrainDs) {
        var tShape = terrainDs.shape;
        if (!tShape || tShape.length !== 2 || tShape[0] !== shape[1] || tShape[1] !== shape[2]) {
          throw new Error("terrain shape does not match the wsel grid");
        }
      }

      var srDs = file.get("spatial_ref");
      if (!srDs) throw new Error("no spatial_ref variable");
      var gt = parseGeoTransform(attrValue(srDs.attrs["GeoTransform"]));
      if (!gt) throw new Error("spatial_ref has no usable GeoTransform");
      if (gt.rotX !== 0 || gt.rotY !== 0) {
        // A rotated grid cannot be placed with four corners alone.
        throw new Error("rotated grids are not supported");
      }

      var t0 = performance.now();
      var mainValues = mainDs.value; // length flow*y*x
      var terrain = isWsel ? terrainDs.value : null;
      var decodeMs = performance.now() - t0;

      var flows = Array.from(file.get("flow").value);
      if (flows.length !== shape[0]) {
        throw new Error("flow has " + flows.length + " values for " + shape[0] + " layers");
      }

      var ny = shape[1], nx = shape[2];
      var west = gt.originX;
      var north = gt.originY;
      var east = west + nx * gt.pixelW;
      var south = north + ny * gt.pixelH; // pixelH is negative for north-up

      var nw = mercatorToLonLat(west, north);
      var ne = mercatorToLonLat(east, north);
      var se = mercatorToLonLat(east, south);
      var sw = mercatorToLonLat(west, south);

      /* The integer fast path is only valid when the raw difference means
         something. If the two variables are packed differently, w - t is not a
         scaled depth at all -- it is a subtraction of incomparable units, and
         multiplying the result by either scale produces a plausible-looking
         wrong number. Detect it here and let the loops take the float path. */
      var fastPath = !isWsel || (
        terrainPack !== null &&
        main.scale === terrainPack.scale &&
        main.offset === terrainPack.offset
      );

      var stack = {
        variable: varName,
        mode: isWsel ? "wsel" : "depth",
        streamId: attrValue(file.attrs["00_stream_id"]),
        verticalFilter: attrValue(file.attrs["09_vertical_filter"]),
        flows: flows,
        nFlow: shape[0], ny: ny, nx: nx,
        scale: main.scale, offset: main.offset,
        hasFill: main.hasFill, fill: main.fill,
        terrainScale: terrainPack ? terrainPack.scale : 1,
        terrainOffset: terrainPack ? terrainPack.offset : 0,
        terrainHasFill: terrainPack ? terrainPack.hasFill : false,
        terrainFill: terrainPack ? terrainPack.fill : NaN,
        fastPath: fastPath,
        wsel: mainValues,
        terrain: terrain,
        units: attrValue(mainDs.attrs["units"]) || "feet",
        flowUnits: attrValue(file.get("flow").attrs["units"]) || "cfs",
        // MapLibre image/canvas sources want [NW, NE, SE, SW].
        coordinates: [nw, ne, se, sw],
        bounds: [
          Math.min(sw[0], nw[0]), Math.min(sw[1], se[1]),
          Math.max(ne[0], se[0]), Math.max(nw[1], ne[1])
        ],
        decodeMs: decodeMs,
        bytes: buffer.byteLength
      };
      return stack;
    } finally {
      // Every exit unlinks. A long-lived worker reading many streams would
      // otherwise leak the whole file into the emscripten heap each time, and
      // that heap does not shrink.
      if (file) { try { file.close(); } catch (e) { /* already closing */ } }
      try { h5.FS.unlink(path); } catch (e) { /* never written */ }
    }
  }

  /** Physical depth at one cell, or NaN where either input is nodata.
   *
   * The general path. Hot loops hoist the mode/packing branch out and use the
   * integer form where `stack.fastPath` allows it; this is the definition they
   * must agree with.
   */
  function depthAt(stack, off, i) {
    var raw = stack.wsel[off + i];
    if (stack.hasFill && raw === stack.fill) return NaN;
    var value = raw * stack.scale + stack.offset;
    if (stack.mode === "depth") return value;
    var t = stack.terrain[i];
    if (stack.terrainHasFill && t === stack.terrainFill) return NaN;
    return value - (t * stack.terrainScale + stack.terrainOffset);
  }

  /** Signed depth statistics for one flow layer, in file units.
   *
   * `valid` counts every cell where both inputs carry data, including depths of
   * zero and below -- that is the population the signed min/max/mean describe.
   * `positive` counts only the cells that are actually inundated, which is what
   * gets painted. Conflating the two silently changes what the panel reports.
   */
  function depthStats(stack, index) {
    var n = stack.ny * stack.nx;
    var off = index * n;
    var min = Infinity, max = -Infinity, sum = 0;
    var valid = 0, positive = 0, negative = 0;

    for (var i = 0; i < n; i += 1) {
      var d = depthAt(stack, off, i);
      if (d !== d) continue; // NaN: nodata in either input
      if (d < 0) negative += 1;
      else if (d > 0) positive += 1;
      if (d < min) min = d;
      if (d > max) max = d;
      sum += d;
      valid += 1;
    }
    if (!valid) {
      return { valid: 0, wet: 0, positive: 0, negative: 0, min: null, max: null, mean: null };
    }
    return {
      valid: valid,
      // `wet` is retained as the historical name for the signed population the
      // panel has always reported.
      wet: valid,
      positive: positive,
      negative: negative,
      min: min,
      max: max,
      mean: sum / valid
    };
  }

  /**
   * Paint one flow layer's depth into `imageData`.
   *
   * `ramp` is a 256x4 Uint8Array lookup table. Cells at or below zero depth are
   * left transparent: a wsel at or under the terrain is not inundation, and
   * ras2fim-2d does produce them.
   */
  function paintDepth(stack, index, imageData, ramp, maxDepth) {
    var n = stack.ny * stack.nx;
    var off = index * n;
    var wsel = stack.wsel, terrain = stack.terrain;
    var out = imageData.data;
    var invMax = 1 / Math.max(1e-9, maxDepth);
    var painted = 0;

    /* The integer fast path stays in raw units so the loop never divides by the
       scale: for a wsel stack packed identically to its terrain, w - t is the
       depth in raw units and the only work per cell is a subtract and a compare.
       Anything else -- a depth stack, or mismatched packing -- takes the general
       path, which is correct rather than fast.

       The two paths agree on the wet mask and on physical depth exactly. They
       can disagree by one 1/255 ramp bin on a cell sitting on a bin boundary,
       because d/rawMax and (d*scale)/maxDepth round differently in floating
       point. Measured on the mismatched-packing fixture: 2.1% of painted cells,
       at most 2/255 per channel, zero difference in alpha or in depth. That is
       below the resolution of the colour ramp and is not worth an extra
       multiply per cell in the hot loop. */
    if (stack.mode === "wsel" && stack.fastPath) {
      var fill = stack.fill, tFill = stack.terrainFill;
      var hasFill = stack.hasFill, tHasFill = stack.terrainHasFill;
      var rawMax = Math.max(1, maxDepth / stack.scale);
      for (var i = 0; i < n; i += 1) {
        var o = i * 4;
        var w = wsel[off + i];
        var t = terrain[i];
        if ((hasFill && w === fill) || (tHasFill && t === tFill)) { out[o + 3] = 0; continue; }
        var d = w - t;
        if (d <= 0) { out[o + 3] = 0; continue; }
        var slot = (d >= rawMax ? 255 : ((d / rawMax) * 255) | 0) * 4;
        out[o] = ramp[slot];
        out[o + 1] = ramp[slot + 1];
        out[o + 2] = ramp[slot + 2];
        out[o + 3] = 255;
        painted += 1;
      }
      return painted;
    }

    for (var j = 0; j < n; j += 1) {
      var oj = j * 4;
      var dv = depthAt(stack, off, j);
      if (!(dv > 0)) { out[oj + 3] = 0; continue; } // also rejects NaN
      var s = (dv >= maxDepth ? 255 : ((dv * invMax) * 255) | 0) * 4;
      out[oj] = ramp[s];
      out[oj + 1] = ramp[s + 1];
      out[oj + 2] = ramp[s + 2];
      out[oj + 3] = 255;
      painted += 1;
    }
    return painted;
  }

  /** Expand colour stops into a 256-entry RGBA lookup table. */
  function buildRamp(stops) {
    var ramp = new Uint8Array(256 * 4);
    for (var i = 0; i < 256; i += 1) {
      var pos = i / 255;
      var a = stops[0], b = stops[stops.length - 1];
      for (var s = 0; s < stops.length - 1; s += 1) {
        if (pos >= stops[s][0] && pos <= stops[s + 1][0]) { a = stops[s]; b = stops[s + 1]; break; }
      }
      var span = b[0] - a[0];
      var f = span > 0 ? (pos - a[0]) / span : 0;
      ramp[i * 4] = a[1] + (b[1] - a[1]) * f;
      ramp[i * 4 + 1] = a[2] + (b[2] - a[2]) * f;
      ramp[i * 4 + 2] = a[3] + (b[3] - a[3]) * f;
      ramp[i * 4 + 3] = 255;
    }
    return ramp;
  }

  var api = {
    readStack: readStack,
    depthStats: depthStats,
    paintDepth: paintDepth,
    depthAt: depthAt,
    buildRamp: buildRamp,
    mercatorToLonLat: mercatorToLonLat,
    FILL: FILL
  };

  global.R2F2D = api;
  // `self` rather than `window` so the reader loads unchanged inside a worker.
  // It has no DOM and no MapLibre dependency; that is the property that makes
  // it the piece worth reusing.
})(typeof self !== "undefined" ? self : this);
