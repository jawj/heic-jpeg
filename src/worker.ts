import { heicToJpeg, heicToJpegAll, heicToPixels } from './convert.js';
import type { ConvertOptions, ConvertResult, PixelOptions, PixelResult } from './types.js';

declare const self: {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

export interface WorkerRequest {
  id: number;
  fn: 'heicToJpeg' | 'heicToJpegAll' | 'heicToPixels';
  input: ArrayBuffer;
  options?: ConvertOptions | PixelOptions;
}

export interface WorkerResponse {
  id: number;
  results?: ConvertResult[];
  pixels?: PixelResult;
  error?: string;
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, fn, input, options } = e.data;
  try {
    if (fn === 'heicToPixels') {
      const pixels = await heicToPixels(new Uint8Array(input), options as PixelOptions);
      // transfer the (freshly-allocated) pixel buffer; the small ICC is cloned.
      self.postMessage({ id, pixels } as WorkerResponse, [pixels.data.buffer as ArrayBuffer]);
      return;
    }
    let results: ConvertResult[];
    if (fn === 'heicToJpegAll') {
      results = await heicToJpegAll(new Uint8Array(input), options as ConvertOptions);
    } else {
      results = [await heicToJpeg(new Uint8Array(input), options as ConvertOptions)];
    }
    self.postMessage({ id, results } as WorkerResponse, results.map(r => r.data.buffer as ArrayBuffer));
  } catch (err) {
    self.postMessage({ id, error: (err as Error).message } as WorkerResponse);
  }
};
