"""Hold each platform's synthetic default-dispatch output to the reviewed Windows wheel's.

    python tests/terrio-synthetic-compare.py WINDOWS_REPORT PLATFORM_REPORT...

Both come from the same workflow run, i.e. the same GDAL/PROJ stack, so the
Windows report (from the originally reviewed win_amd64 wheel) is the reference.

Gate: where a platform's tilers received the same RGBA raster (``tiler_input``:
identical pixel bytes, geotransform, size and CRS identity), its Terrio tile
RGBA must equal the Windows wheel's byte for byte; a difference there is the
native build behaving differently.
Where the shared input differs but the Terrio RGBA is still byte-identical,
that is reported as identity with the input differences named. Where both
differ, the cause is upstream of Terrio (GDAL-side floating point on that
architecture) and Terrio identity is not attributable; that is reported with
the GDAL-side comparison, never silently passed as "identical". With only
Windows and Linux x86_64 reviewed (Terrio 0.9.0), Linux's tiler input has
always differed from Windows' in the last bits of the geotransform. Same-platform Terrio-vs-GDAL coverage/alpha/zoom/bounds are
already gated inside each report's own run.
"""

import json
import sys
from pathlib import Path

reference = json.loads(Path(sys.argv[1]).read_text())
assert reference["platform"] == "win32", "the reference is the reviewed Windows wheel's report"
summary, failed = [], False
for path in sys.argv[2:]:
    report = json.loads(Path(path).read_text())
    assert report["source_values_sha256"] == reference["source_values_sha256"], "generated source differs"
    for ref, got in zip(reference["profiles"], report["profiles"], strict=True):
        same_supplied = ref["supplied_level_sha256"] == got["supplied_level_sha256"]
        same_input = ref["tiler_input"] == got["tiler_input"]
        terrio_same = ref["terrio_tile_rgba_sha256"] == got["terrio_tile_rgba_sha256"]
        gdal_same = ref["gdal_tile_rgba_sha256"] == got["gdal_tile_rgba_sha256"]
        row = {"report": path, "platform": report["platform"], "profile": ref["profile"],
               "supplied_cog_arrays_identical": same_supplied, "tiler_input_identical": same_input,
               "tiler_input_differences": sorted(k for k in ref["tiler_input"] if ref["tiler_input"][k] != got["tiler_input"][k]),
               "terrio_rgba_identical": terrio_same, "gdal_rgba_identical": gdal_same,
               "tiles": [ref["tiles"], got["tiles"]],
               "rgb_vs_gdal_pixels": [ref["rgb_different_pixels"], got["rgb_different_pixels"]],
               "rgb_vs_gdal_max": [ref["rgb_max_channel_difference"], got["rgb_max_channel_difference"]]}
        if same_input and not terrio_same:
            failed = True
            row["verdict"] = "FAIL: identical tiler input, different Terrio output"
        elif same_input:
            row["verdict"] = "Terrio output byte-identical to the reviewed Windows wheel"
        elif terrio_same:
            # Identical output despite differing input is identity evidence, not an
            # attribution question: since 0.9.0 the only other platform is Linux x86_64,
            # whose GDAL warp differs from Windows' in the last bits of the geotransform.
            row["verdict"] = ("Terrio output byte-identical to the reviewed Windows wheel "
                              "(tiler input differs: " + ", ".join(row["tiler_input_differences"]) + ")")
        else:
            row["verdict"] = "not attributable: GDAL-side tiler input differs on this platform"
        summary.append(row)
print(json.dumps(summary, indent=2))
compared = [r for r in summary if r["tiler_input_identical"] or r["terrio_rgba_identical"]]
if not compared:
    # Otherwise a drifted GDAL stack would turn this gate into a silent no-op.
    print("FAIL: no platform received input identical to the reference or produced identical "
          "Terrio output; nothing was compared")
    failed = True
sys.exit(1 if failed else 0)
