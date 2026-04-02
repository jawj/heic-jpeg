import type { ConvertOptions, ConvertResult } from './types.js';
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
