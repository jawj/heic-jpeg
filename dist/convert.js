import { getHeif, getMozjpeg } from './wasm.js';
import { extractIccFromHeic, injectIccIntoJpeg, bitDepthFromHeic } from './icc.js';
const JCS_RGB = 2;
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
/** extract the ICC colour profile from a HEIC file without decoding pixels. */
export async function extractIccProfile(input) {
    return extractIccFromHeic(asUint8Array(input));
}
/**
 * Decode the primary image of a HEIC file to packed interleaved RGB pixels,
 * skipping the lossy JPEG round-trip. 10/12-bit sources are returned as 16-bit
 * (scaled to full 0–65535 range) unless `preferHighBitDepth` is false. libheif
 * applies the image's rotation/mirror transforms, so pixels come out upright.
 *
 * Source depth comes from the container (see bitDepthFromHeic) — libheif-js's
 * per-handle bit-depth query is mis-bound, and iOS stores high-bit-depth photos
 * as grid tiles whose primary item under-reports depth.
 */
export async function heicToPixels(input, options = {}) {
    const { preferHighBitDepth = true } = options;
    const inputData = asUint8Array(input);
    const depth = bitDepthFromHeic(inputData);
    const highBits = preferHighBitDepth && depth > 8;
    const heif = await getHeif();
    const ctx = heif.heif_context_alloc();
    try {
        readContext(heif, ctx, inputData);
        const handle = unwrapOrThrow(heif.heif_js_context_get_primary_image_handle(ctx));
        try {
            const width = heif.heif_image_handle_get_width(handle);
            const height = heif.heif_image_handle_get_height(handle);
            const decoded = heif.heif_js_decode_image2(handle, heif.heif_colorspace.heif_colorspace_RGB, highBits ? heif.heif_chroma.heif_chroma_interleaved_RRGGBB_LE : heif.heif_chroma.heif_chroma_interleaved_RGB);
            if (!decoded.channels)
                throw new Error(`HEIF decode failed: ${decoded.message ?? 'unknown error'}`);
            try {
                const { data: src, stride } = decoded.channels[0];
                const iccProfile = extractIccFromHeic(inputData);
                if (highBits) {
                    // RRGGBB_LE: 16-bit little-endian, samples right-aligned in `depth`
                    // bits; rescale to full 16-bit. Read straight out (single decode, so
                    // the WASM-heap view is still valid).
                    const out = new Uint16Array(width * height * 3);
                    const maxIn = (1 << depth) - 1;
                    for (let y = 0; y < height; y++) {
                        const sRow = y * stride, dRow = y * width * 3;
                        for (let x = 0; x < width * 3; x++) {
                            const lo = src[sRow + x * 2], hi = src[sRow + x * 2 + 1];
                            out[dRow + x] = Math.round(((lo | (hi << 8)) * 65535) / maxIn);
                        }
                    }
                    return { data: out, width, height, bits: 16, iccProfile };
                }
                // interleaved RGB: 3 bytes/pixel; copy row by row honouring stride.
                const rowBytes = width * 3;
                const out = new Uint8Array(rowBytes * height);
                for (let y = 0; y < height; y++) {
                    out.set(src.subarray(y * stride, y * stride + rowBytes), y * rowBytes);
                }
                return { data: out, width, height, bits: 8, iccProfile };
            }
            finally {
                heif.heif_image_release(decoded.image);
            }
        }
        finally {
            heif.heif_image_handle_release(handle);
        }
    }
    finally {
        heif.heif_context_free(ctx);
    }
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
    // decode to interleaved RGB (3 bytes/pixel) — data stays in WASM heap
    const decoded = heif.heif_js_decode_image2(handle, heif.heif_colorspace.heif_colorspace_RGB, heif.heif_chroma.heif_chroma_interleaved_RGB);
    if (!decoded.channels)
        throw new Error(`HEIF decode failed: ${decoded.message ?? 'unknown error'}`);
    try {
        const channel = decoded.channels[0];
        const { data: pixelData, stride } = channel;
        const writer = new MozJPEGWriter(moz, width, height);
        moz.cinfo_set_quality(quality, -1);
        moz.cinfo_set_optimize_coding(true);
        if (!progressive)
            moz.cinfo_disable_progression();
        if (trellis)
            moz.cinfo_set_trellis(10, true, true, true);
        moz.start_compress();
        for (let y = 0; y < height; y++)
            writer.writeScanline(pixelData, y * stride);
        moz.finish_compress();
        let jpegData = concatChunks(writer.chunks);
        const iccProfile = preserveIccProfile ? extractIccFromHeic(rawInput) : null;
        if (iccProfile)
            jpegData = injectIccIntoJpeg(jpegData, iccProfile);
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
