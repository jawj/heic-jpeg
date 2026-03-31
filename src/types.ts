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
