# Feature development notes

Design analysis and architecture decisions, kept alongside the code they govern.

These are **records, not documentation**: each note states what was measured,
what was decided, and what would make the decision wrong. They are tracked in
Git deliberately — a decision that says "we rejected X because we measured Y"
is worth more to a future reader, including a future contributor, than the
absence of X in the source.

| Note | Subject |
|---|---|
| [2026-09-09-netcdf-viewer-performance.md](2026-09-09-netcdf-viewer-performance.md) | Where the browser NetCDF reader's cost actually is, and why range reads are not the answer at current file sizes |
| [2026-09-10-netcdf-viewer-implemented.md](2026-09-10-netcdf-viewer-implemented.md) | What happened when those decisions were built, the measured results, and the five things the plan had wrong |
| [2026-09-10-architecture-audit.md](2026-09-10-architecture-audit.md) | The ten structural gaps found by auditing the whole repository, the recommendations, and what building them taught |
| [2026-09-11-1d-path-proven.md](2026-09-11-1d-path-proven.md) | The 1D viewer proven against real depth grids, why it looked broken for weeks, and what 1D example data actually exists |
| [2026-09-11-publishing-1d-without-a-tile-server.md](2026-09-11-publishing-1d-without-a-tile-server.md) | Why the 1D depth library is published as baked PMTiles, and the two measurements that chose it |
