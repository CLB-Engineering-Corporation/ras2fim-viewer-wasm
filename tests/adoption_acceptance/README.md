# Persistent-worker adoption acceptance

Owned new files only; integration mapping: copy `adoption_acceptance/` unchanged
into the viewer repository as `tests/adoption_acceptance/`. No product source or
default selection changes are included. `oracle/` is a snapshot of the existing
viewer acceptance audit/contracts/error observer/tests from the read-only viewer
checkout supplied for this assignment. `fixture.mjs` derives synthetic tests from
that audit fixture. These are test utilities, not new decoding algorithms.

## Reproduce locally

Node 22+; no dependency installation or Rust build:

```powershell
node adoption_acceptance/baseline.mjs D:/CLB-Dev/wt/ras2fim-viewer-terrio-20261102 adoption_acceptance/baseline.json
node --test adoption_acceptance/audit.test.mjs adoption_acceptance/oracle/audit.test.mjs
# After coordinator integrates and supplies the browser driver below:
node adoption_acceptance/run.mjs C:/path/to/integrated-driver.mjs C:/path/to/candidate-pins.json C:/path/to/new-evidence-directory
# Independent re-audit (no browser):
node adoption_acceptance/audit.mjs C:/path/to/new-evidence-directory/raw.json adoption_acceptance/baseline.json C:/path/to/candidate-pins.json
```

After integration prepend `tests/` to harness paths. Output directory must not
exist. Freeze candidate SHA256 pins independently from the packaged site before
running: app.js, netcdf.js, netcdf-worker.js, terrio-adapter.js and
vendor/terrio/terrio_bg.wasm, using existing acceptance sourcePins key conventions.
Run exact viewer Node tests, Python tests, decoder differential fixtures/pilot and
worker-lifecycle jobs against that same candidate before browser acceptance.
Never substitute archived report pins or report success from these harness tests
for browser acceptance.

## Baseline and margins

`baseline.json` is regenerated from hash-checked final quiet, final WebKit stress,
and final frozen retention raw reports. Original raw data stays read-only outside
Git; only aggregated thresholds and diagnostic endpoints are tracked. The older
all-engine long report uses different WASM and is deliberately excluded.

Each engine/decoder/metric limit is ceil(final-quiet p95 * 1.5 + 100 ms).
All-engine RSS endpoint limits are ceil(final-quiet maximum * 1.25 + 128 MiB),
except WebKit uses its final 80-cycle stress maximum with the same margin.
Numeric per-metric limits and measured baseline values are in baseline.json.
These explicit reviewable margins accommodate bounded measurement variation;
they are not statistical confidence bounds, a device RAM budget, true peaks,
private heap, leak freedom, or an unrestricted session plateau. A failure needs
investigation; do not automatically relax limits. Quiet timing has only three
first-render samples per phase. Fixed decoder order remains a limitation.

Raw retention reuse-decode samples/endpoints are retained in baseline.json to
preserve the control evidence: init-only fresh modules can grow working sets.
Repeat existing `tests/viewer_retention_diagnostics/run.mjs` for each engine with
VIEWER_ROOT, DIAGNOSTIC_SITE pointing to the candidate, ENGINE, CYCLES=40,
MODES=reuse-decode,fresh-init,fresh-decode and a fresh DIAGNOSTIC_OUT. Audit its
pins and zero-error completion separately; it is a diagnostic control, not proof
that the product viewer reuses workers. Product reuse is gated below instead.
No forced GC, cache-disabling route interception, concurrent heavy builds or
claims of physical display timing. Summed Windows browser-descendant working
sets may count shared pages repeatedly. WebKit on Windows does not certify Safari.

## Required coordinator interface (pending, not assumed implemented)

The driver module exports async `runAcceptance(config)` and returns the existing
viewer_acceptance raw report shape. run.mjs requests all three engines, both
h5wasm and terrio-slices, three fresh-context trials, cold then warm navigation,
80 stream cycles per decoder/trial, existing four-stream rotation and three
slider positions per cycle, verify=true. This yields 1,440 stream switches,
4,320 sliders, 36 first renders and 360 dry frames. Preserve source pin recording,
cache behavior, ordinary console/page/request/HTTP/MapLibre error failures,
per-cycle browser descendant RSS and completion only after browser/server cleanup.
The driver should checkpoint raw evidence on failure. It must use the real
integrated viewer, not the isolated diagnostic worker. Existing run.mjs rewrites
private app anchors; adapt that instrumentation in coordinator-owned code or
expose a test-only observer. This harness does not depend on those private names.

Additional report fields:

- `adoption: {schema: 1, stress: [...]}`.
- Every first-render and stream-render sample: `verification` containing integer
  numericCompared > 0, numericDifferences = 0, rgbaBytesCompared > 0,
  rgbaDifferences = 0, from the existing independent decoder/dense oracle.
  Compare actual values/masks and every RGBA channel; counts must represent
  completed comparisons, not status flags or checksum self-consistency.
- Every stream sample `state.reuse`: nonempty stable workerId/moduleId strings,
  workerCreates=1, moduleInitializations=1, liveWorkers=1, liveHandles=0 measured
  after complete decode/disposal. Identities/counters reset only on navigation;
  hold identities through the warm-navigation stream session and recovery stress.
- stress rows: engine, decoder, trial, scenario, iteration (0..19), started and
  settled monotonic milliseconds, failedGeneration, recoveredGeneration,
  outcome, paintedGenerations, liveHandles, reuse and verification. Twenty rows
  of each scenario per engine/decoder/trial (1,080 rows). `cancel-fetch` must
  supersede an in-flight fetch, `cancel-prepare` an in-flight preparation;
  synchronize on an observed phase barrier, never sleep and assume cancellation.
  Both settle as cancelled within 60 seconds. `malformed` submits the known bad
  shape fixture, settles rejected and immediately reloads valid data. Recoveries
  render a newer generation with exact comparisons and zero handles using the
  same worker/module. Record all painted generations during the failure/recovery
  interval; none may equal the failed generation. Scope expected malformed errors
  to the exact dispatched request, never suppress ordinary errors globally.

The producer remains responsible for trustworthy phase barriers, numeric oracle
execution and exhaustive paint-event capture. Audit counters are not independent
proof those probes were implemented correctly. Keep the existing lifecycle tests
for injected prepare/decode failures and zero handles as additional required gates.

## Current result and limits

Only synthetic harness tests and historical baseline recomputation were run in
this assignment. No browser run, source default switch, deployment, upstream
change, NAS write, heavy build, push or PR. New adoption acceptance is pending the
coordinator driver/interface and candidate package. The runner intentionally
fails without that driver rather than exercising the old product as new evidence.
