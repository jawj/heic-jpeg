import type { ConvertOptions, ConvertResult } from './types.js';
/** Convert the primary image of a HEIC file to JPEG. */
export declare function heicToJpeg(input: Uint8Array | ArrayBuffer, options?: ConvertOptions): Promise<ConvertResult>;
/** Convert every top-level image in a HEIC container to JPEG. */
export declare function heicToJpegAll(input: Uint8Array | ArrayBuffer, options?: ConvertOptions): Promise<ConvertResult[]>;
/** extract the ICC colour profile from a HEIC file without decoding pixels. */
export declare function extractIccProfile(input: Uint8Array | ArrayBuffer): Promise<Uint8Array | null>;
