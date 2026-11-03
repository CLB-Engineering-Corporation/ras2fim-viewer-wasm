/* tslint:disable */
/* eslint-disable */

/**
 * A raster or vector dataset opened from bytes.
 */
export class Dataset {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * The summary `terrio info --json` prints, as an object.
     */
    info(stats?: boolean | null, hist?: boolean | null): any;
    /**
     * The vector layer names.
     */
    layerNames(): string[];
    /**
     * Reads a band (numbered from 1) as a typed array of its own type (`Float32Array`,
     * `Uint8Array`...), row after row. `window` is `[col_off, row_off, width, height]` (in the
     * overview's pixels with `overview`, numbered from 0); by default, the whole image.
     */
    readBand(band: number, window?: Uint32Array | null, overview?: number | null): any;
    /**
     * A vector layer (by name or position, the first by default) as an Arrow IPC stream, with
     * its geometries in a GeoArrow column (and the CRS as PROJJSON in its metadata): read it
     * with Apache Arrow JS (`tableFromIPC`), DuckDB-Wasm or GeoArrow-aware libraries.
     *
     * Options: `geometryEncoding` (`"wkb"`, the default, or `"geoarrow"` for the native
     * encodings) and `coordinates` (`"separated"` or `"interleaved"`).
     */
    toArrowIPC(layer: any, options: any): Uint8Array;
    /**
     * Writes the dataset in a format, to bytes: the format of `filename`'s extension, or
     * `options.format`. Options: `format`, `tSrs` (reproject), and for vector datasets `layers`,
     * `where`, `select`, `limit` and `kmzResources` (files packed into a KMZ, such as icon images:
     * `{ "icons/pin.png": Uint8Array }`), for rasters `srcwin`, `overview`, `bands`, `compress`
     * (GeoTIFF/COG: `NONE`, `LZW`, `DEFLATE`, `PACKBITS`, `ZSTD`, `LERC`, `LERC_DEFLATE`,
     * `LERC_ZSTD`, `JXL`, `JPEG`), `tileSize` and `creationOptions` (GDAL's: `MAX_Z_ERROR`,
     * `JPEG_QUALITY`, `PREDICTOR`, `FORMAT=NC4` for netCDF, `FORMAT=ZARR_V3` for Zarr...),
     * `overviews` (GeoTIFF factors such as `[2,4,8]`) and `overviewResampling`. Zarr
     * stores come back as a zip archive of their files. Shapefile output requires
     * `roads.shp.zip` (MIME `application/zip`); `.shp` alone is refused. The ZIP holds
     * `.shp`, `.shx`, `.dbf`, `.cpg` and, when a CRS is present, `.prj`.
     * GeoTIFF/COG preserve dataset masks for raster writes without tSrs; a masked raster with
     * tSrs is refused because separate-mask reprojection is not implemented.
     * Text over 254 UTF-8 bytes and unsupported DBF values are explicit errors.
     * Vector GeoPackage option `preserveDeclaredGeometryType` retains the layer's
     * declared geometry type, including Unknown, instead of inferring it.
     * CityJSON output: `cityjsonVersion` is "1.1" or "2.0" (the default).
     * CityGML output: `citygmlVersion` is "2.0" or "3.0" (the default).
     */
    toBytes(filename: string, options: any): Uint8Array;
    /**
     * A vector layer (by name or position, the first by default) as a GeoJSON FeatureCollection
     * object, in the layer's CRS.
     */
    toGeoJSON(layer: any): any;
    /**
     * The number of raster bands.
     */
    readonly count: number;
    /**
     * The CRS: `EPSG:xxxx` when its code is known, otherwise its WKT, or `undefined`. For vector
     * datasets, the first layer's.
     */
    readonly crs: string | undefined;
    /**
     * The pixel type: `uint8`, `int16`, `float32`...
     */
    readonly dtype: string;
    /**
     * The raster height in pixels.
     */
    readonly height: number;
    /**
     * `"raster"` or `"vector"`.
     */
    readonly kind: string;
    /**
     * The raster's nodata value, or `undefined`.
     */
    readonly nodata: number | undefined;
    /**
     * The overview sizes `[[width, height], ...]`, largest first.
     */
    readonly overviews: any;
    /**
     * The shared styles of a KML or KMZ document, `{ id: "PEN(...)" }`. Features
     * using one have `@id` in their `OGR_STYLE` field. Empty for other formats. `toBytes` writes
     * them to KML and KMZ; for other formats it gives each feature its style.
     */
    readonly styleTable: object;
    /**
     * The GDAL-style geotransform `[x_origin, pixel_width, 0, y_origin, 0, -pixel_height]`.
     */
    readonly transform: Float64Array;
    /**
     * The raster width in pixels.
     */
    readonly width: number;
}

/**
 * Polygon index plus driver metadata, for GeoPackage/FlatGeobuf GTI output.
 */
export class DatasetIndex {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * The polygons as an ordinary vector Dataset (without driver metadata).
     */
    layer(): Dataset;
    /**
     * Encode the index with metadata. Default filename index.gpkg; use .shp.zip for Shapefile.
     * Options: format (otherwise inferred from filename).
     */
    toBytes(filename: string | null | undefined, options: any): Uint8Array;
    /**
     * Number of indexed datasets/layers.
     */
    readonly count: number;
    /**
     * Layer metadata retained when serializing the index.
     */
    readonly metadata: any;
}

/**
 * A numeric array with lazy dimension indexing, slicing and transposition.
 */
export class MultidimArray {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Array metadata with the current view's dimensions and the source chunk layout.
     */
    info(): any;
    /**
     * Select and remove a zero-based current axis, including repeated dimension names.
     */
    iselAxis(axis: number, index: number): MultidimArray;
    /**
     * Select and remove one axis by dimension name, without reading data.
     */
    isel(dimension: string, index: number): MultidimArray;
    /**
     * Fetch the selected values as a flat native TypedArray; use shape to interpret its axes.
     * Int64 and UInt64 values use BigInt64Array and BigUint64Array without a Number conversion.
     */
    read(): any;
    /**
     * Slice a zero-based current axis position.
     */
    sliceAxis(axis: number, start: number, count: number, step?: number | null): MultidimArray;
    /**
     * Select a named-axis range; a positive step defaults to one. No payload is read yet.
     */
    slice(dimension: string, start: number, count: number, step?: number | null): MultidimArray;
    /**
     * Reorder all remaining axes by name, or reverse their order when omitted.
     */
    transpose(dimensions: any): MultidimArray;
    /**
     * Names of the current axes.
     */
    readonly dimensionNames: string[];
    /**
     * Absolute source-array path.
     */
    readonly path: string;
    /**
     * Current shape after indexed axes are removed and transposition applied.
     */
    readonly shape: Uint32Array;
}

/**
 * A native scientific dataset containing groups, dimensions and lazy numeric arrays.
 */
export class MultidimDataset {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Return a lazy numeric array by its absolute path.
     */
    array(name: string): MultidimArray;
    /**
     * Reads every numeric array and coordinate, including in-memory Zarr stores.
     */
    check(): any;
    /**
     * Complete group/array metadata without reading numeric array payloads.
     */
    info(): any;
    /**
     * Serialize a numeric snapshot as netCDF-4 bytes.
     */
    toBytes(): Uint8Array;
    /**
     * Serialize a numeric Zarr v2 snapshot as relative keys mapped to Uint8Array values.
     */
    toZarrStore(): any;
    /**
     * Numeric array paths, in group order.
     */
    readonly arrayPaths: string[];
}

/**
 * Rasters gathered into one netCDF-4 file, each in its group: `add` them, then `toBytes`.
 *
 * ```js
 * const nc = new NetcdfGroups();
 * nc.add("/terrain/dem", dem);
 * nc.add("/terrain/slope", slope);
 * const bytes = nc.toBytes({ COMPRESS: "DEFLATE" }); // read back as NETCDF:"x.nc":/terrain/slope/Band1
 * ```
 */
export class NetcdfGroups {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Adds a raster in a group: a path such as `/terrain/dem` (groups are created as needed), or
     * `/` for the root group. The raster is read whole.
     */
    add(group: string, dataset: Dataset): void;
    /**
     * An empty set of groups.
     */
    constructor();
    /**
     * Encodes the rasters as one netCDF-4 file, with netCDF creation options as GDAL names them
     * (`FORMAT`, `COMPRESS`, `ZLEVEL`, `CHUNKING`).
     */
    toBytes(creation_options: any): Uint8Array;
    /**
     * The number of rasters added.
     */
    readonly length: number;
}

/**
 * A pipeline's final Dataset and deferred named output files.
 */
export class PipelineResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Encode outputs as an object mapping filenames to Uint8Arrays.
     */
    outputBytes(): object;
    /**
     * Final dataset, or undefined when saving a GDALG definition.
     */
    readonly dataset: Dataset | undefined;
    /**
     * Destinations requested by write and named materialize steps.
     */
    readonly outputNames: Array<any>;
}

