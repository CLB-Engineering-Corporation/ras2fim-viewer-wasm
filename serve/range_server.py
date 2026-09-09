"""Serve the static frontend locally with PMTiles byte-range support.

PMTiles is read with HTTP range requests, so a server that ignores ``Range``
returns the whole archive for every tile fetch and the map appears to hang.

Usage: ``python serve/range_server.py 8100 src/frontend``

The depth COGs need a tile server as well -- see ``serve/dev_tiles.py``.
"""

from __future__ import annotations

import os
import re
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class RangeRequestHandler(SimpleHTTPRequestHandler):
    range_length = 0

    def end_headers(self):
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_head(self):
        requested = self.headers.get("Range")
        if requested is None:
            return super().send_head()
        match = re.fullmatch(r"bytes=(\d*)-(\d*)", requested.strip())
        if not match:
            return super().send_head()

        path = self.translate_path(self.path)
        if not os.path.isfile(path):
            return super().send_head()
        size = os.path.getsize(path)
        start_text, end_text = match.groups()
        if start_text == "":
            length = int(end_text)
            start, end = max(0, size - length), size - 1
        else:
            start = int(start_text)
            end = int(end_text) if end_text else size - 1
        end = min(end, size - 1)
        if start > end or start >= size:
            self.send_response(416)
            self.send_header("Content-Range", f"bytes */{size}")
            self.end_headers()
            return None

        stream = open(path, "rb")
        stream.seek(start)
        self.range_length = end - start + 1
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(self.range_length))
        self.end_headers()
        return stream

    def copyfile(self, source, outputfile):
        if not self.range_length:
            return super().copyfile(source, outputfile)
        remaining = self.range_length
        while remaining:
            data = source.read(min(64 * 1024, remaining))
            if not data:
                break
            try:
                outputfile.write(data)
            except (BrokenPipeError, ConnectionResetError):
                break
            remaining -= len(data)
        self.range_length = 0


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8098
    directory = sys.argv[2] if len(sys.argv) > 2 else os.getcwd()
    # Loopback by default. To preview from another machine, pass that host's
    # own address explicitly -- a specific interface, never 0.0.0.0, so what is
    # reachable is a deliberate choice rather than everything the box can see.
    host = sys.argv[3] if len(sys.argv) > 3 else "127.0.0.1"
    handler = partial(RangeRequestHandler, directory=directory)
    server = ThreadingHTTPServer((host, port), handler)
    print(f"FIM preview: http://{host}:{port}/ (serving {directory})", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
