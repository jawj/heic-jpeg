let heifModule = null;
let mozModule = null;
const isNode = typeof process !== 'undefined' &&
    process.versions != null &&
    process.versions.node != null;
/**
 * Load the libheif WASM module (cached singleton).
 *
 * `libheif-js/wasm-bundle` is a CJS entry that auto-invokes the Emscripten
 * factory.  Dynamic-importing it from ESM gives us the ready module as the
 * default export.
 */
export async function getHeif() {
    if (heifModule)
        return heifModule;
    // @ts-expect-error -- CJS subpath with no declaration file
    const mod = await import('libheif-js/wasm-bundle.js');
    heifModule = mod.default ?? mod;
    return heifModule;
}
/**
 * Load the mozjpeg WASM module (cached singleton).
 *
 * In Node.js we load from the filesystem; in the browser we use fetch().
 * The `node:fs` import is hidden behind `new Function` so that bundlers
 * don't try to resolve or bundle it.
 */
export async function getMozjpeg() {
    if (mozModule)
        return mozModule;
    const wm = await import('wasm-mozjpeg');
    if (isNode) {
        // Use indirect eval so bundlers can't statically analyse the import
        const fs = await new Function('return import("node:fs")')();
        mozModule = await wm.loadNodeModule(fs);
    }
    else {
        mozModule = await wm.loadWebModule();
    }
    return mozModule;
}
/** Pre-warm both WASM modules. */
export async function init() {
    await Promise.all([getHeif(), getMozjpeg()]);
}
