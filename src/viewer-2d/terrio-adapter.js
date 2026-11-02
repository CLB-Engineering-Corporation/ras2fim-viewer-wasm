/* Experimental Terrio adapter. The existing reader owns all interpretation.
 * Input/output bytes still copy; only one native flow slice is materialized.
 * This file has no DOM dependency and never transfers WASM memory aliases. */
(function (global) {
  "use strict";
  function readStack(terrio, buffer, sliced) {
    var started = performance.now();
    var dataset = terrio.openMultidim(new Uint8Array(buffer));
    var handles = new Map();
    var closed = false;
    function dispose() {
      if (closed) return;
      closed = true;
      handles.forEach(function (a) { a.free(); });
      handles.clear();
      dataset.free();
    }
    try {
      var root = dataset.info().root;
      var paths = dataset.arrayPaths;
      var file = {
        attrs: root.attributes,
        keys: function () { return paths.filter(function (p) { return p.lastIndexOf("/") === 0; }).map(function (p) { return p.slice(1); }); },
        get: function (name) {
          var path = "/" + name;
          if (paths.indexOf(path) < 0) return null;
          if (!handles.has(path)) handles.set(path, dataset.array(path));
          var a = handles.get(path);
          return { attrs: a.info().attributes, shape: Array.from(a.shape, Number), get value() { return a.read(); } };
        },
        close: function () {}
      };
      // A narrow compatibility facade lets both decoders share grid, packing,
      // unit, fill, flow ordering and georeferencing validation exactly.
      var facade = { FS: { writeFile: function () {}, unlink: function () {} }, File: function () { return file; } };
      var stack = global.R2F2D.readStack(facade, buffer, "stream.nc", { metadataOnly: !!sliced });
      var main = handles.get("/" + stack.variable);
      if (main.dimensionNames.join(",") !== "flow,y,x") throw new Error("expected ordered dimensions [flow,y,x]");
      if (sliced) {
        stack.readLayer = function (index) {
          if (closed) throw new Error("scientific stack is closed");
          var view = main.iselAxis(0, index);
          try { return view.read(); } finally { view.free(); }
        };
        stack.dispose = dispose;
      } else { dispose(); }
      stack.decoderMode = sliced ? "terrio-slices" : "terrio";
      stack.decodeMs = performance.now() - started;
      return stack;
    } catch (e) { dispose(); throw e; }
  }
  global.R2FTerrio = { readStack: readStack };
})(typeof self !== "undefined" ? self : this);
