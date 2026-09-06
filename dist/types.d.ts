export interface ConvertOptions {
    /** MozJPEG quality, 1–100. Default: 80 */
    quality?: number;
    /** Preserve ICC color profile from HEIC. Default: true */
    preserveIccProfile?: boolean;
    /** Enable progressive JPEG. Default: true */
    progressive?: boolean;
    /** Enable mozjpeg trellis quantization. Default: true */
    trellis?: boolean;
}
export interface ConvertResult {
    /** JPEG file bytes */
    data: Uint8Array;
    /** Image width in pixels */
    width: number;
    /** Image height in pixels */
    height: number;
    /** Whether an ICC profile was transferred from the HEIC to the JPEG */
    iccProfileTransferred: boolean;
}
export interface PixelOptions {
    /**
     * Decode 10/12-bit HEIC to 16-bit pixels (scaled to full range) instead of
     * collapsing to 8-bit. Default: true.
     */
    preferHighBitDepth?: boolean;
}
export interface PixelResult {
    /**
     * Packed interleaved RGB. `bits === 8` => Uint8Array (3 bytes/pixel);
     * `bits === 16` => Uint16Array (3 samples/pixel, full 0–65535 range).
     */
    data: Uint8Array | Uint16Array;
    /** Image width in pixels */
    width: number;
    /** Image height in pixels */
    height: number;
    /** Bit depth of `data` (8, or 16 for high-bit-depth sources) */
    bits: 8 | 16;
    /** Embedded ICC profile, or null if the HEIC had none */
    iccProfile: Uint8Array | null;
}
