"""Generate the small producer seam fixture using ras2cng PR30, beb84e96."""
from pathlib import Path
import tempfile
import numpy as np
import rasterio
from rasterio.transform import from_origin
from ras2cng.depth_stack import write_depth_stack

out = Path(__file__).parent / "fixtures/writer-depth.nc"
with tempfile.TemporaryDirectory() as folder:
    sources = []
    for i, values in enumerate([
        [[0, 1.25, -9999], [-2, 2.5, 0]],
        [[3, 0, 8.25], [-9999, -1, 0]],
        [[0, -9999, 4.5], [0, 2, 1]],
    ]):
        path = Path(folder) / f"{i}.tif"
        with rasterio.open(path, "w", driver="GTiff", width=3, height=2,
                           count=1, dtype="float32", crs="EPSG:3857",
                           transform=from_origin(100, 200, 3, 3), nodata=-9999) as dst:
            dst.write(np.array(values, dtype="float32"), 1)
        sources.append(path)
    write_depth_stack(sources, out, profiles=["source-p03", "source-p01", "source-p02"],
                      vertical_unit="ft", include_source_hashes=False,
                      provenance={"producer": "writer seam test", "role": "display_derivative"})
print(out)
