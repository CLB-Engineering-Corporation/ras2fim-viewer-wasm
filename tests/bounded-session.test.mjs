/* Opt-in bounded session and worker protocol 2. Inputs are synthetic; this does
 * not qualify a large real reach, a browser heap or HTTP range transport. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const readerSource = readFileSync(new URL("../src/viewer-2d/netcdf.js", import.meta.url), "utf8");
const workerSource = readFileSync(new URL("../src/viewer-2d/netcdf-worker.js", import.meta.url), "utf8");
const ctx = { performance }; ctx.self = ctx;
vm.runInNewContext(readerSource, ctx);
const R = ctx.R2F2D;

const BOUNDED = { displayMaxDepth: 20, displayRangeSource: "catalog depth_display_max",
  maxCompressedBytes: 1e6 };
const META = { protocol: 2, onDemand: true, nx: 4, ny: 1, nFlow: 5, flows: [0, 1, 2, 3, 4],
  flowUnits: "1", axisSemantics: "profile_index", depthUnits: "ft", crs: "EPSG:3857" };
const VALUES = [[1, 0, -1, -9999], [0, 2, 0, -9999], [40, 0, 0, -9999], [0, 0, 3, 3], [-9999, 0, 0, 0]];

function controller(bounded = BOUNDED, extra = {}) {
  const workers = [], frames = [], statuses = [];
  const session = R.createSession({
    bounded,
    workerFactory() {
      const w = { sent: [], terminated: 0, postMessage(m) { this.sent.push(m); },
        terminate() { this.terminated++; } };
      workers.push(w); return w;
    },
    onStatus: (s) => statuses.push(s),
    onFrame: (f) => frames.push({ ...f, data: Array.from(f.data) }), ...extra,
  });
  const w = () => workers.at(-1);
  const send = (m, worker = w()) => worker.onmessage({ data: { epoch: worker.sent[0].epoch, ...m } });
  const requests = (worker = w()) => worker.sent.filter((m) => m.type === "request");
  /** Answer a request the way the worker would, from the synthetic profile. */
  const answer = (req, worker = w()) => {
    const stack = { mode: "depth", nx: 4, ny: 1, scale: 1, offset: 0, hasFill: true, fill: -9999,
      wsel: VALUES[req.index] };
    send({ type: "layer", index: req.index, request: req.request, ...R.buildIndex(stack, 0) }, worker);
  };
  return { session, workers, frames, statuses, w, send, requests, answer };
}
const alpha = (f) => f.data.filter((_, i) => i % 4 === 3);

test("bounded options are validated and the default session is untouched", () => {
  const factory = () => ({ postMessage() {}, terminate() {} });
  for (const bounded of [{}, { ...BOUNDED, displayMaxDepth: 0 }, { ...BOUNDED, displayMaxDepth: NaN },
    { ...BOUNDED, cacheSize: 0 }, { ...BOUNDED, cacheSize: 17 }, { ...BOUNDED, cacheSize: 1.5 },
    { ...BOUNDED, maxCompressedBytes: undefined }, { ...BOUNDED, maxPlaneCells: -1 }, "yes"]) {
    assert.throws(() => R.createSession({ workerFactory: factory, bounded }), /bounded/);
  }
  const old = controller(null); old.session.load("old.nc");
  assert.deepEqual(Object.keys(old.w().sent[0]).sort(), ["epoch", "rampStops", "type", "url"]);
  assert.equal(old.session.getStatus().bounded, undefined);
});

test("bounded load negotiates protocol 2 and rejects a v1 worker explicitly", () => {
  const c = controller(); c.session.load("reach.nc");
  const start = c.w().sent[0];
  assert.equal(start.protocol, 2); assert.equal(start.onDemand, true);
  assert.equal(start.maxCompressedBytes, 1e6); assert.equal(start.maxPlaneCells, 33554432);
  c.send({ type: "meta", meta: { ...META, protocol: 1, onDemand: undefined } });
  assert.equal(c.session.getStatus().phase, "error");
  assert.match(c.session.getStatus().error, /protocol 2/); assert.equal(c.w().terminated, 1);
});

