import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));

test("real bundled h5wasm hyperslabs agree with the dense NetCDF mask/depth oracle", {
  skip: !process.env.H5WASM_BUNDLE && "Set H5WASM_BUNDLE to the pinned 0.10.3 IIFE build"
}, async () => {
  const context = { console, process, require: createRequire(import.meta.url),
    __dirname: here, __filename: fileURLToPath(import.meta.url),
    performance, setTimeout, clearTimeout, TextDecoder, TextEncoder,
    URL, WebAssembly, Uint8Array, Uint16Array, Uint32Array, Float32Array,
    ArrayBuffer, Buffer, fetch };
  context.self = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(process.env.H5WASM_BUNDLE, "utf8"), context);
  await context.h5wasm.ready;
  vm.runInContext(readFileSync(join(here, "../src/viewer-2d/netcdf.js"), "utf8"), context);
  const R = context.R2F2D, h5 = context.h5wasm;
  const source = readFileSync(process.env.WRITER_FIXTURE || join(here, "fixtures/indexed-depth.nc"));
  const buffer = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
  const dense = R.readStack(h5, buffer);
  const indexed = R.openStack(h5, buffer);
  assert.equal(indexed.wsel, null);
  assert.equal(indexed.axisSemantics, "profile_index");
  assert.deepEqual(Array.from(indexed.profileNames), ["source-p03", "source-p01", "source-p02"]);
  for (const i of [2, 0, 1]) {
    const part = indexed.readLayer(i);
    assert.equal(part.wsel.length, 6);
    const expected = R.buildIndex(dense, i), actual = R.buildIndex(part, 0);
    assert.deepEqual(Array.from(actual.offsets), Array.from(expected.offsets));
    assert.deepEqual(Array.from(actual.depths), Array.from(expected.depths));
    assert.deepEqual(JSON.parse(JSON.stringify(actual.stats)), JSON.parse(JSON.stringify(expected.stats)));
  }
  indexed.close(); indexed.close();
  assert.throws(() => indexed.readLayer(0), /closed/);
});

/* Bounded session end to end on the actual runtime: the real worker source and
   the real session share one context, bridged by structured clones that
   transfer the sparse buffers exactly as postMessage would. */
async function wasmContext() {
  const context = { console, process, require: createRequire(import.meta.url),
    __dirname: here, __filename: fileURLToPath(import.meta.url),
    performance, setTimeout, clearTimeout, TextDecoder, TextEncoder,
    URL, WebAssembly, Uint8Array, Uint16Array, Uint32Array, Float32Array, Uint8ClampedArray,
    ArrayBuffer, Buffer, AbortController, importScripts() {},
    MessageChannel: function () {
      this.port1 = {};
      this.port2 = { postMessage: () => setImmediate(() => this.port1.onmessage()) };
    } };
  context.self = context;
  vm.createContext(context);
  vm.runInContext(readFileSync(process.env.H5WASM_BUNDLE, "utf8"), context);
  await context.h5wasm.ready;
  vm.runInContext(readFileSync(join(here, "../src/viewer-2d/netcdf.js"), "utf8"), context);
  return { context };
}