/**
 * A remote file read lazily with HTTP range requests: see [`open_url`]. Its reads return
 * promises.
 */
export class RemoteDataset {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * PMTiles: a tile's bytes (decompressed), or `undefined` when the archive does not have it.
     * `y` counts rows from the top, as in XYZ tile URLs.
     */
    getTile(z: number, x: number, y: number): Promise<any>;
    /**
     * What the header says: for rasters, the summary `terrio info --json` prints; for tiles, the
     * zoom levels, bounds, tile format and metadata; for point clouds, the LAS header; for
     * FlatGeobuf, the feature count, extent and index; for GeoParquet, the row groups.
     */
    info(): any;
    /**
     * Rasters: reads a band (from 1) as a typed array, fetching only the tiles of the window
     * (`[colOff, rowOff, width, height]`, in the overview's pixels with `overview`).
     */
    readBand(band: number, window?: Uint32Array | null, overview?: number | null): Promise<any>;
    /**
     * Reads into memory, as a `Dataset` (rasters, vector data) or a `PointCloud`:
     *
     * - rasters: `window`, `overview`, `bands`;
     * - vector tiles: `zoom` (the highest by default), `layers`, `bbox` (EPSG:3857);
     * - COPC: the options of `readPoints` (`bounds`, `zRange`, `classes`, `returns`,
     *   `maxLevel`, `resolution`, `maxPoints`), fetching only the octree nodes needed;
     * - FlatGeobuf: `bbox`, finding the features with the spatial index;
     * - GeoParquet: `rowGroups`, `bbox` (skipping row groups by their statistics).
     *
     * With `bbox`, the features are those that intersect it, as `ogr2ogr -spat` keeps them.
     */
    read(options: any): Promise<any>;
    /**
     * The requests sent and the bytes received so far: `{ requests, bytes }`.
     */
    stats(): any;
    /**
     * Rasters: the number of bands.
     */
    readonly count: number;
    /**
     * The CRS: `EPSG:xxxx` when its code is known, otherwise its WKT.
     */
    readonly crs: string | undefined;
    /**
     * Rasters: the pixel type.
     */
    readonly dtype: string;
    /**
     * The format: `GTiff`, `PMTiles`, `COPC`, `FlatGeobuf` or `Parquet`.
     */
    readonly format: string;
    /**
     * Rasters: the height in pixels.
     */
    readonly height: number;
    /**
     * `"raster"` (a GeoTIFF, or PMTiles of images), `"tiles"` (PMTiles of vector tiles),
     * `"pointcloud"` (COPC) or `"vector"` (FlatGeobuf, GeoParquet).
     */
    readonly kind: string;
    /**
     * Rasters: the nodata value.
     */
    readonly nodata: number | undefined;
    /**
     * Rasters: the overview sizes `[[width, height], ...]`, largest first.
     */
    readonly overviews: any;
    /**
     * The file's size in bytes.
     */
    readonly size: number;
    /**
     * Rasters: the GDAL-style geotransform.
     */
    readonly transform: Float64Array;
    /**
     * The URL.
     */
    readonly url: string;
    /**
     * Rasters: the width in pixels.
     */
    readonly width: number;
}

/**
 * Adds internal GeoTIFF overview levels and returns updated file bytes.
 * Options: levels, minSize, resampling, compression, ignoreCogLayoutBreak.
 */
export function addOverviews(bytes: Uint8Array, options: any): Uint8Array;

/**
 * One vector feature per pixel (`gdal raster as-features`). Options: `bands` (from 1, all by
 * default), `geometryType` (`none`, `point` or `polygon`), `skipNodata`, `includeXy`,
 * `includeRowCol`, `layerName` (`pixels`).
 */
export function asFeatures(src: any, options: any): Dataset;

/**
 * Attaches a palette without changing Byte/UInt16 indices, nodata or the dataset mask.
 * colorMap accepts a palette Dataset/file, color-file text or RGBA arrays.
 */
export function attachPalette(src: any, color_map: any): Dataset;

/**
 * Blends equal-sized Byte images. Options: operator (GDAL name), opacity (0..100).
 */
export function blend(src: any, overlay: any, options: any): Dataset;

/**
 * Planar buffers in CRS units. Options: quadrantSegments (default 30).
 */
export function buffer(src: any, distance: number, options: any): Dataset;

/**
 * Evaluates band math over rasters, as `terrio calc` (GDAL's `gdal_calc.py`), with NumPy's
 * typing rules so that results match `gdal_calc.py`.
 *
 * `expression`: an expression, or an array of them (one per output band), in NumPy syntax.
 * `inputs`: the rasters by the names the expressions use, `{ A: dem, B: other }`. Options:
 * `bands` (the band of each input, `{ A: 2 }`; 1 by default), `type`, `nodata` (a number or
 * `"none"`), `hideNodata`, `extent` (`ignore`, `fail`, `union`, `intersect`), `projwin`,
 * `allBands` (the input whose every band is processed), `projectionCheck`.
 */
export function calc(expression: any, inputs: any, options: any): Dataset;

/**
 * Polygon coverage errors as MultiLineStrings, with CRS retained, empty attributes and new IDs.
 * Each polygon must individually be valid. Options: `maximumGapWidth` (input CRS
 * units; zero disables narrow gaps), `includeValid` (empty lines for valid features).
 */
export function checkCoverage(src: any, options: any): Dataset;

/**
 * Reads all exposed uploaded content. Returns successful content counts;
 * reader failures throw. This cannot detect mutations without integrity checks.
 */
export function checkDataset(bytes: Uint8Array, filename: string, options: any): any;

/**
 * Return layers annotated with is_valid and valid_reason, preserving source geometry.
 */
export function checkGeometry(src: any): Dataset;

/**
 * Cleans the noisy collar of an image, as `terrio clean-collar` (GDAL's
 * `gdal raster clean-collar`): a flood fill from the edges by default, an input's last alpha
 * band kept updated. Options as [`nearblack`]'s.
 */
export function cleanCollar(src: any, options: any): Dataset;

/**
 * Clean polygon coverage boundaries. Options: snappingDistance (-1 selects the
 * extent-based default, 0 disables proximity snapping), mergeStrategy
 * (longest-border|max-area|min-area|min-index), maximumGapWidth (0), layer, activeLayer.
 * layer selects one output layer and is mutually exclusive with activeLayer.
 * Topology uses XY; representative Z is retained/interpolated and active M is dropped.
 * Attributes and CRS remain. Inactive layers are copied.
 */
export function cleanCoverage(src: any, options: any): Dataset;

/**
 * Clips vector features. Supply exactly one of `bbox: [xmin,ymin,xmax,ymax]`,
 * `geometry` (polygon WKT or GeoJSON text/object), or `like` (vector/raster Dataset,
 * uploaded bytes, or GeoJSON). `crs` references bbox/geometry; GeoJSON defaults to
 * WGS84. Optional `layers` selects input layers. `likeLayer`, `likeWhere` and
 * `likeSql` select/filter a polygon template. Raster template bounds use metadata;
 * lazy raster pixels are not loaded. Returns a Dataset retaining attributes and
 * input CRS, with sequential feature IDs. Line cuts interpolate Z/M; constructed
 * polygon topology is XY.
 */
export function clipVector(src: any, options: any): Dataset;

/**
 * Combines geometries into collections, one feature per group of field values, as `gdal
 * vector combine`. Options: `groupBy` (field names), `keepNested`, `addExtraFields` (`"no"`,
 * `"sometimes-identical"`, `"always-identical"`).
 */
export function combine(src: any, options: any): Dataset;

/**
 * Compares two rasters as `terrio compare` (GDAL's `gdal raster compare`) does. The binary
 * comparison is made when both are given as bytes (identical bytes have no difference); RPC and
 * subdataset comparisons need files and are not made. Options: `skipAllOptional`, `skipBinary`,
 * `skipCrs`, `skipGeotransform`, `skipOverview`, `skipMetadata`, `skipRpc`, `skipGeolocation`,
 * `skipSubdataset`. Returns `{ difference_count, differences: [{ kind, band?, message }],
 * bands: [{ band, data_type, pixels, pixels_differing, max_abs_diff }] }`.
 */
export function compare(reference: any, input: any, options: any): any;

/**
 * Concatenates vector datasets, as `terrio concat` (GDAL's `gdal vector concat`). `srcs`: an
 * array of `Dataset`s, file bytes (`{ bytes, filename }` gives the name templates use) or
 * GeoJSON. Options: `layers`, `mode` (`merge-per-layer-name`, `stack`, `single`),
 * `outputLayer`, `sourceLayerFieldName`, `sourceLayerFieldContent`, `fieldStrategy`
 * (`union`, `intersection`), `srcCrs`, `dstCrs`.
 */
export function concat(srcs: any, options: any): Dataset;

/**
 * The concave hull of every geometry (of its polygons for polygonal input), as `gdal vector
 * concave-hull`. `ratio` goes from 0 (most concave) to 1 (convex hull). Options: `allowHoles`,
 * `tight`.
 */
