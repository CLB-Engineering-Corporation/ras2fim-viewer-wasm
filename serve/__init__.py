"""Local preview servers.

These stand in for production infrastructure so the frontend's contracts are
exercised in development rather than only after a deploy:

* ``range_server`` serves static files with HTTP byte-range support, which
  PMTiles requires and which ``python -m http.server`` does not provide.
* ``dev_tiles`` implements the handful of TiTiler endpoints the 1D dashboard
  calls, with the same paths, query parameters and response shapes.
* ``preview`` starts what a viewer needs in one command.

Run them as modules -- ``python -m serve.range_server`` -- so they can import
from ``pipeline`` without a sys.path hack. ``dev_tiles`` shares the depth colour
ramp with the published-tile builder for exactly that reason.

None of these is production infrastructure. They are single-process, uncached,
and bind to loopback by default.
"""
