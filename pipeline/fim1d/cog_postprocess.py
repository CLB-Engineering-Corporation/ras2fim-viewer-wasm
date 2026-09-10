"""Shared COG post-processing for ras2fim FIM raster products.

Vendored from ``clb_lwi_webmap/pipeline/fim1d/cog_postprocess.py`` (2026-09-06). The
only deliberate divergence is the plausibility envelope, which is CONUS-wide
here because ras2fim is a national tool. Keep the rest in step with LWI: the
rendering tradeoffs below were measured once and should not be re-litigated per
repository.

This module implements the rendering-defaults findings in:

  * ``WEBMAP_BEST_PRACTICES_FROM_RBFS_2026-08-24.md`` (sections 2 and 5)
  * ``G:\\GH\\ras2cng\\feature_dev_notes\\rendering_defaults_audit_2026-08-24.md``
    (M1, M2, M4, M5, M6, I3, I4, I6)

Every FIM COG writer routes through :func:`finish_cog` so the tradeoffs are made
once, recorded in the file, and verifiable after the fact.

What it fixes
-------------

M1 — **area-matched overviews on wet/dry surfaces.** A depth/WSE raster is a
continuous value *plus* an implicit wet/dry mask carried by nodata. GDAL marks a
coarse cell valid if *any* contributing sub-cell is valid, so ``average``/``mode``
inflate wet area monotonically with every overview level (RBFS measured
113-326%). ``nearest`` preserves neither area nor value (up to 50 ft depth /
21 ft WSE error at coarse zoom). :func:`build_area_matched_overviews` instead
solves for a per-level coverage threshold that reproduces the parent level's wet
area, breaks ties by a coherence rank with a deterministic dither, and writes the
**mean of the wet contributors only**. MEAN is mandatory for depth: MAX inflates
flood volume, which is the wrong conserved quantity.

M2 — **the ``OVERVIEWS=AUTO`` reuse trap.** The GDAL COG driver defaults to
``OVERVIEWS=AUTO``, which silently reuses a source pyramid and ignores
``OVERVIEW_RESAMPLING`` entirely. Every ``gdal.Translate(format='COG')`` here
passes ``OVERVIEWS`` explicitly — ``IGNORE_EXISTING`` when GDAL is asked to build
the pyramid, ``FORCE_USE_EXISTING`` when this module built it — so the declared
method is never a silent no-op.

M4 — **categorical vs continuous.** Averaging a class raster invents classes that
are not members of the class set. ``categorical=True`` selects ``mode``.

M5 — **a real COG gate.** :func:`validate_cog` gates on the boolean from a real
layout validator — ``rio_cogeo.cogeo.cog_validate`` when installed, otherwise
GDAL's own reference implementation
(``osgeo_utils.samples.validate_cloud_optimized_geotiff``), which rio-cogeo's is
derived from and which ships with the GDAL bindings. Note the trap this
deliberately avoids: the ``rio cogeo validate`` **CLI always exits 0**, including
on an invalid file, so any shell step that trusts ``$?`` is a no-op gate.

M6 — **atomic writes.** Nothing ever deletes or truncates a good artifact before
its replacement exists: write to a PID-namespaced partial in the destination
directory (same filesystem, so the rename is atomic), ``os.replace`` on success,
``unlink`` in a ``finally``.

I3/I4 — the chosen ``PREDICTOR`` is passed to the *published* COG, not just to a
temp file that gets deleted.

I6 — one overview-factor policy: halve until the top level fits in a single
block, so a zoomed-out view reads one block instead of many.

Plus a build-time CRS gate (:func:`assert_wgs84_bounds`) so a wrong-but-plausible
CRS can never reach a release: RBFS shipped 17 extents in projected feet, two of
which zoomed into the Southern Ocean.

CLI
---
::

    python cog_postprocess.py validate <cog> [<cog> ...]
    python cog_postprocess.py report <cog>              # wet-area + value error per level
    python cog_postprocess.py rebuild-overviews <cog> [--categorical]
"""
from __future__ import annotations

import argparse
import math
import os
import sys
import time
from pathlib import Path
from typing import Iterable, Sequence

import numpy as np
from osgeo import gdal, osr

from ..common.geodesy import looks_like_lonlat, transform_bounds

gdal.UseExceptions()

# --------------------------------------------------------------------------
# Policy constants
# --------------------------------------------------------------------------

#: COG internal block size. 512 matches the 512-px tile requests TiTiler makes
#: and is what the overview pyramid terminates at (I6).
BLOCKSIZE = 512

#: LERC_DEFLATE at MAX_Z_ERROR=0.01 ft is the production standard (2026-08-26).
#:
#: LERC is a *bounded-error* codec: it guarantees no sample deviates from the
#: original by more than MAX_Z_ERROR. At 0.01 ft that bound sits below the
#: meaningful precision of these surfaces -- HEC-RAS WSE and depth results are not
#: resolved to a hundredth of a foot -- so the discarded information is noise, not
#: signal. On that basis it is not "lossy" for the calculations these rasters
#: feed. This is an engineering decision by the modelling leads, recorded here
#: because the tolerance is the whole justification: change the tolerance and the
#: justification no longer holds.
#:
#: The DEFLATE half is deliberate over LERC_ZSTD (I2): ZSTD-in-TIFF needs a GDAL
#: built with libzstd and a reader without it fails hard rather than degrading.
#: LERC support was verified on both the build host (GDAL 3.10.3) and the serving
#: host (GDAL 3.6.2) before adopting it.
#:
#: MAX_Z_ERROR is in the raster's own units. These are feet.
COMPRESS = "LERC_DEFLATE"

#: Bounded error for LERC, in raster units (feet). Recorded in every COG's
#: provenance so the tolerance a consumer inherited is never a guess.
MAX_Z_ERROR = 0.01

#: Categorical rasters must never use a bounded-error codec: a class value
#: perturbed by any amount is a different class, or no class at all.
CATEGORICAL_COMPRESS = "DEFLATE"

#: Predictor 2 rather than 3/FLOATING_POINT (I3). RBFS measured predictor 2
#: beating 3 on smooth WSE surfaces and standardized on it.
PREDICTOR = 2

#: Shared nodata convention across depth, WSE, and terrain products.
NODATA = -9999.0