export function concaveHull(src: any, ratio: number, options: any): Dataset;

/**
 * Contour an uploaded/shared raster. Options mirror the CLI in camelCase.
 * The source raster and generated lines are held in memory.
 */
export function contour(src: any, options: any): Dataset;

/**
 * The convex hull of every geometry, as `gdal vector convex-hull`.
 */
export function convexHull(src: any): Dataset;

/**
 * Creates a filled raster Dataset. `like` is a raster or null; options override its header.
 * Options: size, bandCount, ot, crs, bbox, nodata, unsetNodata, burn, metadata, copyMetadata.
 */
export function createRaster(like: any, options: any): Dataset;

/**
 * A new dataset of empty layers, as `terrio create` (GDAL's `gdal vector create`), as the
 * bytes of the file `filename` (whose extension tells the format, unless `format` does).
 * Options: `schema` (an OGR_SCHEMA object or JSON text) or `like` (vector data whose layers
 * are templates), `layers`, `outputLayer`, or `geometryType`, `crs` and `fields`
 * (`"NAME:TYPE(WIDTH,PRECISION)"`).
 */
export function createVector(filename: string, options: any): Uint8Array;

/**
 * The PROJJSON v0.7 of a CRS; throws for a CRS it would describe wrongly.
 */
export function crsToProjjson(crs: string): string;

/**
 * Copies a dataset file set without conversion. Options: `format`, `overwrite`, `allowExternalReferences`.
 */
export function datasetCopy(source: string, destination: string, options: any): any;

/**
 * Deletes owned files of one path or an array of paths. Returns one report per input.
 * Options: `format`. Referenced VRT/catalog source assets are retained.
 */
export function datasetDelete(sources: any, options: any): any;

/**
 * Lists owned files. Options: `format`. Referenced VRT assets are not owned.
 */
export function datasetFiles(source: string, options: any): any;

/**
 * Renames a dataset file set. Options: `format`, `overwrite`, `allowExternalReferences`.
 */
export function datasetRename(source: string, destination: string, options: any): any;

/**
 * Deletes internal overview links and returns updated GeoTIFF bytes.
 */
export function deleteOverviews(bytes: Uint8Array, options: any): Uint8Array;

/**
 * Computes a terrain product of a DEM, as `terrio dem` (GDAL's `gdaldem`).
 *
 * `processing`: `hillshade`, `slope`, `aspect`, `color-relief`, `TRI`, `TPI` or `roughness`.
 * GDAL 3.13 hillshade uses CPU-specific SIMD rounding; results are not bit-portable across CPUs/architectures.
 *
 * Options: `kernelVersion` (`3.12` by default; `3.13` for slope and standard hillshade), `band`, `z`, `scale`, `xscale`, `yscale`, `azimuth`, `altitude`, `combined`,
 * `multidirectional`, `igor`, `alg` (`Horn` or `ZevenbergenThorne`; `Riley` or `Wilson` for
 * TRI), `percent`, `trigonometric`, `zeroForFlat`, `computeEdges`, and for color relief
 * `colorTable` (the text of a color file: lines of `value R G B [A]`), `alpha`,
 * `exactColorEntry`, `nearestColorEntry`.
 */
export function dem(src: any, processing: string, options: any): Dataset;

/**
 * Describes a CRS: `{ epsg, esri, name, geographic, wkt }` (`esri`: the ESRI code of a CRS
 * without EPSG code).
 */
export function describeCrs(crs: string): any;

/**
 * Dissolve each input layer, optionally grouped by options.fields.
 */
export function dissolve(src: any, options: any): Dataset;

/**
 * The formats terrio reads and writes: `[{ name, long_name, kind, extensions, read, write }]`.
 * In WebAssembly, only the formats with in-memory codecs can be used (see the README).
 */
export function drivers(): any;

/**
 * Edits GeoTIFF bytes without resampling. Histograms need a sidecar and are refused.
 */
export function editRaster(bytes: Uint8Array, options: any): Uint8Array;

/**
 * Assigns CRS/type on a copy without transforming geometries. Options: activeLayer,
 * crs ("none" removes it), geometryType, unsetFid. Dataset metadata is not represented
 * in the in-memory model; use the native path API for metadata edits.
 */
export function editVector(src: any, options: any): Dataset;

/**
 * Enhances the contrast of a raster with lookup tables, as `terrio enhance` (GDAL's
 * `gdalenhance`).
 *
 * Options: `equalize` (histogram equalization), `config` (the text of a LUT file, as
 * `enhanceLuts` returns it), or `srcScale` (`[min, max]` stretched over the bins); `lutBins`
 * (256) and `ot` (`"Byte"`).
 */
export function enhance(src: any, options: any): Dataset;

/**
 * The histogram-equalization tables of a raster, as the text of a `gdalenhance -config` file.
 * Options: `lutBins` (256).
 */
export function enhanceLuts(src: any, options: any): string;

/**
 * The OGR_SCHEMA document of vector data, as `terrio export-schema` (GDAL's
 * `gdal vector export-schema`). Options: `layers`.
 */
export function exportSchema(src: any, options: any): any;

/**
 * What this module has: `{ build, features, threads }`, `build` being `"terrio-js"` (every
 * format), `"terrio-js/threads"` (every format, with `initThreadPool`), `"terrio-js/memory64"`
 * (every format, with 64-bit memory, up to 16 GB) or `"terrio-js/core"`,
 * `features` the optional formats built in (`jp2`, `netcdf-hdf5`, `pointcloud`, `parquet`...),
 * `threads` the threads work runs on (1 until `initThreadPool` has started more), and `memory`
 * the bytes of the module's memory now.
 */
export function features(): any;

/**
 * Fills holes using GDAL's four-quadrant interpolation, returning a single-band raster.
 * Options: `band`, `mask` (a raster with zero at holes), `maxDistance` (pixels,
 * 100 by default, 0 for unlimited), `interpolation` (`inv_dist` or `nearest`),
 * `smoothingIterations`. Without a mask, uses the source's mask or nodata.
 */
export function fillNodata(src: any, options: any): Dataset;

/**
 * Exact valid-data footprint, with optional mask Dataset/upload and explicit text attributes.
 * Validity uses finite samples and dataset nodata; alpha/external masks require an explicit mask.
 * No source-path field is added automatically; input pixels are materialized.
 */
export function footprint(src: any, options: any): Dataset;

/**
 * Creates a vector dataset from an Arrow IPC stream or file (as Apache Arrow JS's
 * `tableToIPC` writes it): the geometry column is found by its GeoArrow metadata (WKB, WKT or
 * native encodings), GeoParquet metadata, or a binary column named `geometry`.
 */
export function fromArrowIPC(bytes: Uint8Array, name?: string | null): Dataset;

/**
 * Creates a vector dataset from GeoJSON: an object or a JSON string. `crs` is the coordinates'
 * CRS, EPSG:4326 by default.
 */
export function fromGeoJSON(geojson: any, name?: string | null, crs?: string | null): Dataset;

/**
 * Repack an uploaded /vsimem/ GeoPackage in place and return physical storage counts.
 */
export function gpkgRepack(path: string): any;

/**
 * Return a compacted copy of a self-contained GeoPackage image.
 */
export function gpkgRepackBytes(data: Uint8Array): Uint8Array;

/**
 * Identifies Uint8Array or {bytes, filename} inputs from their first 16 KiB.
 * Only that prefix is copied into WASM. Unknown formats return null; this is
 * format identification, not payload-integrity validation.
 */
export function identify(source: any, filename?: string | null): any;

/**
 * Attribute-preserving planar XY layer algebra. Operations: intersection, union,
 * sym-difference, identity, update, clip, erase. CRS must match. Options: layer,
 * methodLayer, keepLowerDimensionGeometries (true), inputPrefix, methodPrefix.
 * Each source must have one layer unless selected. Sources are materialized;
 * output IDs are sequential. All polygon, line and point types are supported.
 */
export function layerAlgebra(src: any, method: any, operation: string, options: any): Dataset;

/**
 * The coordinates `[x, y, z]` of a position on each part spanning it, as
 * `terrio lineref get-coord` (GDAL's `ogrlineref -get_coord`).
 */
export function linerefCoordinates(parts: any, position: number, options: any): any;

/**
 * Cuts a route into parts of equal position length from reference points, as
 * `terrio lineref create` (GDAL's `ogrlineref -create`).
 *
 * `lines`, `points`: vector data (a `Dataset`, bytes or GeoJSON). Options: `positionField`
 * (required), `step` (required), `linesLayer`, `pointsLayer`, `lineField` with `pointField`,
 * `idField`, `layerName`. Returns the parts, with `beg`, `end` and `scale` fields.
 */
export function linerefCreate(lines: any, points: any, options: any): Dataset;

/**
 * The position of `(x, y)` on linear reference parts, as `terrio lineref get-pos` (GDAL's
 * `ogrlineref -get_pos`).
 */
