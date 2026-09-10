/* The browser reader, tested without a browser.
 *
 * src/viewer-2d/netcdf.js is deliberately DOM-free and takes plain objects, so
 * every claim the viewer rests on can be checked in Node with no h5wasm, no
 * fixture NetCDF and no headless Chrome. That is the property that makes CI
 * cheap enough to be worth having, and it is worth protecting: if this file
 * ever needs a browser to run, the reader has grown a dependency it should not
 * have.
 *
 *     node --test tests/
 *
 * The reader is loaded unmodified, through a vm context with `self` bound the
 * way a worker binds it. No build step, no module shim in the shipped source.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");

function loadReader() {
  const src = readFileSync(join(repo, "src", "viewer-2d", "netcdf.js"), "utf8");
  const sandbox = {};
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: "netcdf.js" });
  assert.ok(sandbox.R2F2D, "netcdf.js did not publish R2F2D onto `self`");
  return sandbox.R2F2D;
}

const R = loadReader();
const CASES = JSON.parse(
  readFileSync(join(here, "fixtures", "geodesy_cases.json"), "utf8"));

/* --------------------------------------------------------------------------
 * Cross-language parity: the same rules, written twice
 * ----------------------------------------------------------------------- */

test("mercatorToLonLat agrees with pipeline/common/geodesy.py", () => {
  const tol = CASES.mercator_tolerance_deg;
  for (const c of CASES.mercator) {
    const [lon, lat] = R.mercatorToLonLat(c.x, c.y);
    assert.ok(Math.abs(lon - c.lon) <= tol, `${c.name}: lon ${lon} vs ${c.lon}`);
    assert.ok(Math.abs(lat - c.lat) <= tol, `${c.name}: lat ${lat} vs ${c.lat}`);
  }
});

test("parseGeoTransform accepts and rejects exactly what Python does", () => {
  // Field names differ by language on purpose; the fixture stores the Python
  // names and this is the only place that maps them.
  const NAMES = {
    origin_x: "originX", pixel_w: "pixelW", rot_x: "rotX",
    origin_y: "originY", rot_y: "rotY", pixel_h: "pixelH",
  };
  for (const c of CASES.geotransform) {
    const gt = R.parseGeoTransform(c.text);
    assert.equal(gt !== null, c.valid, `${c.name}: validity disagrees`);
    if (!c.valid) continue;
    for (const [py, js] of Object.entries(NAMES)) {
      assert.equal(gt[js], c.parsed[py], `${c.name}: ${js}`);
    }
    const northUp = gt.rotX === 0 && gt.rotY === 0;
    assert.equal(northUp, c.north_up, `${c.name}: north-up disagrees`);
  }
});

test("parseGeoTransform rejects a null or absent transform", () => {
  assert.equal(R.parseGeoTransform(null), null);
  assert.equal(R.parseGeoTransform(undefined), null);
  assert.equal(R.parseGeoTransform(""), null);
});

/* --------------------------------------------------------------------------
 * Synthetic stacks
 *
 * readStack() needs h5wasm; everything downstream of it takes a plain object,
 * so the tests build that object directly. The shape is the reader's real
 * internal contract, and writing it out here is what documents it.
 * ----------------------------------------------------------------------- */

/** A wsel stack whose terrain is packed identically -- the integer fast path. */
function wselStack(nx, ny, layers, { scale = 0.1, offset = 0, fill = 65535 } = {}) {
  const n = nx * ny;
  return {
    mode: "wsel",
    nx, ny, nLayers: layers.length,
    wsel: Uint16Array.from(layers.flat()),
    terrain: new Uint16Array(n),
    scale, offset, hasFill: true, fill,
    terrainScale: scale, terrainOffset: offset, terrainHasFill: true, terrainFill: fill,
    fastPath: true,
  };
}

/** The general path: a depth variable, no terrain subtraction at all. */
function depthStack(nx, ny, layers, { scale = 0.1, offset = 0, fill = 65535 } = {}) {
  return {
    mode: "depth",
    nx, ny, nLayers: layers.length,
    wsel: Uint16Array.from(layers.flat()),
    terrain: null,
    scale, offset, hasFill: true, fill,
    terrainScale: 1, terrainOffset: 0, terrainHasFill: false, terrainFill: NaN,
    fastPath: false,
  };
}

function fakeImageData(nx, ny) {
  const buffer = new ArrayBuffer(nx * ny * 4);
  return { data: new Uint8ClampedArray(buffer), width: nx, height: ny, buffer };
}

