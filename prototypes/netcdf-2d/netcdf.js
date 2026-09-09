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

  /** Open a ras2fim-2d NetCDF from an ArrayBuffer. Returns a plain object. */
  function readStack(h5, buffer, name) {
    var path = "/" + (name || "stack.nc");
    h5.FS.writeFile(path, new Uint8Array(buffer));
    var file = new h5.File(path, "r");

    try {
      var keys = file.keys();
      /* ras2fim-2d names the main variable after its type ("wsel"), and records
         that name in the global attribute. Fall back to probing so a "depth"
         stack opens too. */
      var type = attrValue(file.attrs["01_type"]) || null;
      var varName = type && keys.indexOf(type) !== -1
        ? type
        : keys.filter(function (k) { return ["wsel", "depth"].indexOf(k) !== -1; })[0];
      if (!varName) throw new Error("no wsel/depth variable; found: " + keys.join(", "));

      var wselDs = file.get(varName);
      var terrainDs = file.get("terrain");
      if (!terrainDs) throw new Error("no terrain coordinate in the file");

      var shape = wselDs.shape; // [flow, y, x]
      var scale = Number(attrValue(wselDs.attrs["scale_factor"]) || 1);
      var fill = Number(attrValue(wselDs.attrs["_FillValue"]));
      var terrainScale = Number(attrValue(terrainDs.attrs["scale_factor"]) || 1);
      var terrainFill = Number(attrValue(terrainDs.attrs["_FillValue"]));

      var srDs = file.get("spatial_ref");
      var gt = parseGeoTransform(attrValue(srDs.attrs["GeoTransform"]));
      if (!gt) throw new Error("spatial_ref has no usable GeoTransform");
      if (gt.rotX !== 0 || gt.rotY !== 0) {
        // A rotated grid cannot be placed with four corners alone.
        throw new Error("rotated grids are not supported");
      }

      var t0 = performance.now();
      var wsel = wselDs.value; // Uint16Array, length flow*y*x
      var terrain = terrainDs.value;
      var decodeMs = performance.now() - t0;

      var flows = Array.from(file.get("flow").value);

      var ny = shape[1], nx = shape[2];
      var west = gt.originX;
      var north = gt.originY;
      var east = west + nx * gt.pixelW;
      var south = north + ny * gt.pixelH; // pixelH is negative for north-up

      var nw = mercatorToLonLat(west, north);
      var ne = mercatorToLonLat(east, north);
      var se = mercatorToLonLat(east, south);
      var sw = mercatorToLonLat(west, south);

      var stack = {
        variable: varName,
        streamId: attrValue(file.attrs["00_stream_id"]),
        verticalFilter: attrValue(file.attrs["09_vertical_filter"]),
        flows: flows,
        nFlow: shape[0], ny: ny, nx: nx,
        scale: scale, fill: fill,
        terrainScale: terrainScale, terrainFill: terrainFill,
        wsel: wsel,
        terrain: terrain,
        units: attrValue(wselDs.attrs["units"]) || "feet",
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

      file.close();
      try { h5.FS.unlink(path); } catch (e) { /* prototype: leak is harmless */ }
      return stack;
    } catch (error) {
      try { file.close(); } catch (e) { /* already closing */ }
      throw error;
    }
  }

  /** Depth statistics for one flow layer, in file units. */
  function depthStats(stack, index) {
    var n = stack.ny * stack.nx;
    var off = index * n;
    var wsel = stack.wsel, terrain = stack.terrain;
    var fill = stack.fill, tFill = stack.terrainFill;
    var min = Infinity, max = -Infinity, sum = 0, wet = 0, negative = 0;

    for (var i = 0; i < n; i += 1) {
      var w = wsel[off + i];
      if (w === fill) continue;
      var t = terrain[i];
      if (t === tFill) continue;
      // Integer difference; signed, because wsel below terrain does occur.
      var d = w - t;
      if (d < 0) negative += 1;
      if (d < min) min = d;
      if (d > max) max = d;
      sum += d;
      wet += 1;
    }
    if (!wet) return { wet: 0, min: null, max: null, mean: null, negative: 0 };
    return {
      wet: wet,
      negative: negative,
      min: min * stack.scale,
      max: max * stack.scale,
      mean: (sum / wet) * stack.scale
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
    var fill = stack.fill, tFill = stack.terrainFill;
    var out = imageData.data;
    // Depth is compared in RAW units so the whole loop stays integer; the ramp
    // index is the only division.
    var rawMax = Math.max(1, maxDepth / stack.scale);
    var wet = 0;

    for (var i = 0; i < n; i += 1) {
      var o = i * 4;
      var w = wsel[off + i];
      var t = terrain[i];
      if (w === fill || t === tFill) { out[o + 3] = 0; continue; }
      var d = w - t;
      if (d <= 0) { out[o + 3] = 0; continue; }
      var slot = (d >= rawMax ? 255 : ((d / rawMax) * 255) | 0) * 4;
      out[o] = ramp[slot];
      out[o + 1] = ramp[slot + 1];
      out[o + 2] = ramp[slot + 2];
      out[o + 3] = 255;
      wet += 1;
    }
    return wet;
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

  global.R2F2D = {
    readStack: readStack,
    depthStats: depthStats,
    paintDepth: paintDepth,
    buildRamp: buildRamp,
    mercatorToLonLat: mercatorToLonLat,
    FILL: FILL
  };
})(window);