test("depth shows the selected profile immediately against the fixed display range", () => {
  const c = controller(); c.session.load("reach.nc", { index: 2 });
  c.send({ type: "meta", meta: META });
  assert.deepEqual(c.requests().map((m) => m.index), [2], "only the selected profile is requested");
  c.answer(c.requests()[0]);
  const f = c.frames.at(-1);
  assert.equal(f.index, 2); assert.equal(f.mode, "depth");
  assert.equal(f.maxDepth, 20, "display range, not the profile maximum");
  assert.deepEqual({ ...f.displayRange }, { min: 0, max: 20, units: "ft", source: "catalog depth_display_max" });
  assert.equal(f.stats.max, 40, "scientific statistics are reported unclamped");
  assert.deepEqual(alpha(f), [255, 0, 0, 0]);
  assert.deepEqual({ ...f.cells }, { total: 4, wet: 1, validDry: 2, nodata: 1 });
  assert.equal(c.session.getStatus().complete, false);
  // A display range above every profile still paints with the same ramp slot rule.
  const top = R.buildRampU32(R.buildRamp([[0, 234, 243, 251], [0.25, 158, 202, 225],
    [0.5, 66, 146, 198], [0.75, 8, 81, 156], [1, 8, 48, 107]]))[255];
  assert.equal(new Uint32Array(Uint8ClampedArray.from(f.data).buffer)[0], top, "40 ft clamps at slot 255");
});

test("LRU never retains more than cacheSize profiles and reuses cached ones without the worker", () => {
  const c = controller({ ...BOUNDED, cacheSize: 2 }); c.session.load("reach.nc", { index: 0 });
  c.send({ type: "meta", meta: META }); c.answer(c.requests().at(-1));
  for (const i of [1, 2, 3, 4]) {
    c.session.select(i); c.answer(c.requests().at(-1));
    const s = c.session.getStatus();
    assert.ok(s.bounded.cached.length <= 2 && s.prepared <= 2, `cache bounded after ${i}`);
    assert.equal(s.bounded.cached.at(-1), i);
  }
  assert.deepEqual([...c.session.getStatus().bounded.cached], [3, 4]);
  const n = c.w().sent.length;
  c.session.select(3); c.session.setMode("extent"); c.session.setMode("depth"); c.session.select(4);
  assert.equal(c.w().sent.length, n, "cached selection and mode toggles send nothing");
  c.session.select(0); assert.equal(c.w().sent.length, n + 1, "evicted profile is decoded again");
  assert.equal(c.session.getStatus().phase, "preparing");
  c.answer(c.requests().at(-1)); assert.deepEqual([...c.session.getStatus().bounded.cached], [4, 0]);
});

test("cacheSize 1 keeps only the displayed profile and still clears the previous footprint", () => {
  const c = controller({ ...BOUNDED, cacheSize: 1 }); c.session.setMode("extent");
  c.session.load("reach.nc", { index: 3 }); c.send({ type: "meta", meta: META });
  c.answer(c.requests().at(-1)); assert.deepEqual(alpha(c.frames.at(-1)), [0, 0, 255, 255]);
  c.session.select(1); assert.deepEqual([...c.session.getStatus().bounded.cached], [3], "shown stays until replaced");
  c.answer(c.requests().at(-1));
  assert.deepEqual(alpha(c.frames.at(-1)), [0, 255, 0, 0]);
  assert.deepEqual([...c.session.getStatus().bounded.cached], [1]);
  c.session.select(4); c.answer(c.requests().at(-1));
  assert.ok(alpha(c.frames.at(-1)).every((a) => a === 0), "all dry/nodata profile is transparent");
  assert.deepEqual({ ...c.frames.at(-1).cells }, { total: 4, wet: 0, validDry: 3, nodata: 1 });
});

test("superseded, repeated and stale responses never produce frames or cache entries", () => {
  const c = controller(); c.session.load("reach.nc", { index: 0 });
  c.send({ type: "meta", meta: META }); const first = c.requests()[0];
  c.session.select(0); assert.equal(c.requests().length, 1, "in-flight reselect sends nothing");
  c.session.select(1); c.session.select(2); const [, r1, r2] = c.requests();
  c.answer(first); c.answer(r1); assert.equal(c.frames.length, 0);
  assert.deepEqual([...c.session.getStatus().bounded.cached], []);
  c.answer(r2); assert.equal(c.frames.at(-1).index, 2);
  c.answer(r2); assert.equal(c.frames.length, 1, "duplicate response ignored");
  // Selecting a cached profile supersedes an outstanding request.
  c.session.select(3); const r3 = c.requests().at(-1); c.session.select(2);
  const frames = c.frames.length; c.answer(r3);
  assert.equal(c.frames.length, frames); assert.deepEqual([...c.session.getStatus().bounded.cached], [2]);
  c.send({ type: "layer", index: 9, request: 99, offsets: new Uint32Array(0), depths: new Float32Array(0),
    stats: { valid: 0, positive: 0 } });
  assert.equal(c.session.getStatus().phase, "ready");
});

