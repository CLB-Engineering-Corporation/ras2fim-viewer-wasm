/* Public controller/worker contract. All inputs are synthetic; this suite does
 * not qualify h5wasm, a real data product, canvas placement or hydraulics. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const readerSource = readFileSync(new URL("../src/viewer-2d/netcdf.js", import.meta.url), "utf8");
const workerSource = readFileSync(new URL("../src/viewer-2d/netcdf-worker.js", import.meta.url), "utf8");
function reader() {
  const ctx = { performance }; ctx.self = ctx;
  vm.runInNewContext(readerSource, ctx);
  return ctx.R2F2D;
}
const R = reader();
const plain = (v) => JSON.parse(JSON.stringify(v));

function fixture({ mode = "depth", units = "feet", crs = "EPSG:3857" } = {}) {
  const datasets = {
    [mode]: { shape: [3, 1, 4], attrs: { units, _FillValue: 65535, scale_factor: 0.1 },
      value: Uint16Array.from([10, 0, 65535, 20, 0, 30, 0, 65535, 10, 0, 0, 65535]) },
    flow: { shape: [3], attrs: { units: "cfs" }, value: [90, 10, 50] },
    spatial_ref: { attrs: { spatial_ref: crs, GeoTransform: "-1000 3 0 1000 0 -3" } },
  };
  if (mode === "wsel") datasets.terrain = {
    shape: [1, 4], attrs: { units, scale_factor: 0.1, _FillValue: 65535 },
    value: Uint16Array.from([0, 0, 0, 0]),
  };
  const file = { attrs: { "01_type": mode }, keys: () => Object.keys(datasets),
    get: (name) => datasets[name], close: () => { file.closed = true; } };
  const h5 = { FS: { writeFile() {}, unlink() { h5.unlinked = true; } }, File: function () { return file; } };
  return { h5, file, datasets, read: () => R.readStack(h5, new ArrayBuffer(1)) };
}

test("reader preserves source order, units, corners and explicit mask metadata", () => {
  const f = fixture(); const stack = f.read();
  assert.deepEqual(plain(stack.flows), [90, 10, 50]);
  assert.equal(stack.units, "feet"); assert.equal(stack.depthUnits, "ft");
  assert.equal(stack.crs, "EPSG:3857"); assert.equal(stack.flowUnits, "cfs");
  assert.match(stack.maskPolicy, /wet > 0/);
  assert.deepEqual(plain(stack.coordinates[0]), plain(R.mercatorToLonLat(-1000, 1000)));
  assert.ok(f.file.closed && f.h5.unlinked);
});

test("reader accepts declared root EPSG authority in WKT1 and WKT2", () => {
  for (const crs of ['PROJCS["grid",AUTHORITY["EPSG","3857"]]', 'PROJCRS["grid",ID["EPSG",3857]]']) {
    assert.equal(fixture({ crs }).read().crs, "EPSG:3857");
  }
  const f = fixture(); delete f.datasets.spatial_ref.attrs.spatial_ref;
  f.datasets.spatial_ref.attrs.epsg_code = 3857;
  assert.equal(f.read().crs, "EPSG:3857");
});

test("reader rejects missing, conflicting and non-Mercator CRS before reading arrays", () => {
  for (const crs of [null, "EPSG:5070", 'PROJCRS["other",BASEGEOGCRS[ID["EPSG",3857]],ID["EPSG",5070]]']) {
    const f = fixture({ crs });
    Object.defineProperty(f.datasets.depth, "value", { get() { assert.fail("array decoded before CRS check"); } });
    assert.throws(f.read, /CRS/);
    assert.ok(f.file.closed && f.h5.unlinked);
  }
  const f = fixture(); f.datasets.spatial_ref.attrs.crs_wkt = "EPSG:5070";
  assert.throws(f.read, /CRS/);
});

test("reader never guesses vertical or flow units and rejects mismatched WSEL terrain", () => {
  for (const units of [null, "", "furlongs"]) assert.throws(fixture({ units }).read, /units/);
  const f = fixture({ units: "metres" }); delete f.datasets.flow.attrs.units;
  assert.equal(f.read().depthUnits, "m"); assert.equal(f.read().flowUnits, null);
  const w = fixture({ mode: "wsel" }); w.datasets.terrain.attrs.units = "m";
  assert.throws(w.read, /units do not match/);
  delete w.datasets.terrain.attrs.units;
  assert.throws(w.read, /units/);
});

test("reader rejects invalid shape, flow, packing and grid orientation with cleanup", () => {
  const mutations = [
    (d) => { d.depth.shape = [0, 1, 4]; },
    (d) => { d.depth.value = [1]; },
    (d) => { d.depth.attrs.scale_factor = -1; },
    (d) => { d.depth.attrs.add_offset = Infinity; },
    (d) => { d.flow.value = [NaN, 2, 3]; },
    (d) => { delete d.flow; },
    (d) => { d.spatial_ref.attrs.GeoTransform = "0 -3 0 0 0 -3"; },
    (d) => { d.spatial_ref.attrs.GeoTransform = "0 3 1 0 0 -3"; },
  ];
  for (const mutate of mutations) {
    const f = fixture(); mutate(f.datasets); assert.throws(f.read);
    assert.ok(f.file.closed && f.h5.unlinked);
  }
});

test("extent uses exactly positive offsets; dry, negative, nonfinite and fill stay transparent", () => {
  const stack = { mode: "depth", nx: 7, ny: 1, scale: 1, offset: 0,
    hasFill: true, fill: -9999, wsel: [2, 0, -1, -9999, NaN, Infinity, -Infinity] };
  const layer = R.buildIndex(stack, 0); const px = new Uint32Array(7);
  assert.equal(R.paintExtent(px, layer, 0xff123456), 1);
  assert.deepEqual(Array.from(px), [0xff123456, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(plain(R.layerCells(stack, layer.stats)), { total: 7, wet: 1, validDry: 2, nodata: 4 });
  assert.equal(layer.stats.wet, 3, "historical wet alias remains the signed valid population");
  R.clearSparse(px, layer); assert.ok(px.every((v) => v === 0));
});

test("float WSEL nonfinite inputs agree in dense/sparse masks and signed counts", () => {
  const stack = { mode: "wsel", nx: 5, ny: 1, scale: 1, offset: 0, fastPath: true,
    terrainScale: 1, terrainOffset: 0, hasFill: false, terrainHasFill: false,
    wsel: [1, NaN, Infinity, -Infinity, 1], terrain: [0, 0, 0, 0, NaN] };
  const layer = R.buildIndex(stack, 0); const data = new Uint8ClampedArray(20);
  assert.equal(R.paintDense(stack, 0, { data }, R.buildRamp([[0, 1, 2, 3], [1, 3, 4, 5]]), 2), 1);
  assert.equal(layer.stats.valid, 1); assert.equal(R.depthStats(stack, 0).valid, 1);
  assert.deepEqual(Array.from(data).filter((_, i) => i % 4 === 3), [255, 0, 0, 0, 0]);
});

function controller(options = {}) {
  const workers = [], frames = [], statuses = [];
  const session = R.createSession({
    workerFactory() {
      const w = { sent: [], terminated: 0, postMessage(m) { this.sent.push(m); },
        terminate() { this.terminated++; } };
      workers.push(w); return w;
    },
    onStatus: (s) => statuses.push(s),
    onFrame: (f) => frames.push({ ...f, data: Array.from(f.data) }), ...options,
  });
  const send = (w, m) => w.onmessage({ data: { epoch: w.sent[0].epoch, ...m } });
  const meta = { protocol: 1, nx: 4, ny: 1, nFlow: 3, flows: [90, 10, 50],
    flowUnits: "cfs", depthUnits: "ft", crs: "EPSG:3857" };
  const layer = (index, values) => {
    const stack = { mode: "depth", nx: 4, ny: 1, scale: 1, offset: 0,
      hasFill: true, fill: -9999, wsel: values };
    return { type: "layer", index, ...R.buildIndex(stack, 0) };
  };
  function prepare() {
    const w = workers.at(-1); send(w, { type: "meta", meta });
    send(w, layer(2, [1, 0, 0, -9999]));
    send(w, layer(0, [10, 0, -1, -9999])); // deepest flow is NOT the final index
    send(w, layer(1, [0, 2, 0, -9999]));
    send(w, { type: "done" }); return w;
  }
  return { session, workers, frames, statuses, send, meta, layer, prepare };
}

test("session fixes the actual library scale, preserves source indices and reuses all prepared rungs", () => {
  const c = controller(); c.session.load("public.nc", { index: 1 });
  const w = c.workers[0]; c.send(w, { type: "meta", meta: c.meta });
  c.send(w, c.layer(2, [1, 0, 0, -9999]));
  c.send(w, c.layer(1, [0, 2, 0, -9999]));
  assert.equal(c.frames.length, 0, "depth waits for library maximum");
  c.send(w, c.layer(0, [10, 0, -1, -9999])); c.send(w, { type: "done" });
  assert.equal(c.frames[0].maxDepth, 10); assert.equal(c.frames[0].flow, 10);
  assert.equal(c.frames[0].index, 1); const messages = w.sent.length;
  c.session.setMode("extent");
  assert.equal(c.frames.at(-1).mode, "extent");
  assert.deepEqual(c.frames.at(-1).data.filter((_, i) => i % 4 === 3), [0, 255, 0, 0]);
  c.session.select(0); c.session.select(1); c.session.setMode("depth");
  assert.equal(w.sent.length, messages, "prepared selection/mode toggle sends no worker requests");
  assert.equal(c.workers.length, 1);
  assert.deepEqual(c.frames.at(-1).data, c.frames[0].data);
  assert.deepEqual(plain(c.frames.at(-1).cells), { total: 4, wet: 1, validDry: 2, nodata: 1 });
});

test("pending selection is superseded; late out-of-order layers cannot select an older flow", () => {
  const c = controller(); c.session.setMode("extent"); c.session.load("public.nc");
  const w = c.workers[0]; c.send(w, { type: "meta", meta: c.meta });
  c.session.select(0); c.session.select(1);
  c.send(w, c.layer(0, [1, 0, 0, -9999])); assert.equal(c.frames.length, 0);
  c.session.setMode("depth"); c.send(w, c.layer(1, [0, 2, 0, -9999]));
  assert.equal(c.frames.length, 0);
  c.session.setMode("extent"); assert.equal(c.frames.at(-1).index, 1);
  c.session.select(0); c.send(w, c.layer(2, [0, 0, 3, -9999]));
  c.send(w, { type: "done" }); assert.equal(c.frames.at(-1).index, 0);
  assert.equal(c.session.getStatus().index, 0);
});

test("receding, disjoint, all-dry and all-nodata frames clear previous wet pixels", () => {
  const c = controller(); c.session.setMode("extent"); c.session.load("public.nc");
  const w = c.workers[0]; c.send(w, { type: "meta", meta: c.meta });
  c.send(w, c.layer(2, [3, 3, 0, -9999]));
  c.send(w, c.layer(1, [0, 0, 2, -9999])); c.session.select(1);
  assert.deepEqual(c.frames.at(-1).data.filter((_, i) => i % 4 === 3), [0, 0, 255, 0]);
  c.send(w, c.layer(0, [0, -1, 0, -9999])); c.session.select(0);
  assert.ok(c.frames.at(-1).data.every((v) => v === 0));
  assert.equal(c.frames.at(-1).cells.validDry, 3);
  c.send(w, c.layer(0, [-9999, -9999, -9999, -9999]));
  assert.ok(c.frames.at(-1).data.every((v) => v === 0));
  assert.equal(c.frames.at(-1).cells.nodata, 4);
});

test("reach changes, cancellation and repeat destroy ignore queued old messages and errors", () => {
  const c = controller(); c.session.load("first.nc");
  const first = c.workers[0], stale = first.onmessage, staleError = first.onerror;
  c.session.load("second.nc"); assert.equal(first.terminated, 1);
  stale({ data: { type: "meta", epoch: first.sent[0].epoch, meta: c.meta } });
  staleError({ message: "old failure" }); assert.equal(c.session.getStatus().phase, "loading");
  const second = c.prepare(), queued = second.onmessage;
  const n = c.frames.length; c.session.cancel();
  queued({ data: { type: "error", epoch: second.sent[0].epoch, message: "stale" } });
  assert.equal(c.session.getStatus().phase, "idle"); assert.equal(c.frames.length, n);
  c.session.load("third.nc"); const third = c.workers[2], late = third.onmessage;
  c.session.destroy(); c.session.destroy(); c.session.cancel();
  assert.equal(third.terminated, 1); assert.equal(c.session.getStatus().phase, "destroyed");
  late({ data: { type: "meta", epoch: third.sent[0].epoch, meta: c.meta } });
  assert.throws(() => c.session.load("after.nc"), /destroyed/);
  assert.throws(() => c.session.select(0), /destroyed/);
  assert.throws(() => c.session.setMode("extent"), /destroyed/);
});

test("session rejects invalid indices/modes and reports worker/protocol/incomplete preparation failures", () => {
  const c = controller();
  for (const index of [-1, 0.5, NaN, "1"]) {
    assert.throws(() => c.session.load("public.nc", { index }), /index/);
    assert.throws(() => c.session.select(index), /index/);
  }
  assert.throws(() => c.session.setMode("unknown"), /mode/);
  c.session.load("public.nc"); const w = c.workers[0];
  c.send(w, { type: "meta", meta: { ...c.meta, protocol: 99 } });
  assert.equal(c.session.getStatus().phase, "error"); assert.equal(w.terminated, 1);
  c.session.load("public.nc"); const w2 = c.workers[1];
  c.send(w2, { type: "meta", meta: c.meta });
  assert.throws(() => c.session.select(3), /index/);
  c.send(w2, { type: "done" }); assert.match(c.session.getStatus().error, /missing layers/);
  c.session.load("public.nc"); c.workers[2].onerror({ message: "startup failed" });
  assert.equal(c.session.getStatus().error, "startup failed");
});

test("status callbacks can cancel synchronously without leaking the old ready frame", () => {
  let session;
  const c = controller({ onStatus(s) { if (s.phase === "ready") session.cancel(); } });
  session = c.session; session.load("public.nc"); c.prepare();
  assert.equal(c.frames.length, 0); assert.equal(session.getStatus().phase, "idle");
});

test("worker startup and malformed metadata become explicit session errors", () => {
  const c = controller({ workerFactory() { throw new Error("worker unavailable"); } });
  c.session.load("public.nc"); assert.equal(c.session.getStatus().error, "worker unavailable");
  for (const meta of [null, { protocol: 1 }, { protocol: 1, nx: 4, ny: 1, nFlow: 2, flows: [1] }]) {
    const s = controller(); s.session.load("public.nc");
    s.send(s.workers[0], { type: "meta", meta });
    assert.equal(s.session.getStatus().phase, "error");
  }
});

function workerHarness() {
  const messages = [], tasks = [], requests = [];
  const ctx = {
    performance, AbortController, Uint8ClampedArray, Uint32Array,
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
      if (buffer[0] === 99) throw new Error("unsupported CRS");
      return { ...fixture().read(), wsel: Uint16Array.from([10, 0, 65535, 20, 0, 30, 0, 65535, 10, 0, 0, 65535]) };
    } },
  };
  ctx.self = ctx; vm.runInNewContext(workerSource, ctx);
  return { messages, tasks, requests, send: (data) => ctx.onmessage({ data }),
    async respond(index, data = [0]) {
      requests[index].resolve({ ok: true, arrayBuffer: async () => data });
      await new Promise(setImmediate);
    },
    drain() { while (tasks.length) tasks.shift()(); },
  };
}

test("unchanged v1 worker protocol sends metadata before transferable sparse layers, never dense arrays", async () => {
  const w = workerHarness(); w.send({ type: "load", epoch: 5, url: "public.nc" });
  await w.respond(0); w.send({ type: "prioritize", epoch: 5, index: 0 }); w.drain();
  const messages = w.messages.filter((m) => m.epoch === 5);
  const meta = messages.find((m) => m.type === "meta");
  assert.equal(meta.meta.protocol, 1); assert.equal(meta.meta.wsel, undefined); assert.equal(meta.meta.terrain, undefined);
  const layers = messages.filter((m) => m.type === "layer");
  assert.deepEqual(layers.map((m) => m.index), [2, 0, 1]);
  assert.ok(messages.indexOf(meta) < messages.indexOf(layers[0]));
  assert.ok(layers.every((m) => m.offsets instanceof Uint32Array && m.depths instanceof Float32Array));
  assert.equal(messages.filter((m) => m.type === "done").length, 1);
});

test("worker load replacement aborts fetch, ignores late fetch and queued old preparation", async () => {
  const w = workerHarness(); w.send({ type: "load", epoch: 1, url: "first.nc" });
  await w.respond(0); assert.equal(w.tasks.length, 1);
  w.send({ type: "load", epoch: 2, url: "second.nc" });
  assert.equal(w.requests[0].options.signal.aborted, true);
  w.drain(); assert.equal(w.messages.filter((m) => m.type === "done").length, 0);
  w.send({ type: "load", epoch: 3, url: "third.nc" });
  await w.respond(1); assert.equal(w.messages.some((m) => m.type === "meta" && m.epoch === 2), false);
  await w.respond(2); w.drain();
  assert.equal(w.messages.filter((m) => m.type === "done" && m.epoch === 3).length, 1);
});

test("worker cancel invalidates preparation and fetch and reports decode errors at the correct phase", async () => {
  const w = workerHarness(); w.send({ type: "load", epoch: 1, url: "first.nc" });
  await w.respond(0); const count = w.messages.length;
  w.send({ type: "cancel", epoch: 1 }); w.drain(); assert.equal(w.messages.length, count);
  w.send({ type: "load", epoch: 2, url: "second.nc" });
  w.send({ type: "cancel", epoch: 1 }); assert.equal(w.requests[1].options.signal.aborted, false);
  await w.respond(1, [99]);
  assert.equal(w.messages.at(-1).type, "error"); assert.equal(w.messages.at(-1).phase, "decode");
  w.send({ type: "load", epoch: 3, url: "third.nc" }); w.send({ type: "cancel", epoch: 3 });
  await w.respond(2); assert.equal(w.messages.some((m) => m.type === "meta" && m.epoch === 3), false);
});

test("private worker generations reject old fetches and preparation even when a client reuses an epoch", async () => {
  const w = workerHarness();
  w.send({ type: "load", epoch: 1, url: "first.nc" });
  w.send({ type: "load", epoch: 1, url: "second.nc" });
  await w.respond(0); assert.equal(w.messages.filter((m) => m.type === "meta").length, 0);
  await w.respond(1); assert.equal(w.tasks.length, 1);
  w.send({ type: "load", epoch: 1, url: "third.nc" });
  w.drain(); assert.equal(w.messages.filter((m) => m.type === "done").length, 0);
  await w.respond(2); w.drain();
  assert.equal(w.messages.filter((m) => m.type === "done").length, 1);
});


test("indexed reader never reads the full depth cube and closes idempotently", () => {
  const f = fixture(); const raw = f.datasets.depth.value; const calls = [];
  Object.defineProperty(f.datasets.depth, "value", { get() { assert.fail("full cube decoded"); } });
  f.datasets.depth.slice = (ranges) => {
    calls.push(plain(ranges)); return raw.slice(ranges[0][0] * 4, ranges[0][1] * 4);
  };
  const stack = R.openStack(f.h5, new ArrayBuffer(1));
  assert.equal(stack.wsel, null); assert.equal(f.file.closed, undefined);
  for (const index of [2, 0, 1]) {
    const layer = R.buildIndex(stack, index);
    assert.equal(layer.stats.valid, 3);
  }
  assert.deepEqual(calls, [[[2, 3], [], []], [[0, 1], [], []], [[1, 2], [], []]]);
  assert.throws(() => stack.readLayer(-1), /out of range/);
  assert.throws(() => stack.readLayer(3), /out of range/);
  stack.close(); stack.close(); assert.ok(f.file.closed && f.h5.unlinked);
  assert.throws(() => stack.readLayer(0), /closed/);
});

test("profile index semantics and ordered names are explicit without invented discharge", () => {
  const f = fixture();
  f.datasets.flow = { attrs: { units: "1", axis_semantics: "profile_index" }, value: [0, 1, 2] };
  f.datasets.profile = { value: ["p03", "p01", "p02"] };
  const stack = f.read();
  assert.equal(stack.flowUnits, "1"); assert.equal(stack.axisSemantics, "profile_index");
  assert.deepEqual(plain(stack.profileNames), ["p03", "p01", "p02"]);
  f.datasets.flow.value = [0, 2, 1]; assert.throws(f.read, /zero-based/);
  f.datasets.flow.value = [0, 1, 2]; f.datasets.flow.attrs.units = "cfs";
  assert.throws(f.read, /units 1/);
  f.datasets.flow.attrs.units = "1"; f.datasets.profile.value = ["p03"];
  assert.throws(f.read, /profile must/);
});


test("CF grid_mapping uses its named variable and never falls back on invalid declarations", () => {
  const f = fixture(); f.datasets.depth.attrs.grid_mapping = "crs";
  f.datasets.crs = f.datasets.spatial_ref; delete f.datasets.spatial_ref;
  assert.equal(f.read().crs, "EPSG:3857");
  for (const mapping of ["missing", "", "crs: x y", "../spatial_ref", 17]) {
    const bad = fixture(); bad.datasets.depth.attrs.grid_mapping = mapping;
    assert.throws(bad.read, /grid_mapping/);
    assert.ok(bad.file.closed && bad.h5.unlinked);
  }
});
