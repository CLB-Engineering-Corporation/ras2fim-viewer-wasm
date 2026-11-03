/* @ts-self-types="./terrio.d.ts" */

/**
 * A raster or vector dataset opened from bytes.
 */
export class Dataset {
    static __wrap(ptr) {
        const obj = Object.create(Dataset.prototype);
        obj.__wbg_ptr = ptr;
        DatasetFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        DatasetFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_dataset_free(ptr, 0);
    }
    /**
     * The handle operations find the dataset by.
     * @returns {number}
     */
    get __handle() {
        const ret = wasm.dataset___handle(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * The number of raster bands.
     * @returns {number}
     */
    get count() {
        const ret = wasm.dataset_count(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * The CRS: `EPSG:xxxx` when its code is known, otherwise its WKT, or `undefined`. For vector
     * datasets, the first layer's.
     * @returns {string | undefined}
     */
    get crs() {
        const ret = wasm.dataset_crs(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]);
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * The pixel type: `uint8`, `int16`, `float32`...
     * @returns {string}
     */
    get dtype() {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.dataset_dtype(this.__wbg_ptr);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * The raster height in pixels.
     * @returns {number}
     */
    get height() {
        const ret = wasm.dataset_height(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * The summary `terrio info --json` prints, as an object.
     * @param {boolean | null} [stats]
     * @param {boolean | null} [hist]
     * @returns {any}
     */
    info(stats, hist) {
        const ret = wasm.dataset_info(this.__wbg_ptr, isLikeNone(stats) ? 0xFFFFFF : stats ? 1 : 0, isLikeNone(hist) ? 0xFFFFFF : hist ? 1 : 0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * `"raster"` or `"vector"`.
     * @returns {string}
     */
    get kind() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.dataset_kind(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * The vector layer names.
     * @returns {string[]}
     */
    layerNames() {
        const ret = wasm.dataset_layerNames(this.__wbg_ptr);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]);
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * The raster's nodata value, or `undefined`.
     * @returns {number | undefined}
     */
    get nodata() {
        const ret = wasm.dataset_nodata(this.__wbg_ptr);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        return ret[0] === 0 ? undefined : ret[1];
    }
    /**
     * The overview sizes `[[width, height], ...]`, largest first.
     * @returns {any}
     */
    get overviews() {
        const ret = wasm.dataset_overviews(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Reads a band (numbered from 1) as a typed array of its own type (`Float32Array`,
     * `Uint8Array`...), row after row. `window` is `[col_off, row_off, width, height]` (in the
     * overview's pixels with `overview`, numbered from 0); by default, the whole image.
     * @param {number} band
     * @param {Uint32Array | null} [window]
     * @param {number | null} [overview]
     * @returns {any}
     */
    readBand(band, window, overview) {
        var ptr0 = isLikeNone(window) ? 0 : passArray32ToWasm0(window, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        const ret = wasm.dataset_readBand(this.__wbg_ptr, band, ptr0, len0, isLikeNone(overview) ? Number.MAX_SAFE_INTEGER : (overview) >>> 0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * The shared styles of a KML or KMZ document, `{ id: "PEN(...)" }`. Features
     * using one have `@id` in their `OGR_STYLE` field. Empty for other formats. `toBytes` writes
     * them to KML and KMZ; for other formats it gives each feature its style.
     * @returns {object}
     */
    get styleTable() {
        const ret = wasm.dataset_styleTable(this.__wbg_ptr);
        return ret;
    }
    /**
     * A vector layer (by name or position, the first by default) as an Arrow IPC stream, with
     * its geometries in a GeoArrow column (and the CRS as PROJJSON in its metadata): read it
     * with Apache Arrow JS (`tableFromIPC`), DuckDB-Wasm or GeoArrow-aware libraries.
     *
     * Options: `geometryEncoding` (`"wkb"`, the default, or `"geoarrow"` for the native
     * encodings) and `coordinates` (`"separated"` or `"interleaved"`).
     * @param {any} layer
     * @param {any} options
     * @returns {Uint8Array}
     */
    toArrowIPC(layer, options) {
        const ret = wasm.dataset_toArrowIPC(this.__wbg_ptr, layer, options);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
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
     * @param {string} filename
     * @param {any} options
     * @returns {Uint8Array}
     */
    toBytes(filename, options) {
        const ptr0 = passStringToWasm0(filename, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.dataset_toBytes(this.__wbg_ptr, ptr0, len0, options);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v2;
    }
    /**
     * A vector layer (by name or position, the first by default) as a GeoJSON FeatureCollection
     * object, in the layer's CRS.
     * @param {any} layer
     * @returns {any}
     */
    toGeoJSON(layer) {
        const ret = wasm.dataset_toGeoJSON(this.__wbg_ptr, layer);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * The GDAL-style geotransform `[x_origin, pixel_width, 0, y_origin, 0, -pixel_height]`.
     * @returns {Float64Array}
     */
    get transform() {
        const ret = wasm.dataset_transform(this.__wbg_ptr);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * The raster width in pixels.
     * @returns {number}
     */
    get width() {
        const ret = wasm.dataset_width(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
}
if (Symbol.dispose) Dataset.prototype[Symbol.dispose] = Dataset.prototype.free;

/**
 * Polygon index plus driver metadata, for GeoPackage/FlatGeobuf GTI output.
 */
export class DatasetIndex {
    static __wrap(ptr) {
        const obj = Object.create(DatasetIndex.prototype);
        obj.__wbg_ptr = ptr;
        DatasetIndexFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        DatasetIndexFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_datasetindex_free(ptr, 0);
    }
    /**
     * Number of indexed datasets/layers.
     * @returns {number}
     */
    get count() {
        const ret = wasm.datasetindex_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * The polygons as an ordinary vector Dataset (without driver metadata).
     * @returns {Dataset}
     */
    layer() {
        const ret = wasm.datasetindex_layer(this.__wbg_ptr);
        return Dataset.__wrap(ret);
    }
    /**
     * Layer metadata retained when serializing the index.
     * @returns {any}
     */
    get metadata() {
        const ret = wasm.datasetindex_metadata(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Encode the index with metadata. Default filename index.gpkg; use .shp.zip for Shapefile.
     * Options: format (otherwise inferred from filename).
     * @param {string | null | undefined} filename
     * @param {any} options
     * @returns {Uint8Array}
     */
    toBytes(filename, options) {
        var ptr0 = isLikeNone(filename) ? 0 : passStringToWasm0(filename, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        var len0 = WASM_VECTOR_LEN;
        const ret = wasm.datasetindex_toBytes(this.__wbg_ptr, ptr0, len0, options);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v2;
    }
}
if (Symbol.dispose) DatasetIndex.prototype[Symbol.dispose] = DatasetIndex.prototype.free;

/**
 * A numeric array with lazy dimension indexing, slicing and transposition.
 */
export class MultidimArray {
    static __wrap(ptr) {
        const obj = Object.create(MultidimArray.prototype);
        obj.__wbg_ptr = ptr;
        MultidimArrayFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        MultidimArrayFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_multidimarray_free(ptr, 0);
    }
    /**
     * Names of the current axes.
     * @returns {string[]}
     */
    get dimensionNames() {
        const ret = wasm.multidimarray_dimensionNames(this.__wbg_ptr);
        var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]);
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Array metadata with the current view's dimensions and the source chunk layout.
     * @returns {any}
     */
    info() {
        const ret = wasm.multidimarray_info(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Select and remove a zero-based current axis, including repeated dimension names.
     * @param {number} axis
     * @param {number} index
     * @returns {MultidimArray}
     */
    iselAxis(axis, index) {
        const ret = wasm.multidimarray_iselAxis(this.__wbg_ptr, axis, index);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return MultidimArray.__wrap(ret[0]);
    }
    /**
     * Select and remove one axis by dimension name, without reading data.
     * @param {string} dimension
     * @param {number} index
     * @returns {MultidimArray}
     */
    isel(dimension, index) {
        const ptr0 = passStringToWasm0(dimension, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.multidimarray_isel(this.__wbg_ptr, ptr0, len0, index);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return MultidimArray.__wrap(ret[0]);
    }
    /**
     * Absolute source-array path.
     * @returns {string}
     */
    get path() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.multidimarray_path(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Fetch the selected values as a flat native TypedArray; use shape to interpret its axes.
     * Int64 and UInt64 values use BigInt64Array and BigUint64Array without a Number conversion.
     * @returns {any}
     */
    read() {
        const ret = wasm.multidimarray_read(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Current shape after indexed axes are removed and transposition applied.
     * @returns {Uint32Array}
     */
    get shape() {
        const ret = wasm.multidimarray_shape(this.__wbg_ptr);
        var v1 = getArrayU32FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Slice a zero-based current axis position.
     * @param {number} axis
     * @param {number} start
     * @param {number} count
     * @param {number | null} [step]
     * @returns {MultidimArray}
     */
    sliceAxis(axis, start, count, step) {
        const ret = wasm.multidimarray_sliceAxis(this.__wbg_ptr, axis, start, count, isLikeNone(step) ? Number.MAX_SAFE_INTEGER : (step) >>> 0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return MultidimArray.__wrap(ret[0]);
    }
    /**
     * Select a named-axis range; a positive step defaults to one. No payload is read yet.
     * @param {string} dimension
     * @param {number} start
     * @param {number} count
     * @param {number | null} [step]
     * @returns {MultidimArray}
     */
    slice(dimension, start, count, step) {
        const ptr0 = passStringToWasm0(dimension, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.multidimarray_slice(this.__wbg_ptr, ptr0, len0, start, count, isLikeNone(step) ? Number.MAX_SAFE_INTEGER : (step) >>> 0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return MultidimArray.__wrap(ret[0]);
    }
    /**
     * Reorder all remaining axes by name, or reverse their order when omitted.
     * @param {any} dimensions
     * @returns {MultidimArray}
     */
    transpose(dimensions) {
        const ret = wasm.multidimarray_transpose(this.__wbg_ptr, dimensions);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return MultidimArray.__wrap(ret[0]);
    }
}
if (Symbol.dispose) MultidimArray.prototype[Symbol.dispose] = MultidimArray.prototype.free;

/**
 * A native scientific dataset containing groups, dimensions and lazy numeric arrays.
 */
export class MultidimDataset {
    static __wrap(ptr) {
        const obj = Object.create(MultidimDataset.prototype);
        obj.__wbg_ptr = ptr;
        MultidimDatasetFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        MultidimDatasetFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_multidimdataset_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get __terrioMultidimId() {
        const ret = wasm.multidimdataset___terrioMultidimId(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Numeric array paths, in group order.
     * @returns {string[]}
     */
    get arrayPaths() {
        const ret = wasm.multidimdataset_arrayPaths(this.__wbg_ptr);
        var v1 = getArrayJsValueFromWasm0(ret[0], ret[1]);
        wasm.__wbindgen_free(ret[0], ret[1] * 4, 4);
        return v1;
    }
    /**
     * Return a lazy numeric array by its absolute path.
     * @param {string} name
     * @returns {MultidimArray}
     */
    array(name) {
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.multidimdataset_array(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return MultidimArray.__wrap(ret[0]);
    }
    /**
     * Reads every numeric array and coordinate, including in-memory Zarr stores.
     * @returns {any}
     */
    check() {
        const ret = wasm.multidimdataset_check(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Complete group/array metadata without reading numeric array payloads.
     * @returns {any}
     */
    info() {
        const ret = wasm.multidimdataset_info(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Serialize a numeric snapshot as netCDF-4 bytes.
     * @returns {Uint8Array}
     */
    toBytes() {
        const ret = wasm.multidimdataset_toBytes(this.__wbg_ptr);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Serialize a numeric Zarr v2 snapshot as relative keys mapped to Uint8Array values.
     * @returns {any}
     */
    toZarrStore() {
        const ret = wasm.multidimdataset_toZarrStore(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
}
if (Symbol.dispose) MultidimDataset.prototype[Symbol.dispose] = MultidimDataset.prototype.free;

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
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        NetcdfGroupsFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_netcdfgroups_free(ptr, 0);
    }
    /**
     * Adds a raster in a group: a path such as `/terrain/dem` (groups are created as needed), or
     * `/` for the root group. The raster is read whole.
     * @param {string} group
     * @param {Dataset} dataset
     */
    add(group, dataset) {
        const ptr0 = passStringToWasm0(group, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        _assertClass(dataset, Dataset);
        const ret = wasm.netcdfgroups_add(this.__wbg_ptr, ptr0, len0, dataset.__wbg_ptr);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * The number of rasters added.
     * @returns {number}
     */
    get length() {
        const ret = wasm.netcdfgroups_length(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * An empty set of groups.
     */
    constructor() {
        const ret = wasm.netcdfgroups_new();
        this.__wbg_ptr = ret;
        NetcdfGroupsFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Encodes the rasters as one netCDF-4 file, with netCDF creation options as GDAL names them
     * (`FORMAT`, `COMPRESS`, `ZLEVEL`, `CHUNKING`).
     * @param {any} creation_options
     * @returns {Uint8Array}
     */
    toBytes(creation_options) {
        const ret = wasm.netcdfgroups_toBytes(this.__wbg_ptr, creation_options);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
}
if (Symbol.dispose) NetcdfGroups.prototype[Symbol.dispose] = NetcdfGroups.prototype.free;

/**
 * A pipeline's final Dataset and deferred named output files.
 */
export class PipelineResult {
    static __wrap(ptr) {
        const obj = Object.create(PipelineResult.prototype);
        obj.__wbg_ptr = ptr;
        PipelineResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PipelineResultFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_pipelineresult_free(ptr, 0);
    }
    /**
     * Final dataset, or undefined when saving a GDALG definition.
     * @returns {Dataset | undefined}
     */
    get dataset() {
        const ret = wasm.pipelineresult_dataset(this.__wbg_ptr);
        return ret === 0 ? undefined : Dataset.__wrap(ret);
    }
    /**
     * Encode outputs as an object mapping filenames to Uint8Arrays.
     * @returns {object}
     */
    outputBytes() {
        const ret = wasm.pipelineresult_outputBytes(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Destinations requested by write and named materialize steps.
     * @returns {Array<any>}
     */
    get outputNames() {
        const ret = wasm.pipelineresult_outputNames(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) PipelineResult.prototype[Symbol.dispose] = PipelineResult.prototype.free;

/**
 * A remote file read lazily with HTTP range requests: see [`open_url`]. Its reads return
 * promises.
 */
export class RemoteDataset {
    static __wrap(ptr) {
        const obj = Object.create(RemoteDataset.prototype);
        obj.__wbg_ptr = ptr;
        RemoteDatasetFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        RemoteDatasetFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_remotedataset_free(ptr, 0);
    }
    /**
     * Rasters: the number of bands.
     * @returns {number}
     */
    get count() {
        const ret = wasm.remotedataset_count(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * The CRS: `EPSG:xxxx` when its code is known, otherwise its WKT.
     * @returns {string | undefined}
     */
    get crs() {
        const ret = wasm.remotedataset_crs(this.__wbg_ptr);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]);
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * Rasters: the pixel type.
     * @returns {string}
     */
    get dtype() {
        let deferred2_0;
        let deferred2_1;
        try {
            const ret = wasm.remotedataset_dtype(this.__wbg_ptr);
            var ptr1 = ret[0];
            var len1 = ret[1];
            if (ret[3]) {
                ptr1 = 0; len1 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred2_0 = ptr1;
            deferred2_1 = len1;
            return getStringFromWasm0(ptr1, len1);
        } finally {
            wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
        }
    }
    /**
     * The format: `GTiff`, `PMTiles`, `COPC`, `FlatGeobuf` or `Parquet`.
     * @returns {string}
     */
    get format() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.remotedataset_format(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * PMTiles: a tile's bytes (decompressed), or `undefined` when the archive does not have it.
     * `y` counts rows from the top, as in XYZ tile URLs.
     * @param {number} z
     * @param {number} x
     * @param {number} y
     * @returns {Promise<any>}
     */
    getTile(z, x, y) {
        const ret = wasm.remotedataset_getTile(this.__wbg_ptr, z, x, y);
        return ret;
    }
    /**
     * Rasters: the height in pixels.
     * @returns {number}
     */
    get height() {
        const ret = wasm.remotedataset_height(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * What the header says: for rasters, the summary `terrio info --json` prints; for tiles, the
     * zoom levels, bounds, tile format and metadata; for point clouds, the LAS header; for
     * FlatGeobuf, the feature count, extent and index; for GeoParquet, the row groups.
     * @returns {any}
     */
    info() {
        const ret = wasm.remotedataset_info(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * `"raster"` (a GeoTIFF, or PMTiles of images), `"tiles"` (PMTiles of vector tiles),
     * `"pointcloud"` (COPC) or `"vector"` (FlatGeobuf, GeoParquet).
     * @returns {string}
     */
    get kind() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.remotedataset_kind(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Rasters: the nodata value.
     * @returns {number | undefined}
     */
    get nodata() {
        const ret = wasm.remotedataset_nodata(this.__wbg_ptr);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        return ret[0] === 0 ? undefined : ret[1];
    }
    /**
     * Rasters: the overview sizes `[[width, height], ...]`, largest first.
     * @returns {any}
     */
    get overviews() {
        const ret = wasm.remotedataset_overviews(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Rasters: reads a band (from 1) as a typed array, fetching only the tiles of the window
     * (`[colOff, rowOff, width, height]`, in the overview's pixels with `overview`).
     * @param {number} band
     * @param {Uint32Array | null} [window]
     * @param {number | null} [overview]
     * @returns {Promise<any>}
     */
    readBand(band, window, overview) {
        var ptr0 = isLikeNone(window) ? 0 : passArray32ToWasm0(window, wasm.__wbindgen_malloc);
        var len0 = WASM_VECTOR_LEN;
        const ret = wasm.remotedataset_readBand(this.__wbg_ptr, band, ptr0, len0, isLikeNone(overview) ? Number.MAX_SAFE_INTEGER : (overview) >>> 0);
        return ret;
    }
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
     * @param {any} options
     * @returns {Promise<any>}
     */
    read(options) {
        const ret = wasm.remotedataset_read(this.__wbg_ptr, options);
        return ret;
    }
    /**
     * The file's size in bytes.
     * @returns {number}
     */
    get size() {
        const ret = wasm.remotedataset_size(this.__wbg_ptr);
        return ret;
    }
    /**
     * The requests sent and the bytes received so far: `{ requests, bytes }`.
     * @returns {any}
     */
    stats() {
        const ret = wasm.remotedataset_stats(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Rasters: the GDAL-style geotransform.
     * @returns {Float64Array}
     */
    get transform() {
        const ret = wasm.remotedataset_transform(this.__wbg_ptr);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayF64FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 8, 8);
        return v1;
    }
    /**
     * The URL.
     * @returns {string}
     */
    get url() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.remotedataset_url(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Rasters: the width in pixels.
     * @returns {number}
     */
    get width() {
        const ret = wasm.remotedataset_width(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
}
if (Symbol.dispose) RemoteDataset.prototype[Symbol.dispose] = RemoteDataset.prototype.free;

/**
 * Adds internal GeoTIFF overview levels and returns updated file bytes.
 * Options: levels, minSize, resampling, compression, ignoreCogLayoutBreak.
 * @param {Uint8Array} bytes
 * @param {any} options
 * @returns {Uint8Array}
 */
export function addOverviews(bytes, options) {
    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.addOverviews(ptr0, len0, options);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * One vector feature per pixel (`gdal raster as-features`). Options: `bands` (from 1, all by
 * default), `geometryType` (`none`, `point` or `polygon`), `skipNodata`, `includeXy`,
 * `includeRowCol`, `layerName` (`pixels`).
 * @param {any} src
 * @param {any} options
 * @returns {Dataset}
 */
export function asFeatures(src, options) {
    const ret = wasm.asFeatures(src, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Attaches a palette without changing Byte/UInt16 indices, nodata or the dataset mask.
 * colorMap accepts a palette Dataset/file, color-file text or RGBA arrays.
 * @param {any} src
 * @param {any} color_map
 * @returns {Dataset}
 */
export function attachPalette(src, color_map) {
    const ret = wasm.attachPalette(src, color_map);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Blends equal-sized Byte images. Options: operator (GDAL name), opacity (0..100).
 * @param {any} src
 * @param {any} overlay
 * @param {any} options
 * @returns {Dataset}
 */
export function blend(src, overlay, options) {
    const ret = wasm.blend(src, overlay, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Planar buffers in CRS units. Options: quadrantSegments (default 30).
 * @param {any} src
 * @param {number} distance
 * @param {any} options
 * @returns {Dataset}
 */
export function buffer(src, distance, options) {
    const ret = wasm.buffer(src, distance, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Evaluates band math over rasters, as `terrio calc` (GDAL's `gdal_calc.py`), with NumPy's
 * typing rules so that results match `gdal_calc.py`.
 *
 * `expression`: an expression, or an array of them (one per output band), in NumPy syntax.
 * `inputs`: the rasters by the names the expressions use, `{ A: dem, B: other }`. Options:
 * `bands` (the band of each input, `{ A: 2 }`; 1 by default), `type`, `nodata` (a number or
 * `"none"`), `hideNodata`, `extent` (`ignore`, `fail`, `union`, `intersect`), `projwin`,
 * `allBands` (the input whose every band is processed), `projectionCheck`.
 * @param {any} expression
 * @param {any} inputs
 * @param {any} options
 * @returns {Dataset}
 */
export function calc(expression, inputs, options) {
    const ret = wasm.calc(expression, inputs, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Polygon coverage errors as MultiLineStrings, with CRS retained, empty attributes and new IDs.
 * Each polygon must individually be valid. Options: `maximumGapWidth` (input CRS
 * units; zero disables narrow gaps), `includeValid` (empty lines for valid features).
 * @param {any} src
 * @param {any} options
 * @returns {Dataset}
 */
export function checkCoverage(src, options) {
    const ret = wasm.checkCoverage(src, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Reads all exposed uploaded content. Returns successful content counts;
 * reader failures throw. This cannot detect mutations without integrity checks.
 * @param {Uint8Array} bytes
 * @param {string} filename
 * @param {any} options
 * @returns {any}
 */
export function checkDataset(bytes, filename, options) {
    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(filename, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.checkDataset(ptr0, len0, ptr1, len1, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Return layers annotated with is_valid and valid_reason, preserving source geometry.
 * @param {any} src
 * @returns {Dataset}
 */
export function checkGeometry(src) {
    const ret = wasm.checkGeometry(src);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Cleans the noisy collar of an image, as `terrio clean-collar` (GDAL's
 * `gdal raster clean-collar`): a flood fill from the edges by default, an input's last alpha
 * band kept updated. Options as [`nearblack`]'s.
 * @param {any} src
 * @param {any} options
 * @returns {Dataset}
 */
export function cleanCollar(src, options) {
    const ret = wasm.cleanCollar(src, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Clean polygon coverage boundaries. Options: snappingDistance (-1 selects the
 * extent-based default, 0 disables proximity snapping), mergeStrategy
 * (longest-border|max-area|min-area|min-index), maximumGapWidth (0), layer, activeLayer.
 * layer selects one output layer and is mutually exclusive with activeLayer.
 * Topology uses XY; representative Z is retained/interpolated and active M is dropped.
 * Attributes and CRS remain. Inactive layers are copied.
 * @param {any} src
 * @param {any} options
 * @returns {Dataset}
 */
export function cleanCoverage(src, options) {
    const ret = wasm.cleanCoverage(src, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Clips vector features. Supply exactly one of `bbox: [xmin,ymin,xmax,ymax]`,
 * `geometry` (polygon WKT or GeoJSON text/object), or `like` (vector/raster Dataset,
 * uploaded bytes, or GeoJSON). `crs` references bbox/geometry; GeoJSON defaults to
 * WGS84. Optional `layers` selects input layers. `likeLayer`, `likeWhere` and
 * `likeSql` select/filter a polygon template. Raster template bounds use metadata;
 * lazy raster pixels are not loaded. Returns a Dataset retaining attributes and
 * input CRS, with sequential feature IDs. Line cuts interpolate Z/M; constructed
 * polygon topology is XY.
 * @param {any} src
 * @param {any} options
 * @returns {Dataset}
 */
export function clipVector(src, options) {
    const ret = wasm.clipVector(src, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Combines geometries into collections, one feature per group of field values, as `gdal
 * vector combine`. Options: `groupBy` (field names), `keepNested`, `addExtraFields` (`"no"`,
 * `"sometimes-identical"`, `"always-identical"`).
 * @param {any} src
 * @param {any} options
 * @returns {Dataset}
 */
export function combine(src, options) {
    const ret = wasm.combine(src, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Compares two rasters as `terrio compare` (GDAL's `gdal raster compare`) does. The binary
 * comparison is made when both are given as bytes (identical bytes have no difference); RPC and
 * subdataset comparisons need files and are not made. Options: `skipAllOptional`, `skipBinary`,
 * `skipCrs`, `skipGeotransform`, `skipOverview`, `skipMetadata`, `skipRpc`, `skipGeolocation`,
 * `skipSubdataset`. Returns `{ difference_count, differences: [{ kind, band?, message }],
 * bands: [{ band, data_type, pixels, pixels_differing, max_abs_diff }] }`.
 * @param {any} reference
 * @param {any} input
 * @param {any} options
 * @returns {any}
 */
export function compare(reference, input, options) {
    const ret = wasm.compare(reference, input, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Concatenates vector datasets, as `terrio concat` (GDAL's `gdal vector concat`). `srcs`: an
 * array of `Dataset`s, file bytes (`{ bytes, filename }` gives the name templates use) or
 * GeoJSON. Options: `layers`, `mode` (`merge-per-layer-name`, `stack`, `single`),
 * `outputLayer`, `sourceLayerFieldName`, `sourceLayerFieldContent`, `fieldStrategy`
 * (`union`, `intersection`), `srcCrs`, `dstCrs`.
 * @param {any} srcs
 * @param {any} options
 * @returns {Dataset}
 */
export function concat(srcs, options) {
    const ret = wasm.concat(srcs, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * The concave hull of every geometry (of its polygons for polygonal input), as `gdal vector
 * concave-hull`. `ratio` goes from 0 (most concave) to 1 (convex hull). Options: `allowHoles`,
 * `tight`.
 * @param {any} src
 * @param {number} ratio
 * @param {any} options
 * @returns {Dataset}
 */
export function concaveHull(src, ratio, options) {
    const ret = wasm.concaveHull(src, ratio, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Contour an uploaded/shared raster. Options mirror the CLI in camelCase.
 * The source raster and generated lines are held in memory.
 * @param {any} src
 * @param {any} options
 * @returns {Dataset}
 */
export function contour(src, options) {
    const ret = wasm.contour(src, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * The convex hull of every geometry, as `gdal vector convex-hull`.
 * @param {any} src
 * @returns {Dataset}
 */
export function convexHull(src) {
    const ret = wasm.convexHull(src);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Creates a filled raster Dataset. `like` is a raster or null; options override its header.
 * Options: size, bandCount, ot, crs, bbox, nodata, unsetNodata, burn, metadata, copyMetadata.
 * @param {any} like
 * @param {any} options
 * @returns {Dataset}
 */
export function createRaster(like, options) {
    const ret = wasm.createRaster(like, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * A new dataset of empty layers, as `terrio create` (GDAL's `gdal vector create`), as the
 * bytes of the file `filename` (whose extension tells the format, unless `format` does).
 * Options: `schema` (an OGR_SCHEMA object or JSON text) or `like` (vector data whose layers
 * are templates), `layers`, `outputLayer`, or `geometryType`, `crs` and `fields`
 * (`"NAME:TYPE(WIDTH,PRECISION)"`).
 * @param {string} filename
 * @param {any} options
 * @returns {Uint8Array}
 */
export function createVector(filename, options) {
    const ptr0 = passStringToWasm0(filename, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.createVector(ptr0, len0, options);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * The PROJJSON v0.7 of a CRS; throws for a CRS it would describe wrongly.
 * @param {string} crs
 * @returns {string}
 */
export function crsToProjjson(crs) {
    let deferred3_0;
    let deferred3_1;
    try {
        const ptr0 = passStringToWasm0(crs, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.crsToProjjson(ptr0, len0);
        var ptr2 = ret[0];
        var len2 = ret[1];
        if (ret[3]) {
            ptr2 = 0; len2 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_free(deferred3_0, deferred3_1, 1);
    }
}

/**
 * Copies a dataset file set without conversion. Options: `format`, `overwrite`, `allowExternalReferences`.
 * @param {string} source
 * @param {string} destination
 * @param {any} options
 * @returns {any}
 */
export function datasetCopy(source, destination, options) {
    const ptr0 = passStringToWasm0(source, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(destination, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.datasetCopy(ptr0, len0, ptr1, len1, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Deletes owned files of one path or an array of paths. Returns one report per input.
 * Options: `format`. Referenced VRT/catalog source assets are retained.
 * @param {any} sources
 * @param {any} options
 * @returns {any}
 */
export function datasetDelete(sources, options) {
    const ret = wasm.datasetDelete(sources, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Lists owned files. Options: `format`. Referenced VRT assets are not owned.
 * @param {string} source
 * @param {any} options
 * @returns {any}
 */
export function datasetFiles(source, options) {
    const ptr0 = passStringToWasm0(source, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.datasetFiles(ptr0, len0, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Renames a dataset file set. Options: `format`, `overwrite`, `allowExternalReferences`.
 * @param {string} source
 * @param {string} destination
 * @param {any} options
 * @returns {any}
 */
export function datasetRename(source, destination, options) {
    const ptr0 = passStringToWasm0(source, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(destination, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.datasetRename(ptr0, len0, ptr1, len1, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Deletes internal overview links and returns updated GeoTIFF bytes.
 * @param {Uint8Array} bytes
 * @param {any} options
 * @returns {Uint8Array}
 */
export function deleteOverviews(bytes, options) {
    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.deleteOverviews(ptr0, len0, options);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

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
 * @param {any} src
 * @param {string} processing
 * @param {any} options
 * @returns {Dataset}
 */
export function dem(src, processing, options) {
    const ptr0 = passStringToWasm0(processing, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.dem(src, ptr0, len0, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Describes a CRS: `{ epsg, esri, name, geographic, wkt }` (`esri`: the ESRI code of a CRS
 * without EPSG code).
 * @param {string} crs
 * @returns {any}
 */
export function describeCrs(crs) {
    const ptr0 = passStringToWasm0(crs, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.describeCrs(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Dissolve each input layer, optionally grouped by options.fields.
 * @param {any} src
 * @param {any} options
 * @returns {Dataset}
 */
export function dissolve(src, options) {
    const ret = wasm.dissolve(src, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * The formats terrio reads and writes: `[{ name, long_name, kind, extensions, read, write }]`.
 * In WebAssembly, only the formats with in-memory codecs can be used (see the README).
 * @returns {any}
 */
export function drivers() {
    const ret = wasm.drivers();
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Edits GeoTIFF bytes without resampling. Histograms need a sidecar and are refused.
 * @param {Uint8Array} bytes
 * @param {any} options
 * @returns {Uint8Array}
 */
export function editRaster(bytes, options) {
    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.editRaster(ptr0, len0, options);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * Assigns CRS/type on a copy without transforming geometries. Options: activeLayer,
 * crs ("none" removes it), geometryType, unsetFid. Dataset metadata is not represented
 * in the in-memory model; use the native path API for metadata edits.
 * @param {any} src
 * @param {any} options
 * @returns {Dataset}
 */
export function editVector(src, options) {
    const ret = wasm.editVector(src, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Enhances the contrast of a raster with lookup tables, as `terrio enhance` (GDAL's
 * `gdalenhance`).
 *
 * Options: `equalize` (histogram equalization), `config` (the text of a LUT file, as
 * `enhanceLuts` returns it), or `srcScale` (`[min, max]` stretched over the bins); `lutBins`
 * (256) and `ot` (`"Byte"`).
 * @param {any} src
 * @param {any} options
 * @returns {Dataset}
 */
export function enhance(src, options) {
    const ret = wasm.enhance(src, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * The histogram-equalization tables of a raster, as the text of a `gdalenhance -config` file.
 * Options: `lutBins` (256).
 * @param {any} src
 * @param {any} options
 * @returns {string}
 */
export function enhanceLuts(src, options) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.enhanceLuts(src, options);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * The OGR_SCHEMA document of vector data, as `terrio export-schema` (GDAL's
 * `gdal vector export-schema`). Options: `layers`.
 * @param {any} src
 * @param {any} options
 * @returns {any}
 */
export function exportSchema(src, options) {
    const ret = wasm.exportSchema(src, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * What this module has: `{ build, features, threads }`, `build` being `"terrio-js"` (every
 * format), `"terrio-js/threads"` (every format, with `initThreadPool`), `"terrio-js/memory64"`
 * (every format, with 64-bit memory, up to 16 GB) or `"terrio-js/core"`,
 * `features` the optional formats built in (`jp2`, `netcdf-hdf5`, `pointcloud`, `parquet`...),
 * `threads` the threads work runs on (1 until `initThreadPool` has started more), and `memory`
 * the bytes of the module's memory now.
 * @returns {any}
 */
export function features() {
    const ret = wasm.features();
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Fills holes using GDAL's four-quadrant interpolation, returning a single-band raster.
 * Options: `band`, `mask` (a raster with zero at holes), `maxDistance` (pixels,
 * 100 by default, 0 for unlimited), `interpolation` (`inv_dist` or `nearest`),
 * `smoothingIterations`. Without a mask, uses the source's mask or nodata.
 * @param {any} src
 * @param {any} options
 * @returns {Dataset}
 */
export function fillNodata(src, options) {
    const ret = wasm.fillNodata(src, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Exact valid-data footprint, with optional mask Dataset/upload and explicit text attributes.
 * Validity uses finite samples and dataset nodata; alpha/external masks require an explicit mask.
 * No source-path field is added automatically; input pixels are materialized.
 * @param {any} src
 * @param {any} options
 * @returns {Dataset}
 */
export function footprint(src, options) {
    const ret = wasm.footprint(src, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Creates a vector dataset from an Arrow IPC stream or file (as Apache Arrow JS's
 * `tableToIPC` writes it): the geometry column is found by its GeoArrow metadata (WKB, WKT or
 * native encodings), GeoParquet metadata, or a binary column named `geometry`.
 * @param {Uint8Array} bytes
 * @param {string | null} [name]
 * @returns {Dataset}
 */
export function fromArrowIPC(bytes, name) {
    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    var ptr1 = isLikeNone(name) ? 0 : passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len1 = WASM_VECTOR_LEN;
    const ret = wasm.fromArrowIPC(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Creates a vector dataset from GeoJSON: an object or a JSON string. `crs` is the coordinates'
 * CRS, EPSG:4326 by default.
 * @param {any} geojson
 * @param {string | null} [name]
 * @param {string | null} [crs]
 * @returns {Dataset}
 */
export function fromGeoJSON(geojson, name, crs) {
    var ptr0 = isLikeNone(name) ? 0 : passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len0 = WASM_VECTOR_LEN;
    var ptr1 = isLikeNone(crs) ? 0 : passStringToWasm0(crs, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len1 = WASM_VECTOR_LEN;
    const ret = wasm.fromGeoJSON(geojson, ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Repack an uploaded /vsimem/ GeoPackage in place and return physical storage counts.
 * @param {string} path
 * @returns {any}
 */
export function gpkgRepack(path) {
    const ptr0 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.gpkgRepack(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Return a compacted copy of a self-contained GeoPackage image.
 * @param {Uint8Array} data
 * @returns {Uint8Array}
 */
export function gpkgRepackBytes(data) {
    const ptr0 = passArray8ToWasm0(data, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.gpkgRepackBytes(ptr0, len0);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * Identifies Uint8Array or {bytes, filename} inputs from their first 16 KiB.
 * Only that prefix is copied into WASM. Unknown formats return null; this is
 * format identification, not payload-integrity validation.
 * @param {any} source
 * @param {string | null} [filename]
 * @returns {any}
 */
export function identify(source, filename) {
    var ptr0 = isLikeNone(filename) ? 0 : passStringToWasm0(filename, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len0 = WASM_VECTOR_LEN;
    const ret = wasm.identify(source, ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Attribute-preserving planar XY layer algebra. Operations: intersection, union,
 * sym-difference, identity, update, clip, erase. CRS must match. Options: layer,
 * methodLayer, keepLowerDimensionGeometries (true), inputPrefix, methodPrefix.
 * Each source must have one layer unless selected. Sources are materialized;
 * output IDs are sequential. All polygon, line and point types are supported.
 * @param {any} src
 * @param {any} method
 * @param {string} operation
 * @param {any} options
 * @returns {Dataset}
 */
export function layerAlgebra(src, method, operation, options) {
    const ptr0 = passStringToWasm0(operation, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.layerAlgebra(src, method, ptr0, len0, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * The coordinates `[x, y, z]` of a position on each part spanning it, as
 * `terrio lineref get-coord` (GDAL's `ogrlineref -get_coord`).
 * @param {any} parts
 * @param {number} position
 * @param {any} options
 * @returns {any}
 */
export function linerefCoordinates(parts, position, options) {
    const ret = wasm.linerefCoordinates(parts, position, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Cuts a route into parts of equal position length from reference points, as
 * `terrio lineref create` (GDAL's `ogrlineref -create`).
 *
 * `lines`, `points`: vector data (a `Dataset`, bytes or GeoJSON). Options: `positionField`
 * (required), `step` (required), `linesLayer`, `pointsLayer`, `lineField` with `pointField`,
 * `idField`, `layerName`. Returns the parts, with `beg`, `end` and `scale` fields.
 * @param {any} lines
 * @param {any} points
 * @param {any} options
 * @returns {Dataset}
 */
export function linerefCreate(lines, points, options) {
    const ret = wasm.linerefCreate(lines, points, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * The position of `(x, y)` on linear reference parts, as `terrio lineref get-pos` (GDAL's
 * `ogrlineref -get_pos`).
 * @param {any} parts
 * @param {number} x
 * @param {number} y
 * @param {any} options
 * @returns {number}
 */
export function linerefPosition(parts, x, y, options) {
    const ret = wasm.linerefPosition(parts, x, y, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return ret[0];
}

/**
 * The route between two positions, as `terrio lineref get-subline` (GDAL's
 * `ogrlineref -get_subline`): one line feature with `beg`, `end` and `scale` fields.
 * @param {any} parts
 * @param {number} begin
 * @param {number} end
 * @param {any} options
 * @returns {Dataset}
 */
export function linerefSubline(parts, begin, end, options) {
    const ret = wasm.linerefSubline(parts, begin, end, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Lists a remote directory with `fetch`, as `gdal vsi list` lists `/vsis3/`, `/vsigs/`,
 * `/vsiaz/` and `/vsicurl/`: public S3 buckets (`s3://bucket/dir`), Google Cloud Storage
 * (`gs://`), Azure Blob Storage (`https://account.blob.core.windows.net/container/dir?<SAS>`)
 * and HTML index pages of plain HTTP servers. Options: `recursive`, `depth`, `fetch` (instead of
 * `globalThis.fetch`), `headers`. Returns `{entries, requests, bytes}`.
 *
 * In browsers, the store must allow the page's origin (CORS). HTML indexes are streamed,
 * checked with a 4 KiB sniff prefix and limited to 4 MiB; custom fetch must return a Response.
 * @param {string} url
 * @param {any} options
 * @returns {Promise<any>}
 */
export function listUrl(url, options) {
    const ptr0 = passStringToWasm0(url, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.listUrl(ptr0, len0, options);
    return ret;
}

/**
 * Point geometries from coordinate fields, as `terrio make-point` (GDAL's
 * `gdal vector make-point`), of the first layer (or `layer`). Options: `z`, `m`, `crs`
 * (assigned to the points), `layer`.
 * @param {any} src
 * @param {string} x
 * @param {string} y
 * @param {any} options
 * @returns {Dataset}
 */
export function makePoint(src, x, y, options) {
    const ptr0 = passStringToWasm0(x, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(y, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.makePoint(src, ptr0, len0, ptr1, len1, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Repair invalid geometries, retaining attributes, IDs and already-valid Z/M values.
 * @param {any} src
 * @returns {Dataset}
 */
export function makeValid(src) {
    const ret = wasm.makeValid(src);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Mosaics rasters into one, as `terrio mosaic` (GDAL's `gdalbuildvrt` then `gdal_translate`).
 *
 * `srcs`: an array of rasters. Options: `resolution` (`highest`, `lowest` or `average`), `tr`,
 * `te`, `tap`, `separate` (each source in its own band), `bands`, `nodata` (both `srcNodata`
 * and `dstNodata`), `srcNodata`, `dstNodata`, `resampling`, `tSrs`.
 * @param {any} srcs
 * @param {any} options
 * @returns {Dataset}
 */
export function mosaic(srcs, options) {
    const ret = wasm.mosaic(srcs, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Coordinate-aligned lazy mosaic of MultidimDataset objects or uploaded scientific inputs.
 * Options: arrays (names/full paths); absent selects arrays with at least two axes.
 * Last input wins overlaps. Views fetch only intersecting source hyperslabs.
 * @param {any} sources
 * @param {any} options
 * @returns {MultidimDataset}
 */
export function mosaicMultidim(sources, options) {
    const ret = wasm.mosaicMultidim(sources, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return MultidimDataset.__wrap(ret[0]);
}

/**
 * Reports or changes georeferencing without resampling. Returns {bytes, report};
 * errorThreshold is required to write an acceptable affine transformation.
 * @param {Uint8Array} bytes
 * @param {any} options
 * @returns {any}
 */
export function moveRaster(bytes, options) {
    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.moveRaster(ptr0, len0, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Sets the nearly black (or white) borders of an image to exact black (or white), as
 * `terrio nearblack` (GDAL's `nearblack`, two scan passes by default).
 *
 * Options: `colors` (`"black"`, `"white"` or `"r,g,b"` strings), `white`, `colorThreshold`
 * (15), `pixelDistance` (2), `addAlpha` and `algorithm` (`"twopasses"` or `"floodfill"`).
 * Masks (`addMask`) are not supported: Datasets hold none.
 * @param {any} src
 * @param {any} options
 * @returns {Dataset}
 */
export function nearblack(src, options) {
    const ret = wasm.nearblack(src, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Focal statistics and convolution kernels, as `terrio neighbors` (GDAL's
 * `gdal raster neighbors`).
 *
 * Options: `kernel` (required: `"u"`, `"v"`, `"edge1"`, `"edge2"`, `"sharpen"`, `"gaussian"`,
 * `"unsharp-masking"`, `"equal"` or a matrix `"[[0,1,0],[1,1,1],[0,1,0]]"`, or an array of
 * them), `method` (`"sum"`, `"mean"`, `"min"`, `"max"`, `"stddev"`, `"median"`, `"mode"`, or
 * one per kernel), `size`, `band` (every band by default), `ot` (`"Float64"`) and `nodata` (a
 * number or `"none"`; the input band's by default).
 * @param {any} src
 * @param {any} options
 * @returns {Dataset}
 */
export function neighbors(src, options) {
    const ret = wasm.neighbors(src, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Replaces nodata values with an alpha band (`gdal raster nodata-to-alpha`). Options:
 * `nodata`, a value overriding the source's, or one per band (transparent where every band has
 * its value). Use strings `"nan"`, `"inf"`, `"-inf"` for non-finite overrides; raw
 * non-finite numbers and null are rejected before JSON serialization.
 * @param {any} src
 * @param {any} options
 * @returns {Dataset}
 */
export function nodataToAlpha(src, options) {
    const ret = wasm.nodataToAlpha(src, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Opens a dataset from its bytes. `filename`'s extension tells the format (`dem.tif`,
 * `roads.fgb`, `parcels.zip`); its stem names vector layers.
 *
 * GeoTIFFs and the image tiles of PMTiles and MBTiles archives are decoded one window at a
 * time, as they are read, and GRIB files one band (message) at a time; vector tiles are read as
 * layers.
 * @param {Uint8Array} bytes
 * @param {string} filename
 * @returns {Dataset}
 */
export function open(bytes, filename) {
    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(filename, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.open(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Opens a lazy indexed raster mosaic from a vector index and named source rasters in memory.
 * `sources` maps the index's location values to Dataset/bytes inputs. Options: locationField,
 * sortField, sortDescending, tr, te, srs, bands, ot, nodata, alphaBand, cacheSize, resampling.
 * @param {any} index
 * @param {any} sources
 * @param {any} options
 * @returns {Dataset}
 */
export function openCatalog(index, sources, options) {
    const ret = wasm.openCatalog(index, sources, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Open netCDF/HDF5 bytes, {bytes,filename}, or a Zarr object of relative keys and Uint8Arrays.
 * @param {any} input
 * @returns {MultidimDataset}
 */
export function openMultidim(input) {
    const ret = wasm.openMultidim(input);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return MultidimDataset.__wrap(ret[0]);
}

/**
 * Point clouds are in the full module, `terrio-js`.
 * @param {Uint8Array} _bytes
 * @param {string} _filename
 * @returns {any}
 */
export function openPoints(_bytes, _filename) {
    const ptr0 = passArray8ToWasm0(_bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(_filename, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.openPoints(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

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
 * @param {string} url
 * @param {any} options
 * @returns {Promise<RemoteDataset>}
 */
export function openUrl(url, options) {
    const ptr0 = passStringToWasm0(url, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.openUrl(ptr0, len0, options);
    return ret;
}

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
 * @param {Uint8Array} bytes
 * @param {string} filename
 * @param {any} options
 * @returns {Dataset}
 */
export function openVector(bytes, filename, options) {
    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(filename, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.openVector(ptr0, len0, ptr1, len1, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Opens serialized VRT XML with a map of source file names to Uint8Array bytes.
 * Source GeoTIFFs and VRT pixel windows are read lazily, including in WebAssembly.
 * @param {string} xml
 * @param {any} sources
 * @returns {Dataset}
 */
export function openVrt(xml, sources) {
    const ptr0 = passStringToWasm0(xml, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.openVrt(ptr0, len0, sources);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Opens a Zarr store (v2 or v3, GeoZarr conventions included) from its files: a `Map` or an
 * object of paths to `Uint8Array`s (`.zgroup`, `dem/.zarray`, `dem/0.0`...), as an in-memory
 * key-value store holds them. A zip archive of a store opens with `open`.
 * @param {any} store
 * @returns {Dataset}
 */
export function openZarr(store) {
    const ret = wasm.openZarr(store);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Expands one indexed band to RGB or RGBA (options: rgba), retaining the dataset mask.
 * The full source and output are materialized; the returned Dataset supports mask reads.
 * @param {any} src
 * @param {any} options
 * @returns {Dataset}
 */
export function paletteToRgb(src, options) {
    const ret = wasm.paletteToRgb(src, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Weighted Brovey pansharpening. `spectral` is a raster/bytes or an array of them;
 * all bands contribute intensity. Options: `weights`, output `bands` (from 1),
 * `panBand`, `resampling` (default cubic), `bitdepth`, `nodata` (number or "none"),
 * `spatAdjust` (union/intersection/none), `ot` (output type).
 * @param {any} pan
 * @param {any} spectral
 * @param {any} options
 * @returns {Dataset}
 */
export function pansharpen(pan, spectral, options) {
    const ret = wasm.pansharpen(pan, spectral, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Create GDAL pansharpened VRT XML from named uploaded sources without decoding pixels.
 * Pass the returned XML and the same source byte map to `openVrt` for lazy window reads.
 * @param {string} pan
 * @param {string[]} spectral
 * @param {any} sources
 * @param {any} options
 * @returns {string}
 */
export function pansharpenVrt(pan, spectral, sources, options) {
    let deferred4_0;
    let deferred4_1;
    try {
        const ptr0 = passStringToWasm0(pan, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayJsValueToWasm0(spectral, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.pansharpenVrt(ptr0, len0, ptr1, len1, sources, options);
        var ptr3 = ret[0];
        var len3 = ret[1];
        if (ret[3]) {
            ptr3 = 0; len3 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred4_0 = ptr3;
        deferred4_1 = len3;
        return getStringFromWasm0(ptr3, len3);
    } finally {
        wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
    }
}

/**
 * Create a Parquet metadata-only file. Options: `overwrite`.
 * @param {string[]} inputs
 * @param {string} output
 * @param {any} options
 * @returns {any}
 */
export function parquetCreateMetadata(inputs, output, options) {
    const ptr0 = passArrayJsValueToWasm0(inputs, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(output, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.parquetCreateMetadata(ptr0, len0, ptr1, len1, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Partitions vector data by field values, as `terrio partition` (GDAL's
 * `gdal vector partition`), returning the parts as `[{ path, bytes }]` (paths relative to the
 * output directory). Options: `fields`, `scheme` (`hive`, `flat`), `pattern`, `featureLimit`,
 * `maxFileSize` (bytes), `omitPartitionedFields`, `format` (by default the input's).
 * @param {any} src
 * @param {any} options
 * @returns {any}
 */
export function partition(src, options) {
    const ret = wasm.partition(src, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Evaluate a command or GDALG JSON text using aliases from inputs. Values may
 * be Datasets, uploaded {bytes, filename} objects, Uint8Arrays or GeoJSON.
 * No files are created; outputBytes() encodes explicit outputs on request.
 * @param {string} command
 * @param {any} inputs
 * @param {any} options
 * @returns {PipelineResult}
 */
export function pipeline(command, inputs, options) {
    const ptr0 = passStringToWasm0(command, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.pipeline(ptr0, len0, inputs, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return PipelineResult.__wrap(ret[0]);
}

/**
 * Queries pixel values at positions, as `terrio pixel-info` (GDAL's `gdal raster pixel-info` and
 * `gdallocationinfo`). `positions` is an array of `[x, y]` or `[x, y, text]` (column and line,
 * or coordinates in `positionCrs`), or the vector dataset whose points (centroids of other
 * geometries) are the positions: a `Dataset`, file bytes or GeoJSON. Options: `positionCrs`
 * (`pixel`, `dataset` or a CRS), `layer`, `includeFields`, `bands`, `overview`, `resampling`
 * (`nearest`, `bilinear`, `cubic`, `cubicspline`), `promotePixelValueToZ` and `format`:
 * `geojson` (an object, the default), `json` (an array), `csv`, `text` or `value` (strings).
 * @param {any} src
 * @param {any} positions
 * @param {any} options
 * @returns {any}
 */
export function pixelInfo(src, positions, options) {
    const ret = wasm.pixelInfo(src, positions, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Plan folder tiles without reading pixels. Grid fields accept camelCase.
 * @param {any} input
 * @param {any} options
 * @returns {any}
 */
export function planRasterTiles(input, options) {
    const ret = wasm.planRasterTiles(input, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Plan GDAL-style retile files and recursive pyramid levels. Inputs are a
 * Dataset/byte upload or an array of them; options use camelCase or snake_case.
 * @param {any} inputs
 * @param {any} options
 * @returns {any}
 */
export function planRetile(inputs, options) {
    const ret = wasm.planRetile(inputs, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Point clouds are in the full module, `terrio-js`.
 * @param {object} _arrays
 * @param {string | null} [_crs]
 * @returns {any}
 */
export function pointsFromArrays(_arrays, _crs) {
    var ptr0 = isLikeNone(_crs) ? 0 : passStringToWasm0(_crs, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len0 = WASM_VECTOR_LEN;
    const ret = wasm.pointsFromArrays(_arrays, ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Turns a raster band into polygons of connected pixels of the same value, as
 * `terrio polygonize` (GDAL's `gdal_polygonize`). Returns a vector `Dataset`.
 *
 * Options: `band` (1), `field` (`"DN"`), `layerName` (`"polygonized"`), `connectedness` (4 or
 * 8), `nomask` (keep nodata pixels), `mask` (a raster: pixels where its first band is 0 are
 * left out).
 * @param {any} src
 * @param {any} options
 * @returns {Dataset}
 */
export function polygonize(src, options) {
    const ret = wasm.polygonize(src, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * The distance from every pixel to the nearest target pixel, as `terrio proximity` (GDAL's
 * `gdal_proximity.py`).
 *
 * Options: `band`, `values` (the target values; every non-zero pixel by default), `distunits`
 * (`PIXEL` or `GEO`), `maxdist`, `nodata`, `useInputNodata`, `fixedBufVal`, `ot` (`Float32`).
 * @param {any} src
 * @param {any} options
 * @returns {Dataset}
 */
export function proximity(src, options) {
    const ret = wasm.proximity(src, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Creates a raster from a typed array of pixels, band after band, row after row.
 *
 * `transform` is the GDAL-style geotransform `[x_origin, pixel_width, 0, y_origin, 0,
 * -pixel_height]`; `crs` is `EPSG:4326`, WKT or a PROJ string.
 * @param {any} data
 * @param {number} width
 * @param {number} height
 * @param {Float64Array} transform
 * @param {string | null} [crs]
 * @param {number | null} [nodata]
 * @returns {Dataset}
 */
export function rasterFromArray(data, width, height, transform, crs, nodata) {
    const ptr0 = passArrayF64ToWasm0(transform, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    var ptr1 = isLikeNone(crs) ? 0 : passStringToWasm0(crs, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len1 = WASM_VECTOR_LEN;
    const ret = wasm.rasterFromArray(data, width, height, ptr0, len0, ptr1, len1, !isLikeNone(nodata), isLikeNone(nodata) ? 0 : nodata);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Create raster extent polygons from {storedLocation: Dataset/file} mappings, without
 * decoding pixels through lazy-capable readers. Options use camelCase CLI concepts:
 * outputLayer, locationName, outputCrs, sourceCrsFieldName/Format, metadata,
 * minPixelSize/maxPixelSize, fetchMetadata (KEY,FIELD,TYPE triples), resolution, bbox,
 * ot, bandCount, nodata (an array; strings for nan/inf), colorInterpretations and mask.
 * @param {any} sources
 * @param {any} options
 * @returns {DatasetIndex}
 */
export function rasterIndex(sources, options) {
    const ret = wasm.rasterIndex(sources, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return DatasetIndex.__wrap(ret[0]);
}

/**
 * Generate one encoded tile at a time, calling onTile(relativePath, Uint8Array).
 * The callback is synchronous. A thrown exception stops generation. Use the callback
 * to save/download each tile; Terrio does not retain the encoded pyramid in WASM memory.
 * @param {any} input
 * @param {any} options
 * @param {Function} on_tile
 * @returns {any}
 */
export function rasterTiles(input, options, on_tile) {
    const ret = wasm.rasterTiles(input, options, on_tile);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Burns vector geometries into a raster, as `terrio rasterize` (GDAL's `gdal_rasterize`).
 *
 * `src`: vector data (a `Dataset`, bytes or GeoJSON). Options: `burn` (a value, or one per
 * band) or `attribute`, `layers`, `sql`, `where`, `tr`, `ts`, `te`, `tap`, `like` (a raster
 * whose grid to use), `ot`, `init`, `nodata`, `allTouched`, `add`, `aSrs`.
 * @param {any} src
 * @param {any} options
 * @returns {Dataset}
 */
export function rasterize(src, options) {
    const ret = wasm.rasterize(src, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Returns RGBA entries from a palette Dataset/file, color-file text or RGBA arrays.
 * filename hints TXT/CPT/QML/QLR formats for text or encoded bytes. Raster palettes
 * are read from headers, with source nodata transparency applied. Text-file
 * Uint8Array uploads need a filename hint or {bytes, filename}; plain strings
 * and {text, filename} accept color-file text directly.
 * @param {any} source
 * @param {string | null} [filename]
 * @returns {any}
 */
export function readColorTable(source, filename) {
    var ptr0 = isLikeNone(filename) ? 0 : passStringToWasm0(filename, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    var len0 = WASM_VECTOR_LEN;
    const ret = wasm.readColorTable(source, ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Point clouds are in the full module, `terrio-js`.
 * @param {Uint8Array} _bytes
 * @param {string} _filename
 * @param {any} _options
 * @returns {any}
 */
export function readPoints(_bytes, _filename, _options) {
    const ptr0 = passArray8ToWasm0(_bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(_filename, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.readPoints(ptr0, len0, ptr1, len1, _options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Maps values or ranges to new values (`gdal raster reclassify`). `mapping` is GDAL's mapping
 * (`"[0,10)=1;[10,inf)=2;NO_DATA=NO_DATA;DEFAULT=PASS_THROUGH"`). Options: `ot`, the output data
 * type; `mappingFile`, the text of a mapping file (one entry per line, `#` comments) used
 * instead of `mapping`.
 * @param {any} src
 * @param {string} mapping
 * @param {any} options
 * @returns {Dataset}
 */
export function reclassify(src, mapping, options) {
    const ptr0 = passStringToWasm0(mapping, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.reclassify(src, ptr0, len0, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Refreshes internal GeoTIFF overviews. Options: levels, resampling, bbox, ignoreCogLayoutBreak.
 * @param {Uint8Array} bytes
 * @param {any} options
 * @returns {Uint8Array}
 */
export function refreshOverviews(bytes, options) {
    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.refreshOverviews(ptr0, len0, options);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * Makes a datum shift or geoid grid (NTv2 `.gsb`, GTX, or a PROJ GeoTIFF grid from
 * https://cdn.proj.org such as `us_noaa_conus.tif`) available under its name, from its bytes,
 * for the transformations that use it.
 * @param {string} name
 * @param {Uint8Array} bytes
 */
export function registerGrid(name, bytes) {
    const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    wasm.registerGrid(ptr0, len0, ptr1, len1);
}

/**
 * Renames layers on a copy of vector data. Options match the CLI naming rules:
 * inputLayer, outputLayer, ascii, lowerCase, filenameCompatible, reservedCharacters,
 * replacementCharacter and maxLength. Serialize the returned Dataset to persist it.
 * @param {any} src
 * @param {any} options
 * @returns {Dataset}
 */
export function renameLayer(src, options) {
    const ret = wasm.renameLayer(src, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Generate retile image files and optional index/CSV companions incrementally.
 * onFile(relativePath, Uint8Array) is synchronous; exceptions stop generation.
 * Optional readFile(relativePath) returns earlier bytes (or null), avoiding parent
 * regeneration after the bounded cache evicts a tile.
 * @param {any} inputs
 * @param {any} options
 * @param {Function} on_file
 * @param {Function | null} [read_file]
 * @returns {any}
 */
export function retile(inputs, options, on_file, read_file) {
    const ret = wasm.retile(inputs, options, on_file, isLikeNone(read_file) ? 0 : addToExternrefTable0(read_file));
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Converts RGB Byte sources to indexed color. Options: colorCount (2..256),
 * bitDepth (5 or 8), dither (true), colorMap (palette Dataset/file/text/RGBA entries),
 * outputNodata (Byte index), mask (flat Uint8Array/array, zero invalid).
 * Color-file byte uploads need {bytes, filename}; plain strings accept text.
 * The full raster is materialized. Shared RGB nodata takes precedence over
 * dataset/alpha/caller masks. Supplied palettes need outputNodata to mark invalid pixels.
 * @param {any} src
 * @param {any} options
 * @returns {Dataset}
 */
export function rgbToPalette(src, options) {
    const ret = wasm.rgbToPalette(src, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Encode A.TOC from [{filename: relative path, bytes: Uint8Array}], without pixel decoding.
 * Preserve those frame files beside the returned TOC. Options: scale, producerId,
 * producerName, countryCode, classification. Metadata is validated before returning bytes.
 * @param {any} frames
 * @param {any} options
 * @returns {Uint8Array}
 */
export function rpftocCreate(frames, options) {
    const ret = wasm.rpftocCreate(frames, options);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v1;
}

/**
 * Adds vertices so that no segment is longer than `maxLength` (CRS units), as `gdal vector
 * segmentize`.
 * @param {any} src
 * @param {number} max_length
 * @returns {Dataset}
 */
export function segmentize(src, max_length) {
    const ret = wasm.segmentize(src, max_length);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Changes the type of vector fields with GDAL's value conversions, as `terrio set-field-type`
 * (GDAL's `gdal vector set-field-type`). `fieldType`: a type (`Integer`, `Integer64`, `Real`,
 * `String`, `Date`, `Time`, `DateTime`, `Binary`) or subtype (`Boolean`, `Int16`,
 * `Float32`, `JSON`, `UUID`). Options: `fieldName` or `srcFieldType`, `activeLayer`.
 * @param {any} src
 * @param {string} field_type
 * @param {any} options
 * @returns {Dataset}
 */
export function setFieldType(src, field_type, options) {
    const ptr0 = passStringToWasm0(field_type, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.setFieldType(src, ptr0, len0, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Changes geometry types and dimensions, as `gdal vector set-geom-type`. Options:
 * `geometryType` (`"MULTIPOLYGON"`, `"POINTZ"`...), `multi`, `single`, `linear`, `dim`
 * (`"XY"`, `"XYZ"`, `"XYM"`, `"XYZM"`), `layerOnly`, `featureOnly`, `skip`.
 * @param {any} src
 * @param {any} options
 * @returns {Dataset}
 */
export function setGeomType(src, options) {
    const ret = wasm.setGeomType(src, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Merges raster areas smaller than a threshold into their largest neighbour, as
 * `terrio sieve` (GDAL's `gdal_sieve.py`).
 *
 * Options: `band`, `threshold` (2), `connectedness` (4 or 8), `mask` (`"default"`: the band's
 * nodata pixels are left out; `"none"`; or a raster whose band 1 is 0 where pixels are left
 * out).
 * @param {any} src
 * @param {any} options
 * @returns {Dataset}
 */
export function sieve(src, options) {
    const ret = wasm.sieve(src, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Topology-preserving simplification of every geometry (GEOS's TopologyPreservingSimplifier,
 * as `gdal vector simplify`), with a tolerance in CRS units. Z is kept, M dropped.
 * @param {any} src
 * @param {number} tolerance
 * @returns {Dataset}
 */
export function simplify(src, tolerance) {
    const ret = wasm.simplify(src, tolerance);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Simplify shared polygon coverage edges while preserving topology. `tolerance`
 * is the square root of the triangle-area threshold, in input CRS units.
 * Options: `preserveBoundary`, `layer` (select one), `activeLayer` (copy other layers unchanged).
 * `layer` and `activeLayer` are mutually exclusive.
 * Inputs must form a valid polygon coverage. Attributes and CRS are retained;
 * output feature IDs are sequential from 1 in each layer.
 * @param {any} src
 * @param {number} tolerance
 * @param {any} options
 * @returns {Dataset}
 */
export function simplifyCoverage(src, tolerance, options) {
    const ret = wasm.simplifyCoverage(src, tolerance, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Recursively split multipart geometries/collections in every layer; IDs restart at one.
 * @param {any} src
 * @returns {Dataset}
 */
export function singlepart(src) {
    const ret = wasm.singlepart(src);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Sorts features spatially, as `gdal vector sort`. Options: `method` (`"hilbert"`, the
 * default, or `"strtree"`). Null and empty geometries go last.
 * @param {any} src
 * @param {any} options
 * @returns {Dataset}
 */
export function sort(src, options) {
    const ret = wasm.sort(src, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Creates a Seek-Optimized ZIP archive in `/vsimem/` from `/vsimem/` files (or adds to it),
 * as `gdal vsi sozip create` does. Options: `enable` (`auto`, `yes`, `no`), `chunkSize`,
 * `minFileSize`, `overwrite`, `recursive`, `junkPaths`, `contentType`.
 * @param {string[]} inputs
 * @param {string} output
 * @param {any} options
 * @returns {any}
 */
export function sozipCreate(inputs, output, options) {
    const ptr0 = passArrayJsValueToWasm0(inputs, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(output, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.sozipCreate(ptr0, len0, ptr1, len1, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Lists a `/vsimem/` zip archive's members with their SOZip status.
 * @param {string} input
 * @returns {any}
 */
export function sozipList(input) {
    const ptr0 = passStringToWasm0(input, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.sozipList(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Rewrites a `/vsimem/` zip archive as a SOZip archive. Options: `enable`, `chunkSize`, `minFileSize` and `overwrite`. Creation-only options are rejected.
 * @param {string} input
 * @param {string} output
 * @param {any} options
 * @returns {any}
 */
export function sozipOptimize(input, output, options) {
    const ptr0 = passStringToWasm0(input, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(output, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.sozipOptimize(ptr0, len0, ptr1, len1, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Validates a `/vsimem/` zip archive and its SOZip indexes: `{valid, sozip_files, messages,
 * errors}`.
 * @param {string} input
 * @returns {any}
 */
export function sozipValidate(input) {
    const ptr0 = passStringToWasm0(input, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.sozipValidate(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Runs the documented read-only OGR SQL subset on vector inputs, returning a Dataset.
 * SELECT expressions and LEFT JOIN retain primary geometry; DISTINCT and summaries discard it.
 * @param {any} src
 * @param {string} query
 * @returns {Dataset}
 */
export function sql(src, query) {
    const ptr0 = passStringToWasm0(query, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.sql(src, ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Reports Rust panics on the JavaScript console, with their message.
 */
export function start() {
    wasm.start();
}

/**
 * Swaps the X and Y coordinates of every geometry, as `gdal vector swap-xy`.
 * @param {any} src
 * @returns {Dataset}
 */
export function swapXy(src) {
    const ret = wasm.swapXy(src);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Take coordinate-operation and driver warnings recorded since the previous call.
 * @returns {Array<any>}
 */
export function takeWarnings() {
    const ret = wasm.takeWarnings();
    return ret;
}

/**
 * Transforms coordinates between two CRSs (`EPSG:4326`, `EPSG:4326+5773`, WKT or PROJ
 * strings), x (longitude) first. Returns `[xs, ys]` as two `Float64Array`s, or `[xs, ys, zs]`
 * when `zs` are given. For geocentric CRSs these are Cartesian Z ordinates; use
 * all three arrays to retain XYZ (the 2D call uses input Z=0 and drops output Z).
 * Options: `sCoordEpoch` and `tCoordEpoch`, the coordinate epochs of time-dependent
 * transformations. Datum shift grids are used once registered with `registerGrid`.
 * @param {Float64Array} xs
 * @param {Float64Array} ys
 * @param {string} src_crs
 * @param {string} dst_crs
 * @param {Float64Array | null | undefined} zs
 * @param {any} options
 * @returns {Array<any>}
 */
export function transformPoints(xs, ys, src_crs, dst_crs, zs, options) {
    const ptr0 = passArrayF64ToWasm0(xs, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(ys, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passStringToWasm0(src_crs, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passStringToWasm0(dst_crs, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len3 = WASM_VECTOR_LEN;
    var ptr4 = isLikeNone(zs) ? 0 : passArrayF64ToWasm0(zs, wasm.__wbindgen_malloc);
    var len4 = WASM_VECTOR_LEN;
    const ret = wasm.transformPoints(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, ptr4, len4, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Subsets, resizes, rescales or converts a raster, as `terrio translate` (GDAL's
 * `gdal_translate`).
 *
 * Options: `bands` (numbered from 1), `ot`, `srcwin` (`[colOff, rowOff, width, height]`),
 * `projwin` (`[ulx, uly, lrx, lry]`), `projwinSrs`, `outsize` (`[width, height]`, pixels or
 * percentages such as `"50%"`; 0 keeps the aspect ratio), `tr`, `resampling`, `scale` (`true`,
 * `[srcMin, srcMax]` or `[srcMin, srcMax, dstMin, dstMax]`), `exponent`, `aNodata` (a number or
 * `"none"`), `aSrs`, `aUllr`.
 * @param {any} src
 * @param {any} options
 * @returns {Dataset}
 */
export function translate(src, options) {
    const ret = wasm.translate(src, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Applies band scales and offsets (`gdal raster unscale`). Options: `ot`, the output data type
 * (Float32, or Float64 for Float64 sources, by default). Nodata pixels keep the nodata value.
 * @param {any} src
 * @param {any} options
 * @returns {Dataset}
 */
export function unscale(src, options) {
    const ret = wasm.unscale(src, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Warps valid source samples into destination GeoTIFF bytes and returns the updated file.
 * Options: resampling, geometry, geometryCrs, noUpdateOverviews, errorThreshold, ignoreCogLayoutBreak.
 * @param {any} src
 * @param {Uint8Array} dst
 * @param {any} options
 * @returns {Uint8Array}
 */
export function updateRaster(src, dst, options) {
    const ptr0 = passArray8ToWasm0(dst, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.updateRaster(src, ptr0, len0, options);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * Updates a copy of dst from src, by FID or key fields. Options: inputLayer,
 * outputLayer, key (array), mode (merge, update-only, append-only).
 * @param {any} src
 * @param {any} dst
 * @param {any} options
 * @returns {Dataset}
 */
export function updateVector(src, dst, options) {
    const ret = wasm.updateVector(src, dst, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Validates uploaded TIFF structure without decoding pixels. Options: profile
 * (`rio-cogeo` or `gdal`), strict, fullCheck (default automatic; true for bytes).
 * GDAL full checks inspect all compressed block leaders/trailers and ordering.
 * @param {Uint8Array} bytes
 * @param {any} options
 * @returns {any}
 */
export function validateCog(bytes, options) {
    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.validateCog(ptr0, len0, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Validate uploaded GeoPackage bytes. Options: fullCheck, strict, unicodeCase.
 * @param {Uint8Array} bytes
 * @param {any} options
 * @returns {any}
 */
export function validateGpkg(bytes, options) {
    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.validateGpkg(ptr0, len0, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Validate an uploaded /vsimem/ GeoPackage path using the same options/report.
 * @param {string} path
 * @param {any} options
 * @returns {any}
 */
export function validateGpkgPath(path, options) {
    const ptr0 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.validateGpkgPath(ptr0, len0, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

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
 * @param {any} src
 * @param {any} options
 * @returns {Dataset}
 */
export function vectorGrid(src, options) {
    const ret = wasm.vectorGrid(src, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Create vector layer envelope polygons from {storedLocation: Dataset/file/GeoJSON}
 * mappings. Common options match rasterIndex; sourceLayerNames/sourceLayerIndexes select
 * original layers. acceptDifferentCrs, acceptDifferentSchemas and datasetNameOnly are optional.
 * @param {any} sources
 * @param {any} options
 * @returns {DatasetIndex}
 */
export function vectorIndex(sources, options) {
    const ret = wasm.vectorIndex(sources, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return DatasetIndex.__wrap(ret[0]);
}

/**
 * The version of terrio.
 * @returns {string}
 */
export function version() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.version();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Single-observer visibility or minimum visible height on a projected DEM.
 * `ox`, `oy` are coordinates in the DEM CRS. Options: `band`, `oz` (observer height),
 * `tz` (target height), `md` (maximum distance, 0 unlimited), `cc` (curvature coefficient,
 * 1 minus refraction), `om` (NORMAL/DEM/GROUND), `ov` (out-of-range value).
 * Numeric nodata is treated as elevation, as in GDAL; nonfinite elevations are rejected.
 * @param {any} src
 * @param {number} ox
 * @param {number} oy
 * @param {any} options
 * @returns {Dataset}
 */
export function viewshed(src, ox, oy, options) {
    const ret = wasm.viewshed(src, ox, oy, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Copies a file, or a directory with `recursive`, within `/vsimem/` (archive members out of
 * archives). Options: `recursive`, `skipErrors`. Returns the report.
 * @param {string} src
 * @param {string} dst
 * @param {any} options
 * @returns {any}
 */
export function vsiCopy(src, dst, options) {
    const ptr0 = passStringToWasm0(src, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(dst, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.vsiCopy(ptr0, len0, ptr1, len1, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Deletes a `/vsimem/` file, or a directory with `recursive` (the root of `/vsimem/` is
 * refused). Options: `{ recursive }`; the original boolean argument is also accepted.
 * Returns the report.
 * @param {string} path
 * @param {any} options
 * @returns {any}
 */
export function vsiDelete(path, options) {
    const ptr0 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.vsiDelete(ptr0, len0, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Lists a `/vsimem/` directory, or a zip archive in memory (`/vsizip//vsimem/a.zip`), as
 * `gdal vsi list` does. Options: `recursive`, `depth`, `absolute`, `long` (fetch missing entry metadata).
 * @param {string} path
 * @param {any} options
 * @returns {any}
 */
export function vsiList(path, options) {
    const ptr0 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.vsiList(ptr0, len0, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Moves (renames) a `/vsimem/` file or directory. Returns the report.
 * @param {string} src
 * @param {string} dst
 * @returns {any}
 */
export function vsiMove(src, dst) {
    const ptr0 = passStringToWasm0(src, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(dst, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.vsiMove(ptr0, len0, ptr1, len1);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Reads a whole `/vsimem/` file or a member of an archive in memory.
 * @param {string} path
 * @returns {Uint8Array}
 */
export function vsiRead(path) {
    const ptr0 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.vsiRead(ptr0, len0);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v2 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v2;
}

/**
 * Describes a location, or returns `null` when nothing is there.
 * @param {string} path
 * @returns {any}
 */
export function vsiStat(path) {
    const ptr0 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.vsiStat(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Copies the files missing or out of date in the target, within `/vsimem/`. Options:
 * `recursive`, `strategy` (`timestamp`, `ETag` or `overwrite`). Returns the report.
 * @param {string} src
 * @param {string} dst
 * @param {any} options
 * @returns {any}
 */
export function vsiSync(src, dst, options) {
    const ptr0 = passStringToWasm0(src, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passStringToWasm0(dst, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.vsiSync(ptr0, len0, ptr1, len1, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Writes bytes to a `/vsimem/` file, replacing it.
 * @param {string} path
 * @param {Uint8Array} bytes
 */
export function vsiWrite(path, bytes) {
    const ptr0 = passStringToWasm0(path, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.vsiWrite(ptr0, len0, ptr1, len1);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

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
 * @param {any} src
 * @param {any} options
 * @returns {Dataset}
 */
export function warp(src, options) {
    const ret = wasm.warp(src, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}

/**
 * Raster pixels as XYZ text, as `terrio xyz` (GDAL's `gdal2xyz.py`). Options: `bands` (band 1
 * by default), `allBands`, `skip` (`[n]` or `[columns, rows]`), `srcwin` (`[x, y, width,
 * height]`), `skipNodata`, `srcNodata` and `dstNodata` (one value or one per band) and
 * `delimiter`.
 * @param {any} src
 * @param {any} options
 * @returns {string}
 */
export function xyz(src, options) {
    let deferred2_0;
    let deferred2_1;
    try {
        const ret = wasm.xyz(src, options);
        var ptr1 = ret[0];
        var len1 = ret[1];
        if (ret[3]) {
            ptr1 = 0; len1 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_free(deferred2_0, deferred2_1, 1);
    }
}

/**
 * Statistics for each polygon and raster band. Source pixels are materialized.
 * Options: bands, prefixes, stats, allTouched, tSrs, decimalPlaces.
 * Default prefixes raster1, raster2, etc. produce PREFIX_bN_STATISTIC fields.
 * @param {any} zones
 * @param {any} rasters
 * @param {any} options
 * @returns {Dataset}
 */
export function zonalStats(zones, rasters, options) {
    const ret = wasm.zonalStats(zones, rasters, options);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Dataset.__wrap(ret[0]);
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_Error_30c8987f7c2ed4e2: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg___wbindgen_boolean_get_5b446f51afd21013: function(arg0) {
            const v = arg0;
            const ret = typeof(v) === 'boolean' ? v : undefined;
            return isLikeNone(ret) ? 0xFFFFFF : ret ? 1 : 0;
        },
        __wbg___wbindgen_debug_string_4687d8d8c2017d52: function(arg0, arg1) {
            const ret = debugString(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_is_function_1f9d30630b8b1d3d: function(arg0) {
            const ret = typeof(arg0) === 'function';
            return ret;
        },
        __wbg___wbindgen_is_null_e343b7d08827ba72: function(arg0) {
            const ret = arg0 === null;
            return ret;
        },
        __wbg___wbindgen_is_object_3c45d4f2dde4e749: function(arg0) {
            const val = arg0;
            const ret = typeof(val) === 'object' && val !== null;
            return ret;
        },
        __wbg___wbindgen_is_string_90b56bc79aad6f6c: function(arg0) {
            const ret = typeof(arg0) === 'string';
            return ret;
        },
        __wbg___wbindgen_is_undefined_8865fb403f8fe9d8: function(arg0) {
            const ret = arg0 === undefined;
            return ret;
        },
        __wbg___wbindgen_memory_caa4a6165639c8b5: function() {
            const ret = wasm.memory;
            return ret;
        },
        __wbg___wbindgen_number_get_2e0e7dee9f701a71: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'number' ? obj : undefined;
            getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
        },
        __wbg___wbindgen_string_get_0380ccaa2f57f0d9: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'string' ? obj : undefined;
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_throw_41e9ee4f547fc59a: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg__wbg_cb_unref_dcc1a90847f04c41: function(arg0) {
            arg0._wbg_cb_unref();
        },
        __wbg_allSettled_f26c6af8232ba69f: function(arg0) {
            const ret = Promise.allSettled(arg0);
            return ret;
        },
        __wbg_apply_a910804df6e1e433: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.apply(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_assign_e39d243f5fbe1e2d: function(arg0, arg1) {
            const ret = Object.assign(arg0, arg1);
            return ret;
        },
        __wbg_call_1875a20c43a36133: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            const ret = arg0.call(arg1, arg2, arg3);
            return ret;
        }, arguments); },
        __wbg_call_187d372bd5fdd4aa: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.call(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_call_6137034ef55c9d0f: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.call(arg1);
            return ret;
        }, arguments); },
        __wbg_dataset_new: function(arg0) {
            const ret = Dataset.__wrap(arg0);
            return ret;
        },
        __wbg_defineProperty_363eb34158116b0f: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = Reflect.defineProperty(arg0, arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_deleteProperty_698947935b859cd2: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.deleteProperty(arg0, arg1);
            return ret;
        }, arguments); },
        __wbg_entries_3602f27ad32994b8: function(arg0) {
            const ret = arg0.entries();
            return ret;
        },
        __wbg_entries_fb6397112b1de25f: function(arg0) {
            const ret = Object.entries(arg0);
            return ret;
        },
        __wbg_error_757e9472f8410341: function(arg0, arg1) {
            let deferred0_0;
            let deferred0_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                console.error(getStringFromWasm0(arg0, arg1));
            } finally {
                wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
            }
        },
        __wbg_fromEntries_5159142be68954c3: function() { return handleError(function (arg0) {
            const ret = Object.fromEntries(arg0);
            return ret;
        }, arguments); },
        __wbg_from_296ca31f8d0f1c52: function(arg0) {
            const ret = Array.from(arg0);
            return ret;
        },
        __wbg_getOwnPropertyDescriptor_544b699e978e9c92: function(arg0, arg1) {
            const ret = Object.getOwnPropertyDescriptor(arg0, arg1);
            return ret;
        },
        __wbg_getPrototypeOf_228a4abae6ef0509: function(arg0) {
            const ret = Object.getPrototypeOf(arg0);
            return ret;
        },
        __wbg_get_31af05bd4842a84f: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.get(arg0, arg1);
            return ret;
        }, arguments); },
        __wbg_get_6c896e0571ddae51: function(arg0, arg1) {
            const ret = arg0[arg1 >>> 0];
            return ret;
        },
        __wbg_get_unchecked_288889d017702237: function(arg0, arg1) {
            const ret = arg0[arg1 >>> 0];
            return ret;
        },
        __wbg_has_5d6706e5209576c1: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.has(arg0, arg1);
            return ret;
        }, arguments); },
        __wbg_instanceof_BigInt64Array_1a1234d945c1625f: function(arg0) {
            let result;
            try {
                result = arg0 instanceof BigInt64Array;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_BigUint64Array_0362060ffc2f1e06: function(arg0) {
            let result;
            try {
                result = arg0 instanceof BigUint64Array;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Error_80a725f81f2e102d: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Error;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Float32Array_595afb0f28b828c9: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Float32Array;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Float64Array_8a59377f9eec1b8b: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Float64Array;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Int16Array_dc79388a406d1748: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Int16Array;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Int32Array_4b9a86620726269b: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Int32Array;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Int8Array_dead59f83656e45a: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Int8Array;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Map_b2611749102d7ba3: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Map;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Object_67a83cdc00c5d141: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Object;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Promise_e1dc6893aa1ece28: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Promise;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Uint16Array_eff85aa31096af44: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Uint16Array;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Uint32Array_53a4facaf04b8a8b: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Uint32Array;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Uint8Array_828cef2aaacafc31: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Uint8Array;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Uint8ClampedArray_ae70cf3ae1cd285f: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Uint8ClampedArray;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_isArray_e15a2ff68ffdbef2: function(arg0) {
            const ret = Array.isArray(arg0);
            return ret;
        },
        __wbg_isView_87b70d94ddaa60d3: function(arg0) {
            const ret = ArrayBuffer.isView(arg0);
            return ret;
        },
        __wbg_iterator_e3c31c892080e444: function() {
            const ret = Symbol.iterator;
            return ret;
        },
        __wbg_keys_440be172f17c0265: function(arg0) {
            const ret = Object.keys(arg0);
            return ret;
        },
        __wbg_length_0acba72356589f9c: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_length_1e9d4dcab09bd28f: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_length_3035e53132b7a991: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_length_511b1f84719d3462: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_length_58572db4c38f3c3e: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_length_7f3c00c40364105e: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_length_961efae5d4679ef5: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_length_b5d0ffc9b832763b: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_length_b5f0008bbf60cf59: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_length_beff923aab722a55: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_length_d4bdea10311bd9cf: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_length_e5fdd54468b9e6ed: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_message_5f8387f0c32b90a7: function(arg0) {
            const ret = arg0.message;
            return ret;
        },
        __wbg_new_1dbf7428bba60a42: function(arg0) {
            const ret = new Uint8Array(arg0);
            return ret;
        },
        __wbg_new_227d7c05414eb861: function() {
            const ret = new Error();
            return ret;
        },
        __wbg_new_5502aad30c185fc8: function(arg0, arg1) {
            try {
                var state0 = {a: arg0, b: arg1};
                var cb0 = (arg0, arg1) => {
                    const a = state0.a;
                    state0.a = 0;
                    try {
                        return wasm_bindgen_2965c4ec8bfbc987___convert__closures_____invoke___js_sys_12ec3bdfc075b477___Function_fn_wasm_bindgen_2965c4ec8bfbc987___JsValue_____wasm_bindgen_2965c4ec8bfbc987___sys__Undefined___js_sys_12ec3bdfc075b477___Function_fn_wasm_bindgen_2965c4ec8bfbc987___JsValue_____wasm_bindgen_2965c4ec8bfbc987___sys__Undefined_______true_(a, state0.b, arg0, arg1);
                    } finally {
                        state0.a = a;
                    }
                };
                const ret = new Promise(cb0);
                return ret;
            } finally {
                state0.a = 0;
            }
        },
        __wbg_new_617a8cdb8bb1130e: function() {
            const ret = new Object();
            return ret;
        },
        __wbg_new_ee2291f50781bf1d: function() {
            const ret = new Array();
            return ret;
        },
        __wbg_new_from_slice_23f60f47cde8d664: function(arg0, arg1) {
            const ret = new Uint16Array(getArrayU16FromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_from_slice_2443ca2017fac0fd: function(arg0, arg1) {
            const ret = new Int16Array(getArrayI16FromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_from_slice_36f6b4e63daa7f59: function(arg0, arg1) {
            const ret = new Int8Array(getArrayI8FromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_from_slice_37a3c3a194266cb8: function(arg0, arg1) {
            const ret = new Uint32Array(getArrayU32FromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_from_slice_911f717853b222c7: function(arg0, arg1) {
            const ret = new Int32Array(getArrayI32FromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_from_slice_9a868026ffa4208a: function(arg0, arg1) {
            const ret = new Uint8Array(getArrayU8FromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_from_slice_aa8f37bd5e72dcc7: function(arg0, arg1) {
            const ret = new BigInt64Array(getArrayI64FromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_from_slice_ca6ad97db1f4779a: function(arg0, arg1) {
            const ret = new Float32Array(getArrayF32FromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_from_slice_f545fd22ddc142b8: function(arg0, arg1) {
            const ret = new Float64Array(getArrayF64FromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_from_slice_f6cd96ab370a57b3: function(arg0, arg1) {
            const ret = new BigUint64Array(getArrayU64FromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_typed_b01cb72a8af741a3: function(arg0, arg1) {
            try {
                var state0 = {a: arg0, b: arg1};
                var cb0 = (arg0, arg1) => {
                    const a = state0.a;
                    state0.a = 0;
                    try {
                        return wasm_bindgen_2965c4ec8bfbc987___convert__closures_____invoke___js_sys_12ec3bdfc075b477___Function_fn_wasm_bindgen_2965c4ec8bfbc987___JsValue_____wasm_bindgen_2965c4ec8bfbc987___sys__Undefined___js_sys_12ec3bdfc075b477___Function_fn_wasm_bindgen_2965c4ec8bfbc987___JsValue_____wasm_bindgen_2965c4ec8bfbc987___sys__Undefined_______true_(a, state0.b, arg0, arg1);
                    } finally {
                        state0.a = a;
                    }
                };
                const ret = new Promise(cb0);
                return ret;
            } finally {
                state0.a = 0;
            }
        },
        __wbg_new_with_length_3da0ad195f6f63ba: function(arg0) {
            const ret = new Uint8Array(arg0 >>> 0);
            return ret;
        },
        __wbg_of_20798cb14708764f: function(arg0, arg1) {
            const ret = Array.of(arg0, arg1);
            return ret;
        },
        __wbg_of_dde0b9d3265685ee: function(arg0, arg1, arg2) {
            const ret = Array.of(arg0, arg1, arg2);
            return ret;
        },
        __wbg_parse_0fc53dead14b3b42: function() { return handleError(function (arg0, arg1) {
            const ret = JSON.parse(getStringFromWasm0(arg0, arg1));
            return ret;
        }, arguments); },
        __wbg_prototypesetcall_06eb15da165dee8f: function(arg0, arg1, arg2) {
            Uint32Array.prototype.set.call(getArrayU32FromWasm0(arg0, arg1), arg2);
        },
        __wbg_prototypesetcall_0e2bc23e51b9fbd2: function(arg0, arg1, arg2) {
            Uint8ClampedArray.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
        },
        __wbg_prototypesetcall_13adbfb002dee200: function(arg0, arg1, arg2) {
            Int32Array.prototype.set.call(getArrayI32FromWasm0(arg0, arg1), arg2);
        },
        __wbg_prototypesetcall_158adb600d119d3c: function(arg0, arg1, arg2) {
            BigUint64Array.prototype.set.call(getArrayU64FromWasm0(arg0, arg1), arg2);
        },
        __wbg_prototypesetcall_2ee09b855e324444: function(arg0, arg1, arg2) {
            Uint16Array.prototype.set.call(getArrayU16FromWasm0(arg0, arg1), arg2);
        },
        __wbg_prototypesetcall_546a6fcbab18189a: function(arg0, arg1, arg2) {
            Int8Array.prototype.set.call(getArrayI8FromWasm0(arg0, arg1), arg2);
        },
        __wbg_prototypesetcall_8b03c01e2c0f8066: function(arg0, arg1, arg2) {
            Float32Array.prototype.set.call(getArrayF32FromWasm0(arg0, arg1), arg2);
        },
        __wbg_prototypesetcall_b275ad9519a0a737: function(arg0, arg1, arg2) {
            BigInt64Array.prototype.set.call(getArrayI64FromWasm0(arg0, arg1), arg2);
        },
        __wbg_prototypesetcall_bc27214492979395: function(arg0, arg1, arg2) {
            Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
        },
        __wbg_prototypesetcall_d49a4fab5ca427bc: function(arg0, arg1, arg2) {
            Float64Array.prototype.set.call(getArrayF64FromWasm0(arg0, arg1), arg2);
        },
        __wbg_prototypesetcall_f8d32a400a944612: function(arg0, arg1, arg2) {
            Int16Array.prototype.set.call(getArrayI16FromWasm0(arg0, arg1), arg2);
        },
        __wbg_push_2baf45db356cf468: function(arg0, arg1) {
            const ret = arg0.push(arg1);
            return ret;
        },
        __wbg_queueMicrotask_9833f9a49df95a49: function(arg0) {
            const ret = arg0.queueMicrotask;
            return ret;
        },
        __wbg_queueMicrotask_a72f977e97f23c5f: function(arg0) {
            queueMicrotask(arg0);
        },
        __wbg_remotedataset_new: function(arg0) {
            const ret = RemoteDataset.__wrap(arg0);
            return ret;
        },
        __wbg_resolve_0076e10020304ede: function(arg0) {
            const ret = Promise.resolve(arg0);
            return ret;
        },
        __wbg_set_145a351398b48c65: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = Reflect.set(arg0, arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_stack_3b0d974bbf31e44f: function(arg0, arg1) {
            const ret = arg1.stack;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_static_accessor_GLOBAL_266715b9d96ba635: function() {
            const ret = typeof global === 'undefined' ? null : global;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_GLOBAL_THIS_10fb7dc1ae063179: function() {
            const ret = typeof globalThis === 'undefined' ? null : globalThis;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_SELF_0b583911f537483a: function() {
            const ret = typeof self === 'undefined' ? null : self;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_WINDOW_d7f903d1508cbdc4: function() {
            const ret = typeof window === 'undefined' ? null : window;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_stringify_52ff602c1cc4fbb6: function() { return handleError(function (arg0) {
            const ret = JSON.stringify(arg0);
            return ret;
        }, arguments); },
        __wbg_subarray_002b94d5e13d1411: function(arg0, arg1, arg2) {
            const ret = arg0.subarray(arg1 >>> 0, arg2 >>> 0);
            return ret;
        },
        __wbg_then_c949d5a25a4e78f8: function(arg0, arg1, arg2) {
            const ret = arg0.then(arg1, arg2);
            return ret;
        },
        __wbg_then_e71170d78fcf8954: function(arg0, arg1) {
            const ret = arg0.then(arg1);
            return ret;
        },
        __wbg_toStringTag_c2bddd7ea795065c: function() {
            const ret = Symbol.toStringTag;
            return ret;
        },
        __wbindgen_generic_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [Externref], shim_idx: 185, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen_2965c4ec8bfbc987___convert__closures_____invoke___wasm_bindgen_2965c4ec8bfbc987___JsValue__core_37ee0ce0c4cd57d5___result__Result_____wasm_bindgen_2965c4ec8bfbc987___JsError___true_);
            return ret;
        },
        __wbindgen_generic_0000000000000002: function(arg0) {
            // Cast intrinsic for `F64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_generic_0000000000000003: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./terrio_bg.js": import0,
    };
}

function wasm_bindgen_2965c4ec8bfbc987___convert__closures_____invoke___wasm_bindgen_2965c4ec8bfbc987___JsValue__core_37ee0ce0c4cd57d5___result__Result_____wasm_bindgen_2965c4ec8bfbc987___JsError___true_(arg0, arg1, arg2) {
    const ret = wasm.wasm_bindgen_2965c4ec8bfbc987___convert__closures_____invoke___wasm_bindgen_2965c4ec8bfbc987___JsValue__core_37ee0ce0c4cd57d5___result__Result_____wasm_bindgen_2965c4ec8bfbc987___JsError___true_(arg0, arg1, arg2);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

function wasm_bindgen_2965c4ec8bfbc987___convert__closures_____invoke___js_sys_12ec3bdfc075b477___Function_fn_wasm_bindgen_2965c4ec8bfbc987___JsValue_____wasm_bindgen_2965c4ec8bfbc987___sys__Undefined___js_sys_12ec3bdfc075b477___Function_fn_wasm_bindgen_2965c4ec8bfbc987___JsValue_____wasm_bindgen_2965c4ec8bfbc987___sys__Undefined_______true_(arg0, arg1, arg2, arg3) {
    wasm.wasm_bindgen_2965c4ec8bfbc987___convert__closures_____invoke___js_sys_12ec3bdfc075b477___Function_fn_wasm_bindgen_2965c4ec8bfbc987___JsValue_____wasm_bindgen_2965c4ec8bfbc987___sys__Undefined___js_sys_12ec3bdfc075b477___Function_fn_wasm_bindgen_2965c4ec8bfbc987___JsValue_____wasm_bindgen_2965c4ec8bfbc987___sys__Undefined_______true_(arg0, arg1, arg2, arg3);
}

const DatasetFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_dataset_free(ptr, 1));
const DatasetIndexFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_datasetindex_free(ptr, 1));
const MultidimArrayFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_multidimarray_free(ptr, 1));
const MultidimDatasetFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_multidimdataset_free(ptr, 1));
const NetcdfGroupsFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_netcdfgroups_free(ptr, 1));
const PipelineResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_pipelineresult_free(ptr, 1));
const RemoteDatasetFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_remotedataset_free(ptr, 1));

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

function _assertClass(instance, klass) {
    if (!(instance instanceof klass)) {
        throw new Error(`expected instance of ${klass.name}`);
    }
}

const CLOSURE_DTORS = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(state => wasm.__wbindgen_destroy_closure(state.a, state.b));

function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
        return  `${val}`;
    }
    if (type == 'string') {
        return `"${val}"`;
    }
    if (type == 'symbol') {
        const description = val.description;
        if (description == null) {
            return 'Symbol';
        } else {
            return `Symbol(${description})`;
        }
    }
    if (type == 'function') {
        const name = val.name;
        if (typeof name == 'string' && name.length > 0) {
            return `Function(${name})`;
        } else {
            return 'Function';
        }
    }
    // objects
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = '[';
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for(let i = 1; i < length; i++) {
            debug += ', ' + debugString(val[i]);
        }
        debug += ']';
        return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches && builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        // Failed to match the standard '[object ClassName]'
        return toString.call(val);
    }
    if (className == 'Object') {
        // we're a user defined class or Object
        // JSON.stringify avoids problems with cycles, and is generally much
        // easier than looping through ownProperties of `val`.
        try {
            return 'Object(' + JSON.stringify(val) + ')';
        } catch (_) {
            return 'Object';
        }
    }
    // errors
    if (val instanceof Error) {
        return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}

function getArrayF32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayF64FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat64ArrayMemory0().subarray(ptr / 8, ptr / 8 + len);
}

function getArrayI16FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getInt16ArrayMemory0().subarray(ptr / 2, ptr / 2 + len);
}

function getArrayI32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getInt32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayI64FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getBigInt64ArrayMemory0().subarray(ptr / 8, ptr / 8 + len);
}

function getArrayI8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getInt8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

function getArrayJsValueFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    const mem = getDataViewMemory0();
    const result = [];
    for (let i = ptr; i < ptr + 4 * len; i += 4) {
        result.push(wasm.__wbindgen_externrefs.get(mem.getUint32(i, true)));
    }
    wasm.__externref_drop_slice(ptr, len);
    return result;
}

function getArrayU16FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint16ArrayMemory0().subarray(ptr / 2, ptr / 2 + len);
}

function getArrayU32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayU64FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getBigUint64ArrayMemory0().subarray(ptr / 8, ptr / 8 + len);
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedBigInt64ArrayMemory0 = null;
function getBigInt64ArrayMemory0() {
    if (cachedBigInt64ArrayMemory0 === null || cachedBigInt64ArrayMemory0.byteLength === 0) {
        cachedBigInt64ArrayMemory0 = new BigInt64Array(wasm.memory.buffer);
    }
    return cachedBigInt64ArrayMemory0;
}

let cachedBigUint64ArrayMemory0 = null;
function getBigUint64ArrayMemory0() {
    if (cachedBigUint64ArrayMemory0 === null || cachedBigUint64ArrayMemory0.byteLength === 0) {
        cachedBigUint64ArrayMemory0 = new BigUint64Array(wasm.memory.buffer);
    }
    return cachedBigUint64ArrayMemory0;
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

let cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

let cachedFloat64ArrayMemory0 = null;
function getFloat64ArrayMemory0() {
    if (cachedFloat64ArrayMemory0 === null || cachedFloat64ArrayMemory0.byteLength === 0) {
        cachedFloat64ArrayMemory0 = new Float64Array(wasm.memory.buffer);
    }
    return cachedFloat64ArrayMemory0;
}

let cachedInt16ArrayMemory0 = null;
function getInt16ArrayMemory0() {
    if (cachedInt16ArrayMemory0 === null || cachedInt16ArrayMemory0.byteLength === 0) {
        cachedInt16ArrayMemory0 = new Int16Array(wasm.memory.buffer);
    }
    return cachedInt16ArrayMemory0;
}

let cachedInt32ArrayMemory0 = null;
function getInt32ArrayMemory0() {
    if (cachedInt32ArrayMemory0 === null || cachedInt32ArrayMemory0.byteLength === 0) {
        cachedInt32ArrayMemory0 = new Int32Array(wasm.memory.buffer);
    }
    return cachedInt32ArrayMemory0;
}

let cachedInt8ArrayMemory0 = null;
function getInt8ArrayMemory0() {
    if (cachedInt8ArrayMemory0 === null || cachedInt8ArrayMemory0.byteLength === 0) {
        cachedInt8ArrayMemory0 = new Int8Array(wasm.memory.buffer);
    }
    return cachedInt8ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint16ArrayMemory0 = null;
function getUint16ArrayMemory0() {
    if (cachedUint16ArrayMemory0 === null || cachedUint16ArrayMemory0.byteLength === 0) {
        cachedUint16ArrayMemory0 = new Uint16Array(wasm.memory.buffer);
    }
    return cachedUint16ArrayMemory0;
}

let cachedUint32ArrayMemory0 = null;
function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
        cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function makeMutClosure(arg0, arg1, f) {
    const state = { a: arg0, b: arg1, cnt: 1 };
    const real = (...args) => {

        // First up with a closure we increment the internal reference
        // count. This ensures that the Rust closure environment won't
        // be deallocated while we're invoking it.
        state.cnt++;
        const a = state.a;
        state.a = 0;
        try {
            return f(a, state.b, ...args);
        } finally {
            state.a = a;
            real._wbg_cb_unref();
        }
    };
    real._wbg_cb_unref = () => {
        if (--state.cnt === 0) {
            wasm.__wbindgen_destroy_closure(state.a, state.b);
            state.a = 0;
            CLOSURE_DTORS.unregister(state);
        }
    };
    CLOSURE_DTORS.register(real, state, state);
    return real;
}

function passArray32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getUint32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayF64ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 8, 8) >>> 0;
    getFloat64ArrayMemory0().set(arg, ptr / 8);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayJsValueToWasm0(array, malloc) {
    const ptr = malloc(array.length * 4, 4) >>> 0;
    for (let i = 0; i < array.length; i++) {
        const add = addToExternrefTable0(array[i]);
        getDataViewMemory0().setUint32(ptr + 4 * i, add, true);
    }
    WASM_VECTOR_LEN = array.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedBigInt64ArrayMemory0 = null;
    cachedBigUint64ArrayMemory0 = null;
    cachedDataViewMemory0 = null;
    cachedFloat32ArrayMemory0 = null;
    cachedFloat64ArrayMemory0 = null;
    cachedInt16ArrayMemory0 = null;
    cachedInt32ArrayMemory0 = null;
    cachedInt8ArrayMemory0 = null;
    cachedUint16ArrayMemory0 = null;
    cachedUint32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (!module.ok) {
            throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
        }

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('terrio_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
