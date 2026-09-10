"""The depth colour ramp, defined once.

Three things have to agree on what a depth of 12.4 ft looks like: the published
PMTiles, which bake the ramp into PNG pixels at build time; ``serve/dev_tiles.py``,
which applies it per request while standing in for TiTiler; and the legend the
viewer draws beside the map. Two of those are Python and share this module. The
legend is CSS and cannot, so ``stops()`` exists to generate it rather than have
someone retype the hex.

The names match TiTiler's, so the same ``colormap_name`` renders comparably
whether a deployment tiles through TiTiler or ships static tiles.

Two rules the ramp cannot express on its own, and which every caller must apply:

* **Rescale against the library maximum, never the profile's own.** A per-profile
  stretch renders every profile with the same darkest blue, which hides the one
  thing a stage slider exists to show.
* **A depth of exactly zero is not inundation.** RASMapper writes plenty of
  zero-depth cells at the extent edge; painting them draws a hard collar of the
  ramp's lightest colour around every flood.
"""

from __future__ import annotations

#: (position 0-1, R, G, B) control points, interpolated linearly between.
COLORMAPS: dict[str, list[tuple[float, int, int, int]]] = {
    "blues": [
        (0.00, 234, 243, 251),
        (0.25, 158, 202, 225),
        (0.50, 66, 146, 198),
        (0.75, 8, 81, 156),
        (1.00, 8, 48, 107),
    ],
    "ylorrd": [
        (0.00, 255, 255, 178),
        (0.25, 254, 217, 118),
        (0.50, 253, 141, 60),
        (0.75, 240, 59, 32),
        (1.00, 189, 0, 38),
    ],
    "ylgnbu": [
        (0.00, 255, 255, 217),
        (0.25, 161, 218, 180),
        (0.50, 65, 182, 196),
        (0.75, 34, 94, 168),
        (1.00, 12, 44, 132),
    ],
}

DEFAULT = "blues"


def control_points(name: str = DEFAULT) -> list[tuple[float, int, int, int]]:
    """The named ramp's control points, falling back to the default."""
    return COLORMAPS.get(str(name).lower(), COLORMAPS[DEFAULT])


def table(name: str = DEFAULT):
    """A 256x3 uint8 lookup table. Requires numpy; the callers all have it."""
    import numpy as np

    points = control_points(name)
    positions = np.array([p[0] for p in points])
    out = np.zeros((256, 3), dtype=np.uint8)
    x = np.linspace(0.0, 1.0, 256)
    for channel in range(3):
        values = np.array([p[channel + 1] for p in points], dtype=float)
        out[:, channel] = np.interp(x, positions, values).astype(np.uint8)
    return out


def stops(name: str = DEFAULT) -> list[tuple[float, str]]:
    """Control points as (position, "#rrggbb"), for generating CSS or JSON."""
    return [(p[0], "#%02x%02x%02x" % (p[1], p[2], p[3])) for p in control_points(name)]


def css_gradient(name: str = DEFAULT, angle: str = "to right") -> str:
    """A CSS ``linear-gradient`` matching the raster ramp exactly."""
    parts = ", ".join(f"{colour} {pos * 100:g}%" for pos, colour in stops(name))
    return f"linear-gradient({angle}, {parts})"
