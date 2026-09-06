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
 * Always 8-bit for now: this libheif-js@1.19 build's 16-bit path
 * (`interleaved_RRGGBB_LE`) is unreliable — it returns all-zero pixels for
 * grid-tiled HEICs, which is exactly how iOS stores 10/12-bit photos. We
 * request 8-bit and let libheif downconvert (which is correct). The `bits`
 * field and `PixelOptions.preferHighBitDepth` keep the API forward-compatible
 * for when the binding is fixed. (See bitDepthFromHeic for reading the source
 * depth from the container.)
 */
export declare function heicToPixels(input: Uint8Array | ArrayBuffer, _options?: PixelOptions): Promise<PixelResult>;
