"""A local stand-in for TiTiler, for previewing the map without deploying one.

Implements only the endpoints ``src/viewer-1d/app.js`` actually calls, with the
same paths, query parameters, and response shapes TiTiler uses:

* ``GET /cog/tiles/WebMercatorQuad/{z}/{x}/{y}.png`` -- one 256 px RGBA tile
* ``GET /cog/info`` -- enough of TiTiler's info document for the startup probe
* ``GET /cog/point`` -- the depth value under a lon/lat

This exists so the frontend's tile URL contract is exercised in development
rather than only in production. It is NOT a TiTiler replacement: it is
single-process, has no caching, and reads from the local filesystem. Point
``rasterTileBase`` at a real TiTiler for anything beyond local preview.

Usage::

    python -m serve.dev_tiles --port 8102 --root src/viewer-1d

Requires ``rasterio`` and ``Pillow`` (see pipeline/requirements-frontend-dev.txt).
"""

from __future__ import annotations

import argparse
import io
import json
import math
import re
import sys
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling
from rasterio.transform import from_bounds as transform_from_bounds
from rasterio.vrt import WarpedVRT

from pipeline.common.ramp import DEFAULT as DEFAULT_RAMP
from pipeline.common.ramp import table as ramp_table

TILE_SIZE = 256
WEB_MERCATOR = "EPSG:3857"
#: Half the circumference of the Web Mercator plane, in metres.
ORIGIN = 20037508.342789244

TILE_RE = re.compile(r"^/cog/tiles/WebMercatorQuad/(\d+)/(\d+)/(\d+)(?:@\d+x)?\.png$")

#: The ramp lives in pipeline/common/ramp.py because three things must agree on
#: what a given depth looks like: this server, the baked PMTiles that
#: pipeline/fim1d/depth_pmtiles.py writes, and the legend beside the map. Two of
#: them are Python and share the module rather than each carrying a copy.


class TileError(Exception):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


def tile_bounds(z: int, x: int, y: int) -> tuple[float, float, float, float]:
    """Web Mercator bounds of an XYZ tile, in metres."""
    span = 2 * ORIGIN / (2**z)
    left = -ORIGIN + x * span
    top = ORIGIN - y * span
    return (left, top - span, left + span, top)


def _resolve(root: Path, url: str) -> Path:
    """Map a COG URL from the page back onto a local file under ``root``.

    The frontend sends absolute ``http://host/cogs/...`` URLs because that is
    what a real TiTiler needs. Only the path is used here, and it is confined to
    ``root`` -- this server has no business reading anything else, and a
    ``..``-laden URL from a browser must not be able to escape.
    """
    parsed = urllib.parse.urlparse(url)
    relative = urllib.parse.unquote(parsed.path).lstrip("/")
    if not relative:
        raise TileError(400, "url parameter has no path")
    candidate = (root / relative).resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError:
        raise TileError(403, "url resolves outside the served root") from None
    if not candidate.is_file():
        raise TileError(404, f"no such COG: {relative}")
    return candidate


def render_tile(path: Path, z: int, x: int, y: int, params: dict) -> bytes:
    rescale = params.get("rescale", ["0,1"])[0]
    try:
        lo, hi = (float(v) for v in rescale.split(",", 1))
    except ValueError:
        raise TileError(400, f"bad rescale: {rescale!r}") from None
    if hi <= lo:
        raise TileError(400, "rescale max must exceed min")

    nodata = params.get("nodata", [None])[0]
    resampling = Resampling.nearest
    if params.get("resampling", ["nearest"])[0] != "nearest":
        resampling = Resampling.bilinear

    left, bottom, right, top = tile_bounds(z, x, y)

    with rasterio.open(path) as src:
        override = float(nodata) if nodata not in (None, "") else src.nodata
        fill = override if override is not None else 0.0
        # The VRT is built to the tile's own grid rather than read with a window
        # and resampled afterwards. A WarpedVRT refuses boundless reads, and a
        # tile that only partly overlaps the raster is the normal case at the
        # edge of a flood -- so the warp target IS the tile.
        with WarpedVRT(
            src,
            crs=WEB_MERCATOR,
            transform=transform_from_bounds(left, bottom, right, top, TILE_SIZE, TILE_SIZE),
            width=TILE_SIZE,
            height=TILE_SIZE,
            resampling=resampling,
            src_nodata=override,
            nodata=fill,
        ) as vrt:
            # A tile with no overlap reads back entirely as the fill value and
            # so renders fully transparent, which is what MapLibre wants: it
            # requests a full grid for the viewport regardless of where the data
            # is, and an error for the empty ones would look like a broken map.
            data = vrt.read(1).astype("float32")

    valid = np.isfinite(data)
    if override is not None and math.isfinite(override):
        valid &= data != override
    # A depth grid's dry cells are nodata, but a wet cell of exactly 0.0 ft is
    # not meaningfully wet either, and RASMapper writes plenty of them at the
    # extent edge. Rendering them opaque would draw a hard collar of the ramp's
    # lightest colour around every flood.
    valid &= data > 0

    scaled = np.clip((data - lo) / (hi - lo), 0.0, 1.0)
    index = (scaled * 255).astype(np.uint8)
    table = ramp_table(params.get("colormap_name", [DEFAULT_RAMP])[0])

    rgba = np.zeros((TILE_SIZE, TILE_SIZE, 4), dtype=np.uint8)
    rgba[..., :3] = table[index]
    rgba[..., 3] = np.where(valid, 255, 0).astype(np.uint8)
    return _encode(rgba)


