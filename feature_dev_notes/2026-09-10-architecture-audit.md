# Architecture audit — gaps and recommendations

**Date:** 2026-09-10
**Scope:** whole repository — files, module boundaries, naming, API surface, docs
**Model:** `ras-commander`'s structure and its API-consistency auditor
**Status:** gaps identified; nothing changed yet

---

## What ras-commander does that we do not

ras-commander is a Python *library* with a public API, so not every pattern
transfers — static-class enforcement and `@log_call` decorators are answers to
a problem we do not have. Four things do transfer:

| ras-commander | us |
|---|---|
| `.auditor.yaml` — machine-readable conventions **with documented exceptions and rationale** | nothing; conventions live in prose in `AGENTS.md` |
| `.claude/rules/**.md` — one file per convention, loaded by humans and agents alike | nothing |
| Split docs: `README`, `CONTRIBUTING`, `ROADMAP`, `LLM_GUIDE`, `VALIDATION_MATRIX` | one 238-line README doing all of it |
| Subpackages by domain (`hdf/`, `usgs/`, `remote/`, `geom/`) | flat `pipeline/` with 9 unrelated modules |

The transferable idea is not the specific rules. It is that **conventions are
written down as artifacts, with the reasoning attached, and something checks
them.**

---

## Gaps, worst first

### G1 — The repository has three different names

| | |
|---|---|
| Directory on disk | `fim-dashboard` |
| GitHub repository | `ras2fim-viewer-wasm` |
| README title | `ras2fim-viewer-wasm` |

Every path in `CLAUDE.md`, `deploy.example.json` and the notes says
`H:\CLB-Repos\fim-dashboard`. Anyone cloning the public repo gets a directory
that matches none of them.

### G2 — The 1D/2D split is the central architectural fact, and the names hide it

The repository holds two products with different data models, different
delivery mechanisms and no shared code. The naming does not say so, and worse,
it is *asymmetric*: the 2D half is qualified, the 1D half is not.

| Module | Serves | Name implies |
|---|---|---|
| `src/frontend/` | 1D only | *the* frontend |
| `pipeline/build_manifest.py` | 1D only | *the* manifest builder |
| `pipeline/validate_release.py` | 1D only | *the* validator |
| `pipeline/ras2fim_source.py` | 1D only | any ras2fim source |
| `pipeline/cog_postprocess.py` | 1D only | — |
| `pipeline/build_netcdf_manifest.py` | 2D | correctly qualified |
| `pipeline/build_netcdf_site.py` | 2D | correctly qualified |
| `pipeline/validate_netcdf_release.py` | 2D | correctly qualified |

So the layout says "1D is the product, 2D is a variant" — while the repository
is *named after* the 2D wasm path and the live demo is the 2D viewer. A reader
arriving from `ras2fim-viewer-wasm` opens `src/frontend/` and finds the wrong
thing.

### G3 — No tests, no CI

No `tests/`, no `.github/`, no pre-commit. The two validators are *release
gates* over built artifacts, not unit tests, and they cannot run without a
built site.

Pure, fast, obviously testable functions with no test:

| Function | File |
|---|---|
| `mercatorToLonLat` / `_mercator_to_lonlat` | `netcdf.js`, `build_netcdf_manifest.py` |
| `parseGeoTransform` | `netcdf.js` |
| `packing`, `depthAt` | `netcdf.js` |
| `buildIndex` / `paintSparse` vs `paintDense` | `netcdf.js` — an oracle exists but only runs by hand in a browser |
| `_hamilton`, `overview_factors`, `wet_mask` | `cog_postprocess.py` |
| `_model_key`, `_multi_type` | `build_fim_pmtiles.py` |
| `_assert_safe_layout`, `_select_inventory` | `build_netcdf_site.py` — verified once, manually |

Everything proven in this session was proven by hand. None of it is guarded.

### G4 — CLI surface is inconsistent

| Concern | Variants in use |
|---|---|
| Input positional | `unit` (1D) vs `source` (2D) |
| Output flag | `--out` ×4, `--frontend` ×2, `--site` ×1 |
| Machine-readable report | `--report` on 2 of 5 builders |
| Deep mode | `--deep` on validators only |
| Command shape | `cog_postprocess.py` has subcommands; everything else is flat |

Nothing is *wrong*; it is that no two tools agree, so every one must be read
before it can be used.

### G5 — Geodesy is duplicated across four files and two languages

