// Adapted from clb-fim-webmap PR #236, a17999fd (CLB Engineering Corporation).
// Gen 4 CF-packed stacks: one whole-rung HDF5 chunk per range request.
// No whole-file fallback. Callers keep one selected reach and release each plane.
export function validatePackedIndex(index) {
  const integer = (x) => Number.isSafeInteger(x) && x > 0;
  if (index?.schema !== "fim-packed-stack-ranges/v1" || index.dtype !== "uint16"
      || index.byteorder !== "little" || index.packing_arithmetic !== "float32_multiply_then_float32_add"
      || !/^[a-f0-9]{64}$/.test(index.sha256) || !integer(index.bytes)
      || !Array.isArray(index.shape) || index.shape.length !== 3 || !index.shape.every(integer)
      || index.shape[1] * index.shape[2] > 33554432
      || !Array.isArray(index.chunks) || index.chunks.length !== index.shape[0]
      || !Number.isFinite(index.scale_factor) || index.scale_factor <= 0
      || !Number.isFinite(index.add_offset) || !Number.isInteger(index.fill_value)
      || index.fill_value < 0 || index.fill_value > 65535
      || !Array.isArray(index.filters) || index.filters.length > 2) throw new Error("invalid packed stack index");
  const ids = index.filters.map((f) => f.id);
  if (!ids.every((id, i) => [1, 2].includes(id) && ids.indexOf(id) === i)
      || (ids.includes(1) && ids.includes(2) && ids.join() !== "2,1")
      || index.filters.some((f) => f.id === 2 && String(f.parameters) !== "2")) throw new Error("unsupported packed stack filters");
  for (const chunk of index.chunks) {
    if (!Number.isSafeInteger(chunk.offset) || chunk.offset < 0 || !integer(chunk.length)
        || !/^[a-f0-9]{64}$/.test(chunk.sha256)
        || chunk.length > 134217728 || chunk.offset + chunk.length > index.bytes) throw new Error("invalid packed chunk range");
  }
  return index;
}

async function boundedBytes(response, limit) {
  const reader = response.body.getReader();
  const parts = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("packed chunk exceeds declared size");
      parts.push(value);
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return bytes;
}

/** Decode one chunk, preserving NetCDF float32 arithmetic and the dry mask. */
export async function decodePackedRung(index, bytes) {
  validatePackedIndex(index);
  const cells = index.shape[1] * index.shape[2];
  for (const filter of [...index.filters].reverse()) {
    if (filter.id === 1) {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
      bytes = await boundedBytes(new Response(stream), cells * 2);
    } else {
      if (bytes.length !== cells * 2) throw new Error("invalid shuffled chunk size");
      const unshuffled = new Uint8Array(bytes.length);
      for (let i = 0; i < cells; i++) { unshuffled[2 * i] = bytes[i]; unshuffled[2 * i + 1] = bytes[cells + i]; }
      bytes = unshuffled;
    }
  }
  if (bytes.length !== cells * 2) throw new Error("invalid decoded chunk size");
  const raw = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const depths = new Float32Array(cells);
  const dry = new Uint8Array(cells);
  for (let i = 0; i < cells; i++) {
    const value = raw.getUint16(i * 2, true);
    dry[i] = value === index.fill_value ? 1 : 0;
    depths[i] = dry[i] ? NaN : Math.fround(Math.fround(value * index.scale_factor) + index.add_offset);
  }
  return { depths, dry };
}

/** One selected rung, HTTP 206 only; artifactBase is trusted site configuration.
 * key is a manifest-relative immutable object key, never a request parameter.
 * signal cancels obsolete selections. No planes are cached by this reader.
 */
export async function readPackedRung(artifactBase, key, index, rung, { signal, fetcher = fetch } = {}) {
  validatePackedIndex(index);
  if (!Number.isInteger(rung) || rung < 0 || rung >= index.shape[0]) throw new Error("invalid rung");
  if (typeof key !== "string" || !key || key.startsWith("/") || key.includes("\\")
      || key.split("/").some((p) => !/^[a-zA-Z0-9_.-]+$/.test(p) || p === "." || p === "..")) throw new Error("invalid artifact key");
  const url = new URL(key, artifactBase);
  // Each compressed range is independently SHA-256 checked below.
  const chunk = index.chunks[rung];
  const end = chunk.offset + chunk.length - 1;
  const response = await fetcher(url, { signal, headers: { Range: `bytes=${chunk.offset}-${end}` } });
  if (response.status !== 206 || response.headers.get("Content-Encoding")
      || response.headers.get("Content-Range") !== `bytes ${chunk.offset}-${end}/${index.bytes}`
      || Number(response.headers.get("Content-Length")) !== chunk.length) throw new Error("invalid packed stack range response");
  const bytes = await boundedBytes(response, chunk.length);
  if (bytes.length !== chunk.length) throw new Error("truncated packed stack chunk");
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const hash = Array.from(digest, value => value.toString(16).padStart(2, "0")).join("");
  if (hash !== chunk.sha256) throw new Error("packed chunk checksum mismatch");
  const plane = await decodePackedRung(index, bytes);
  if (signal?.aborted) throw new DOMException("selection cancelled", "AbortError");
  return { ...plane, rung, transferBytes: bytes.length };
}