test("real h5wasm bounded session decodes only selected profiles and matches the dense oracle", {
  skip: !process.env.H5WASM_BUNDLE && "Set H5WASM_BUNDLE to the pinned 0.10.3 IIFE build"
}, async () => {
  const { context } = await wasmContext();
  const R = context.R2F2D, h5 = context.h5wasm;
  const source = readFileSync(process.env.WRITER_FIXTURE || join(here, "fixtures/indexed-depth.nc"));
  const bytes = () => source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
  const fetched = [];
  context.fetch = async (url) => { fetched.push(url); return { ok: true,
    headers: { get: (h) => (h === "Content-Length" ? String(source.byteLength) : null) },
    arrayBuffer: async () => bytes() }; };
  const slices = [];
  const fakeWorker = { postMessage: (m) => context.onmessage({ data: structuredClone(m) }), terminate() {} };
  context.postMessage = (m, transfer) => {
    if (m.epoch === -1) return;
    const data = structuredClone(m, { transfer });
    if (fakeWorker.onmessage) fakeWorker.onmessage({ data });
  };
  vm.runInContext(readFileSync(join(here, "../src/viewer-2d/netcdf-worker.js"), "utf8"), context);
  // Count hyperslabs on the real dataset object the worker opens.
  const open = R.openStack;
  context.R2F2D.openStack = (h, b, n) => { const s = open(h, b, n); const read = s.readLayer;
    s.readLayer = (i) => { slices.push(i); return read(i); }; return s; };

  const frames = [], statuses = [];
  const session = R.createSession({ workerFactory: () => fakeWorker,
    bounded: { displayMaxDepth: 5, cacheSize: 2, maxCompressedBytes: source.byteLength },
    onFrame: (f) => frames.push({ ...f, data: Uint8ClampedArray.from(f.data) }),
    onStatus: (s) => statuses.push(s) });
  const settle = async () => { for (let i = 0; i < 20; i += 1) await new Promise(setImmediate); };

  session.load("synthetic.nc", { index: 1 }); await settle();
  assert.equal(frames.length, 1); assert.deepEqual(slices, [1], "one hyperslab, no all-profile scan");
  const meta = frames[0].meta;
  assert.equal(meta.protocol, 2); assert.equal(meta.axisSemantics, "profile_index");
  assert.deepEqual(Array.from(meta.profileNames), ["source-p03", "source-p01", "source-p02"]);

  const dense = R.readStack(h5, bytes());
  const rampU32 = R.buildRampU32(R.buildRamp([[0, 234, 243, 251], [0.25, 158, 202, 225],
    [0.5, 66, 146, 198], [0.75, 8, 81, 156], [1, 8, 48, 107]]));
  const expected = (i) => { const px = new Uint32Array(6); R.paintSparse(px, R.buildIndex(dense, i), rampU32, 5);
    return Array.from(new Uint8ClampedArray(px.buffer)); };
  const want = (i) => JSON.parse(JSON.stringify(R.buildIndex(dense, i).stats));
  assert.deepEqual(Array.from(frames[0].data), expected(1));
  assert.deepEqual(JSON.parse(JSON.stringify(frames[0].stats)), want(1));

  session.select(0); await settle();
  session.select(2); await settle();
  assert.deepEqual(Array.from(frames.at(-1).data), expected(2));
  assert.deepEqual(Array.from(session.getStatus().bounded.cached), [0, 2]);
  session.select(0); await settle();
  assert.deepEqual(slices, [1, 0, 2], "cached profile reused without a new hyperslab");
  assert.deepEqual(Array.from(frames.at(-1).data), expected(0));
  session.setMode("extent"); await settle();
  assert.deepEqual(Array.from(frames.at(-1).data.filter((_, i) => i % 4 === 3)),
    Array.from(R.buildIndex(dense, 0).offsets).reduce((a, o) => { a[o] = 255; return a; }, [0, 0, 0, 0, 0, 0]));
  assert.equal(fetched.length, 1, "whole compressed file fetched once per reach");
  session.destroy();

  // The compressed-byte guard fails explicitly on the same real worker.
  const errors = R.createSession({ workerFactory: () => fakeWorker,
    bounded: { displayMaxDepth: 5, maxCompressedBytes: source.byteLength - 1 } });
  errors.load("synthetic.nc"); await settle();
  assert.match(errors.getStatus().error, /exceeds maxCompressedBytes/);
  // Replacing the reach closed the previous file; nothing is left in MEMFS.
  assert.equal(h5.FS.readdir("/").filter((n) => n.startsWith("stack-")).length, 0);
});


test("committed writer fixture preserves declared CRS, values, masks and order", {
  skip: !process.env.H5WASM_BUNDLE && "Set H5WASM_BUNDLE to the pinned runtime"
}, async () => {
  const { context } = await wasmContext();
  const source = readFileSync(join(here, "fixtures/writer-depth.nc"));
  const s = context.R2F2D.openStack(context.h5wasm,
    source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength));
  assert.equal(s.crs, "EPSG:3857");
  assert.deepEqual(Array.from(s.profileNames), ["source-p03", "source-p01", "source-p02"]);
  const a = Array.from(s.readLayer(0).wsel);
  assert.deepEqual(a.slice(0, 2), [0, 1.25]);
  assert.ok(Number.isNaN(a[2]));
  assert.deepEqual(a.slice(3), [-2, 2.5, 0]);
  s.close();
});