- Web Mercator → lon/lat: `build_netcdf_manifest.py` **and** `netcdf.js`
- `GeoTransform` parsing: `build_manifest.py`, `build_netcdf_manifest.py`,
  `cog_postprocess.py`, `validate_netcdf_release.py`, `netcdf.js`

The JS/Python duplication is unavoidable — different runtimes. The *four Python
copies* are not, and they are exactly the kind of thing that drifts silently:
one of them already rejects rotated grids while another does not check.

### G6 — The two frontends share nothing, and one is undocumented

`src/frontend/app.js` is **990 lines, 48 functions, 0 doc comments**. Both apps
independently implement a collapsible sidebar, a resizer, basemap switching with
transparency, panel accordions, `localStorage` persistence and a feature panel.
`src/frontend` has a 582-line `styles.css`; `src/netcdf-viewer` inlines its
styles in `index.html`.

### G7 — No conventions artifact, and nothing checks the contracts we wrote

`AGENTS.md` lists "contracts that must not drift" in prose — including
`VIEWER_FILES` completeness, sparse-vs-dense agreement, and the two "wet"
populations. Only the first is machine-checked, and only inside
`validate_netcdf_release.py`. The rest rely on someone remembering.

### G8 — No packaging or dependency pinning

No `pyproject.toml`. `requirements.txt` carries good prose about the two
environments but no pins, no lockfile, and no machine-readable statement of
which tool needs which environment — a real trap, because half the pipeline
needs the GDAL bindings and half must *not* run there.

### G9 — Documentation is one file doing five jobs

The README is pitch, rendering contract, repo layout, build recipe, preview
guide, deployment, provenance, licensing and competitive analysis. There is no
`CONTRIBUTING.md`, `ROADMAP.md`, or `CHANGELOG.md`.

### G10 — Minor

- Type-hint coverage uneven: `range_server.py` 1/4, `build_fim_cogs.py` 2/4.
- `serve/preview.py` refuses to start without `manifest.json`, so it cannot
  preview the 2D viewer at all — it is a 1D tool with a general name.
- `serve/dev_tiles.py` is a TiTiler stand-in, a 1D-only concern.

---

## Recommendations

### R1 — Settle on one name

Rename the working directory to `ras2fim-viewer-wasm` to match the repository,
and update the paths in `CLAUDE.md`, `AGENTS.md` and `deploy.example.json`.

### R2 — Restructure around the 1D/2D split, symmetrically

```text
src/
  viewer-1d/          was src/frontend        COG + TiTiler dashboard
  viewer-2d/          was src/netcdf-viewer   NetCDF + wasm viewer
  shared/             NEW  sidebar, basemap, panels, ramp, localStorage
pipeline/
  common/             NEW  geodesy.py, report.py, cli.py
  fim1d/              source.py, cogs.py, pmtiles.py, manifest.py,
                      validate.py, cog_postprocess.py
  fim2d/              manifest.py, site.py, validate.py
serve/
  range_server.py     shared
  titiler_stub.py     was dev_tiles.py, 1D only
  preview.py          teach it to serve either viewer
tests/
  test_geodesy.py  test_source.py  test_site_safety.py  test_netcdf_reader.mjs
```

Every module then reads as `fim1d.manifest` or `fim2d.manifest` — the ambiguity
in G2 disappears because the qualifier is structural rather than remembered.

**Cost:** touches `_viewer_root`, `--frontend` defaults, `.gitignore`,
`fetch-vendor.sh`, both READMEs, `deploy.example.json`, `CLAUDE.md`, and the
gh-pages build. All mechanical, all verifiable by rebuilding both sites and
diffing the output.

### R3 — Add `tests/`, starting with what is already proven by hand

Port this session's manual verifications into automated ones. The
sparse-vs-dense oracle is the highest value: it is the gate on the 16× paint
optimisation and currently only runs when someone opens a browser with
`?verify=1`. Node can run `netcdf.js` directly — it is deliberately DOM-free.

### R4 — One convention file, plus a checker

A `.conventions.yaml` in the spirit of `.auditor.yaml`: CLI argument names,
module naming, the "wet"-population rule, the `VIEWER_FILES` contract, the
worker-boundary rule — each with rationale and explicit exceptions. Then a
`pipeline/check_conventions.py` that enforces the mechanical subset, following
the precedent `clb_lwi_webmap` already set with its own `check_conventions.py`.

### R5 — Normalise the CLI

`<source>` positional everywhere, `--out` everywhere, `--report` everywhere,
`--deep` where a deep mode exists. Keep `cog_postprocess.py`'s subcommands —
it is genuinely a multi-tool.

