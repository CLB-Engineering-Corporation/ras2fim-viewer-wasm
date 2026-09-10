"""Start both preview servers on one host, with one command.

The map needs two: static files with byte-range support for PMTiles, and a tile
server for the depth COGs. Starting them separately is two chances to bind them
to different hosts, and the failure mode when that happens is quiet -- the page
loads with every vector layer drawn and no depth grid, which reads as missing
data rather than a wrong address.

    python serve/preview.py                       # this machine only
    python serve/preview.py --host 10.0.0.42      # reachable from the LAN

``--host`` takes one specific address, never ``0.0.0.0``: what becomes reachable
should be a deliberate choice, not every interface the machine happens to have.
Both servers are read-only and serve only what is under ``--root``.
"""

from __future__ import annotations

import argparse
import socket
import sys
import threading
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from dev_tiles import make_handler as make_tile_handler  # noqa: E402
from range_server import RangeRequestHandler  # noqa: E402

DEFAULT_STATIC_PORT = 8100
DEFAULT_TILE_PORT = 8102


def _check_port(host: str, port: int) -> str | None:
    """Return a message if something already holds ``host:port``."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.settimeout(0.5)
        if probe.connect_ex((host, port)) == 0:
            return f"{host}:{port} is already in use -- stop the old server first"
    return None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="one specific address to bind (default loopback). Use this machine's "
        "own LAN or Tailscale address to preview from another device.",
    )
    parser.add_argument("--root", default="src/viewer-1d", help="frontend directory to serve")
    parser.add_argument("--port", type=int, default=DEFAULT_STATIC_PORT)
    parser.add_argument("--tile-port", type=int, default=DEFAULT_TILE_PORT)
    args = parser.parse_args(argv)

    if args.host in ("0.0.0.0", "::"):
        parser.error(
            "refusing to bind every interface. Pass this machine's own address "
            "(see `ipconfig`) so what is exposed is an explicit choice."
        )

    root = Path(args.root).resolve()
    if not root.is_dir():
        parser.error(f"root is not a directory: {root}")
    if not (root / "index.html").is_file():
        parser.error(f"no index.html under {root} -- is --root the frontend directory?")
    if not (root / "manifest.json").is_file():
        parser.error(
            f"no manifest.json under {root}. Run pipeline/fim1d/manifest.py before previewing."
        )

    for port in (args.port, args.tile_port):
        if message := _check_port(args.host, port):
            print(f"FAIL  {message}", flush=True)
            return 2

    static = ThreadingHTTPServer(
        (args.host, args.port), partial(RangeRequestHandler, directory=str(root))
    )
    tiles = ThreadingHTTPServer((args.host, args.tile_port), make_tile_handler(root))

    # The tile port is not configurable in the browser: config.js derives the
    # host from the page's own location and appends 8102. Say so rather than
    # letting a non-default --tile-port fail silently in the map.
    if args.tile_port != DEFAULT_TILE_PORT:
        print(
            f"NOTE  src/viewer-1d/config.js expects the tile server on {DEFAULT_TILE_PORT}; "
            f"update rasterTileBase to use {args.tile_port}.",
            flush=True,
        )

    for server, label in ((static, "static"), (tiles, "tiles")):
        thread = threading.Thread(target=server.serve_forever, name=label, daemon=True)
        thread.start()

    print(f"\n  FIM dashboard   http://{args.host}:{args.port}/", flush=True)
    print(f"  depth tiles     http://{args.host}:{args.tile_port}/", flush=True)
    print(f"  serving         {root}", flush=True)
    if args.host != "127.0.0.1":
        print(f"\n  Reachable from other devices that can route to {args.host}.", flush=True)
        print("  Read-only, and no authentication -- stop it when you are done.", flush=True)
    print("\n  Ctrl+C to stop.\n", flush=True)

    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        print("\nstopped", flush=True)
        static.shutdown()
        tiles.shutdown()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
