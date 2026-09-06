import type { ConvertOptions, ConvertResult, PixelOptions, PixelResult } from './types.js';
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