export function linerefPosition(parts: any, x: number, y: number, options: any): number;

/**
 * The route between two positions, as `terrio lineref get-subline` (GDAL's
 * `ogrlineref -get_subline`): one line feature with `beg`, `end` and `scale` fields.
 */
export function linerefSubline(parts: any, begin: number, end: number, options: any): Dataset;

/**
 * Lists a remote directory with `fetch`, as `gdal vsi list` lists `/vsis3/`, `/vsigs/`,
 * `/vsiaz/` and `/vsicurl/`: public S3 buckets (`s3://bucket/dir`), Google Cloud Storage
 * (`gs://`), Azure Blob Storage (`https://account.blob.core.windows.net/container/dir?<SAS>`)
 * and HTML index pages of plain HTTP servers. Options: `recursive`, `depth`, `fetch` (instead of
 * `globalThis.fetch`), `headers`. Returns `{entries, requests, bytes}`.
 *
 * In browsers, the store must allow the page's origin (CORS). HTML indexes are streamed,
 * checked with a 4 KiB sniff prefix and limited to 4 MiB; custom fetch must return a Response.
 */
export function listUrl(url: string, options: any): Promise<any>;

/**
 * Point geometries from coordinate fields, as `terrio make-point` (GDAL's
 * `gdal vector make-point`), of the first layer (or `layer`). Options: `z`, `m`, `crs`
 * (assigned to the points), `layer`.
 */
export function makePoint(src: any, x: string, y: string, options: any): Dataset;

/**
 * Repair invalid geometries, retaining attributes, IDs and already-valid Z/M values.
 */
export function makeValid(src: any): Dataset;

/**
 * Mosaics rasters into one, as `terrio mosaic` (GDAL's `gdalbuildvrt` then `gdal_translate`).
 *
 * `srcs`: an array of rasters. Options: `resolution` (`highest`, `lowest` or `average`), `tr`,
 * `te`, `tap`, `separate` (each source in its own band), `bands`, `nodata` (both `srcNodata`
 * and `dstNodata`), `srcNodata`, `dstNodata`, `resampling`, `tSrs`.
 */
export function mosaic(srcs: any, options: any): Dataset;

/**
 * Coordinate-aligned lazy mosaic of MultidimDataset objects or uploaded scientific inputs.
 * Options: arrays (names/full paths); absent selects arrays with at least two axes.
 * Last input wins overlaps. Views fetch only intersecting source hyperslabs.
 */
export function mosaicMultidim(sources: any, options: any): MultidimDataset;

/**
 * Reports or changes georeferencing without resampling. Returns {bytes, report};
 * errorThreshold is required to write an acceptable affine transformation.
 */
export function moveRaster(bytes: Uint8Array, options: any): any;

/**
 * Sets the nearly black (or white) borders of an image to exact black (or white), as
 * `terrio nearblack` (GDAL's `nearblack`, two scan passes by default).
 *
 * Options: `colors` (`"black"`, `"white"` or `"r,g,b"` strings), `white`, `colorThreshold`
 * (15), `pixelDistance` (2), `addAlpha` and `algorithm` (`"twopasses"` or `"floodfill"`).
 * Masks (`addMask`) are not supported: Datasets hold none.
 */
export function nearblack(src: any, options: any): Dataset;

/**
 * Focal statistics and convolution kernels, as `terrio neighbors` (GDAL's
 * `gdal raster neighbors`).
 *
 * Options: `kernel` (required: `"u"`, `"v"`, `"edge1"`, `"edge2"`, `"sharpen"`, `"gaussian"`,
 * `"unsharp-masking"`, `"equal"` or a matrix `"[[0,1,0],[1,1,1],[0,1,0]]"`, or an array of
 * them), `method` (`"sum"`, `"mean"`, `"min"`, `"max"`, `"stddev"`, `"median"`, `"mode"`, or
 * one per kernel), `size`, `band` (every band by default), `ot` (`"Float64"`) and `nodata` (a
 * number or `"none"`; the input band's by default).
 */
export function neighbors(src: any, options: any): Dataset;

/**
 * Replaces nodata values with an alpha band (`gdal raster nodata-to-alpha`). Options:
 * `nodata`, a value overriding the source's, or one per band (transparent where every band has
 * its value). Use strings `"nan"`, `"inf"`, `"-inf"` for non-finite overrides; raw
 * non-finite numbers and null are rejected before JSON serialization.
 */
export function nodataToAlpha(src: any, options: any): Dataset;

/**
 * Opens a dataset from its bytes. `filename`'s extension tells the format (`dem.tif`,
 * `roads.fgb`, `parcels.zip`); its stem names vector layers.
 *
 * GeoTIFFs and the image tiles of PMTiles and MBTiles archives are decoded one window at a
 * time, as they are read, and GRIB files one band (message) at a time; vector tiles are read as
 * layers.
 */
export function open(bytes: Uint8Array, filename: string): Dataset;

/**
 * Opens a lazy indexed raster mosaic from a vector index and named source rasters in memory.
 * `sources` maps the index's location values to Dataset/bytes inputs. Options: locationField,
 * sortField, sortDescending, tr, te, srs, bands, ot, nodata, alphaBand, cacheSize, resampling.
 */
export function openCatalog(index: any, sources: any, options: any): Dataset;

/**
 * Open netCDF/HDF5 bytes, {bytes,filename}, or a Zarr object of relative keys and Uint8Arrays.
 */
export function openMultidim(input: any): MultidimDataset;

/**
 * Point clouds are in the full module, `terrio-js`.
 */
export function openPoints(_bytes: Uint8Array, _filename: string): any;

/**
 * Opens a remote file for reading lazily with HTTP range requests (`fetch`): a COG or other
 * GeoTIFF, a PMTiles archive, a COPC point cloud, a FlatGeobuf file or a GeoParquet file. Only
 * its header is read now, in a request or two; reads fetch only the bytes they need.
 *
 * Options: `headers` (sent with every request, for authorization), `fetch` (the function to
 * call instead of `globalThis.fetch`), `blockSize` (64 KiB: reads fetch whole blocks),
 * `cacheSize` (256 MB kept between reads, not during one: a read holds all the bytes it needs),
 * `format` (when the URL does not tell it).
 *
 * Servers must answer range requests; in browsers, cross-origin servers must allow the `Range`
 * header and expose `Content-Range` (CORS).
 */
export function openUrl(url: string, options: any): Promise<RemoteDataset>;

/**
 * Opens a vector dataset from its bytes, with driver open options. `filename` names the file
 * (its extension tells the format when the content does not); `options` takes `layers` (names)
 * and `openOptions`, the driver's open options by their GDAL names: the CSV and XLSX options, the
 * tile archive options and those of the HECRAS driver for HEC-RAS geometry and plan HDF files
 * (`CELL_SUMMARIES`, `TIME_STEP`, ...). A list option takes a comma-separated string or an
 * array of names.
 *
 * A HEC-RAS file is read whole from memory: it must fit in the module's memory (4 GiB at most
 * for wasm32) and opening briefly needs about twice its size. Layers the engine refuses are
 * errors when named in `layers`, and left out with a warning otherwise.
 */
export function openVector(bytes: Uint8Array, filename: string, options: any): Dataset;

/**
 * Opens serialized VRT XML with a map of source file names to Uint8Array bytes.
 * Source GeoTIFFs and VRT pixel windows are read lazily, including in WebAssembly.
 */
export function openVrt(xml: string, sources: any): Dataset;

/**
 * Opens a Zarr store (v2 or v3, GeoZarr conventions included) from its files: a `Map` or an
 * object of paths to `Uint8Array`s (`.zgroup`, `dem/.zarray`, `dem/0.0`...), as an in-memory
 * key-value store holds them. A zip archive of a store opens with `open`.
 */
export function openZarr(store: any): Dataset;

/**
 * Expands one indexed band to RGB or RGBA (options: rgba), retaining the dataset mask.
 * The full source and output are materialized; the returned Dataset supports mask reads.
 */
export function paletteToRgb(src: any, options: any): Dataset;

/**
 * Weighted Brovey pansharpening. `spectral` is a raster/bytes or an array of them;
 * all bands contribute intensity. Options: `weights`, output `bands` (from 1),
 * `panBand`, `resampling` (default cubic), `bitdepth`, `nodata` (number or "none"),
 * `spatAdjust` (union/intersection/none), `ot` (output type).
 */
export function pansharpen(pan: any, spectral: any, options: any): Dataset;

/**
 * Create GDAL pansharpened VRT XML from named uploaded sources without decoding pixels.
 * Pass the returned XML and the same source byte map to `openVrt` for lazy window reads.
 */
export function pansharpenVrt(pan: string, spectral: string[], sources: any, options: any): string;

/**
 * Create a Parquet metadata-only file. Options: `overwrite`.
 */
export function parquetCreateMetadata(inputs: string[], output: string, options: any): any;