const RAMP = R.buildRamp([[0, 8, 81, 156], [0.5, 66, 146, 198], [1, 234, 243, 251]]);
const RAMP_U32 = R.buildRampU32(RAMP);

/** Render one layer both ways and return the two RGBA buffers. */
function renderBothWays(stack, index, maxDepth) {
  const dense = fakeImageData(stack.nx, stack.ny);
  R.paintDense(stack, index, dense, RAMP, maxDepth);

  const sparse = fakeImageData(stack.nx, stack.ny);
  const px = new Uint32Array(sparse.buffer);
  const layer = R.buildIndex(stack, index);
  R.paintSparse(px, layer, RAMP_U32, maxDepth);

  return { dense: new Uint8Array(dense.buffer), sparse: new Uint8Array(sparse.buffer), layer };
}

/* --------------------------------------------------------------------------
 * The oracle. This is the gate on the 16x paint optimisation.
 * ----------------------------------------------------------------------- */

test("sparse paint is byte-identical to the dense reference", () => {
  const nx = 7, ny = 5, n = nx * ny;
  const F = 65535;
  // Terrain is all zero, so raw wsel IS raw depth. Layers cover, in order:
  // all dry, a single wet cell, a full grid, a mixed grid with fill and zero,
  // and a layer that recedes -- which is what caught the "clear once" bug.
  const layers = [
    new Array(n).fill(F),
    Object.assign(new Array(n).fill(F), { 12: 40 }),
    Array.from({ length: n }, (_, i) => i + 1),
    Array.from({ length: n }, (_, i) => (i % 3 === 0 ? F : (i % 5 === 0 ? 0 : i * 2))),
    Array.from({ length: n }, (_, i) => (i < 10 ? 5 : F)),
  ];
  const stack = wselStack(nx, ny, layers);
  for (let i = 0; i < layers.length; i += 1) {
    const { dense, sparse } = renderBothWays(stack, i, 10.0);
    assert.deepEqual(sparse, dense, `layer ${i} differs`);
  }
});

test("sparse paint matches the dense reference on the depth-variable path", () => {
  const nx = 6, ny = 4, n = nx * ny;
  const F = 65535;
  const layers = [
    Array.from({ length: n }, (_, i) => (i % 4 === 0 ? F : i * 3)),
    Array.from({ length: n }, (_, i) => (i % 2 === 0 ? 0 : i)),
  ];
  const stack = depthStack(nx, ny, layers);
  for (let i = 0; i < layers.length; i += 1) {
    const { dense, sparse } = renderBothWays(stack, i, 8.0);
    assert.deepEqual(sparse, dense, `depth layer ${i} differs`);
  }
});

test("an empty layer paints nothing and reports no bbox", () => {
  const nx = 4, ny = 4, n = nx * ny;
  const stack = wselStack(nx, ny, [new Array(n).fill(65535)]);
  const layer = R.buildIndex(stack, 0);
  assert.equal(layer.painted, 0);
  assert.equal(layer.bbox, null);
  assert.equal(layer.stats.valid, 0);
  assert.equal(layer.stats.min, null);
});

/* --------------------------------------------------------------------------
 * Clearing. The plan's D-4 said "clear once, then write only wet cells".
 * ----------------------------------------------------------------------- */

test("clear-then-paint removes water where the flow receded", () => {
  const nx = 5, ny = 1, n = nx * ny;
  const F = 65535;
  const high = [10, 10, 10, 10, 10];        // whole row wet
  const low = [10, 10, F, F, F];            // right half dries out
  const stack = wselStack(nx, ny, [high, low]);

  const image = fakeImageData(nx, ny);
  const px = new Uint32Array(image.buffer);
  const a = R.buildIndex(stack, 0);
  const b = R.buildIndex(stack, 1);

  R.paintSparse(px, a, RAMP_U32, 5.0);
  assert.ok([...px].every((word) => word !== 0), "high flow should wet every cell");

  // The load-bearing order: clear the previously painted set, then paint.
  R.clearSparse(px, a);
  R.paintSparse(px, b, RAMP_U32, 5.0);

  const expected = new Uint8Array(fakeImageData(nx, ny).buffer);
  const reference = fakeImageData(nx, ny);
  R.paintDense(stack, 1, reference, RAMP, 5.0);
  expected.set(new Uint8Array(reference.buffer));
  assert.deepEqual(new Uint8Array(image.buffer), expected,
    "receded cells were left painted");
});

