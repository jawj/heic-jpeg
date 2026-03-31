import { getHeif, getMozjpeg } from './wasm.js';
import { extractIccFromHeic, injectIccIntoJpeg } from './icc.js';
const JCS_RGB = 2;
// ---------------------------------------------------------------------------
// MozJPEGWriter — encapsulates the stale-view footgun
// ---------------------------------------------------------------------------
/**
 * Thin wrapper around a mozjpeg compression session that re-acquires typed-
 * array views into WASM memory on every write.  This is necessary because
 * `write_scanlines()` can trigger WASM memory growth, which detaches the
 * ArrayBuffer backing any previously-created view.
 */
class MozJPEGWriter {
    constructor(moz, width, height) {
        this.moz = moz;
        this.chunks = [];
        moz.onImgChunk = (startPtr, length) => {
            this.chunks.push(moz.getMemoryUint8View(startPtr, length).slice().buffer);
        };
        this.rowBufPtr = moz.init_compress(width, height, JCS_RGB, 3);
        this.rowBytes = width * 3;
    }
    /** Copy one scanline from `src` at `srcOffset` into WASM and compress it. */
    writeScanline(src, srcOffset) {
        const rowBuf = this.moz.getMemoryUint8View(this.rowBufPtr, this.rowBytes);
        rowBuf.set(src.subarray(srcOffset, srcOffset + this.rowBytes));
        this.moz.write_scanlines();
    }
}
/** Convert the primary image of a HEIC file to JPEG. */
export async function heicToJpeg(input, options = {}) {
    const inputData = asUint8Array(input);
    const [heif, moz] = await Promise.all([getHeif(), getMozjpeg()]);
    const ctx = heif.heif_context_alloc();
    try {
        readContext(heif, ctx, inputData);
        const handle = unwrapOrThrow(heif.heif_js_context_get_primary_image_handle(ctx));
        try {
            return encodeHandle(heif, moz, handle, inputData, options);
        }
        finally {
            heif.heif_image_handle_release(handle);
        }
    }
    finally {
        heif.heif_context_free(ctx);
    }
}
/** Convert every top-level image in a HEIC container to JPEG. */
export async function heicToJpegAll(input, options = {}) {
    const inputData = asUint8Array(input);
    const [heif, moz] = await Promise.all([getHeif(), getMozjpeg()]);
    const ctx = heif.heif_context_alloc();
    try {
        readContext(heif, ctx, inputData);
        const ids = heif.heif_js_context_get_list_of_top_level_image_IDs(ctx);
        if (!Array.isArray(ids)) {
            throw new Error(`Failed to list images: ${ids.message}`);
        }
        const results = [];
        for (const id of ids) {
            const handle = unwrapOrThrow(heif.heif_js_context_get_image_handle(ctx, id));
            try {
                results.push(encodeHandle(heif, moz, handle, inputData, options));
            }
            finally {
                heif.heif_image_handle_release(handle);
            }
        }
        return results;
    }
    finally {
        heif.heif_context_free(ctx);
    }
}
/** Extract the ICC colour profile from a HEIC file without decoding pixels. */
export async function extractIccProfile(input) {
    return extractIccFromHeic(asUint8Array(input));
}
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
function asUint8Array(input) {
    return input instanceof Uint8Array ? input : new Uint8Array(input);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readContext(heif, ctx, data) {
    const err = heif.heif_context_read_from_memory(ctx, data);
    if (err.code.value !== 0) {
        throw new Error(`Failed to read HEIC data: ${err.message}`);
    }
}
/**
 * embind calls that return `handle | heif_error` put `code` and `message` on
 * the error objects.  A valid handle never has a `code` property.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrapOrThrow(result) {
    if (result && typeof result === 'object' && 'code' in result && 'message' in result) {
        throw new Error(`HEIF error: ${result.message}`);
    }
    return result;
}
/**
 * Decode one image handle and encode it as JPEG, streaming scanlines in
 * strips so the full uncompressed image never lives in JS heap memory.
 *
 * The decoded pixel data remains in libheif's WASM linear memory; we copy
 * only one scanline at a time into mozjpeg's WASM row buffer.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function encodeHandle(heif, moz, handle, rawInput, opts) {
    const { quality = 80, preserveIccProfile = true, progressive = true, trellis = true, } = opts;
    const width = heif.heif_image_handle_get_width(handle);
    const height = heif.heif_image_handle_get_height(handle);
    // Decode to interleaved RGB (3 bytes/pixel) — data stays in WASM heap
    const decoded = heif.heif_js_decode_image2(handle, heif.heif_colorspace.heif_colorspace_RGB, heif.heif_chroma.heif_chroma_interleaved_RGB);
    if (!decoded.channels) {
        throw new Error(`HEIF decode failed: ${decoded.message ?? 'unknown error'}`);
    }
    try {
        const channel = decoded.channels[0];
        const { data: pixelData, stride } = channel;
        // -- Initialise mozjpeg scanline encoder -----------------------------------
        const writer = new MozJPEGWriter(moz, width, height);
        moz.cinfo_set_quality(quality, -1);
        moz.cinfo_set_optimize_coding(true);
        if (!progressive)
            moz.cinfo_disable_progression();
        if (trellis)
            moz.cinfo_set_trellis(10, true, true, true);
        moz.start_compress();
        // -- Scanline transfer ----------------------------------------------------
        for (let y = 0; y < height; y++) {
            writer.writeScanline(pixelData, y * stride);
        }
        moz.finish_compress();
        // -- Concatenate JPEG output chunks ----------------------------------------
        let jpegData = concatChunks(writer.chunks);
        // -- ICC profile passthrough -----------------------------------------------
        const iccProfile = preserveIccProfile ? extractIccFromHeic(rawInput) : null;
        if (iccProfile) {
            jpegData = injectIccIntoJpeg(jpegData, iccProfile);
        }
        return {
            data: jpegData,
            width,
            height,
            iccProfileTransferred: iccProfile !== null,
        };
    }
    finally {
        heif.heif_image_release(decoded.image);
    }
}
function concatChunks(chunks) {
    const totalLen = chunks.reduce((s, c) => s + c.byteLength, 0);
    const out = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(new Uint8Array(chunk), offset);
        offset += chunk.byteLength;
    }
    return out;
}
