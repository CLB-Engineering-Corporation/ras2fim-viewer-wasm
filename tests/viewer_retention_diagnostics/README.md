# Isolated decoder retention diagnostic

This is a bounded headless diagnostic, not a product lifecycle change or physical-display acceptance. It reads the viewer worktree without modifying it. Requires Node, Windows PowerShell/CIM and installed Playwright browsers. No builds or extra packages.

```powershell
node tests/viewer_retention_diagnostics/run.mjs
# Optional independent engine run, after the previous engine has exited:
$env:ENGINE='chromium'
$env:DIAGNOSTIC_OUT='.terrio-validation/retention-diagnostics-chromium'
node tests/viewer_retention_diagnostics/run.mjs
```

Options: VIEWER_ROOT, DIAGNOSTIC_SITE (packaged site override), PLAYWRIGHT_MODULE, ENGINE (default webkit), CYCLES (20), DECODERS (terrio-slices,h5wasm), MODES (reuse-decode,fresh-init,fresh-decode), DIAGNOSTIC_OUT. Use 20–40 cycles. Evidence defaults to ignored .terrio-validation/retention-diagnostics/raw.json. Each run records SHA256/length of the fixture, actual decoder artifacts, reader, adapter and diagnostic worker, browser version, timestamps, duration, every operation and process sample. No route interception, no forced GC.

The server serves a blank same-origin page and pinned viewer assets. There is no MapLibre, GL, map basemap or application layer cache. Every control gets a new context. The same 12,309-byte receding.nc buffer is retained once on the page and cloned to each worker request. This substitutes for the requested 14,826-byte packed fixture, which was not found in the viewer validation fixture directory. Both decoders use the viewer reader/adapter and build all three sparse layers, discard the outputs locally, free Terrio handles and drop the stack. All decode cycles must return identical layer count/output byte count/checksum. Output is never posted to or retained by the page.

Controls:

- reuse-decode: one worker/module for 20 fixed-input decode/build/dispose cycles.
- fresh-init: create and initialize a worker/module, then terminate, on each cycle; never open the fixture.
- fresh-decode: create, initialize, decode/build/dispose and terminate a worker on each cycle.

Samples every five cycles follow a 300 ms idle delay. At completion terminate any remaining worker, clear the page input, wait 1.5 seconds, sample; close context and sample again. Memory is the summed WorkingSet64 of launch-server PID plus recursive Win32_Process descendants, with all rows retained. Shared pages can be counted repeatedly. These are neither private bytes nor peak/JS heap. The worker count is an explicit page reference count, not a GC reachability proof. Termination is asynchronous and the fixed idle delays do not prove all internal destruction has completed. Checksums establish repeatability, not independent numerical conformance.

No production worker reuse is proposed by this diagnostic. A reuse control isolates lifetime effects; shipping it would require cancellation, generation isolation, failure recovery and concurrency review.