test("painting without clearing leaves stale flooding -- the bug D-4 would have shipped", () => {
  const nx = 5, ny = 1;
  const F = 65535;
  const stack = wselStack(nx, ny, [[10, 10, 10, 10, 10], [10, 10, F, F, F]]);
  const image = fakeImageData(nx, ny);
  const px = new Uint32Array(image.buffer);
  R.paintSparse(px, R.buildIndex(stack, 0), RAMP_U32, 5.0);
  R.paintSparse(px, R.buildIndex(stack, 1), RAMP_U32, 5.0);
  assert.notEqual(px[4], 0,
    "this test documents the wrong behaviour; if it starts failing, paintSparse " +
    "began clearing on its own and clearSparse callers should be revisited");
});

/* --------------------------------------------------------------------------
 * The two "wet" populations -- F-03, the trap that would have silently
 * redefined the numbers in the panel.
 * ----------------------------------------------------------------------- */

test("buildIndex separates painted cells from the statistics population", () => {
  const nx = 4, ny = 1;
  const F = 65535;
  // Terrain zero, so depth = raw * 0.1: one fill, one exactly zero, two wet.
  const stack = wselStack(nx, ny, [[F, 0, 20, 50]]);
  const layer = R.buildIndex(stack, 0);

  assert.equal(layer.stats.valid, 3, "zero-depth cells are valid data");
  assert.equal(layer.stats.positive, 2, "only cells above terrain are painted");
  assert.equal(layer.painted, 2);
  assert.equal(layer.offsets.length, 2);
  assert.ok(Math.abs(layer.stats.min - 0) < 1e-9);
  assert.ok(Math.abs(layer.stats.max - 5.0) < 1e-9);
  // Mean is over the valid population, not the painted one: (0 + 2 + 5) / 3.
  assert.ok(Math.abs(layer.stats.mean - 7.0 / 3.0) < 1e-9,
    `mean ${layer.stats.mean} was computed over the wrong population`);
});

test("below-terrain cells count as valid, are not painted, and are counted", () => {
  const nx = 3, ny = 1;
  // Terrain at raw 10; wsel below it on the first cell gives a negative depth.
  const stack = wselStack(nx, ny, [[5, 10, 40]]);
  stack.terrain = Uint16Array.from([10, 10, 10]);
  const layer = R.buildIndex(stack, 0);

  assert.equal(layer.stats.valid, 3);
  assert.equal(layer.stats.negative, 1);
  assert.equal(layer.stats.positive, 1);
  assert.ok(layer.stats.min < 0, "a negative depth must survive into the minimum");
});

test("depthStats and buildIndex agree on the same populations", () => {
  const nx = 9, ny = 7, n = nx * ny;
  const F = 65535;
  const layer = Array.from({ length: n }, (_, i) =>
    (i % 7 === 0 ? F : (i % 5 === 0 ? 0 : i)));
  const stack = wselStack(nx, ny, [layer]);
  const stats = R.depthStats(stack, 0);
  const index = R.buildIndex(stack, 0);
  for (const key of ["valid", "positive", "negative"]) {
    assert.equal(index.stats[key], stats[key], `${key} disagrees`);
  }
  assert.ok(Math.abs(index.stats.mean - stats.mean) < 1e-9);
});

/* --------------------------------------------------------------------------
 * Packing. F-01: add_offset was never read, and a missing _FillValue became
 * Number(null) === 0, masking valid terrain at elevation zero.
 * ----------------------------------------------------------------------- */

test("add_offset is applied on the depth path", () => {
  const stack = depthStack(2, 1, [[10, 20]], { scale: 0.1, offset: 100 });
  assert.ok(Math.abs(R.depthAt(stack, 0, 0) - 101.0) < 1e-9);
  assert.ok(Math.abs(R.depthAt(stack, 0, 1) - 102.0) < 1e-9);
});

test("a terrain elevation of exactly zero is data, not nodata", () => {
  // The bug: Number(null) === 0, so an absent _FillValue excluded real ground
  // at elevation zero. hasFill must be false, not "fill happens to be 0".
  const stack = wselStack(2, 1, [[30, 40]]);
  stack.terrainHasFill = false;
  stack.terrainFill = NaN;
  stack.terrain = Uint16Array.from([0, 0]);
  const layer = R.buildIndex(stack, 0);
  assert.equal(layer.stats.valid, 2, "zero-elevation terrain was treated as nodata");
});

