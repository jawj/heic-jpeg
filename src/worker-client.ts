import type { ConvertOptions, ConvertResult } from './types.js';
import type { WorkerRequest, WorkerResponse } from './worker.js';

let worker: Worker | null = null;
let workerUrl: string | URL | undefined;
let nextId = 0;
const pending = new Map<number, {
  resolve: (results: ConvertResult[]) => void;
  reject: (error: Error) => void;
}>();

/**
 * Set the URL for the worker script. Call this before any conversion if your
 * bundler doesn't support `new URL('./worker.js', import.meta.url)` (e.g.
 * esbuild). For example:
 *
 * ```ts
 * setWorkerUrl('/assets/worker.js');
 * ```
 */
export function setWorkerUrl(url: string | URL): void {
  workerUrl = url;
}

function getWorker(): Worker {
  if (worker) return worker;
  const url = workerUrl ?? new URL('./worker.js', import.meta.url);
  worker = new Worker(url, { type: 'module' });
  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const { id, results, error } = e.data;
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (error) {
      p.reject(new Error(error));
    } else {
      p.resolve(results!);
    }
  };
  return worker;
}

function postRequest(
  fn: WorkerRequest['fn'],
  input: Uint8Array | ArrayBuffer,
  options?: ConvertOptions,
): Promise<ConvertResult[]> {
  const w = getWorker();
  const id = nextId++;
  const buffer = input instanceof Uint8Array
    ? (input.buffer as ArrayBuffer).slice(input.byteOffset, input.byteOffset + input.byteLength)
    : (input as ArrayBuffer).slice(0);

  return new Promise<ConvertResult[]>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const msg: WorkerRequest = { id, fn, input: buffer, options };
    w.postMessage(msg, [buffer]);
  });
}

/** Convert a HEIC file to JPEG in a Web Worker. */
export async function heicToJpegWorker(
  input: Uint8Array | ArrayBuffer,
  options?: ConvertOptions,
): Promise<ConvertResult> {
  const results = await postRequest('heicToJpeg', input, options);
  return results[0];
}

/** Convert all images in a HEIC container to JPEG in a Web Worker. */
export async function heicToJpegAllWorker(
  input: Uint8Array | ArrayBuffer,
  options?: ConvertOptions,
): Promise<ConvertResult[]> {
  return postRequest('heicToJpegAll', input, options);
}

/** Terminate the worker. A new one will be created on the next call. */
export function terminateWorker(): void {
  worker?.terminate();
  worker = null;
  for (const p of pending.values()) {
    p.reject(new Error('Worker terminated'));
  }
  pending.clear();
}
