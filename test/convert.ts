#!/usr/bin/env node
import { heicToJpeg } from '../src/index.js';
import type { ConvertOptions } from '../src/types.js';

const args = process.argv.slice(2);
const opts: ConvertOptions = {};
let showHelp = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  switch (arg) {
    case '-q':
    case '--quality':
      opts.quality = Number(args[++i]);
      break;
    case '--no-progressive':
      opts.progressive = false;
      break;
    case '--no-trellis':
      opts.trellis = false;
      break;
    case '--no-icc':
      opts.preserveIccProfile = false;
      break;
    case '-h':
    case '--help':
      showHelp = true;
      break;
    default:
      process.stderr.write(`Unknown option: ${arg}\n`);
      process.exit(1);
  }
}

if (showHelp) {
  process.stderr.write(
    `Usage: heic-to-jpeg [options] < input.heic > output.jpg

Options:
  -q, --quality <n>      JPEG quality 1-100 (default: 80)
  --no-progressive       Disable progressive JPEG
  --no-trellis           Disable trellis quantization
  --no-icc               Strip ICC color profile
  -h, --help             Show this help
`,
  );
  process.exit(0);
}

const chunks: Uint8Array[] = [];
process.stdin.on('data', (chunk: Buffer) => chunks.push(new Uint8Array(chunk)));
process.stdin.on('end', async () => {
  try {
    const totalLen = chunks.reduce((s, c) => s + c.length, 0);
    const input = new Uint8Array(totalLen);
    let offset = 0;
    for (const c of chunks) { input.set(c, offset); offset += c.length; }
    const result = await heicToJpeg(input, opts);
    process.stdout.write(result.data);
    process.stderr.write(
      `${result.width}x${result.height} → ${result.data.length} bytes` +
        (result.iccProfileTransferred ? ' (ICC profile transferred)' : '') +
        '\n',
    );
  } catch (err) {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : err}\n`);
    process.exit(1);
  }
});