### R6 — Extract `pipeline/common/geodesy.py`

Web Mercator conversion, `GeoTransform` parsing and validation, bbox union. One
implementation with one set of rules about rotation and finiteness. The JS copy
stays, with a comment naming its Python counterpart and a test asserting the two
agree on a fixture.

### R7 — Split the docs

`README.md` keeps the pitch, the two paths, quick start and status.
`docs/rendering-contract.md`, `docs/deployment.md`, `docs/data-contract.md`
take the rest. Add `CONTRIBUTING.md` and `CHANGELOG.md`.

### R8 — `pyproject.toml` with two dependency groups

Name the split that already exists in prose: a `gdal` group for the 1D pipeline
and a plain group for the 2D pipeline and `serve/`. Pin versions.

---

## Suggested order

1. **R1 + R2** — the rename and restructure, as one mechanical change verified
   by byte-identical rebuilds. Everything else is easier afterwards and harder
   before.
2. **R6** — extract `common/` while the moves are fresh.
3. **R3** — tests, starting with the oracle and the geodesy.
4. **R5** — CLI normalisation (breaking; do it with the tests in place).
5. **R4** — conventions file and checker, once there are stable conventions.
6. **R7 + R8** — docs and packaging.

R2 is the one that pays for the rest: until the 1D/2D split is structural, every
other change has to keep explaining which half it applies to.

---

## Progress

Appended rather than folded into the gaps above — the gap list is a dated record
of what the repository looked like on 2026-09-10.

| | Status |
|---|---|
| R1 — one name | **done.** Directory renamed to `ras2fim-viewer-wasm`; `CLAUDE.md`, `AGENTS.md` and `deploy.example.json` updated. |
| R2 — 1D/2D split | **done.** `src/viewer-1d`, `src/viewer-2d`, `pipeline/fim1d`, `pipeline/fim2d`. Verified by a byte-identical 2D rebuild. |
| R6 — shared geodesy | **done.** All four Python copies are gone. `transform_bounds()` and `geotransform_error()` were added to carry what the call sites actually needed. |
| R3 — tests | **done.** 65 tests, under a second, plus CI. |
| R5, R4, R7, R8 | not started |
| "1D is unproven" | **closed** — see [2026-09-11-1d-path-proven.md](2026-09-11-1d-path-proven.md). The viewer renders depth grids from the pilot unit; the blocker was a hidden automated tab never running MapLibre's render loop, not the code. A *public* 1D example still does not exist. |

### What R3 turned out to be

The gap list called the sparse-vs-dense oracle "the highest value" because it
gates the 16x paint optimisation and only ran when someone opened a browser.
That was right, and it was also cheaper than expected: `netcdf.js` is already
DOM-free and `self`-scoped, so `node:vm` loads the shipped file unmodified with
`self` bound the way a worker binds it. No build step, no module shim, no
h5wasm, no fixture NetCDF. That property is now itself under test.

CI is two jobs and about a minute. The Node job installs nothing, deliberately —
if it ever needs `npm ci`, the reader has grown a dependency it should not have.
The Python job runs the geodesy tests *before* installing anything, so "works on
a bare checkout" is demonstrated rather than asserted. The 1D pipeline stays out
of CI: it needs the GDAL bindings and real ras2fim output.

Two things only running it could find. Node's `--test` did not expand a quoted
glob before version 22, so the pattern that worked locally failed outright on
Node 20. And the round-trip test called `fetch-vendor.sh`, which downloads 6.9 MB
from two CDNs — right for a real build, wrong for a test, and guaranteed to fail
on a fresh checkout. It builds against a temporary viewer root with stub vendor
files now.

The shared geodesy fixture earned its place immediately: the JavaScript tested
finiteness with `parts.some(isNaN)`, and `isNaN(Infinity)` is `false`, so it
accepted an infinite origin that Python rejected. That is exactly the silent
drift G5 predicted, found the first time the two were compared.

`src/shared/` from the R2 sketch was **not** created. Extracting the sidebar,
resizer, basemap switcher and panel accordions is a real deduplication, but it
is a behavioural change to two working frontends with no test between them.
It waits for R3.

One thing the move nearly broke silently, worth recording because the next bulk
rename will meet it too: `.gitignore` has no file extension, so a rewrite
filtered by suffix skips it, and 4.3 MB of generated COGs staged themselves on
the first `add`. Any path rewrite must include extensionless files by name.