test("mismatched packing takes the float path and still matches the reference", () => {
  // R2: when the scales differ, w - t is not a valid integer difference at all.
  const stack = wselStack(6, 3, [Array.from({ length: 18 }, (_, i) => 200 + i * 7)]);
  stack.terrainScale = 0.05;
  stack.terrain = Uint16Array.from(Array.from({ length: 18 }, (_, i) => 100 + i));
  stack.fastPath = false;
  const { dense, sparse } = renderBothWays(stack, 0, 20.0);
  assert.deepEqual(sparse, dense);
});

/* --------------------------------------------------------------------------
 * Ramp packing. R12: the packed-word paint assumes a byte order.
 * ----------------------------------------------------------------------- */

test("buildRampU32 packs words that unpack to the ramp's own bytes", () => {
  const words = R.buildRampU32(RAMP);
  const bytes = new Uint8Array(words.buffer);
  for (const i of [0, 1, 128, 254, 255]) {
    assert.equal(bytes[i * 4], RAMP[i * 4], `slot ${i} red`);
    assert.equal(bytes[i * 4 + 1], RAMP[i * 4 + 1], `slot ${i} green`);
    assert.equal(bytes[i * 4 + 2], RAMP[i * 4 + 2], `slot ${i} blue`);
    assert.equal(bytes[i * 4 + 3], 255, `slot ${i} alpha`);
  }
});

test("buildRamp interpolates between stops and is fully opaque", () => {
  const ramp = R.buildRamp([[0, 0, 0, 0], [1, 255, 255, 255]]);
  assert.equal(ramp[0], 0);
  assert.equal(ramp[255 * 4], 255);
  assert.ok(Math.abs(ramp[128 * 4] - 128) <= 1, "midpoint should be about half");
  for (let i = 0; i < 256; i += 1) assert.equal(ramp[i * 4 + 3], 255);
});

/* --------------------------------------------------------------------------
 * The bounding box drives the dirty-rect upload. A wrong one shows as
 * torn rendering that only appears at certain slider positions.
 * ----------------------------------------------------------------------- */

test("bbox covers exactly the painted cells", () => {
  const nx = 10, ny = 10, n = nx * ny;
  const F = 65535;
  const layer = new Array(n).fill(F);
  for (const [x, y] of [[2, 3], [7, 3], [4, 8]]) layer[y * nx + x] = 25;
  const stack = wselStack(nx, ny, [layer]);
  const index = R.buildIndex(stack, 0);
  assert.equal(index.painted, 3);
  // Field by field, not deepEqual: buildIndex runs in a vm context, so its
  // objects carry that realm's prototype and a strict deep comparison fails on
  // identical values.
  assert.deepEqual(
    { x0: index.bbox.x0, y0: index.bbox.y0, x1: index.bbox.x1, y1: index.bbox.y1 },
    { x0: 2, y0: 3, x1: 7, y1: 8 });
  for (const off of index.offsets) {
    const y = Math.floor(off / nx);
    const x = off - y * nx;
    assert.ok(x >= index.bbox.x0 && x <= index.bbox.x1, `x ${x} outside bbox`);
    assert.ok(y >= index.bbox.y0 && y <= index.bbox.y1, `y ${y} outside bbox`);
  }
});

test("the index grows past its initial capacity without losing cells", () => {
  // Initial capacity is max(1024, n >> 3); a fully wet grid forces the regrow
  // path, and an off-by-one in the copy would drop cells silently.
  const nx = 64, ny = 64, n = nx * ny;
  const stack = wselStack(nx, ny, [Array.from({ length: n }, () => 30)]);
  const index = R.buildIndex(stack, 0);
  assert.equal(index.painted, n);
  assert.equal(index.offsets.length, n);
  const seen = new Set(index.offsets);
  assert.equal(seen.size, n, "duplicate or dropped offsets after regrow");
  assert.equal(Math.min(...index.offsets), 0);
  assert.equal(Math.max(...index.offsets), n - 1);
});

test("offsets and depths are exactly sized so they can be transferred alone", () => {
  // slice(), not subarray(): a subarray shares the grown buffer, and
  // transferring it to the main thread would detach the worker's own copy.
  const stack = wselStack(8, 8, [Array.from({ length: 64 }, (_, i) => (i < 5 ? 20 : 65535))]);
  const index = R.buildIndex(stack, 0);
  assert.equal(index.offsets.byteLength, index.painted * 4);
  assert.equal(index.depths.byteLength, index.painted * 4);
  assert.equal(index.offsets.byteOffset, 0);
  assert.equal(index.offsets.buffer.byteLength, index.painted * 4);
});