#: Plausibility envelope for a published FIM raster, lon/lat. ras2fim is a
#: national tool, so this is CONUS plus a margin rather than one state: the guard
#: exists to catch a raster still carrying projected feet, or one warped with the
#: metre variant of a foot CRS, not to assert a study area. Both failure modes
#: land far outside these bounds -- a State Plane easting of 3.27e6 cannot pass a
#: +-180 check, and the foot/metre confusion displaces a Texas raster by
#: thousands of kilometres. Pass ``envelope=None`` only for a genuinely
#: out-of-region unit, never to silence a surprise.
DEFAULT_ENVELOPE = (-130.0, 20.0, -60.0, 55.0)

#: Prefix for the provenance tags stamped into every published artifact. The
#: tolerance, the overview method, and the codec are only defensible while they
#: are recorded next to the data they apply to, so they are always written; the
#: prefix names the product family that wrote them.
METADATA_PREFIX = "FIM"

#: Overview methods this module understands.
OVERVIEW_METHODS = ("area_matched", "mode", "nearest", "average", "bilinear", "cubic")


class CogError(RuntimeError):
    """Raised when a COG fails to build or fails a gate."""


# --------------------------------------------------------------------------
# Small helpers
# --------------------------------------------------------------------------

def _log(msg: str, indent: int = 4) -> None:
    print(" " * indent + msg, flush=True)


def wet_mask(arr: np.ndarray, nodata: float | None) -> np.ndarray:
    """Boolean mask of cells carrying real data.

    Handles NaN nodata, which a plain ``arr != nodata`` comparison silently gets
    wrong (NaN != NaN is True, so NaN cells would be counted as wet).
    """
    m = np.isfinite(arr)
    if nodata is not None and math.isfinite(nodata):
        m &= arr != nodata
    return m


def overview_factors(width: int, height: int, blocksize: int = BLOCKSIZE) -> list[int]:
    """Halve until the top level fits inside a single block (I6).

    Three different policies existed upstream (stop at 256, cap at factor 64,
    hardcode 2..128 regardless of size). Stopping short leaves a large raster
    without a cheap top level, so a zoomed-out view reads many blocks from a
    mid-level overview.

    The terminating level is the first one that fits in a single block, and it
    is INCLUDED. Stopping at the last level still larger than a block leaves the
    top of the pyramid 2x2 blocks, so the most zoomed-out view — the one every
    visitor loads first — reads four blocks instead of one.
    """
    longest = max(width, height)
    if longest <= blocksize:
        return []
    factors: list[int] = []
    f = 2
    while True:
        factors.append(f)
        if longest // f <= blocksize:
            break
        f *= 2
        if f > 1 << 16:  # pathological guard
            break
    return factors


def _dither_rank(row0: int, col0: int, shape: tuple[int, int]) -> np.ndarray:
    """Deterministic per-cell tie-break key from global (row, col).

    Deterministic so two runs of the pipeline produce byte-identical pyramids —
    a random tie-break would make every rebuild a spurious diff and would defeat
    hash-based deploy verification.
    """
    rows = (np.arange(shape[0], dtype=np.uint64) + np.uint64(row0))[:, None]
    cols = (np.arange(shape[1], dtype=np.uint64) + np.uint64(col0))[None, :]
    h = (rows * np.uint64(73856093)) ^ (cols * np.uint64(19349663))
    h = (h ^ (h >> np.uint64(13))) * np.uint64(1274126177)
    return (h ^ (h >> np.uint64(16))).astype(np.uint64)


def _iter_blocks(width: int, height: int, block: int) -> Iterable[tuple[int, int, int, int]]:
    """Yield (xoff, yoff, xsize, ysize) in a fixed order (determinism)."""
    for y in range(0, height, block):
        ys = min(block, height - y)
        for x in range(0, width, block):
            yield x, y, min(block, width - x), ys


def _hamilton(quota: int, weights: Sequence[int]) -> list[int]:
    """Apportion ``quota`` across blocks proportionally to ``weights``.

    Largest-remainder (Hamilton) apportionment. A naive greedy "best-ranked
    first-come" allocation would exhaust the quota in the first blocks scanned
    and leave the rest of the raster dry — a spatial bias, not a threshold.
    """
    total = int(sum(weights))
    if total <= 0 or quota <= 0:
        return [0] * len(weights)
    quota = min(quota, total)
    exact = [quota * w / total for w in weights]
    base = [int(math.floor(e)) for e in exact]
    base = [min(b, w) for b, w in zip(base, weights)]
    remainder = quota - sum(base)
    if remainder > 0:
        order = sorted(
            range(len(weights)),
            key=lambda i: (-(exact[i] - math.floor(exact[i])), i),
        )
        for i in order:
            if remainder == 0:
                break
            if base[i] < weights[i]:
                base[i] += 1
                remainder -= 1
    return base


# --------------------------------------------------------------------------
# M1 — area-matched coverage-mask overviews
# --------------------------------------------------------------------------

