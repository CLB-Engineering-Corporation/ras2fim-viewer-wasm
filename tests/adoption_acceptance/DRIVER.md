# Adoption driver handoff

Integrate this directory beside the existing adoption harness; import
`driver.mjs` through its `run.mjs`. Defaults use VIEWER_ROOT's
`.terrio-validation/adoption-site`; override with ADOPTION_SITE or config.site.
PLAYWRIGHT_MODULE overrides the primary Terrio validation-tools installation.
The caller supplies exact independently frozen expectedPins and a fresh out.
No full run or browser smoke was performed: adoption-site does not yet exist.

Response instrumentation derives from tests/viewer_acceptance/run.mjs and the
existing tests/terrio-differential.mjs in the viewer checkout. Product sources
are read only. Exact anchor drift fails closed. Source pins describe original
packaged bytes, not transformed responses. Browser network cache stays enabled.
The synthetic receding and badshape fixtures come from VIEWER_ROOT's existing
.terrio-validation/fixtures. Blank basemap responses are same-origin.

Independent h5wasm versus Terrio sliced preflight executes separately for each
engine, on each rotation input, before measured contexts. It compares typed
native arrays including fill values, metadata, sparse indices and dense RGBA.
It records input SHA256, completed comparison counts and candidate pins.
Per-load numeric counts represent actual cell-mask and sparse depth comparisons
against that load's decoded values; per-load RGBA counts come from every byte of
worker dense-versus-sparse painting. They are NOT fresh independent decoder
comparisons. Coordinator audit must explicitly require completed preflight rows
for every engine/input, exact sourcePins/inputPins association, positive native
and RGBA comparisons, zero differences, and the per-load sparse/RGBA checks.
Do not present the current audit's generic numericCompared check as proof of
per-load independent double decoding. Verification adds a full cell scan; compare
its timing overhead before interpreting historical baseline regressions.

Handle instrumentation counts actual dataset/array/slice acquire/free and file
open/close events (including the adapter facade file), not module memory size.
Worker identity is generated within each actual worker; module identity and init
count change on actual ready messages. Main Worker construction/termination
counters override worker-side state. No dense arrays are sent to the main page.
Done checks both handles and released stack/reference. Fetch cancellation waits
for an observed held HTTP request; preparation cancellation waits at a test-only
worker barrier before its first layer. This tests supersession at preparation
entry, not interruption of synchronous preparation. Every pushCanvas call and
settled map callback is captured. Malformed errors are allowed only for the
explicit badshape epoch at decode; console/page/HTTP/MapLibre failures still fail.

Focused validation: `node --test viewer_adoption/tests/adoption_acceptance/driver.test.mjs`.
Tests verify current worker/adapter/netcdf anchors and transformed JS parsing,
fail-closed drift, and side-effect-free driver import. Browser behavior and
cross-engine recovery require coordinator smoke/review before the long run.
Existing decoder differential and injected-failure lifecycle gates remain required.
