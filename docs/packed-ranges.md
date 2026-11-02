# Experimental packed-depth range loading

Adapted from clb-fim-webmap PR #236 (a17999fd4a9e3e88b1ec3485ed8b3c2681a924a3), CLB Engineering Corporation.

The native session accepts `load(url, {rangeIndexUrl})`. The standalone app also
accepts an optional `range_index` URL on a manually prepared manifest stream.
Omitting it retains the existing small-file WASM path. Generated sites do not
yet automatically publish sidecars; that requires producer/validator qualification.

The index is `fim-packed-stack-ranges/v1`, as produced by fim-commander
`index_packed_stack`. It describes original little-endian uint16 depth chunks,
float32 CF packing, fill value, CRS, GeoTransform and the ordered flow axis.
One chunk is fetched per selected rung. The client checks exact HTTP 206,
Content-Range, Content-Length and compressed SHA-256 before decoding zlib/shuffle.
The host must preserve byte offsets, omit Content-Encoding, and support Range.
Cross-origin hosts must expose these response headers and permit Range requests.
An invalid index or range fails visibly; it never falls back to a whole-file fetch.
Each new immutable stack needs a new matching sidecar. The index must be trusted
publication metadata: per-chunk hashes verify bytes but do not authenticate it.

The range path releases previous sparse layers. Total file size and range offsets
may exceed 2 GiB without entering the WASM filesystem. The existing v1 index
still limits each rung to 33,554,432 cells and compressed chunks to 128 MiB;
tiled larger rungs, automatic publication, deep site validation, browser memory
and timing measurements, cancellation/reselection qualification and actual >2 GiB
file testing remain required. This draft does not complete the PE direction.