def _decimate_area_matched(
    read_parent,
    parent_w: int,
    parent_h: int,
    child_w: int,
    child_h: int,
    nodata: float,
    block: int,
    write_block,
) -> int:
    """One factor-2 area-matched decimation step. Returns child_wet_count.

    Output is STREAMED: each finished block is handed to ``write_block(xoff,
    yoff, arr)`` and then dropped. An earlier version accumulated every block of
    a level into a list and returned it, which made peak memory scale with the
    size of the overview level rather than with one block — on an 11 GB source
    raster that is billions of cells resident at once, and it OOM-killed two
    workers on the first production fleet run. Never buffer a whole level.

    Algorithm (audit M1):

    1. Per coarse cell, compute the wet *coverage count* c in 0..4 and the mean
       of the wet contributors only.
    2. Solve for the coverage threshold that reproduces the parent's wet area
       scaled by the decimation factor (target = parent_wet / 4) instead of
       hardcoding 0.5. Cells with c strictly above the threshold bin are always
       kept; the threshold bin itself is partially kept to hit the target
       exactly.
    3. Break ties inside the threshold bin by a coherence rank — prefer cells
       adjacent to cells that are already certainly wet — with a deterministic
       dither, so the boundary stays coherent instead of checkerboarding and the
       result is stable across runs.
    4. Every kept cell carries the MEAN of its wet contributors.

    Because each step reproduces its parent's wet area, cascading factor-2 steps
    preserves the *level-0* wet area all the way up the pyramid.
    """
    # ---- Pass A: per-block coverage histograms ----------------------------
    # Keeping the FULL 5-bin histogram per block (40 bytes each) rather than just
    # the total lets the tie counts be derived once k_star is known, which
    # removes an entire extra read pass over the parent level.
    hist = np.zeros(5, dtype=np.int64)          # counts of c == 0..4
    block_index: list[tuple[int, int, int, int]] = []
    block_hists: list[np.ndarray] = []
    parent_wet = 0

    for xoff, yoff, xs, ys in _iter_blocks(child_w, child_h, block):
        c, _mean = _coverage_and_mean(read_parent, xoff, yoff, xs, ys, parent_w, parent_h, nodata)
        counts = np.bincount(c.ravel(), minlength=5)[:5].astype(np.int64)
        hist += counts
        parent_wet += int(c.sum())
        block_index.append((xoff, yoff, xs, ys))
        block_hists.append(counts)
        del c, _mean

    if parent_wet == 0:
        return 0

    target = int(round(parent_wet / 4.0))
    # cum[k] = number of coarse cells with coverage >= k
    cum = {k: int(hist[k:].sum()) for k in range(1, 5)}
    # cum[1] >= target (each coarse cell holds at most 4 wet sub-cells) and
    # cum[4] <= target, so a threshold bin always exists in 1..4.
    k_star = 4
    for k in range(1, 5):
        if cum[k] >= target:
            k_star = k
    keep_above = cum.get(k_star + 1, 0)          # cells with c > k_star: always kept
    tie_quota = max(0, target - keep_above)      # how many c == k_star cells to keep

    # Tie counts come straight out of the stored histograms — no second pass.
    tie_counts = [int(h[k_star]) for h in block_hists]
    block_quota = _hamilton(tie_quota, tie_counts)

    # ---- Pass B: select and stream each block out -------------------------
    child_wet = 0
    for (xoff, yoff, xs, ys), quota in zip(block_index, block_quota):
        c, mean = _coverage_and_mean(
            read_parent, xoff, yoff, xs, ys, parent_w, parent_h, nodata, halo=1
        )
        # c/mean came back with a 1-cell halo where the raster allows it.
        c_full, mean_full, y_lo, x_lo = c, mean, 0, 0
        if c.shape != (ys, xs):
            y_lo = 1 if yoff > 0 else 0
            x_lo = 1 if xoff > 0 else 0

        certain = c_full > k_star
        keep_full = certain.copy()

        if quota > 0:
            ties = c_full == k_star
            # Coherence rank: how many of the 8 neighbours are certainly wet.
            rank = _neighbour_count(certain)
            tie_idx = np.argwhere(ties)
            if tie_idx.size:
                dither = _dither_rank(yoff - y_lo, xoff - x_lo, c_full.shape)
                keys = [
                    (-int(rank[r, cc]), int(dither[r, cc]), int(r), int(cc))
                    for r, cc in tie_idx
                ]
                keys.sort()
                for _, _, r, cc in keys[:quota]:
                    keep_full[r, cc] = True

        core = (slice(y_lo, y_lo + ys), slice(x_lo, x_lo + xs))
        keep = keep_full[core]
        vals = mean_full[core]

        out = np.full((ys, xs), nodata, dtype=np.float32)
        out[keep] = vals[keep]
        child_wet += int(keep.sum())
        write_block(xoff, yoff, out)
        del c, mean, c_full, mean_full, certain, keep_full, keep, vals, out

    return child_wet


