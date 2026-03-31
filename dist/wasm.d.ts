import type { MozJPEG } from 'wasm-mozjpeg';
type HeifModule = any;
/**
 * Load the libheif WASM module (cached singleton).
 *
 * `libheif-js/wasm-bundle` is a CJS entry that auto-invokes the Emscripten
 * factory.  Dynamic-importing it from ESM gives us the ready module as the
 * default export.
 */
export declare function getHeif(): Promise<HeifModule>;
/**
 * Load the mozjpeg WASM module (cached singleton).
 *
 * In Node.js we load from the filesystem; in the browser we use fetch().
 * The `node:fs` import is hidden behind `new Function` so that bundlers
 * don't try to resolve or bundle it.
 */
export declare function getMozjpeg(): Promise<MozJPEG>;
/** Pre-warm both WASM modules. */
export declare function init(): Promise<void>;
export {};
