/**
 * Extract an ICC colour profile from a HEIC file by parsing the ISOBMFF box
 * tree: meta → iprp → ipco → colr (colour_type 'prof' or 'rICC').
 *
 * Returns null when no ICC profile is present.
 */
export declare function extractIccFromHeic(data: Uint8Array): Uint8Array | null;
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
