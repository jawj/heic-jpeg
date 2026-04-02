import { heicToJpeg, heicToJpegAll } from './convert.js';
self.onmessage = async (e) => {
    const { id, fn, input, options } = e.data;
    try {
        let results;
        if (fn === 'heicToJpegAll') {
            results = await heicToJpegAll(new Uint8Array(input), options);
        }
        else {
            results = [await heicToJpeg(new Uint8Array(input), options)];
        }
        const transfer = results.map(r => r.data.buffer);
        const resp = { id, results };
        self.postMessage(resp, transfer);
    }
    catch (err) {
        const resp = { id, error: err.message };
        self.postMessage(resp);
    }
};
