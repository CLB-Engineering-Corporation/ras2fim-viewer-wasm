# Viewer render acceptance

Standalone, read-only viewer acceptance. Run from this checkout (Node 22+):

```powershell
$env:VIEWER_ROOT = 'D:/CLB-Dev/wt/ras2fim-viewer-terrio-20261102'
$env:PLAYWRIGHT_MODULE = 'C:/Users/billk_clb/.t3/worktrees/terrio-wasm-viewer-20261102/feat-wasm-viewer-contributions/target/validation-tools/node_modules/playwright'
node "$env:PLAYWRIGHT_MODULE/cli.js" install firefox webkit
$env:TRIALS = '3'
$env:CYCLES = '20'
$env:DWELL_MS = '500'
node tests/viewer_acceptance/run.mjs
```

The server reads the packaged pilot site, adding the existing receding fixture to
its in-memory manifest. It patches five uniquely asserted app.js anchors in the
HTTP response only; no viewer files change. The basemap URL is rewritten to a same-origin transparent PNG to isolate local
depth rendering without request interception. Verification remains enabled, default
smoothing remains enabled. Real small/depth, large WSEL, small WSEL, and synthetic
receding streams rotate. Every cycle selects dry/low, high, and middle flows.

First-render time starts at navigation's performance time origin and ends at the
MapLibre render callback following the final canvas revision, with the depth
layer present and source loaded. Interaction time starts immediately before DOM
input dispatch and ends at that same milestone, after the default dissolve.
It measures a completed MapLibre render, not physical scanout/compositor display
or a human slider drag. Samples retain painted counts, including zero for dry
frames. This is headless CLI acceptance; document.hidden is recorded but is not
a foreground/shared-UI claim. First-prepared timings are retained separately in
worker done messages and are never substituted for rendering.

Cold means fresh browser context (HTTP/module state); warm means the next
navigation in that context. Neither clears OS file caches or restarts the browser
process. Workers respawn on every stream switch, as in the unmodified viewer.
Three independent contexts per decoder, each with cold/warm navigation and 20
switch cycles, exercise retention. One browser engine runs at a time.

`target/viewer-acceptance/raw.json` is checkpointed after every cycle, including
raw samples and counts/median/nearest-rank p95 by engine, decoder, metric and
cold/warm phase. Browser launch failures and rendering timeouts are errors and
make the command fail. `run.log` and `install.log` capture execution output when
redirected as in the handoff. Increase CYCLES/DWELL_MS for longer observation.

RSS samples enumerate only the launched browser server PID and its descendants,
using Windows CIM parent IDs plus Get-Process WorkingSet64. Per-process values
permit browser/renderer/GPU comparison; summing working sets may double count
shared pages. These are endpoint samples, not peak RSS, private bytes or live
heap. WASM capacity comes separately from actual worker done timings; capacity
is a high-water allocation and cannot establish leak freedom. No forced GC is
used. This finite test cannot prove absence of leaks.

Coordinator integration: copy this directory into viewer/tests/viewer_acceptance
and invoke the script with VIEWER_ROOT set explicitly and a local ACCEPTANCE_OUT.
Only this directory belongs in the source commit; target evidence stays local.

Audit the completed run (fails on missing cycles, engines, dry rendered frames,
RSS samples, or browser errors):

```powershell
node tests/viewer_acceptance/audit.mjs target/viewer-acceptance/raw.json
```

The audit writes `raw.summary.json` with timing counts/median/p95, RSS endpoint
range and first/last, WASM capacity and retained sparse-array bytes separately.
Do not interpret first-to-last RSS differences as leak slopes: stream sizes,
process lifetime, allocator retention and shared working sets affect them.
Archived initial-run packaged WASM SHA256 (not the final package):
`DD196F4B6B38347C92E2548054F4146E7BCCF206559A4787F76F227A27DFA7E6`
(source scientific fork 7f09be44ff95937cf66801da730d2b17e7d9d440).

All browser errors fail the runner and audit. The test response rewrites the basemap URL to a same-origin transparent image.
This isolates local depth rendering without WebKit CORS/Blob errors from
cross-origin request interception. The earlier standalone evidence had one such deliberately aborted
request; retain that evidence separately rather than treating it as a clean run.

The audit requires exactly Chromium, Firefox and WebKit, unique trial/phase and
trial/cycle sample keys, three distinct slider positions per cycle, completed
render milestones, and one nonempty process-RSS endpoint per cycle. Summaries
are recomputed from raw samples; the runner's cached summaries are not trusted.
`node --test tests/viewer_acceptance/audit.test.mjs` covers duplicate/missing
samples and injected ordinary console, page, HTTP and request failures.

Context routing is disabled so the second navigation can use the browser HTTP
cache. The basemap URL alone is rewritten to an absolute URL on the local test
server. The runner waits for MapLibre idle between phases/switches and before
RSS/teardown so cancellation of outstanding basemap fetches cannot contaminate
the application-error gate. Recorded first-render/interaction times still end
at the earlier completed depth render, not the idle barrier. Raw samples retain
dispatch timestamps, generations, canvas revisions, exact input IDs and slider
bounds. The audit checks their consistency and the fixed four-stream rotation
within every trial. The report pins the served app, worker, adapter, reader and
WASM bytes with SHA256. An imported runner or partially completed report is not
an acceptance result; run the separate audit after all engines complete.

Checkpoints always carry `completed: false`. Only successful browser/context and
server cleanup writes `completed: true` with a finish timestamp. The audit
rejects an otherwise complete checkpoint without that final success marker.

Set `ACCEPTANCE_SITE` to a different packaged pilot site when validating a newly
pinned decoder package; the original site is retained by default. The raw source
pins distinguish these runs. `TERRIO_SITE` similarly directs the differential and
worker-lifecycle jobs to a packaged site's reader/module/worker assets while
preserving their existing virtual URLs and fixtures.

The runner also samples process working sets after each context closes, outside
all latency intervals. POST_CLOSE_MS optionally adds a declared 0–5000 ms delay
before that diagnostic sample (default 0). Context-close observations describe a
lifecycle boundary; they do not identify individual allocations or prove GC.
For a separate bounded single-engine stress run, ENGINES=webkit, TRIALS=1,
CYCLES=80 and POST_CLOSE_MS=1000 retain the same exact render/error checks. Such
a report is not the full three-engine audit result and must be labelled as a
single-engine stress experiment.

Audit the 80-cycle single-engine experiment with
`node tests/viewer_acceptance/audit.mjs <raw.json> --webkit-stress`.
This named profile requires WebKit only, at least 80 cycles per decoder, all of
the existing exact sample/render/error/memory checks, and explicit 1000 ms
post-context-close samples. Its output is labelled `bounded-webkit-stress`.
The default full audit still requires all three engines; stress evidence cannot
stand in for that result. Neither profile imposes an unagreed product RAM budget.
