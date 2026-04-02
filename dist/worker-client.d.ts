import type { ConvertOptions, ConvertResult } from './types.js';
/**
 * Set the URL for the worker script. Call this before any conversion if your
 * bundler doesn't support `new URL('./worker.js', import.meta.url)` (e.g.
 * esbuild). For example:
 *
 * ```ts
 * setWorkerUrl('/assets/worker.js');
 * ```
 */
export declare function setWorkerUrl(url: string | URL): void;
/** Convert a HEIC file to JPEG in a Web Worker. */
export declare function heicToJpegWorker(input: Uint8Array | ArrayBuffer, options?: ConvertOptions): Promise<ConvertResult>;
/** Convert all images in a HEIC container to JPEG in a Web Worker. */
export declare function heicToJpegAllWorker(input: Uint8Array | ArrayBuffer, options?: ConvertOptions): Promise<ConvertResult[]>;
/** Terminate the worker. A new one will be created on the next call. */
export declare function terminateWorker(): void;