/**
 * Partitions vector data by field values, as `terrio partition` (GDAL's
 * `gdal vector partition`), returning the parts as `[{ path, bytes }]` (paths relative to the
 * output directory). Options: `fields`, `scheme` (`hive`, `flat`), `pattern`, `featureLimit`,
 * `maxFileSize` (bytes), `omitPartitionedFields`, `format` (by default the input's).
 */
export function partition(src: any, options: any): any;

/**
 * Evaluate a command or GDALG JSON text using aliases from inputs. Values may
 * be Datasets, uploaded {bytes, filename} objects, Uint8Arrays or GeoJSON.
 * No files are created; outputBytes() encodes explicit outputs on request.
 */
export function pipeline(command: string, inputs: any, options: any): PipelineResult;

/**
 * Queries pixel values at positions, as `terrio pixel-info` (GDAL's `gdal raster pixel-info` and
 * `gdallocationinfo`). `positions` is an array of `[x, y]` or `[x, y, text]` (column and line,
 * or coordinates in `positionCrs`), or the vector dataset whose points (centroids of other
 * geometries) are the positions: a `Dataset`, file bytes or GeoJSON. Options: `positionCrs`
 * (`pixel`, `dataset` or a CRS), `layer`, `includeFields`, `bands`, `overview`, `resampling`
 * (`nearest`, `bilinear`, `cubic`, `cubicspline`), `promotePixelValueToZ` and `format`:
 * `geojson` (an object, the default), `json` (an array), `csv`, `text` or `value` (strings).
 */
export function pixelInfo(src: any, positions: any, options: any): any;

/**
 * Plan folder tiles without reading pixels. Grid fields accept camelCase.
 */
export function planRasterTiles(input: any, options: any): any;

/**
 * Plan GDAL-style retile files and recursive pyramid levels. Inputs are a
 * Dataset/byte upload or an array of them; options use camelCase or snake_case.
 */
export function planRetile(inputs: any, options: any): any;

/**
 * Point clouds are in the full module, `terrio-js`.
 */
export function pointsFromArrays(_arrays: object, _crs?: string | null): any;

/**
 * Turns a raster band into polygons of connected pixels of the same value, as
 * `terrio polygonize` (GDAL's `gdal_polygonize`). Returns a vector `Dataset`.
 *
 * Options: `band` (1), `field` (`"DN"`), `layerName` (`"polygonized"`), `connectedness` (4 or
 * 8), `nomask` (keep nodata pixels), `mask` (a raster: pixels where its first band is 0 are
 * left out).
 */
export function polygonize(src: any, options: any): Dataset;

/**
 * The distance from every pixel to the nearest target pixel, as `terrio proximity` (GDAL's
 * `gdal_proximity.py`).
 *
 * Options: `band`, `values` (the target values; every non-zero pixel by default), `distunits`
 * (`PIXEL` or `GEO`), `maxdist`, `nodata`, `useInputNodata`, `fixedBufVal`, `ot` (`Float32`).
 */
export function proximity(src: any, options: any): Dataset;

/**
 * Creates a raster from a typed array of pixels, band after band, row after row.
 *
 * `transform` is the GDAL-style geotransform `[x_origin, pixel_width, 0, y_origin, 0,
 * -pixel_height]`; `crs` is `EPSG:4326`, WKT or a PROJ string.
 */
export function rasterFromArray(data: any, width: number, height: number, transform: Float64Array, crs?: string | null, nodata?: number | null): Dataset;

/**
 * Create raster extent polygons from {storedLocation: Dataset/file} mappings, without
 * decoding pixels through lazy-capable readers. Options use camelCase CLI concepts:
 * outputLayer, locationName, outputCrs, sourceCrsFieldName/Format, metadata,
 * minPixelSize/maxPixelSize, fetchMetadata (KEY,FIELD,TYPE triples), resolution, bbox,
 * ot, bandCount, nodata (an array; strings for nan/inf), colorInterpretations and mask.
 */
export function rasterIndex(sources: any, options: any): DatasetIndex;

/**
 * Generate one encoded tile at a time, calling onTile(relativePath, Uint8Array).
 * The callback is synchronous. A thrown exception stops generation. Use the callback
 * to save/download each tile; Terrio does not retain the encoded pyramid in WASM memory.
 */
export function rasterTiles(input: any, options: any, on_tile: Function): any;

/**
 * Burns vector geometries into a raster, as `terrio rasterize` (GDAL's `gdal_rasterize`).
 *
 * `src`: vector data (a `Dataset`, bytes or GeoJSON). Options: `burn` (a value, or one per
 * band) or `attribute`, `layers`, `sql`, `where`, `tr`, `ts`, `te`, `tap`, `like` (a raster
 * whose grid to use), `ot`, `init`, `nodata`, `allTouched`, `add`, `aSrs`.
 */
export function rasterize(src: any, options: any): Dataset;

/**
 * Returns RGBA entries from a palette Dataset/file, color-file text or RGBA arrays.
 * filename hints TXT/CPT/QML/QLR formats for text or encoded bytes. Raster palettes
 * are read from headers, with source nodata transparency applied. Text-file
 * Uint8Array uploads need a filename hint or {bytes, filename}; plain strings
 * and {text, filename} accept color-file text directly.
 */
export function readColorTable(source: any, filename?: string | null): any;

/**
 * Point clouds are in the full module, `terrio-js`.
 */
export function readPoints(_bytes: Uint8Array, _filename: string, _options: any): any;

/**
 * Maps values or ranges to new values (`gdal raster reclassify`). `mapping` is GDAL's mapping
 * (`"[0,10)=1;[10,inf)=2;NO_DATA=NO_DATA;DEFAULT=PASS_THROUGH"`). Options: `ot`, the output data
 * type; `mappingFile`, the text of a mapping file (one entry per line, `#` comments) used
 * instead of `mapping`.
 */
export function reclassify(src: any, mapping: string, options: any): Dataset;

/**
 * Refreshes internal GeoTIFF overviews. Options: levels, resampling, bbox, ignoreCogLayoutBreak.
 */
export function refreshOverviews(bytes: Uint8Array, options: any): Uint8Array;

/**
 * Makes a datum shift or geoid grid (NTv2 `.gsb`, GTX, or a PROJ GeoTIFF grid from
 * https://cdn.proj.org such as `us_noaa_conus.tif`) available under its name, from its bytes,
 * for the transformations that use it.
 */
export function registerGrid(name: string, bytes: Uint8Array): void;

/**
 * Renames layers on a copy of vector data. Options match the CLI naming rules:
 * inputLayer, outputLayer, ascii, lowerCase, filenameCompatible, reservedCharacters,
 * replacementCharacter and maxLength. Serialize the returned Dataset to persist it.
 */
export function renameLayer(src: any, options: any): Dataset;

/**
 * Generate retile image files and optional index/CSV companions incrementally.
 * onFile(relativePath, Uint8Array) is synchronous; exceptions stop generation.
 * Optional readFile(relativePath) returns earlier bytes (or null), avoiding parent
 * regeneration after the bounded cache evicts a tile.
 */
export function retile(inputs: any, options: any, on_file: Function, read_file?: Function | null): any;

/**
 * Converts RGB Byte sources to indexed color. Options: colorCount (2..256),
 * bitDepth (5 or 8), dither (true), colorMap (palette Dataset/file/text/RGBA entries),
 * outputNodata (Byte index), mask (flat Uint8Array/array, zero invalid).
 * Color-file byte uploads need {bytes, filename}; plain strings accept text.
 * The full raster is materialized. Shared RGB nodata takes precedence over
 * dataset/alpha/caller masks. Supplied palettes need outputNodata to mark invalid pixels.
 */
export function rgbToPalette(src: any, options: any): Dataset;

/**
 * Encode A.TOC from [{filename: relative path, bytes: Uint8Array}], without pixel decoding.
 * Preserve those frame files beside the returned TOC. Options: scale, producerId,
 * producerName, countryCode, classification. Metadata is validated before returning bytes.
 */
export function rpftocCreate(frames: any, options: any): Uint8Array;

/**
 * Adds vertices so that no segment is longer than `maxLength` (CRS units), as `gdal vector
 * segmentize`.
 */
export function segmentize(src: any, max_length: number): Dataset;

/**
 * Changes the type of vector fields with GDAL's value conversions, as `terrio set-field-type`
 * (GDAL's `gdal vector set-field-type`). `fieldType`: a type (`Integer`, `Integer64`, `Real`,
 * `String`, `Date`, `Time`, `DateTime`, `Binary`) or subtype (`Boolean`, `Int16`,
 * `Float32`, `JSON`, `UUID`). Options: `fieldName` or `srcFieldType`, `activeLayer`.
 */
export function setFieldType(src: any, field_type: string, options: any): Dataset;

/**
 * Changes geometry types and dimensions, as `gdal vector set-geom-type`. Options:
 * `geometryType` (`"MULTIPOLYGON"`, `"POINTZ"`...), `multi`, `single`, `linear`, `dim`
 * (`"XY"`, `"XYZ"`, `"XYM"`, `"XYZM"`), `layerOnly`, `featureOnly`, `skip`.
 */
