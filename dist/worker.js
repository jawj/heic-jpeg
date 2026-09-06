import { heicToJpeg, heicToJpegAll, heicToPixels } from './convert.js';
self.onmessage = async (e) => {
    const { id, fn, input, options } = e.data;
    try {
        if (fn === 'heicToPixels') {
            const pixels = await heicToPixels(new Uint8Array(input), options);
            // transfer the (freshly-allocated) pixel buffer; the small ICC is cloned.
            self.postMessage({ id, pixels }, [pixels.data.buffer]);
            return;
        }
        let results;
        if (fn === 'heicToJpegAll') {
            results = await heicToJpegAll(new Uint8Array(input), options);
        }
        else {
            results = [await heicToJpeg(new Uint8Array(input), options)];
        }
        self.postMessage({ id, results }, results.map(r => r.data.buffer));
    }
    catch (err) {
        self.postMessage({ id, error: err.message });
    }
};
