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
    once(event, action) { map.on(event, action); },
  };
  const ctx = vm.createContext({ map, ...extra });
  const readiness = src.match(/  var styleReady = false;\n  map.on\("style.load",[^\n]+/);
  vm.runInContext((readiness ? readiness[0] : '') + '\n' + fn(src, 'whenMapReady'), ctx);
  return { ctx, map, src, emit(event) { for (const f of events.get(event) || []) f(); events.delete(event); } };
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

test('1D: rapid profile changes replace the source with the latest archive while loading', () => {
  const sources = new Map(), layers = new Map();
  const h = styleHarness('viewer-1d', {
    activeModel: {}, activeProfile: 0,
    byId: id => id === 'depth-visible' ? { checked: true } : { value: '85' },
    depthSourceSpec: (_model, profile) => ({ kind: 'pmtiles', url: `profile-${profile}.pmtiles` }),
    showRasterUnavailable() { assert.fail('depth should be available'); },
  });
  Object.assign(h.map, {
    getLayer: id => layers.get(id), removeLayer: id => layers.delete(id),
    getSource: id => sources.get(id), removeSource: id => sources.delete(id),
    addSource: (id, spec) => sources.set(id, spec),
    addLayer: spec => layers.set(spec.id, spec),
    getStyle: () => ({ layers: [{ id: 'fimvec-cross-sections' }] }),
  });
  vm.runInContext(['styleLayers', 'removeDepthLayer', 'firstVectorLayerId', 'updateDepthLayer']
    .map(name => fn(h.src, name)).join('\n'), h.ctx);
  h.emit('style.load');
  for (const index of [71, 0, 45, 3]) {
    h.ctx.activeProfile = index;
    h.ctx.updateDepthLayer();
    assert.equal(sources.get('depth-tiles')?.url, `profile-${index}.pmtiles`);
    assert.equal(h.ctx.firstVectorLayerId(), 'fimvec-cross-sections');
    assert.equal(layers.size, 1);
  }
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
      performance, timings: {}, ensureLayer() {}, pushCanvas() {},
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