export function setGeomType(src: any, options: any): Dataset;

/**
 * Merges raster areas smaller than a threshold into their largest neighbour, as
 * `terrio sieve` (GDAL's `gdal_sieve.py`).
 *
 * Options: `band`, `threshold` (2), `connectedness` (4 or 8), `mask` (`"default"`: the band's
 * nodata pixels are left out; `"none"`; or a raster whose band 1 is 0 where pixels are left
 * out).
 */
export function sieve(src: any, options: any): Dataset;

/**
 * Topology-preserving simplification of every geometry (GEOS's TopologyPreservingSimplifier,
 * as `gdal vector simplify`), with a tolerance in CRS units. Z is kept, M dropped.
 */
export function simplify(src: any, tolerance: number): Dataset;

/**
 * Simplify shared polygon coverage edges while preserving topology. `tolerance`
 * is the square root of the triangle-area threshold, in input CRS units.
 * Options: `preserveBoundary`, `layer` (select one), `activeLayer` (copy other layers unchanged).
 * `layer` and `activeLayer` are mutually exclusive.
 * Inputs must form a valid polygon coverage. Attributes and CRS are retained;
 * output feature IDs are sequential from 1 in each layer.
 */
export function simplifyCoverage(src: any, tolerance: number, options: any): Dataset;

/**
 * Recursively split multipart geometries/collections in every layer; IDs restart at one.
 */
export function singlepart(src: any): Dataset;

/**
 * Sorts features spatially, as `gdal vector sort`. Options: `method` (`"hilbert"`, the
 * default, or `"strtree"`). Null and empty geometries go last.
 */
export function sort(src: any, options: any): Dataset;

/**
 * Creates a Seek-Optimized ZIP archive in `/vsimem/` from `/vsimem/` files (or adds to it),
 * as `gdal vsi sozip create` does. Options: `enable` (`auto`, `yes`, `no`), `chunkSize`,
 * `minFileSize`, `overwrite`, `recursive`, `junkPaths`, `contentType`.
 */
export function sozipCreate(inputs: string[], output: string, options: any): any;

/**
 * Lists a `/vsimem/` zip archive's members with their SOZip status.
 */
export function sozipList(input: string): any;

/**
 * Rewrites a `/vsimem/` zip archive as a SOZip archive. Options: `enable`, `chunkSize`, `minFileSize` and `overwrite`. Creation-only options are rejected.
 */
export function sozipOptimize(input: string, output: string, options: any): any;

/**
 * Validates a `/vsimem/` zip archive and its SOZip indexes: `{valid, sozip_files, messages,
 * errors}`.
 */
export function sozipValidate(input: string): any;

/**
 * Runs the documented read-only OGR SQL subset on vector inputs, returning a Dataset.
 * SELECT expressions and LEFT JOIN retain primary geometry; DISTINCT and summaries discard it.
 */
export function sql(src: any, query: string): Dataset;

/**
 * Reports Rust panics on the JavaScript console, with their message.
 */
export function start(): void;

/**
 * Swaps the X and Y coordinates of every geometry, as `gdal vector swap-xy`.
 */
export function swapXy(src: any): Dataset;

/**
 * Take coordinate-operation and driver warnings recorded since the previous call.
 */
export function takeWarnings(): Array<any>;

/**
 * Transforms coordinates between two CRSs (`EPSG:4326`, `EPSG:4326+5773`, WKT or PROJ
 * strings), x (longitude) first. Returns `[xs, ys]` as two `Float64Array`s, or `[xs, ys, zs]`
 * when `zs` are given. For geocentric CRSs these are Cartesian Z ordinates; use
 * all three arrays to retain XYZ (the 2D call uses input Z=0 and drops output Z).
 * Options: `sCoordEpoch` and `tCoordEpoch`, the coordinate epochs of time-dependent
 * transformations. Datum shift grids are used once registered with `registerGrid`.
 */
export function transformPoints(xs: Float64Array, ys: Float64Array, src_crs: string, dst_crs: string, zs: Float64Array | null | undefined, options: any): Array<any>;

/**
 * Subsets, resizes, rescales or converts a raster, as `terrio translate` (GDAL's
 * `gdal_translate`).
 *
 * Options: `bands` (numbered from 1), `ot`, `srcwin` (`[colOff, rowOff, width, height]`),
 * `projwin` (`[ulx, uly, lrx, lry]`), `projwinSrs`, `outsize` (`[width, height]`, pixels or
 * percentages such as `"50%"`; 0 keeps the aspect ratio), `tr`, `resampling`, `scale` (`true`,
 * `[srcMin, srcMax]` or `[srcMin, srcMax, dstMin, dstMax]`), `exponent`, `aNodata` (a number or
 * `"none"`), `aSrs`, `aUllr`.
 */
export function translate(src: any, options: any): Dataset;

/**
 * Applies band scales and offsets (`gdal raster unscale`). Options: `ot`, the output data type
 * (Float32, or Float64 for Float64 sources, by default). Nodata pixels keep the nodata value.
 */
export function unscale(src: any, options: any): Dataset;

/**
 * Warps valid source samples into destination GeoTIFF bytes and returns the updated file.
 * Options: resampling, geometry, geometryCrs, noUpdateOverviews, errorThreshold, ignoreCogLayoutBreak.
 */
export function updateRaster(src: any, dst: Uint8Array, options: any): Uint8Array;

/**
 * Updates a copy of dst from src, by FID or key fields. Options: inputLayer,
 * outputLayer, key (array), mode (merge, update-only, append-only).
 */
export function updateVector(src: any, dst: any, options: any): Dataset;

/**
 * Validates uploaded TIFF structure without decoding pixels. Options: profile
 * (`rio-cogeo` or `gdal`), strict, fullCheck (default automatic; true for bytes).
 * GDAL full checks inspect all compressed block leaders/trailers and ordering.
 */
export function validateCog(bytes: Uint8Array, options: any): any;

/**
 * Validate uploaded GeoPackage bytes. Options: fullCheck, strict, unicodeCase.
 */
export function validateGpkg(bytes: Uint8Array, options: any): any;

/**
 * Validate an uploaded /vsimem/ GeoPackage path using the same options/report.
 */
export function validateGpkgPath(path: string, options: any): any;

/**
 * Grids scattered vector points into a raster, as `terrio vector-grid` (GDAL's
 * `gdal vector grid` and `gdal_grid`).
 *
 * `src`: vector data (a `Dataset`, bytes or GeoJSON). Options: `algorithm` (`"invdist"`, the
 * default, `"invdistnn"`, `"average"`, `"nearest"`, `"linear"`, `"minimum"`, `"maximum"`,
 * `"range"`, `"count"`, `"average_distance"`, `"average_distance_pts"`, or a GDAL string such as
 * `"invdist:power=3"`), `zfield`, `zoffset`, `zmultiply`, `layers`, `sql`, `where`, `bbox`,
 * `extent`, `size`, `resolution`, `ot`, `crs`, and the parameters `power`, `smoothing`,
 * `radius`, `radius1`, `radius2`, `angle`, `minPoints`, `maxPoints`, `minPointsPerQuadrant`,
 * `maxPointsPerQuadrant`, `nodata`.
 */
export function vectorGrid(src: any, options: any): Dataset;

/**
 * Create vector layer envelope polygons from {storedLocation: Dataset/file/GeoJSON}
 * mappings. Common options match rasterIndex; sourceLayerNames/sourceLayerIndexes select
 * original layers. acceptDifferentCrs, acceptDifferentSchemas and datasetNameOnly are optional.
 */
export function vectorIndex(sources: any, options: any): DatasetIndex;

/**
 * The version of terrio.
 */
export function version(): string;

/**
 * Single-observer visibility or minimum visible height on a projected DEM.
 * `ox`, `oy` are coordinates in the DEM CRS. Options: `band`, `oz` (observer height),
 * `tz` (target height), `md` (maximum distance, 0 unlimited), `cc` (curvature coefficient,
 * 1 minus refraction), `om` (NORMAL/DEM/GROUND), `ov` (out-of-range value).
 * Numeric nodata is treated as elevation, as in GDAL; nonfinite elevations are rejected.
 */
export function viewshed(src: any, ox: number, oy: number, options: any): Dataset;

/**
 * Copies a file, or a directory with `recursive`, within `/vsimem/` (archive members out of
 * archives). Options: `recursive`, `skipErrors`. Returns the report.
 */
export function vsiCopy(src: string, dst: string, options: any): any;

/**
 * Deletes a `/vsimem/` file, or a directory with `recursive` (the root of `/vsimem/` is
 * refused). Options: `{ recursive }`; the original boolean argument is also accepted.
 * Returns the report.
 */
export function vsiDelete(path: string, options: any): any;

