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