test("reach change, cancel and destroy release the cache and ignore late layers", () => {
  const c = controller(); c.session.load("a.nc"); c.send({ type: "meta", meta: META });
  const a = c.w(), ra = c.requests(a)[0]; c.answer(ra, a);
  assert.equal(c.session.getStatus().prepared, 1);
  const stale = a.onmessage; c.session.load("b.nc"); assert.equal(a.terminated, 1);
  assert.deepEqual([...c.session.getStatus().bounded.cached], []);
  stale({ data: { type: "layer", epoch: a.sent[0].epoch, index: 4, request: ra.request } });
  assert.equal(c.session.getStatus().prepared, 0);
  c.send({ type: "meta", meta: META }); const b = c.w(), rb = c.requests(b)[0], late = b.onmessage;
  c.session.cancel(); const n = c.frames.length;
  late({ data: { type: "layer", epoch: b.sent[0].epoch, index: rb.index, request: rb.request,
    offsets: new Uint32Array([0]), depths: new Float32Array([1]), stats: { valid: 1, positive: 1 } } });
  assert.equal(c.frames.length, n); assert.equal(c.session.getStatus().phase, "idle");
  assert.equal(c.session.getStatus().prepared, 0);
  c.session.load("c.nc"); c.session.destroy(); c.session.destroy();
  assert.equal(c.w().terminated, 1); assert.equal(c.session.getStatus().phase, "destroyed");
});

test("worker errors in bounded mode become explicit session errors", () => {
  const c = controller(); c.session.load("big.nc");
  c.send({ type: "error", phase: "fetch", message: "compressed size 9 bytes exceeds maxCompressedBytes 1" });
  assert.equal(c.session.getStatus().phase, "error");
  assert.match(c.session.getStatus().error, /maxCompressedBytes/);
});

/* ---------------- worker protocol 2 ---------------- */

function workerHarness(stackFactory) {
  const messages = [], tasks = [], requests = [], closed = [];
  const wctx = {
    performance, AbortController, Uint8ClampedArray, Uint32Array, Uint8Array,
    h5wasm: { ready: Promise.resolve() },
    importScripts() {},
    MessageChannel: function () {
      this.port1 = {}; this.port2 = { postMessage: () => tasks.push(() => this.port1.onmessage()) };
    },
    postMessage: (m, transfer) => messages.push(structuredClone(m, { transfer })),
    fetch(url, options) {
      return new Promise((resolve, reject) => requests.push({ url, options, resolve, reject }));
    },
    R2F2D: { ...R, openStack(h5, buffer) {
      const values = VALUES.flat();
      const stack = { mode: "depth", nx: 4, ny: 1, nFlow: 5, flows: META.flows, scale: 1, offset: 0,
        hasFill: true, fill: -9999, wsel: null, bytes: buffer.byteLength, decodeMs: 0, ...(stackFactory ? stackFactory() : {}) };
      stack.readLayer = (i) => {
        if (stack.closedFlag) throw new Error("indexed stack is closed");
        if (!(i >= 0 && i < 5)) throw new Error("profile index out of range");
        return { ...stack, readLayer: undefined, wsel: values.slice(i * 4, i * 4 + 4), nFlow: 1 };
      };
      stack.close = () => { stack.closedFlag = true; closed.push(stack); };
      return stack;
    } },
  };
  wctx.self = wctx; vm.runInNewContext(workerSource, wctx);
  return { messages, tasks, requests, closed, send: (data) => wctx.onmessage({ data }),
    async respond(index, response) {
      requests[index].resolve({ ok: true, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(8), ...response });
      await new Promise(setImmediate);
    },
    drain() { while (tasks.length) tasks.shift()(); },
  };
}
const LOAD2 = { type: "load", protocol: 2, onDemand: true, maxCompressedBytes: 100 };

test("protocol 2 worker prepares nothing until asked and coalesces to the latest request", async () => {
  const w = workerHarness(); w.send({ ...LOAD2, epoch: 4, url: "reach.nc" });
  await w.respond(0); w.drain();
  const meta = w.messages.find((m) => m.type === "meta");
  assert.equal(meta.meta.protocol, 2); assert.equal(meta.meta.onDemand, true);
  assert.equal(meta.meta.wsel, undefined);
  assert.equal(w.messages.filter((m) => m.type === "layer" || m.type === "done").length, 0);
  w.send({ type: "request", epoch: 4, index: 0, request: 1 });
  w.send({ type: "request", epoch: 4, index: 3, request: 2 });
  w.send({ type: "request", epoch: 3, index: 1, request: 3 }); // wrong epoch
  w.drain();
  const layers = w.messages.filter((m) => m.type === "layer");
  assert.deepEqual(layers.map((m) => [m.index, m.request]), [[3, 2]]);
  assert.ok(layers[0].offsets instanceof Uint32Array && layers[0].depths instanceof Float32Array);
  assert.deepEqual(Array.from(layers[0].offsets), [2, 3]);
  assert.equal(w.messages.filter((m) => m.type === "done").length, 0);
});