def _encode(rgba: np.ndarray) -> bytes:
    buffer = io.BytesIO()
    Image.fromarray(rgba, mode="RGBA").save(buffer, format="PNG", optimize=False)
    return buffer.getvalue()


def cog_info(path: Path) -> dict:
    with rasterio.open(path) as src:
        band = src.tags(1)
        return {
            "bounds": list(src.bounds),
            "crs": str(src.crs),
            "width": src.width,
            "height": src.height,
            "count": src.count,
            "dtype": str(src.dtypes[0]),
            "nodata_value": src.nodata,
            "overviews": src.overviews(1),
            "band_metadata": [["b1", band]],
            "tags": src.tags(),
        }


def cog_point(path: Path, lon: float, lat: float) -> dict:
    empty = {"coordinates": [lon, lat], "values": [None]}
    with rasterio.open(path) as src:
        nodata = src.nodata
        with WarpedVRT(src, crs="EPSG:4326") as vrt:
            row, col = vrt.index(lon, lat)
            if not (0 <= row < vrt.height and 0 <= col < vrt.width):
                return empty
            value = vrt.read(1, window=((row, row + 1), (col, col + 1)))[0][0]
    if not np.isfinite(value) or (nodata is not None and float(value) == float(nodata)):
        return empty
    return {"coordinates": [lon, lat], "values": [float(value)]}


def make_handler(root: Path):
    class Handler(BaseHTTPRequestHandler):
        server_version = "fim-dev-tiles/1.0"

        def log_message(self, fmt, *args):
            """One compact line per request, with the query string dropped.

            The default logs the whole request line, and a tile URL carries an
            encoded COG URL plus rescale and colormap -- hundreds of characters
            repeated for every tile in the viewport, which buries anything worth
            reading. Dropping the query is not the same as dropping the request:
            an earlier version skipped any line containing "?", which silently
            hid every tile request and left the log looking idle under load.
            """
            request = str(args[0]) if args else ""
            status = str(args[1]) if len(args) > 1 else "-"
            sys.stderr.write("  %s %s\n" % (status, request.split("?", 1)[0]))

        def _send(self, status: int, body: bytes, content_type: str) -> None:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            # The page is served from a different port in development, so every
            # response needs CORS. A production TiTiler sits behind the same
            # origin and does not.
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)

        def _json(self, status: int, payload: dict) -> None:
            self._send(status, json.dumps(payload).encode("utf-8"), "application/json")

        def do_GET(self):  # noqa: N802 - BaseHTTPRequestHandler's interface
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)
            try:
                url = params.get("url", [None])[0]
                if parsed.path in ("/cog/info", "/cog/point") or TILE_RE.match(parsed.path):
                    if not url:
                        raise TileError(400, "missing url parameter")
                    path = _resolve(root, url)

                if match := TILE_RE.match(parsed.path):
                    z, x, y = (int(g) for g in match.groups())
                    self._send(200, render_tile(path, z, x, y, params), "image/png")
                    return
                if parsed.path == "/cog/info":
                    self._json(200, cog_info(path))
                    return
                if parsed.path == "/cog/point":
                    lon = float(params.get("lon", ["0"])[0])
                    lat = float(params.get("lat", ["0"])[0])
                    self._json(200, cog_point(path, lon, lat))
                    return
                if parsed.path in ("/", "/healthz"):
                    self._json(200, {"status": "ok", "root": str(root), "server": self.server_version})
                    return
                raise TileError(404, f"no handler for {parsed.path}")
            except TileError as error:
                self._json(error.status, {"detail": error.message})
            except Exception as error:  # a broken tile must not kill the server
                self._json(500, {"detail": f"{type(error).__name__}: {error}"})

        do_HEAD = do_GET

    return Handler


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--port", type=int, default=8102)
    parser.add_argument("--root", default="src/viewer-1d", help="directory the COG URLs resolve against")
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args(argv)

    root = Path(args.root).resolve()
    if not root.is_dir():
        parser.error(f"root is not a directory: {root}")

    server = ThreadingHTTPServer((args.host, args.port), make_handler(root))
    print(f"dev tiles on http://{args.host}:{args.port}  root={root}")
    print("  set rasterTileBase in src/viewer-1d/config.js to this address")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
