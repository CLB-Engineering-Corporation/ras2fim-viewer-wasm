# Diagnostic conclusion — 2026-11-02

## Decision for integration

Do not classify the completed rendering benchmark as an application leak, and do not grant unconditional long-session WebKit retention acceptance. Functional/render acceptance remains supported by the existing strict benchmark; retention has a demonstrated WebKit/module-lifecycle contribution and a remaining full-viewer gate. No narrow application defect or justified product patch was identified here.

The controlled evidence establishes that decoded stacks, retained sparse layers, large source buffers and GL textures are **not necessary** for substantial WebKit growth: repeated fresh worker/module initialization alone reproduces it. It does not establish that this mechanism explains every byte in the full viewer. The bounded init-only test plateaus; that cannot be extrapolated to an unbounded session or to the full viewer's larger continuously rising checkpoints.

## Evidence

Completed WebKit 27.2 run: `target/retention-diagnostics-complete/raw.json`, 120 operations (20 cycles × 2 decoders × 3 controls), 56.126 seconds. All decode cycles yielded three layers, 6,128 sparse bytes, checksum 1258265.21875, with no errors. No forced GC. Samples below are summed descendant working sets in MiB, rounded; cycle numbers are zero-based.

| Decoder / control | Before | Cycle 4 | Cycle 19 | After termination + input clear | Context closed |
|---|---:|---:|---:|---:|---:|
| Terrio reuse decode | 181 | 283 | 280 | 228 | 67 |
| Terrio fresh init only | 182 | 310 | 423 | 421 | 67 |
| Terrio fresh decode/free | 183 | 306 | 416 | 414 | 67 |
| h5wasm reuse decode | 183 | 272 | 275 | 228 | 67 |
| h5wasm fresh init only | 183 | 228 | 232 | 232 | 67 |
| h5wasm fresh decode/free | 183 | 234 | 236 | 234 | 67 |

Terrio WASM capacity was constant at 4,456,448 bytes for decode and 4,390,912 for init-only. h5wasm capacity was constant at 19,333,120 bytes. This rules out *growing reported linear-memory capacity* in these controls, not internal allocation retention or JS/engine memory growth.

A separate complete 40-cycle Terrio fresh-init run is in `target/retention-diagnostics-init40/raw.json`: cycles 4/9/14/19/24/29/34/39 were 300/392/412/417/424/413/413/416 MiB. After input clear/termination: 414; context close: 67. This is a bounded plateau with no file open or decode. A previous partial run also reproduced Terrio's three controls, but failed on a diagnostic h5wasm API mismatch before its h5 controls; retain `target/retention-diagnostics/raw.json` as failed evidence, not acceptance. The complete run fixes the harness by passing self.h5wasm to the reader after awaiting its ready module, matching the production worker.

Exact artifact pins and per-process samples are in each raw file. Terrio WASM SHA256 is dd196f4b6b38347c92e2548054f4146e7bccf206559a4787f76f227a27dfa7e6 (14,238,241 bytes); JS f210e463bd9cf30cce3e9caafd92c13b3fc58e78a1db7bc65fd9a7067dc8b830. h5wasm JS 29a56a9e4576957b8ce0cce4fdc41527f72539fc6b062f74985882fce06f3952. Fixture 524b643971a4cb0f8e87bab055b29e734d629896ae21633eae98f4e3ff75f001 (12,309 bytes). The named 14,826-byte fixture was unavailable in the inspected fixture directory.

## What the controls demonstrate

Fresh controls explicitly terminate every worker; the page keeps zero worker references between cycles. They still retain a higher process working set. Worker termination alone therefore does not promptly restore the pre-init working set in WebKit. Context close does restore a low working set, often by discarding a process, so it proves a useful lifecycle containment boundary, not GC collection of a specific allocation.

Reused-worker Terrio decode/free stays near h5wasm's reused-worker working set, with stable capacity and identical output. This is evidence against an accumulating live decoded stack under these inputs. Source inspection also confirms adapter handles are freed and the product worker drops dense arrays after preparation; this diagnostic is not a reachability audit of the full application.

The full viewer creates a new worker per load (`pilot-site/app.js` lines 331–332). Its existing benchmark therefore exercises the lifecycle that produces this effect in the minimized test. No viewer files were changed. Module initialization includes WASM compilation/instantiation, worker machinery and imports. This experiment cannot distinguish JIT caches, delayed destruction, allocator arenas or other engine bookkeeping; calling a specific one the cause would exceed the evidence.

## Remaining acceptance gate and mitigation

Before claiming unrestricted WebKit retention acceptance, run a matched full-viewer test long enough to show whether the large-input working set plateaus, with an agreed operational memory ceiling and session length. Retain explicit stream/state checkpoints and context-close samples. The existing 20-cycle contexts rising toward 828–899 MiB do not yet establish that ceiling. If the plateau exceeds the supported budget, reject long-session WebKit acceptance even though correctness passes.

Context replacement/closing is the **demonstrated** memory containment control here. A reload alone was not measured and must not be claimed equivalent. Worker reuse is only a candidate optimization supported by the minimized control: it needs separate product review and full-viewer cancellation/generation/recovery tests before adoption. No worker-reuse patch was implemented or adopted; adoption requires separate product review and validation. Forced-GC/heap analysis was not needed for this bounded conclusion and was not performed. Firefox was not rerun; its prior mixed-decoder growth remains outside this WebKit-focused attribution.

## Chromium comparison and checks

`target/retention-diagnostics-chromium/raw.json` is the complete same 120-operation comparison, run only after WebKit exited. Chromium fresh Terrio init checkpoints cycle 4 to 19 were 207 to 209 MiB; fresh decode 209 to 211 MiB, with roughly 129–130 MiB after context close. This strengthens attribution to an engine-dependent module/worker lifecycle effect. Absolute browser working sets should not be compared as private memory. Chromium h5wasm controls were likewise stable over this bounded interval.

Validation: both diagnostic JS files passed `node --check`; complete WebKit, 40-cycle init-only and Chromium reports have completed:true. All fixed-input decode signatures matched within/across decoders; the run asserts consistency within each control. The abandoned report is explicitly completed:false. No Rust build or product files were touched; no commit, push or deployment was performed. Only new viewer_retention_diagnostics source/docs and ignored target evidence were written.

Preserved producer evidence lives under
`C:/Users/billk_clb/.t3/worktrees/terrio-wasm-viewer-20261102/t3-0a692b73/target/`.
The source copied into viewer/tests resolves its worker relative to its own module
and supports DIAGNOSTIC_SITE for a newly pinned packaged site. Those path-only
changes do not retroactively change the preserved measurements.
