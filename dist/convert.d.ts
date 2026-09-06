import type { ConvertOptions, ConvertResult, PixelOptions, PixelResult } from './types.js';
/** Convert the primary image of a HEIC file to JPEG. */
export declare function heicToJpeg(input: Uint8Array | ArrayBuffer, options?: ConvertOptions): Promise<ConvertResult>;
/** Convert every top-level image in a HEIC container to JPEG. */
export declare function heicToJpegAll(input: Uint8Array | ArrayBuffer, options?: ConvertOptions): Promise<ConvertResult[]>;
/** extract the ICC colour profile from a HEIC file without decoding pixels. */
export declare function extractIccProfile(input: Uint8Array | ArrayBuffer): Promise<Uint8Array | null>;
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
export declare function heicToPixels(input: Uint8Array | ArrayBuffer, options?: PixelOptions): Promise<PixelResult>;
