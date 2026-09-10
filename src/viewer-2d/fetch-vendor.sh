#!/usr/bin/env bash
# Populate this prototype's vendor/ directory.
#
# These are pinned, not committed. h5wasm's self-contained IIFE build is 5.7 MB
# (the wasm is embedded as base64) and MapLibre is another 1.1 MB that the
# production frontend already carries -- 6.9 MB of permanent history for a
# prototype is a bad trade when two pinned URLs reproduce it exactly.
#
#   bash src/viewer-2d/fetch-vendor.sh
#
# The production frontend under src/viewer-1d/vendor/ IS committed: that one is
# the deliverable, and a release has to be reproducible without the network.
set -euo pipefail

H5WASM_VERSION="0.10.3"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
vendor="$here/vendor"
mkdir -p "$vendor"

fetch() {
  local url="$1" dest="$2"
  if [ -s "$dest" ]; then
    printf '  have  %s\n' "$(basename "$dest")"
    return
  fi
  printf '  get   %s\n' "$(basename "$dest")"
  curl -fsSL -o "$dest" "$url"
}

echo "vendor -> $vendor"
fetch "https://cdn.jsdelivr.net/npm/h5wasm@${H5WASM_VERSION}/dist/iife/h5wasm.js" "$vendor/h5wasm.js"

# MapLibre is copied from the production frontend rather than re-downloaded, so
# the prototype cannot drift onto a different version than the real map.
for asset in maplibre-gl.js maplibre-gl.css; do
  if [ ! -s "$vendor/$asset" ]; then
    printf '  copy  %s\n' "$asset"
    cp "$here/../frontend/vendor/$asset" "$vendor/$asset"
  else
    printf '  have  %s\n' "$asset"
  fi
done

echo
echo "Sample data is not fetched: copy two streams from ras2fim-2d, e.g."
echo "  cp <ras2fim-2d>/sample_data/sample_output/06_simple_rasters/03_wsel_nc_filtered/*.nc \\"
echo "     $here/data/"