/**
 * Lists a `/vsimem/` directory, or a zip archive in memory (`/vsizip//vsimem/a.zip`), as
 * `gdal vsi list` does. Options: `recursive`, `depth`, `absolute`, `long` (fetch missing entry metadata).
 */
export function vsiList(path: string, options: any): any;

/**
 * Moves (renames) a `/vsimem/` file or directory. Returns the report.
 */
export function vsiMove(src: string, dst: string): any;

/**
 * Reads a whole `/vsimem/` file or a member of an archive in memory.
 */
export function vsiRead(path: string): Uint8Array;

/**
 * Describes a location, or returns `null` when nothing is there.
 */
export function vsiStat(path: string): any;

/**
 * Copies the files missing or out of date in the target, within `/vsimem/`. Options:
 * `recursive`, `strategy` (`timestamp`, `ETag` or `overwrite`). Returns the report.
 */
export function vsiSync(src: string, dst: string, options: any): any;

/**
 * Writes bytes to a `/vsimem/` file, replacing it.
 */
export function vsiWrite(path: string, bytes: Uint8Array): void;

/**
 * Reprojects, resamples, crops or mosaics rasters, as `terrio warp` (GDAL's `gdalwarp`).
 *
 * `src`: a raster or an array of them. Options: `sSrs`, `tSrs`, `tr` (`[xres, yres]`), `te`
 * (`[minX, minY, maxX, maxY]`), `teSrs`, `ts` (`[width, height]`), `tap`, `resampling`
 * (`near`, `bilinear`, `cubic`, `cubicspline`, `lanczos`, `average`, `rms`, `mode`, `min`,
 * `max`, `med`, `q1`, `q3`, `sum`), `srcNodata` and `dstNodata` (a number, one per band, or
 * `"none"`), `ot`, `cutline` (polygons: a `Dataset`, bytes or GeoJSON), `cropToCutline`, `et`
 * (the approximate transformer's error in pixels, 0.125 by default) and `wm` (working memory in
 * bytes). `geoloc` requires array metadata; `geolocation: { x, y, pixelStep, lineStep,
 * pixelOffset, lineOffset, pixelCenter, xBand, yBand, srs }` supplies coordinate rasters for the first source.
 */
export function warp(src: any, options: any): Dataset;

/**
 * Raster pixels as XYZ text, as `terrio xyz` (GDAL's `gdal2xyz.py`). Options: `bands` (band 1
 * by default), `allBands`, `skip` (`[n]` or `[columns, rows]`), `srcwin` (`[x, y, width,
 * height]`), `skipNodata`, `srcNodata` and `dstNodata` (one value or one per band) and
 * `delimiter`.
 */
export function xyz(src: any, options: any): string;

/**
 * Statistics for each polygon and raster band. Source pixels are materialized.
 * Options: bands, prefixes, stats, allTouched, tSrs, decimalPlaces.
 * Default prefixes raster1, raster2, etc. produce PREFIX_bN_STATISTIC fields.
 */
