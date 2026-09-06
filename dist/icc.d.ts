/**
 * Extract an ICC colour profile from a HEIC file by parsing the ISOBMFF box
 * tree: meta → iprp → ipco → colr (colour_type 'prof' or 'rICC').
 *
 * Returns null when no ICC profile is present.
 */
export declare function extractIccFromHeic(data: Uint8Array): Uint8Array | null;
/**
 * Read the per-channel bit depth (8/10/12) of the main image from the HEIC
 * container — binding-independent (libheif-js's per-handle query is mis-bound).
 *
 * iOS 10/12-bit photos are grid-tiled: the primary `grid` item declares an
 * 8-bit `pixi`, while the real depth lives in the tiles' `hvcC`/`pixi`. So we
 * take the MAX depth across every image property in ipco. Auxiliary images
 * (gain maps) are 8-bit on iOS, so the max is the main image's depth. Prefers
 * the direct `pixi`, falling back to the codec config (`hvcC` HEVC / `av1C` AV1).
 */
export declare function bitDepthFromHeic(data: Uint8Array): number;
/**
 * Inject an ICC colour profile into a JPEG byte stream by inserting APP2
 * markers immediately after SOI (0xFF 0xD8).
 *
 * Follows the ICC specification for JPEG embedding: one or more APP2
 * (0xFF 0xE2) segments, each with the header "ICC_PROFILE\0", a one-based
 * sequence number, the total chunk count, and up to 65 519 bytes of profile
 * data.
 */
export declare function injectIccIntoJpeg(jpeg: Uint8Array, iccProfile: Uint8Array): Uint8Array;