test("a request that arrives before the file is open is served once it opens", async () => {
  const w = workerHarness(); w.send({ ...LOAD2, epoch: 1, url: "reach.nc" });
  w.send({ type: "request", epoch: 1, index: 2, request: 7 });
  await w.respond(0); w.drain();
  assert.deepEqual(w.messages.filter((m) => m.type === "layer").map((m) => m.request), [7]);
});

test("compressed-byte guard fails before buffering on Content-Length and while streaming", async () => {
  const w = workerHarness();
  w.send({ ...LOAD2, epoch: 1, url: "declared.nc" });
  let buffered = false;
  await w.respond(0, { headers: { get: (h) => (h === "Content-Length" ? "500" : null) },
    arrayBuffer: async () => { buffered = true; return new ArrayBuffer(500); } });
  let err = w.messages.at(-1);
  assert.equal(err.type, "error"); assert.equal(err.phase, "fetch"); assert.equal(buffered, false);
  assert.match(err.message, /500 bytes exceeds maxCompressedBytes 100/);

  w.send({ ...LOAD2, epoch: 2, url: "chunked.nc" });
  let reads = 0, cancelled = false;
  await w.respond(1, { body: { getReader: () => ({
    read: async () => (reads++ < 5 ? { done: false, value: new Uint8Array(60) } : { done: true }),
    cancel: () => { cancelled = true; } }) } });
  await new Promise(setImmediate);
  err = w.messages.at(-1);
  assert.equal(err.type, "error"); assert.equal(err.epoch, 2); assert.equal(err.phase, "fetch");
  assert.ok(cancelled && reads === 2, "stream cancelled at the first chunk over the limit");
  assert.equal(w.messages.some((m) => m.type === "meta"), false);

  w.send({ ...LOAD2, epoch: 3, url: "small.nc" });
  await w.respond(2, { body: { getReader: () => { let n = 0; return {
    read: async () => (n++ < 2 ? { done: false, value: new Uint8Array(40) } : { done: true }), cancel() {} }; } } });
  await new Promise(setImmediate);
  assert.equal(w.messages.find((m) => m.type === "meta" && m.epoch === 3).meta.bytes, 80);
});

test("plane guard refuses before any hyperslab and closes the file", async () => {
  const w = workerHarness(); w.send({ ...LOAD2, maxPlaneCells: 3, epoch: 1, url: "wide.nc" });
  await w.respond(0);
  const err = w.messages.at(-1);
  assert.equal(err.type, "error"); assert.equal(err.phase, "decode"); assert.match(err.message, /maxPlaneCells 3/);
  assert.equal(w.closed.length, 1);
});

test("protocol 2 cancel and replacement close the open file and drop pending work", async () => {
  const w = workerHarness(); w.send({ ...LOAD2, epoch: 1, url: "a.nc" });
  await w.respond(0); w.send({ type: "request", epoch: 1, index: 0, request: 1 });
  w.send({ type: "cancel", epoch: 1 }); w.drain();
  assert.equal(w.closed.length, 1); assert.equal(w.messages.some((m) => m.type === "layer"), false);
  w.send({ ...LOAD2, epoch: 2, url: "b.nc" }); await w.respond(1);
  w.send({ type: "request", epoch: 2, index: 1, request: 1 });
  w.send({ type: "load", epoch: 3, url: "v1.nc" }); w.drain();
  assert.equal(w.closed.length, 2); assert.equal(w.messages.some((m) => m.type === "layer"), false);
  await w.respond(2); w.drain();
  const v1 = w.messages.filter((m) => m.epoch === 3);
  assert.equal(v1.find((m) => m.type === "meta").meta.protocol, 1, "a later v1 load is plain v1");
  assert.equal(v1.filter((m) => m.type === "layer").length, 5);
  assert.equal(v1.filter((m) => m.type === "done").length, 1);
});


test("byte budget evicts profiles independently of the count cap", () => {
  const c = controller({ ...BOUNDED, cacheSize: 3, maxCacheBytes: 16 });
  c.session.load("reach.nc", { index: 0 }); c.send({ type: "meta", meta: META });
  c.answer(c.requests().at(-1));
  c.session.select(3); c.answer(c.requests().at(-1));
  const status = c.session.getStatus();
  assert.deepEqual([...status.bounded.cached], [3]);
  assert.equal(status.bounded.cachedBytes, 16);
  assert.equal(status.bounded.maxCacheBytes, 16);
});

test("a single profile above the byte budget fails before display", () => {
  const c = controller({ ...BOUNDED, maxCacheBytes: 8 });
  c.session.load("reach.nc", { index: 3 }); c.send({ type: "meta", meta: META });
  c.answer(c.requests().at(-1));
  assert.equal(c.frames.length, 0);
  assert.match(c.session.getStatus().error, /maxCacheBytes/);
});
