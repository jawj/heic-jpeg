import type { ConvertOptions, ConvertResult, PixelOptions, PixelResult } from './types.js';
/** Convert the primary image of a HEIC file to JPEG. */
export declare function heicToJpeg(input: Uint8Array | ArrayBuffer, options?: ConvertOptions): Promise<ConvertResult>;
/** Convert every top-level image in a HEIC container to JPEG. */
export declare function heicToJpegAll(input: Uint8Array | ArrayBuffer, options?: ConvertOptions): Promise<ConvertResult[]>;
/** extract the ICC colour profile from a HEIC file without decoding pixels. */
export declare function extractIccProfile(input: Uint8Array | ArrayBuffer): Promise<Uint8Array | null>;
/**
 * Decode the primary image of a HEIC file to packed 8-bit interleaved RGB
 * pixels, skipping the lossy JPEG round-trip. libheif applies the image's
 * rotation/mirror transforms, so pixels come out upright.
 *
 * Currently always 8-bit: this libheif-js build's per-handle bit-depth query
 * (`heif_image_handle_get_luma_bits_per_pixel`) is mis-bound (signature
 * mismatch), so we can't reliably detect 10/12-bit sources. The `bits` field
 * and `PixelOptions.preferHighBitDepth` exist so a 16-bit path can be enabled
 * later without an API change.
 */
export declare function heicToPixels(input: Uint8Array | ArrayBuffer, _options?: PixelOptions): Promise<PixelResult>;