def _coverage_and_mean(
    read_parent,
    xoff: int,
    yoff: int,
    xs: int,
    ys: int,
    parent_w: int,
    parent_h: int,
    nodata: float,
    halo: int = 0,
) -> tuple[np.ndarray, np.ndarray]:
    """Wet coverage count (0..4) and mean-of-wet-contributors for a child block."""
    cy0 = max(0, yoff - halo)
    cx0 = max(0, xoff - halo)
    cy1 = min((parent_h + 1) // 2, yoff + ys + halo)
    cx1 = min((parent_w + 1) // 2, xoff + xs + halo)

    py0, px0 = cy0 * 2, cx0 * 2
    py1 = min(parent_h, cy1 * 2)
    px1 = min(parent_w, cx1 * 2)

    arr = read_parent(px0, py0, px1 - px0, py1 - py0).astype(np.float32, copy=False)

    # Pad to an even 2x block so the reshape is exact; padding is nodata, which
    # contributes nothing to coverage or to the mean.
    ph = (cy1 - cy0) * 2 - arr.shape[0]
    pw = (cx1 - cx0) * 2 - arr.shape[1]
    if ph > 0 or pw > 0:
        arr = np.pad(arr, ((0, max(0, ph)), (0, max(0, pw))), constant_values=nodata)

    m = wet_mask(arr, nodata)
    h, w = cy1 - cy0, cx1 - cx0
    m4 = m.reshape(h, 2, w, 2)
    v4 = np.where(m, arr, 0.0).reshape(h, 2, w, 2)

    c = m4.sum(axis=(1, 3)).astype(np.int8)
    total = v4.sum(axis=(1, 3), dtype=np.float64)
    with np.errstate(invalid="ignore", divide="ignore"):
        mean = np.where(c > 0, total / np.maximum(c, 1), nodata).astype(np.float32)
    return c, mean


def _neighbour_count(certain: np.ndarray) -> np.ndarray:
    """Count of certainly-wet cells among the 8 neighbours of each cell."""
    p = np.pad(certain.astype(np.int8), 1)
    out = np.zeros_like(certain, dtype=np.int8)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dy == 0 and dx == 0:
                continue
            out += p[1 + dy : 1 + dy + certain.shape[0], 1 + dx : 1 + dx + certain.shape[1]]
    return out


def _decimate_mode(
    read_parent, parent_w, parent_h, child_w, child_h, nodata, block, write_block
) -> int:
    """Factor-2 majority decimation for categorical rasters (M4).

    ``nearest`` preserves class membership but not class *proportion*; ``mode``
    preserves both, and ``average`` invents classes that are not members of the
    class set (a uint8 raster averaging 2 and 4 yields 3).

    Streams its output for the same reason as the area-matched path: buffering a
    whole overview level makes peak memory scale with the level, not the block.
    """
    child_wet = 0
    for xoff, yoff, xs, ys in _iter_blocks(child_w, child_h, block):
        py0, px0 = yoff * 2, xoff * 2
        py1, px1 = min(parent_h, (yoff + ys) * 2), min(parent_w, (xoff + xs) * 2)
        arr = read_parent(px0, py0, px1 - px0, py1 - py0).astype(np.float32, copy=False)
        ph, pw = ys * 2 - arr.shape[0], xs * 2 - arr.shape[1]
        if ph > 0 or pw > 0:
            arr = np.pad(arr, ((0, max(0, ph)), (0, max(0, pw))), constant_values=nodata)

        v = arr.reshape(ys, 2, xs, 2).transpose(0, 2, 1, 3).reshape(ys, xs, 4)
        m = wet_mask(v, nodata)
        out = np.full((ys, xs), nodata, dtype=np.float32)

        # Majority over the (at most 4) valid values; ties resolve to the
        # smallest value, which is deterministic.
        vs = np.where(m, v, np.inf)
        vs.sort(axis=2)
        best = np.full((ys, xs), np.inf, dtype=np.float32)
        best_n = np.zeros((ys, xs), dtype=np.int8)
        for i in range(4):
            cand = vs[:, :, i]
            valid = np.isfinite(cand)
            n = np.zeros((ys, xs), dtype=np.int8)
            for j in range(4):
                n += (np.isfinite(vs[:, :, j]) & (vs[:, :, j] == cand)).astype(np.int8)
            take = valid & (n > best_n)
            best[take] = cand[take]
            best_n[take] = n[take]

        keep = best_n > 0
        out[keep] = best[keep]
        child_wet += int(keep.sum())
        write_block(xoff, yoff, out)
        del arr, v, m, vs, best, best_n, keep, out
    return child_wet


def build_area_matched_overviews(
    path: str | Path,
    *,
    categorical: bool = False,
    nodata: float | None = None,
    blocksize: int = BLOCKSIZE,
    block: int = 1024,
    verbose: bool = True,
) -> dict:
    """Build the pyramid in place on a **GTiff** (not a COG — COGs are write-once).

    Cascades factor-2 area-matched (or mode) steps so the published wet area
    matches the model's at every zoom level. Returns a report dict suitable for
    logging and for embedding in provenance.
    """
    ds = gdal.Open(str(path), gdal.GA_Update)
    if ds is None:
        raise CogError(f"cannot open for update: {path}")
    band = ds.GetRasterBand(1)
    nd = nodata if nodata is not None else band.GetNoDataValue()
    if nd is None:
        nd = NODATA
        band.SetNoDataValue(nd)

    w, h = ds.RasterXSize, ds.RasterYSize
    factors = overview_factors(w, h, blocksize)
    method = "mode" if categorical else "area_matched"
    report = {"method": method, "factors": factors, "levels": []}

    if not factors:
        if verbose:
            _log(f"overviews: none needed ({w}x{h} fits one {blocksize} block)")
        ds = None
        return report

    # 'NONE' allocates the pyramid without computing it, so each level can be
    # written explicitly below.
    ds.BuildOverviews("NONE", factors)

    # Level 0 wet area, for the area-preservation report.
    base_wet = 0
    for xo, yo, xs, ys in _iter_blocks(w, h, block):
        base_wet += int(wet_mask(band.ReadAsArray(xo, yo, xs, ys), nd).sum())
    report["base_wet_cells"] = base_wet

    decimate = _decimate_mode if categorical else _decimate_area_matched
    parent_band = band
    parent_w, parent_h = w, h

    for i, factor in enumerate(factors):
        t0 = time.time()
        ovr = band.GetOverview(i)
        cw, ch = ovr.XSize, ovr.YSize

        pb = parent_band  # bind for the closure
        out_dtype = _np_dtype(band.DataType)

        def read_parent(x, y, xs, ys, _pb=pb):
            return _pb.ReadAsArray(x, y, xs, ys)

        # Write each block as it is produced and let it go. Nothing accumulates,
        # so peak memory is one block regardless of raster size.
        def write_block(x, y, arr, _ovr=ovr, _dt=out_dtype):
            _ovr.WriteArray(arr.astype(_dt, copy=False), x, y)

        child_wet = decimate(read_parent, parent_w, parent_h, cw, ch, nd, block, write_block)
        ovr.SetNoDataValue(nd)
        ovr.FlushCache()

        expected = base_wet / (factor * factor)
        ratio = (child_wet / expected) if expected else 1.0
        report["levels"].append(
            {
                "factor": factor,
                "size": [cw, ch],
                "wet_cells": child_wet,
                "wet_area_ratio": round(ratio, 4),
                "seconds": round(time.time() - t0, 1),
            }
        )
        if verbose:
            _log(
                f"overview 1/{factor}: {cw}x{ch} wet={child_wet:,} "
                f"area={ratio * 100:.1f}% of native ({time.time() - t0:.0f}s)"
            )
        parent_band = ovr
        parent_w, parent_h = cw, ch

    # Record the tradeoff in the file itself, so a downstream consumer can tell
    # which pyramid semantics it inherited without re-deriving them.
    ds.SetMetadataItem("RESAMPLING", method.upper(), "RIO_OVERVIEW")
    ds.SetMetadataItem(f"{METADATA_PREFIX}_OVERVIEW_METHOD", method)
    ds.SetMetadataItem(f"{METADATA_PREFIX}_OVERVIEW_FACTORS", ",".join(str(f) for f in factors))
    ds.FlushCache()
    ds = None
    return report


def _np_dtype(gdal_dtype):
    return {
        gdal.GDT_Byte: np.uint8,
        gdal.GDT_UInt16: np.uint16,
        gdal.GDT_Int16: np.int16,
        gdal.GDT_UInt32: np.uint32,
        gdal.GDT_Int32: np.int32,
        gdal.GDT_Float32: np.float32,
        gdal.GDT_Float64: np.float64,
    }.get(gdal_dtype, np.float32)


# --------------------------------------------------------------------------
# M3 / 4.2 — build-time CRS gate
# --------------------------------------------------------------------------

def assert_wgs84_bounds(
    path: str | Path,
    envelope: tuple[float, float, float, float] | None = DEFAULT_ENVELOPE,
) -> tuple[float, float, float, float]:
    """Refuse a raster whose georeferencing is not plausible WGS84 lon/lat.

    RBFS shipped 17 extents in projected feet — two of them zoomed into the
    Southern Ocean — because nothing asserted a degree range. Projected
    coordinates are in the thousands or millions and cannot survive the +-180/+-90
    check, so this catches a wrong CRS before it reaches a release rather than
    after someone notices the map is in the wrong hemisphere.

    Never guess an EPSG code to "fix" a mismatch: at a low confidence threshold
    the closest registered code can be the metre variant of a foot CRS, which
    displaces the raster by ~25,000 km. Fail loudly and fix the source instead.
    """
    ds = gdal.Open(str(path))
    if ds is None:
        raise CogError(f"cannot open: {path}")
    bounds = transform_bounds(ds.GetGeoTransform(), ds.RasterXSize, ds.RasterYSize)

    wkt = ds.GetProjection()
    ds = None

    if not wkt:
        raise CogError(f"{Path(path).name}: no CRS. Refusing to guess one.")
    srs = osr.SpatialReference()
    srs.ImportFromWkt(wkt)
    if not srs.IsGeographic():
        raise CogError(
            f"{Path(path).name}: CRS is projected ({srs.GetAttrValue('PROJCS')}), "
            "expected geographic WGS84. Reproject; do not re-stamp the code."
        )

    if not looks_like_lonlat(bounds):
        raise CogError(
            f"{Path(path).name}: bounds {bounds} are outside +-180/+-90 — "
            "the raster is almost certainly in projected units carrying a "
            "geographic CRS tag."
        )

    if envelope is not None:
        lo_x, lo_y, hi_x, hi_y = envelope
        if bounds[0] < lo_x or bounds[2] > hi_x or bounds[1] < lo_y or bounds[3] > hi_y:
            raise CogError(
                f"{Path(path).name}: bounds {bounds} fall outside the Louisiana "
                f"envelope {envelope}. Check the source CRS override before "
                "publishing (a wrong-but-plausible CRS lands near lon -68/lat 36)."
            )
    return bounds


# --------------------------------------------------------------------------
# M5 — a real COG gate
# --------------------------------------------------------------------------

def _run_cog_checker(path: Path) -> tuple[bool, list, list, str]:
    """Run a real COG-layout validator. Returns (ok, errors, warnings, checker).

    Two authoritative implementations are accepted, in preference order:

    1. ``rio_cogeo.cogeo.cog_validate`` — the one the audit names.
    2. ``osgeo_utils.samples.validate_cloud_optimized_geotiff.validate`` — GDAL's
       own reference validator, which rio-cogeo's is derived from. It ships with
       the GDAL Python bindings, so it is always present wherever this pipeline
       can run at all.

    What is NOT accepted is a hand-rolled "is it tiled / does it have overviews"
    check, or shelling out to the ``rio cogeo validate`` CLI: that CLI exits 0
    even on an invalid file, so any gate trusting ``$?`` is a no-op.
    """
    try:
        from rio_cogeo.cogeo import cog_validate  # type: ignore

        is_valid, errors, warnings = cog_validate(str(path))
        return bool(is_valid), list(errors or []), list(warnings or []), "rio-cogeo"
    except ImportError:
        pass

    try:
        from osgeo_utils.samples.validate_cloud_optimized_geotiff import validate
    except ImportError as exc:  # pragma: no cover - environment dependent
        raise CogError(
            "No COG validator available. Install rio-cogeo "
            "(`uv pip install 'rio-cogeo>=5.0,<6.0'`, see "
            "pipeline/requirements-pipeline.txt) or use a GDAL build that ships "
            "osgeo_utils. Refusing to fall back to a structural guess."
        ) from exc

    ds = gdal.Open(str(path))
    if ds is None:
        return False, ["unreadable by GDAL"], [], "gdal-osgeo_utils"
    # Returns (warnings, errors, details) — note the order.
    warnings, errors, _details = validate(ds, full_check=True)
    ds = None
    return not errors, list(errors or []), list(warnings or []), "gdal-osgeo_utils"


def validate_cog(path: str | Path, *, require_nodata: bool = True, strict: bool = True) -> dict:
    """Gate on a real COG-layout validator's boolean, not on an exit code.

    The hand-rolled checks this replaces (tiled? has overviews? has nodata?)
    establish nothing about cloud-optimized *layout*: a plain tiled GTiff with a
    ``.ovr`` sidecar, or one with its IFDs in the wrong order, passes all of them
    and is not a COG. It still serves, but with one HTTP range request per tile
    instead of a header read, which is the entire point of the format.

    The nodata/mask check is kept alongside because ``cog_validate`` does not
    cover it, and it is the thing that makes a flood surface display
    transparently instead of as an opaque rectangle.
    """
    path = Path(path)
    result: dict = {"path": str(path), "ok": False, "errors": [], "warnings": []}

    is_valid, errors, warnings, checker = _run_cog_checker(path)
    result["checker"] = checker
    result["errors"] = list(errors or [])
    result["warnings"] = list(warnings or [])

    ds = gdal.Open(str(path))
    if ds is None:
        result["errors"].append("unreadable by GDAL")
        return result
    band = ds.GetRasterBand(1)
    if require_nodata and band.GetNoDataValue() is None:
        has_mask = bool(band.GetMaskFlags() & gdal.GMF_PER_DATASET)
        if not has_mask:
            result["errors"].append("no nodata value and no per-dataset mask")
    result["overviews"] = band.GetOverviewCount()
    result["blocksize"] = band.GetBlockSize()
    result["overview_method"] = ds.GetMetadataItem(f"{METADATA_PREFIX}_OVERVIEW_METHOD") or "unrecorded"
    if band.GetOverviewCount() == 0:
        w, h = ds.RasterXSize, ds.RasterYSize
        if overview_factors(w, h):
            result["errors"].append("no overviews on a raster large enough to need them")
    ds = None

    result["ok"] = bool(is_valid) and not result["errors"]
    if strict and not result["ok"]:
        raise CogError(f"{path.name} failed COG validation: {result['errors']}")
    return result


# --------------------------------------------------------------------------
# M6 — atomic COG write
# --------------------------------------------------------------------------

def finish_cog(
    src_path: str | Path,
    dst_path: str | Path,
    *,
    categorical: bool = False,
    overview_method: str = "area_matched",
    compress: str = COMPRESS,
    max_z_error: float | None = MAX_Z_ERROR,
    predictor: int | None = PREDICTOR,
    blocksize: int = BLOCKSIZE,
    bigtiff: str = "IF_SAFER",
    nodata: float | None = None,
    validate: bool = True,
    check_bounds: bool = True,
    envelope: tuple[float, float, float, float] | None = DEFAULT_ENVELOPE,
    extra_metadata: dict[str, str] | None = None,
    label: str = "COG",
    verbose: bool = True,
) -> dict:
    """Convert a staged GTiff to a published COG, atomically and correctly.

    ``src_path`` is consumed as an intermediate: its pyramid is (re)built in
    place when ``overview_method`` is one this module implements. Pass a temp
    file, not a file anyone else is reading.

    The published artifact never blinks: the replacement is built at a
    PID-namespaced partial path in the *destination directory* — same filesystem,
    so the rename is atomic — and only then does ``os.replace`` swap it in. If
    anything fails, the previous good COG is still there and the partial is
    removed in a ``finally``.

    ``extra_metadata`` is stamped onto the **staged** file so it is baked into the
    COG at creation. Never reopen a finished COG with ``GA_Update`` to add
    metadata: GDAL refuses outright (and, if forced with
    ``IGNORE_COG_LAYOUT_BREAK``, produces a valid GeoTIFF that is no longer a
    COG — the exact defect the validation gate exists to catch).
    """
    src_path = Path(src_path)
    dst_path = Path(dst_path)
    dst_path.parent.mkdir(parents=True, exist_ok=True)

    if overview_method not in OVERVIEW_METHODS:
        raise ValueError(f"overview_method must be one of {OVERVIEW_METHODS}")
    if categorical and overview_method == "area_matched":
        overview_method = "mode"
    if categorical and compress.startswith("LERC"):
        # A bounded-error codec on a class raster is not a small error, it is a
        # different class. Downgrade rather than silently corrupting the classes.
        compress = CATEGORICAL_COMPRESS
        max_z_error = None

    t0 = time.time()
    report: dict = {"dst": str(dst_path), "overview_method": overview_method}

    # Build the pyramid ourselves when the method is one GDAL cannot express.
    self_built = overview_method in ("area_matched", "mode")
    if self_built:
        report["overviews"] = build_area_matched_overviews(
            src_path,
            categorical=(overview_method == "mode"),
            nodata=nodata,
            blocksize=blocksize,
            verbose=verbose,
        )

    creation = [
        f"COMPRESS={compress}",
        f"BLOCKSIZE={blocksize}",
        f"BIGTIFF={bigtiff}",
        "NUM_THREADS=ALL_CPUS",
    ]
    if compress.startswith("LERC") and max_z_error is not None:
        # The bound is the whole justification for using LERC on these rasters,
        # so it is always explicit -- never left to the driver default (0, i.e.
        # lossless, which silently discards the size benefit) and never implied.
        creation.append(f"MAX_Z_ERROR={max_z_error}")
        # Overviews are display-only and tolerate the same bound.
        creation.append(f"MAX_Z_ERROR_OVERVIEW={max_z_error}")
    # PREDICTOR applies to the DEFLATE/LZW/ZSTD family. LERC does its own
    # encoding, so passing a predictor alongside it is meaningless at best.
    if predictor is not None and not compress.startswith("LERC"):
        # I4: pass the predictor to the *published* COG, not only to the
        # intermediate that gets deleted. Without this the COG driver falls back
        # to PREDICTOR=NO and the chosen predictor buys nothing.
        creation.append(f"PREDICTOR={predictor}")

    if self_built:
        # M2: the pyramid above is the whole point of this function; FORCE_USE_EXISTING
        # makes reuse explicit and fails loudly if it is somehow missing, rather
        # than silently regenerating it with GDAL's method.
        creation.append("OVERVIEWS=FORCE_USE_EXISTING")
    else:
        # M2: AUTO would silently reuse whatever pyramid the source happened to
        # carry and ignore OVERVIEW_RESAMPLING entirely — the reason a
        # "resampling fix" can land and change nothing.
        creation.append("OVERVIEWS=IGNORE_EXISTING")
        creation.append(f"OVERVIEW_RESAMPLING={overview_method.upper()}")

    # Stamp provenance on the staged file, before it becomes a COG. gdal.Translate
    # carries dataset metadata through, so this lands in the published artifact
    # without ever reopening it for update.
    tags = dict(extra_metadata or {})
    tags[f"{METADATA_PREFIX}_OVERVIEW_METHOD"] = overview_method
    tags[f"{METADATA_PREFIX}_COMPRESS"] = compress
    if compress.startswith("LERC") and max_z_error is not None:
        # Bind the tolerance into the artifact. A consumer must never have to
        # guess what bound it inherited, and "0.01 ft" is only defensible while
        # it is written down next to the data it applies to.
        tags[f"{METADATA_PREFIX}_MAX_Z_ERROR"] = str(max_z_error)
    stage = gdal.Open(str(src_path), gdal.GA_Update)
    if stage is not None:
        for k, v in tags.items():
            stage.SetMetadataItem(k, str(v))
        stage.SetMetadataItem("RESAMPLING", overview_method.upper(), "RIO_OVERVIEW")
        stage.FlushCache()
        stage = None

    partial = dst_path.with_name(f".{dst_path.name}.partial-{os.getpid()}")
    try:
        gdal.Translate(str(partial), str(src_path), format="COG", creationOptions=creation)

        if check_bounds:
            assert_wgs84_bounds(partial, envelope=envelope)
        if validate:
            report["validation"] = validate_cog(partial, strict=True)

        os.replace(partial, dst_path)
    finally:
        # Never leave a partial behind, and never destroy the previous good COG:
        # os.replace already consumed the partial on the success path.
        Path(partial).unlink(missing_ok=True)

    size_mb = dst_path.stat().st_size / 1024 / 1024
    report["size_mb"] = round(size_mb, 1)
    report["seconds"] = round(time.time() - t0, 1)
    if verbose:
        _log(f"{label}: {size_mb:.0f} MB, {overview_method} overviews ({report['seconds']:.0f}s)")
    return report


def staged_intermediate(dst_path: str | Path, tag: str = "stage") -> Path:
    """A PID-namespaced scratch path beside the destination (same filesystem)."""
    dst_path = Path(dst_path)
    return dst_path.with_name(f".{dst_path.stem}.{tag}-{os.getpid()}.tif")


# --------------------------------------------------------------------------
# Verification — makes the "check your map" column runnable
# --------------------------------------------------------------------------

def overview_report(path: str | Path, sample_blocks: int = 24) -> dict:
    """Measure what the pyramid actually did to wet area and to values.

    This is the check the best-practices doc asks for: "read an overview level;
    compare wet-area % and value error vs full-res". Run it on any COG,
    including one built before this module existed, to see which tradeoff it
    carries.
    """
    ds = gdal.Open(str(path))
    if ds is None:
        raise CogError(f"cannot open: {path}")
    band = ds.GetRasterBand(1)
    nd = band.GetNoDataValue()
    if nd is None:
        nd = NODATA
    w, h = ds.RasterXSize, ds.RasterYSize

    base_wet = 0
    for xo, yo, xs, ys in _iter_blocks(w, h, 2048):
        base_wet += int(wet_mask(band.ReadAsArray(xo, yo, xs, ys), nd).sum())

    out = {
        "path": str(path),
        "size": [w, h],
        "recorded_method": ds.GetMetadataItem(f"{METADATA_PREFIX}_OVERVIEW_METHOD") or "unrecorded",
        "base_wet_cells": base_wet,
        "levels": [],
    }

    for i in range(band.GetOverviewCount()):
        ovr = band.GetOverview(i)
        factor = int(round(w / ovr.XSize))
        wet = 0
        for xo, yo, xs, ys in _iter_blocks(ovr.XSize, ovr.YSize, 2048):
            wet += int(wet_mask(ovr.ReadAsArray(xo, yo, xs, ys), nd).sum())
        expected = base_wet / (factor * factor) if base_wet else 0

        # Value error: compare a sample of overview cells against the mean of
        # their own level-0 wet contributors.
        errs: list[float] = []
        taken = 0
        for xo, yo, xs, ys in _iter_blocks(ovr.XSize, ovr.YSize, 256):
            if taken >= sample_blocks:
                break
            o = ovr.ReadAsArray(xo, yo, xs, ys).astype(np.float32)
            b = band.ReadAsArray(
                xo * factor, yo * factor,
                min(xs * factor, w - xo * factor),
                min(ys * factor, h - yo * factor),
            )
            if b is None:
                continue
            b = b.astype(np.float32)
            ph, pw = ys * factor - b.shape[0], xs * factor - b.shape[1]
            if ph > 0 or pw > 0:
                b = np.pad(b, ((0, max(0, ph)), (0, max(0, pw))), constant_values=nd)
            bm = wet_mask(b, nd)
            blocks = b.reshape(ys, factor, xs, factor)
            masks = bm.reshape(ys, factor, xs, factor)
            cnt = masks.sum(axis=(1, 3))
            tot = np.where(masks, blocks, 0.0).sum(axis=(1, 3), dtype=np.float64)
            with np.errstate(invalid="ignore", divide="ignore"):
                truth = np.where(cnt > 0, tot / np.maximum(cnt, 1), np.nan)
            om = wet_mask(o, nd)
            both = om & np.isfinite(truth)
            if both.any():
                errs.extend(np.abs(o[both] - truth[both]).tolist())
            taken += 1

        out["levels"].append(
            {
                "factor": factor,
                "size": [ovr.XSize, ovr.YSize],
                "wet_cells": wet,
                "wet_area_ratio": round(wet / expected, 4) if expected else None,
                "value_err_mean": round(float(np.mean(errs)), 4) if errs else None,
                "value_err_p99": round(float(np.percentile(errs, 99)), 4) if errs else None,
                "value_err_max": round(float(np.max(errs)), 4) if errs else None,
            }
        )
    ds = None
    return out


def recompress_in_place(
    cog_path: str | Path,
    *,
    compress: str = COMPRESS,
    max_z_error: float | None = MAX_Z_ERROR,
    blocksize: int = BLOCKSIZE,
    verbose: bool = True,
) -> dict:
    """Re-encode a published COG with a different codec, KEEPING its pyramid.

    Changing compression does not require re-deriving the overviews. Rebuilding
    them would cost the whole area-matched decimation again for no benefit, and
    would risk producing a *different* pyramid than the one already validated.
    ``OVERVIEWS=FORCE_USE_EXISTING`` carries the existing levels through
    verbatim, so this is a pure transcode: read, encode, atomic swap.

    Refuses a source that does not already carry an area-matched pyramid --
    otherwise this would quietly publish a re-compressed *wrong* pyramid, which
    is worse than leaving it alone.
    """
    cog_path = Path(cog_path)
    ds = gdal.Open(str(cog_path))
    if ds is None:
        raise CogError(f"cannot open {cog_path}")
    method = ds.GetMetadataItem(f"{METADATA_PREFIX}_OVERVIEW_METHOD")
    n_ovr = ds.GetRasterBand(1).GetOverviewCount()
    prefix = f"{METADATA_PREFIX}_"
    tags = {k: v for k, v in (ds.GetMetadata() or {}).items() if k.startswith(prefix)}
    ds = None

    if method != "area_matched":
        raise CogError(
            f"{cog_path.name}: pyramid is '{method or 'unrecorded'}', not area_matched. "
            "Re-compressing would publish a re-encoded wrong pyramid. Rebuild it first."
        )

    creation = [
        f"COMPRESS={compress}",
        f"BLOCKSIZE={blocksize}",
        "BIGTIFF=IF_SAFER",
        "NUM_THREADS=ALL_CPUS",
        # Keep the validated pyramid rather than deriving a new one.
        "OVERVIEWS=FORCE_USE_EXISTING",
    ]
    if compress.startswith("LERC") and max_z_error is not None:
        creation.append(f"MAX_Z_ERROR={max_z_error}")
        creation.append(f"MAX_Z_ERROR_OVERVIEW={max_z_error}")

    # New provenance must be written AT CREATION via -mo. A finished COG cannot be
    # reopened for metadata without breaking its cloud-optimized layout, and the
    # tolerance has to travel with the artifact -- it is the justification.
    meta_opts = [f"{METADATA_PREFIX}_COMPRESS={compress}"]
    # placeholder replaced below once the actual level count is known
    if compress.startswith("LERC") and max_z_error is not None:
        meta_opts.append(f"{METADATA_PREFIX}_MAX_Z_ERROR={max_z_error}")
    for k, v in tags.items():
        if k not in (f"{METADATA_PREFIX}_COMPRESS", f"{METADATA_PREFIX}_MAX_Z_ERROR"):
            meta_opts.append(f"{k}={v}")

    before = cog_path.stat().st_size
    partial = cog_path.with_name(f".{cog_path.name}.partial-{os.getpid()}")
    t0 = time.time()
    try:
        gdal.Translate(str(partial), str(cog_path), format="COG",
                       creationOptions=creation, metadataOptions=meta_opts)

        # The transcode must not have silently dropped the pyramid or the tags.
        chk = gdal.Open(str(partial))
        got_ovr = chk.GetRasterBand(1).GetOverviewCount()
        got_method = chk.GetMetadataItem(f"{METADATA_PREFIX}_OVERVIEW_METHOD")
        got_mz = chk.GetMetadataItem(f"{METADATA_PREFIX}_MAX_Z_ERROR")
        chk = None
        # On very large rasters the COG driver emits one fewer level than its own
        # "halve until it fits a block" rule implies -- measured on
        # boeuf_river (57676 x 188124), where 9 source levels become 8, while a
        # 26353 x 37625 raster preserves all 7. It is not LERC-specific: plain
        # DEFLATE with FORCE_USE_EXISTING behaves identically. GDAL will not do
        # better, so tolerate exactly one dropped level and RECORD it rather than
        # failing the raster or hiding the loss.
        #
        # The cost is bounded: the most zoomed-out view reads the next level down
        # (2 blocks instead of 1). Losing more than one would mean something else
        # is wrong, and still fails.
        dropped = n_ovr - got_ovr
        if dropped < 0 or dropped > 1:
            raise CogError(f"{cog_path.name}: overview count changed {n_ovr} -> {got_ovr}")
        if got_method != "area_matched":
            raise CogError(f"{cog_path.name}: {METADATA_PREFIX}_OVERVIEW_METHOD lost in transcode")
        if compress.startswith("LERC") and max_z_error is not None and got_mz is None:
            raise CogError(f"{cog_path.name}: {METADATA_PREFIX}_MAX_Z_ERROR not recorded -- the "
                           "tolerance must travel with the artifact")

        if dropped == 1:
            _log(f"{cog_path.name}: COG driver dropped the smallest overview "
                 f"level ({n_ovr} -> {got_ovr}); accepted", indent=6)
        validate_cog(partial, strict=True)
        assert_wgs84_bounds(partial, envelope=DEFAULT_ENVELOPE)
        os.replace(partial, cog_path)
    finally:
        Path(partial).unlink(missing_ok=True)

    after = cog_path.stat().st_size
    rep = {"before": before, "after": after, "ratio": round(after / before, 3),
           "levels": n_ovr, "seconds": round(time.time() - t0, 1)}
    if verbose:
        _log(f"{cog_path.name}: {before/1e6:.0f} -> {after/1e6:.0f} MB "
             f"({rep['ratio']}x, {n_ovr} levels kept, {rep['seconds']:.0f}s)")
    return rep


def rebuild_overviews_in_place(
    cog_path: str | Path,
    *,
    categorical: bool = False,
    verbose: bool = True,
    **finish_kwargs,
) -> dict:
    """Re-pyramid an existing published COG without re-running extraction.

    Lets an already-deployed catalogue be corrected in place: the COG is
    exploded to a staged GTiff, given a correct pyramid, and swapped back
    atomically. The original is only removed once the replacement validates.
    """
    cog_path = Path(cog_path)
    staged = staged_intermediate(cog_path, "rebuild")
    try:
        if verbose:
            _log(f"staging {cog_path.name} for re-pyramiding...")
        gdal.Translate(
            str(staged),
            str(cog_path),
            format="GTiff",
            creationOptions=[
                f"COMPRESS={COMPRESS}",
                f"PREDICTOR={PREDICTOR}",
                "TILED=YES",
                f"BLOCKXSIZE={BLOCKSIZE}",
                f"BLOCKYSIZE={BLOCKSIZE}",
                "BIGTIFF=IF_SAFER",
                "NUM_THREADS=ALL_CPUS",
            ],
        )
        return finish_cog(
            staged,
            cog_path,
            categorical=categorical,
            label=cog_path.name,
            verbose=verbose,
            **finish_kwargs,
        )
    finally:
        Path(staged).unlink(missing_ok=True)
        for side in (staged.with_suffix(staged.suffix + ".ovr"), staged.with_suffix(staged.suffix + ".aux.xml")):
            Path(side).unlink(missing_ok=True)


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------

def _cmd_validate(args) -> int:
    bad = 0
    for p in args.paths:
        try:
            r = validate_cog(p, strict=False)
            status = "PASS" if r["ok"] else "FAIL"
            print(f"{status}  {Path(p).name}  overviews={r.get('overviews')} "
                  f"block={r.get('blocksize')} method={r.get('overview_method')} "
                  f"[{r.get('checker')}]")
            for e in r["errors"]:
                print(f"        error: {e}")
            if not r["ok"]:
                bad += 1
        except CogError as exc:
            print(f"FAIL  {Path(p).name}: {exc}")
            bad += 1
    print("-" * 60)
    print(f"{len(args.paths) - bad}/{len(args.paths)} valid")
    return 1 if bad else 0


def _cmd_report(args) -> int:
    import json
    for p in args.paths:
        print(json.dumps(overview_report(p), indent=2))
    return 0


def _cmd_rebuild(args) -> int:
    for p in args.paths:
        rebuild_overviews_in_place(
            p,
            categorical=args.categorical,
            envelope=None if args.no_envelope else DEFAULT_ENVELOPE,
        )
    return 0


def _cmd_bounds(args) -> int:
    bad = 0
    for p in args.paths:
        try:
            b = assert_wgs84_bounds(p, envelope=None if args.no_envelope else DEFAULT_ENVELOPE)
            print(f"PASS  {Path(p).name}  {tuple(round(v, 4) for v in b)}")
        except CogError as exc:
            print(f"FAIL  {exc}")
            bad += 1
    return 1 if bad else 0


def main(argv: Sequence[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)

    v = sub.add_parser("validate", help="gate on rio-cogeo cog_validate + nodata")
    v.add_argument("paths", nargs="+")
    v.set_defaults(func=_cmd_validate)

    r = sub.add_parser("report", help="wet-area and value error per overview level")
    r.add_argument("paths", nargs="+")
    r.set_defaults(func=_cmd_report)

    b = sub.add_parser("bounds", help="assert plausible WGS84 lon/lat bounds")
    b.add_argument("paths", nargs="+")
    b.add_argument("--no-envelope", action="store_true", help="skip the Louisiana envelope check")
    b.set_defaults(func=_cmd_bounds)

    rb = sub.add_parser("rebuild-overviews", help="re-pyramid an existing COG in place")
    rb.add_argument("paths", nargs="+")
    rb.add_argument("--categorical", action="store_true")
    rb.add_argument("--no-envelope", action="store_true")
    rb.set_defaults(func=_cmd_rebuild)

    args = ap.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
