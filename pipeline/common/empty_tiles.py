"""The explicit all-dry PMTiles sentinel, shared with publication validation."""
import base64

TRANSPARENT_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBg"
    "AAAABQABpfZFQAAAAABJRU5ErkJggg==")
EMPTY_REPRESENTATION = "transparent-z0-sentinel"


def validate_empty_archive(path) -> None:
    """Check the deliberately small sentinel without optional GIS dependencies."""
    import gzip
    import json
    import zlib

    if path.stat().st_size > 16384:
        raise ValueError("empty PMTiles exceeds sentinel size bound")
    data = path.read_bytes()
    if len(data) > 16384 or len(data) < 127 or data[:8] != b"PMTiles\x03":
        raise ValueError("invalid empty PMTiles header or size")
    def number(offset):
        return int.from_bytes(data[offset:offset + 8], "little")
    if (tuple(number(o) for o in (72, 80, 88)) != (1, 1, 1)
            or data[97:102] != bytes((2, 1, 2, 0, 0))):
        raise ValueError("empty PMTiles must contain one uncompressed PNG at zoom zero")
    sections = []
    for offset in (8, 24, 40, 56):
        start, length = number(offset), number(offset + 8)
        if start < 127 or start + length > len(data):
            raise ValueError("empty PMTiles section outside archive")
        sections.append(data[start:start + length])
    root, metadata, leaves, tile = sections
    try:
        root = gzip.decompress(root)
        metadata = json.loads(gzip.decompress(metadata))
    except (OSError, EOFError, ValueError, zlib.error) as error:
        raise ValueError("invalid empty PMTiles compressed directory or metadata") from error
    if not isinstance(metadata, dict):
        raise ValueError("empty PMTiles metadata must be an object")
    # Directory varints: one entry, tile-id delta 0, run length 1,
    # payload length, and offset+1=1 (the first payload starts at zero).
    if root != bytes((1, 0, 1, len(TRANSPARENT_PNG), 1)) or leaves:
        raise ValueError("empty PMTiles directory is not the z0 sentinel")
    if (metadata.get("empty") is not True
            or metadata.get("empty_representation") != EMPTY_REPRESENTATION
            or tile != TRANSPARENT_PNG):
        raise ValueError("empty PMTiles metadata or transparent payload mismatch")