export function zonalStats(zones: any, rasters: any, options: any): Dataset;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_dataset_free: (a: number, b: number) => void;
    readonly __wbg_datasetindex_free: (a: number, b: number) => void;
    readonly __wbg_multidimarray_free: (a: number, b: number) => void;
    readonly __wbg_multidimdataset_free: (a: number, b: number) => void;
    readonly __wbg_netcdfgroups_free: (a: number, b: number) => void;
    readonly __wbg_pipelineresult_free: (a: number, b: number) => void;
    readonly __wbg_remotedataset_free: (a: number, b: number) => void;
    readonly addOverviews: (a: number, b: number, c: any) => [number, number, number, number];
    readonly asFeatures: (a: any, b: any) => [number, number, number];
    readonly attachPalette: (a: any, b: any) => [number, number, number];
    readonly blend: (a: any, b: any, c: any) => [number, number, number];
    readonly buffer: (a: any, b: number, c: any) => [number, number, number];
    readonly calc: (a: any, b: any, c: any) => [number, number, number];
    readonly checkCoverage: (a: any, b: any) => [number, number, number];
    readonly checkDataset: (a: number, b: number, c: number, d: number, e: any) => [number, number, number];
    readonly checkGeometry: (a: any) => [number, number, number];
    readonly cleanCollar: (a: any, b: any) => [number, number, number];
    readonly cleanCoverage: (a: any, b: any) => [number, number, number];
    readonly clipVector: (a: any, b: any) => [number, number, number];
    readonly combine: (a: any, b: any) => [number, number, number];
    readonly compare: (a: any, b: any, c: any) => [number, number, number];
    readonly concat: (a: any, b: any) => [number, number, number];
    readonly concaveHull: (a: any, b: number, c: any) => [number, number, number];
    readonly contour: (a: any, b: any) => [number, number, number];
    readonly convexHull: (a: any) => [number, number, number];
    readonly createRaster: (a: any, b: any) => [number, number, number];
    readonly createVector: (a: number, b: number, c: any) => [number, number, number, number];
    readonly crsToProjjson: (a: number, b: number) => [number, number, number, number];
    readonly datasetCopy: (a: number, b: number, c: number, d: number, e: any) => [number, number, number];
    readonly datasetDelete: (a: any, b: any) => [number, number, number];
    readonly datasetFiles: (a: number, b: number, c: any) => [number, number, number];
    readonly datasetRename: (a: number, b: number, c: number, d: number, e: any) => [number, number, number];
    readonly dataset___handle: (a: number) => number;
    readonly dataset_count: (a: number) => [number, number, number];
    readonly dataset_crs: (a: number) => [number, number];
    readonly dataset_dtype: (a: number) => [number, number, number, number];
    readonly dataset_height: (a: number) => [number, number, number];
    readonly dataset_info: (a: number, b: number, c: number) => [number, number, number];
    readonly dataset_kind: (a: number) => [number, number];
    readonly dataset_layerNames: (a: number) => [number, number, number, number];
    readonly dataset_nodata: (a: number) => [number, number, number, number];
    readonly dataset_overviews: (a: number) => [number, number, number];
    readonly dataset_readBand: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly dataset_styleTable: (a: number) => any;
    readonly dataset_toArrowIPC: (a: number, b: any, c: any) => [number, number, number, number];
    readonly dataset_toBytes: (a: number, b: number, c: number, d: any) => [number, number, number, number];
    readonly dataset_toGeoJSON: (a: number, b: any) => [number, number, number];
    readonly dataset_transform: (a: number) => [number, number, number, number];
    readonly dataset_width: (a: number) => [number, number, number];
    readonly datasetindex_count: (a: number) => number;
    readonly datasetindex_layer: (a: number) => number;
    readonly datasetindex_metadata: (a: number) => [number, number, number];
    readonly datasetindex_toBytes: (a: number, b: number, c: number, d: any) => [number, number, number, number];
    readonly deleteOverviews: (a: number, b: number, c: any) => [number, number, number, number];
    readonly dem: (a: any, b: number, c: number, d: any) => [number, number, number];
    readonly describeCrs: (a: number, b: number) => [number, number, number];
    readonly dissolve: (a: any, b: any) => [number, number, number];
    readonly drivers: () => [number, number, number];
    readonly editRaster: (a: number, b: number, c: any) => [number, number, number, number];
    readonly editVector: (a: any, b: any) => [number, number, number];
    readonly enhance: (a: any, b: any) => [number, number, number];
    readonly enhanceLuts: (a: any, b: any) => [number, number, number, number];
    readonly exportSchema: (a: any, b: any) => [number, number, number];
    readonly features: () => [number, number, number];
    readonly fillNodata: (a: any, b: any) => [number, number, number];
    readonly footprint: (a: any, b: any) => [number, number, number];
    readonly fromArrowIPC: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly fromGeoJSON: (a: any, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly gpkgRepack: (a: number, b: number) => [number, number, number];
    readonly gpkgRepackBytes: (a: number, b: number) => [number, number, number, number];
    readonly identify: (a: any, b: number, c: number) => [number, number, number];
    readonly layerAlgebra: (a: any, b: any, c: number, d: number, e: any) => [number, number, number];
    readonly linerefCoordinates: (a: any, b: number, c: any) => [number, number, number];
    readonly linerefCreate: (a: any, b: any, c: any) => [number, number, number];
    readonly linerefPosition: (a: any, b: number, c: number, d: any) => [number, number, number];
    readonly linerefSubline: (a: any, b: number, c: number, d: any) => [number, number, number];
    readonly listUrl: (a: number, b: number, c: any) => any;
    readonly makePoint: (a: any, b: number, c: number, d: number, e: number, f: any) => [number, number, number];
    readonly makeValid: (a: any) => [number, number, number];
    readonly mosaic: (a: any, b: any) => [number, number, number];
    readonly mosaicMultidim: (a: any, b: any) => [number, number, number];
    readonly moveRaster: (a: number, b: number, c: any) => [number, number, number];
    readonly multidimarray_dimensionNames: (a: number) => [number, number];
    readonly multidimarray_info: (a: number) => [number, number, number];
    readonly multidimarray_isel: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly multidimarray_iselAxis: (a: number, b: number, c: number) => [number, number, number];
    readonly multidimarray_path: (a: number) => [number, number];
    readonly multidimarray_read: (a: number) => [number, number, number];
    readonly multidimarray_shape: (a: number) => [number, number];
    readonly multidimarray_slice: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly multidimarray_sliceAxis: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly multidimarray_transpose: (a: number, b: any) => [number, number, number];
    readonly multidimdataset___terrioMultidimId: (a: number) => number;
    readonly multidimdataset_array: (a: number, b: number, c: number) => [number, number, number];
    readonly multidimdataset_arrayPaths: (a: number) => [number, number];
    readonly multidimdataset_check: (a: number) => [number, number, number];
    readonly multidimdataset_info: (a: number) => [number, number, number];
    readonly multidimdataset_toBytes: (a: number) => [number, number, number, number];
    readonly multidimdataset_toZarrStore: (a: number) => [number, number, number];
    readonly nearblack: (a: any, b: any) => [number, number, number];
    readonly neighbors: (a: any, b: any) => [number, number, number];
    readonly netcdfgroups_add: (a: number, b: number, c: number, d: number) => [number, number];
    readonly netcdfgroups_length: (a: number) => number;
    readonly netcdfgroups_new: () => number;
    readonly netcdfgroups_toBytes: (a: number, b: any) => [number, number, number, number];
    readonly nodataToAlpha: (a: any, b: any) => [number, number, number];
    readonly open: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly openCatalog: (a: any, b: any, c: any) => [number, number, number];
    readonly openMultidim: (a: any) => [number, number, number];
    readonly openPoints: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly openUrl: (a: number, b: number, c: any) => any;
    readonly openVector: (a: number, b: number, c: number, d: number, e: any) => [number, number, number];
    readonly openVrt: (a: number, b: number, c: any) => [number, number, number];
    readonly openZarr: (a: any) => [number, number, number];
    readonly paletteToRgb: (a: any, b: any) => [number, number, number];
    readonly pansharpen: (a: any, b: any, c: any) => [number, number, number];
    readonly pansharpenVrt: (a: number, b: number, c: number, d: number, e: any, f: any) => [number, number, number, number];
    readonly parquetCreateMetadata: (a: number, b: number, c: number, d: number, e: any) => [number, number, number];
    readonly partition: (a: any, b: any) => [number, number, number];
    readonly pipeline: (a: number, b: number, c: any, d: any) => [number, number, number];
    readonly pipelineresult_dataset: (a: number) => number;
    readonly pipelineresult_outputBytes: (a: number) => [number, number, number];
    readonly pipelineresult_outputNames: (a: number) => any;
    readonly pixelInfo: (a: any, b: any, c: any) => [number, number, number];
    readonly planRasterTiles: (a: any, b: any) => [number, number, number];
    readonly planRetile: (a: any, b: any) => [number, number, number];
    readonly pointsFromArrays: (a: any, b: number, c: number) => [number, number, number];
    readonly polygonize: (a: any, b: any) => [number, number, number];
    readonly proximity: (a: any, b: any) => [number, number, number];
    readonly rasterFromArray: (a: any, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number, number];
    readonly rasterIndex: (a: any, b: any) => [number, number, number];
    readonly rasterTiles: (a: any, b: any, c: any) => [number, number, number];
    readonly rasterize: (a: any, b: any) => [number, number, number];
    readonly readColorTable: (a: any, b: number, c: number) => [number, number, number];
    readonly readPoints: (a: number, b: number, c: number, d: number, e: any) => [number, number, number];
    readonly reclassify: (a: any, b: number, c: number, d: any) => [number, number, number];
    readonly refreshOverviews: (a: number, b: number, c: any) => [number, number, number, number];
    readonly registerGrid: (a: number, b: number, c: number, d: number) => void;
    readonly remotedataset_count: (a: number) => [number, number, number];
    readonly remotedataset_crs: (a: number) => [number, number];
    readonly remotedataset_dtype: (a: number) => [number, number, number, number];
    readonly remotedataset_format: (a: number) => [number, number];
    readonly remotedataset_getTile: (a: number, b: number, c: number, d: number) => any;
    readonly remotedataset_height: (a: number) => [number, number, number];
    readonly remotedataset_info: (a: number) => [number, number, number];
    readonly remotedataset_kind: (a: number) => [number, number];
    readonly remotedataset_nodata: (a: number) => [number, number, number, number];
    readonly remotedataset_overviews: (a: number) => [number, number, number];
    readonly remotedataset_read: (a: number, b: any) => any;
    readonly remotedataset_readBand: (a: number, b: number, c: number, d: number, e: number) => any;
    readonly remotedataset_size: (a: number) => number;
    readonly remotedataset_stats: (a: number) => [number, number, number];
    readonly remotedataset_transform: (a: number) => [number, number, number, number];
    readonly remotedataset_url: (a: number) => [number, number];
    readonly remotedataset_width: (a: number) => [number, number, number];
    readonly renameLayer: (a: any, b: any) => [number, number, number];
    readonly retile: (a: any, b: any, c: any, d: number) => [number, number, number];
    readonly rgbToPalette: (a: any, b: any) => [number, number, number];
    readonly rpftocCreate: (a: any, b: any) => [number, number, number, number];
    readonly segmentize: (a: any, b: number) => [number, number, number];
    readonly setFieldType: (a: any, b: number, c: number, d: any) => [number, number, number];
    readonly setGeomType: (a: any, b: any) => [number, number, number];
    readonly sieve: (a: any, b: any) => [number, number, number];
    readonly simplify: (a: any, b: number) => [number, number, number];
    readonly simplifyCoverage: (a: any, b: number, c: any) => [number, number, number];
    readonly singlepart: (a: any) => [number, number, number];
    readonly sort: (a: any, b: any) => [number, number, number];
    readonly sozipCreate: (a: number, b: number, c: number, d: number, e: any) => [number, number, number];
    readonly sozipList: (a: number, b: number) => [number, number, number];
    readonly sozipOptimize: (a: number, b: number, c: number, d: number, e: any) => [number, number, number];
    readonly sozipValidate: (a: number, b: number) => [number, number, number];
    readonly sql: (a: any, b: number, c: number) => [number, number, number];
    readonly start: () => void;
    readonly swapXy: (a: any) => [number, number, number];
    readonly takeWarnings: () => any;
    readonly transformPoints: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: any) => [number, number, number];
    readonly translate: (a: any, b: any) => [number, number, number];
    readonly unscale: (a: any, b: any) => [number, number, number];
    readonly updateRaster: (a: any, b: number, c: number, d: any) => [number, number, number, number];
    readonly updateVector: (a: any, b: any, c: any) => [number, number, number];
    readonly validateCog: (a: number, b: number, c: any) => [number, number, number];
    readonly validateGpkg: (a: number, b: number, c: any) => [number, number, number];
    readonly validateGpkgPath: (a: number, b: number, c: any) => [number, number, number];
    readonly vectorGrid: (a: any, b: any) => [number, number, number];
    readonly vectorIndex: (a: any, b: any) => [number, number, number];
    readonly version: () => [number, number];
    readonly viewshed: (a: any, b: number, c: number, d: any) => [number, number, number];
    readonly vsiCopy: (a: number, b: number, c: number, d: number, e: any) => [number, number, number];
    readonly vsiDelete: (a: number, b: number, c: any) => [number, number, number];
    readonly vsiList: (a: number, b: number, c: any) => [number, number, number];
    readonly vsiMove: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly vsiRead: (a: number, b: number) => [number, number, number, number];
    readonly vsiStat: (a: number, b: number) => [number, number, number];
    readonly vsiSync: (a: number, b: number, c: number, d: number, e: any) => [number, number, number];
    readonly vsiWrite: (a: number, b: number, c: number, d: number) => [number, number];
    readonly warp: (a: any, b: any) => [number, number, number];
    readonly xyz: (a: any, b: any) => [number, number, number, number];
    readonly zonalStats: (a: any, b: any, c: any) => [number, number, number];
    readonly wasm_bindgen_2965c4ec8bfbc987___convert__closures_____invoke___js_sys_12ec3bdfc075b477___Function_fn_wasm_bindgen_2965c4ec8bfbc987___JsValue_____wasm_bindgen_2965c4ec8bfbc987___sys__Undefined___js_sys_12ec3bdfc075b477___Function_fn_wasm_bindgen_2965c4ec8bfbc987___JsValue_____wasm_bindgen_2965c4ec8bfbc987___sys__Undefined_______true_: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen_2965c4ec8bfbc987___convert__closures_____invoke___wasm_bindgen_2965c4ec8bfbc987___JsValue__core_37ee0ce0c4cd57d5___result__Result_____wasm_bindgen_2965c4ec8bfbc987___JsError___true_: (a: number, b: number, c: any) => [number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_destroy_closure: (a: number, b: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __externref_drop_slice: (a: number, b: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
