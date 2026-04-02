import { heicToJpeg, heicToJpegAll } from './convert.js';
import type { ConvertOptions, ConvertResult } from './types.js';

declare const self: {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

export interface WorkerRequest {
  id: number;
  fn: 'heicToJpeg' | 'heicToJpegAll';
  input: ArrayBuffer;
  options?: ConvertOptions;
}

export interface WorkerResponse {
  id: number;
  results?: ConvertResult[];
  error?: string;
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, fn, input, options } = e.data;
  try {
    let results: ConvertResult[];
    if (fn === 'heicToJpegAll') {
      results = await heicToJpegAll(new Uint8Array(input), options);
    } else {
      results = [await heicToJpeg(new Uint8Array(input), options)];
    }
    const transfer = results.map(r => r.data.buffer as ArrayBuffer);
    const resp: WorkerResponse = { id, results };
    self.postMessage(resp, transfer);
  } catch (err) {
    const resp: WorkerResponse = { id, error: (err as Error).message };
    self.postMessage(resp);
  }
};
