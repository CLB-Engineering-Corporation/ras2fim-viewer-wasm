"""Opt-in real decoder cases, independent of either WASM decoder."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import netCDF4

from tests.fixture_nc import write_stack

root = Path(".terrio-validation/fixtures")
for case in [
    "wsel",
    "depth",
    "unequal",
    "nofill",
    "receding",
    "missing",
    "rotated",
    "badshape",
    "float",
]:
    path = write_stack(
        root / f"{case}.nc",
        variable="depth" if case == "depth" else "wsel",
        flows=(0.5, 1.75, 2.25),
        rotated=case == "rotated",
        stream_id=case,
    )
    with netCDF4.Dataset(path, "a") as nc:
        v = nc["depth" if case == "depth" else "wsel"]
        v.set_auto_maskandscale(False)
        if case == "unequal":
            nc["terrain"].scale_factor = 0.25
            nc["terrain"].add_offset = 7.5
        elif case == "nofill":
            v.delncattr("_FillValue")
        elif case == "receding":
            data = v[:].copy()
            data[0] = data[-1]
            data[-1] = 65535
            data[1, 0, 0] = 0
            v[:] = data
        elif case == "missing":
            nc.renameVariable("wsel", "unknown")
        elif case == "badshape":
            nc.renameVariable("wsel", "old")
            nc.createVariable("wsel", "u2", ("y", "x"))[:] = 1
        elif case == "float":
            data = v[:].astype("float32")
            nc.renameVariable("wsel", "old")
            v = nc.createVariable("wsel", "f4", ("flow", "y", "x"), zlib=True, fill_value=65535)
            v.units = "ft"
            v[:] = data
    if case == "wsel":
        (root / "truncated.nc").write_bytes(path.read_bytes()[:24])
print(root)
