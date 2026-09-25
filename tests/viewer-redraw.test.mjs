import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = viewer => readFileSync(new URL(`../src/${viewer}/app.js`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
// Exercise the shipped orchestration functions, not copies of the algorithms.
function fn(src, name) {
  const match = src.match(new RegExp(`^  function ${name}\\([^]*?^  }`, 'm'));
  assert.ok(match, name);
  return match[0];
}
function styleHarness(viewer, extra = {}) {
  const src = source(viewer);
  const events = new Map();
  const map = {
    isStyleLoaded: () => false, // A source request is still outstanding.
    on(event, action) { const list = events.get(event) || []; list.push(action); events.set(event, list); },
    once(event, action) { const once = (...args) => { map.off(event, once); action(...args); }; map.on(event, once); },
    off(event, action) { events.set(event, (events.get(event) || []).filter(f => f !== action)); },
  };
  const ctx = vm.createContext({ map, ...extra });
  const readiness = src.match(/  var styleReady = false;\n  map.on\("style.load",[^\n]+/);
  vm.runInContext((readiness ? readiness[0] : '') + '\n' + fn(src, 'whenMapReady'), ctx);
  return { ctx, map, src, emit(event, data) { for (const f of [...events.get(event) || []]) f(data); } };
}
for (const viewer of ['viewer-1d', 'viewer-2d']) {
  test(`${viewer}: controls work after style initialization while tiles are loading`, () => {
    const h = styleHarness(viewer);
    let calls = 0;
    h.ctx.whenMapReady(() => calls++);
    assert.equal(calls, 0);
    h.emit('style.load');
    assert.equal(calls, 1, 'initial work must not wait for all map tiles');
    h.ctx.whenMapReady(() => calls++);
    assert.equal(calls, 2, 'source loading must not strand work on the one-time load event');
  });
}

function depthHarness() {
  const sources = new Map(), layers = new Map(), loaded = new Set();
  const nodes = { 'depth-visible': { checked: true }, 'depth-opacity': { value: '85' }, 'depth-opacity-value': {},
    'profile-readout': { textContent: 'Profile', setAttribute() {} } };
  const h = styleHarness('viewer-1d', {
    activeModel: {}, activeProfile: 0, displayedDepth: null, pendingDepth: null, depthSequence: 0,
    byId: id => nodes[id], setNotice() {},
    depthSourceSpec: (_model, profile) => ({ kind: 'pmtiles', url: `profile-${profile}.pmtiles` }),
    showRasterUnavailable() { assert.fail('depth should be available'); },
  });
  Object.assign(h.map, {
    getLayer: id => layers.get(id), removeLayer: id => layers.delete(id),
    getSource: id => sources.get(id), removeSource: id => sources.delete(id),
    addSource: (id, spec) => sources.set(id, spec),
    addLayer: spec => layers.set(spec.id, spec),
    setPaintProperty: (id, key, value) => { layers.get(id).paint[key] = value; },
    isSourceLoaded: id => loaded.has(id),
    getStyle: () => ({ layers: [{ id: 'fimvec-cross-sections' }] }),
  });
  vm.runInContext(['styleLayers', 'discardDepth', 'depthLoading', 'removeDepthLayer',
    'firstVectorLayerId', 'updateDepthLayer', 'setDepthOpacity']
    .map(name => fn(h.src, name)).join('\n'), h.ctx);
  h.emit('style.load');
  return Object.assign(h, { sources, layers, loaded, nodes,
    select(index) { h.ctx.activeProfile = index; h.ctx.updateDepthLayer(); },
    finish() { loaded.add(h.ctx.pendingDepth.source); h.emit('render'); },
    visible() { return [...layers.values()].filter(l => l.paint['raster-opacity'] > 0); },
  });
}

test('1D: old profile stays visible until replacement viewport tiles are ready', () => {
  const h = depthHarness();
  h.select(71); h.finish();
  const old = h.ctx.displayedDepth;
  h.select(0);
  const next = h.ctx.pendingDepth;
  h.emit('render');
  assert.equal(h.visible()[0].id, old.layer);
  assert.equal(h.layers.get(next.layer).paint['raster-opacity'], 0);
  assert.equal(h.layers.size, 2);
  h.finish();
  assert.equal(h.visible().length, 1);
  assert.equal(h.visible()[0].id, next.layer);
  assert.equal(h.sources.has(old.source), false);
  assert.equal(h.layers.size, 1);
  assert.equal(h.ctx.firstVectorLayerId(), 'fimvec-cross-sections');
});

test('1D: rapid changes discard obsolete loads without removing the displayed frame', () => {
  const h = depthHarness();
  h.select(71); h.finish();
  const old = h.ctx.displayedDepth;
  h.select(0); const stale = h.ctx.pendingDepth;
  for (const index of [45, 3, 20]) {
    h.select(index);
    assert.equal(h.sources.get(h.ctx.pendingDepth.source).url, `profile-${index}.pmtiles`);
    assert.equal(h.visible()[0].id, old.layer);
    assert.equal(h.layers.size, 2);
  }
  stale.ready(); // An already queued callback cannot overwrite the latest selection.
  assert.equal(h.ctx.displayedDepth, old);
  h.finish();
  assert.equal(h.ctx.displayedDepth.profile, 20);
  assert.equal(h.sources.size, 1);
});

test('1D: returning to the displayed profile cancels the pending swap', () => {
  const h = depthHarness();
  h.select(71); h.finish();
  const old = h.ctx.displayedDepth;
  h.select(0); h.select(71);
  assert.equal(h.ctx.pendingDepth, null);
  assert.equal(h.ctx.displayedDepth, old);
  assert.equal(h.layers.size, 1);
});

test('1D: hidden depth cancels loading and cannot reappear from stale callbacks', () => {
  const h = depthHarness();
  h.select(71); h.finish(); h.select(0);
  const stale = h.ctx.pendingDepth;
  h.nodes['depth-visible'].checked = false;
  h.ctx.updateDepthLayer(); stale.ready();
  assert.equal(h.layers.size, 0);
  assert.equal(h.sources.size, 0);
  assert.equal(h.ctx.pendingDepth, null);
});

test('1D: failed tiles keep the previous complete profile visible', () => {
  const h = depthHarness();
  h.select(71); h.finish(); h.select(0);
  h.emit('error', { sourceId: h.ctx.pendingDepth.source });
  h.emit('render');
  assert.equal(h.ctx.pendingDepth, null);
  assert.equal(h.ctx.displayedDepth.profile, 71);
  assert.equal(h.visible().length, 1);
});

test('1D: a new model never retains the previous model flood', () => {
  const h = depthHarness();
  h.select(71); h.finish(); h.ctx.activeModel = {}; h.select(0);
  assert.equal(h.ctx.displayedDepth, null);
  assert.equal(h.layers.size, 1);
  assert.equal(h.visible().length, 0);
});

const reader = vm.createContext({});
reader.self = reader;
vm.runInContext(readFileSync(new URL('../src/viewer-2d/netcdf.js', import.meta.url), 'utf8'), reader);
const R = reader.R2F2D;
function layer(offsets) {
  const xs = offsets.map(i => i % 4), ys = offsets.map(i => Math.floor(i / 4));
  return { offsets: Uint32Array.from(offsets), depths: Float32Array.from(offsets, () => 1),
    bbox: offsets.length ? { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) } : null,
    stats: { valid: offsets.length, max: 1, mean: 1, min: 1, negative: 0 } };
}
for (const [name, frames] of [
  ['receding flood', [[0, 3, 5, 10, 12, 15], [5, 10], [5]]],
  ['disjoint flood footprints', [[0, 1], [14, 15], [4]]],
  ['completely dry frame', [[0, 15], [], [5], []]],
]) {
  test(`2D canvas clears previous pixels: ${name}`, () => {
    const pixels = new Uint32Array(16), canvas = new Uint32Array(16);
    const layers = frames.map(layer);
    const context = vm.createContext({
      stack: { nx: 4, ny: 4, flows: frames.map((_, i) => i), flowUnits: 'cfs' },
      layers, shown: null, px: pixels, R2F2D: R,
      rampU32: new Uint32Array(256).fill(0xff123456), maxDepth: 1,
      imageData: { data: new Uint8ClampedArray(pixels.buffer) },
      ctx: { putImageData(_data, _dx, _dy, x, y, w, h) {
        for (let row = y; row < y + h; row++) for (let col = x; col < x + w; col++)
          canvas[row * 4 + col] = pixels[row * 4 + col];
      } },
      performance, timings: {}, ensureLayer() {}, presentCanvas() {},
      fillList() {}, seg() {}, fmt: String, indexBytes: () => 0, byId: () => ({}),
    });
    const src = source('viewer-2d');
    vm.runInContext(fn(src, 'dirtyRect') + '\n' + fn(src, 'render'), context);
    frames.forEach((offsets, index) => {
      context.render(index);
      const expected = new Uint32Array(16);
      offsets.forEach(i => { expected[i] = 0xff123456; });
      assert.deepEqual(canvas, expected, `canvas must match frame ${index}, including cleared pixels`);
    });
  });
}


test('1D: omitted dry raster tiles resolve as transparent PNGs; vector and metadata responses pass through', async () => {
  const src = source('viewer-1d');
  const encoded = src.match(/Uint8Array.from\(atob\("([^"]+)"\)/)[1];
  const png = Buffer.from(encoded, 'base64');
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  const { inflateSync } = await import('node:zlib');
  assert.deepEqual(inflateSync(png.subarray(41, png.length - 16)), Buffer.alloc(5));
  let response = { data: null };
  const ctx = vm.createContext({ emptyRasterTile: new Uint8Array(png),
    protocol: { tile: async () => response } });
  vm.runInContext(fn(src, 'loadPmtilesTile'), ctx);
  assert.deepEqual((await ctx.loadPmtilesTile({}, {})).data, new Uint8Array(png));
  for (const data of [new Uint8Array(), new Uint8Array([1, 2]), { tiles: ['tile'] }]) {
    response = { data };
    assert.equal(await ctx.loadPmtilesTile({}, {}), response);
  }
  ctx.protocol.tile = async () => { throw new Error('network failed'); };
  await assert.rejects(ctx.loadPmtilesTile({}, {}), /network failed/);
});


test('1D: opacity changes affect the displayed frame and are retained at the swap', () => {
  const h = depthHarness();
  h.select(71); h.finish(); h.select(0);
  h.ctx.setDepthOpacity(40, false);
  assert.equal(h.layers.get(h.ctx.displayedDepth.layer).paint['raster-opacity'], 0.4);
  assert.equal(h.layers.get(h.ctx.pendingDepth.layer).paint['raster-opacity'], 0);
  h.finish();
  assert.equal(h.visible()[0].paint['raster-opacity'], 0.4);
});

// A tiny premultiplied-alpha canvas oracle exercises presentation independently
// of WebGL. Endpoint pixels must remain exact, including newly dry cells.
function transitionHarness() {
  function canvas(values) {
    const c = { width: 2, height: 1, pixels: Float64Array.from(values) };
    c.ctx = { globalAlpha: 1, globalCompositeOperation: 'source-over',
      clearRect() { c.pixels.fill(0); },
      drawImage(src) {
        for (let i = 0; i < 8; i += 4) {
          const alpha = src.pixels[i + 3] * this.globalAlpha;
          for (let k = 0; k < 4; k++) {
            const value = src.pixels[i + k] * this.globalAlpha;
            if (this.globalCompositeOperation === 'copy') c.pixels[i + k] = value;
            else if (this.globalCompositeOperation === 'lighter') c.pixels[i + k] += value;
            else c.pixels[i + k] = value + c.pixels[i + k] * (1 - alpha);
          }
        }
      },
    };
    return c;
  }
  const old = [1, 0, 0, 1, 0, 0, 1, 1];
  const next = [0, 1, 0, 1, 0, 0, 0, 0];
  const target = canvas(next), display = canvas(old), from = canvas(new Array(8).fill(0));
  let now = 0, serial = 0, uploads = 0, paused = false;
  const frames = new Map(), renders = [];
  const checkbox = { checked: true }, motion = { matches: false };
  const source = { play() { paused = false; }, pause() { paused = true; } };
  const ctx = vm.createContext({
    canvas: target, displayCanvas: display, displayCtx: display.ctx,
    fromCanvas: from, fromCtx: from.ctx, transitionFrame: 0, transitionEpoch: 0, canvasRevision: 0,
    TRANSITION_MS: 180, performance: { now: () => now },
    byId: () => checkbox, window: { matchMedia: () => motion },
    requestAnimationFrame(fn) { frames.set(++serial, fn); return serial; },
    cancelAnimationFrame(id) { frames.delete(id); },
    map: { getSource: () => source, once: (_event, fn) => renders.push(fn), triggerRepaint() { uploads++; } },
  });
  const src = sourceText();
  vm.runInContext(['pushCanvas', 'cancelTransition', 'presentCanvas'].map(n => fn(src, n)).join('\n'), ctx);
  function sourceText() { return readFileSync(new URL('../src/viewer-2d/app.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n'); }
  return { ctx, target, display, old, next, checkbox, motion, frames, renders,
    paused: () => paused, uploads: () => uploads,
    tick(time) { now = time; const queued = [...frames.values()]; frames.clear(); queued.forEach(f => f(time)); },
  };
}

test('2D dissolve preserves shared wet pixels and ends exactly at the new wet/dry footprint', () => {
  const h = transitionHarness();
  h.ctx.presentCanvas(true);
  assert.deepEqual([...h.display.pixels], h.old);
  h.tick(90);
  assert.deepEqual([...h.display.pixels], [0.5, 0.5, 0, 1, 0, 0, 0.5, 0.5]);
  assert.equal(h.paused(), false);
  h.tick(180);
  assert.deepEqual([...h.display.pixels], h.next);
  assert.equal(h.frames.size, 0);
  h.renders.forEach(f => f());
  assert.equal(h.paused(), true);
});

test('2D rapid input starts from the visible blend and cancels obsolete animation', () => {
  const h = transitionHarness();
  h.ctx.presentCanvas(true); h.tick(90);
  const partial = [...h.display.pixels];
  const stale = [...h.frames.values()][0];
  h.target.pixels.fill(0);
  h.ctx.presentCanvas(true);
  assert.deepEqual([...h.display.pixels], partial);
  stale(180);
  assert.deepEqual([...h.display.pixels], partial);
  h.tick(270);
  assert.deepEqual([...h.display.pixels], new Array(8).fill(0));
});

test('2D reduced motion and smoothing-off copy exact frames without animation', () => {
  for (const reduced of [false, true]) {
    const h = transitionHarness();
    h.motion.matches = reduced; h.checkbox.checked = reduced;
    h.ctx.presentCanvas(true);
    assert.deepEqual([...h.display.pixels], h.next);
    assert.equal(h.frames.size, 0);
  }
});

test('2D an obsolete upload callback cannot pause the next dissolve', () => {
  const h = transitionHarness();
  h.ctx.presentCanvas(false);
  const oldPause = h.renders[0];
  h.ctx.presentCanvas(true);
  oldPause();
  assert.equal(h.paused(), false);
  h.ctx.cancelTransition();
  assert.equal(h.frames.size, 0);
  assert.equal(h.paused(), true);
});
