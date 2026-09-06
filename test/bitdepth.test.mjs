// Regression test for bitDepthFromHeic's ISOBMFF property parsing. Runs against
// the built dist (plain JS) so no HEIC decode / WASM is needed.
//   npm run build && node --test 'test/**/*.test.mjs'
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bitDepthFromHeic } from '../dist/index.js';

const fourcc = (s) => [...s].map((c) => c.charCodeAt(0));
const box = (type, payload) => {
  const n = 8 + payload.length;
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255, ...fourcc(type), ...payload];
};
const ftyp = box('ftyp', [...fourcc('heic'), 0, 0, 0, 0]);
// hvcC record: byte 0 = configurationVersion, byte 17 = bitDepthLumaMinus8 (low 3 bits)
const hvcC = (lumaMinus8) => box('hvcC', [1, ...Array(16).fill(0), lumaMinus8 & 7, 0]);
// pixi: FullBox(4) num_channels(1)=3 then bits per channel
const pixi = (bits) => box('pixi', [0, 0, 0, 0, 3, bits, bits, bits]);
// av1C: byte 0 = 0x81, byte 1 seq_profile in top 3 bits, byte 2 high_bitdepth(bit6)/twelve_bit(bit5)
const av1C = (profile, highBd, twelve) => box('av1C', [0x81, (profile & 7) << 5, (highBd << 6) | (twelve << 5), 0]);
const build = (...props) =>
  new Uint8Array([...ftyp, ...box('meta', [0, 0, 0, 0, ...box('iprp', box('ipco', props.flat()))])]);

describe('bitDepthFromHeic', () => {
  it('reads depth from pixi', () => {
    assert.equal(bitDepthFromHeic(build(pixi(10))), 10);
    assert.equal(bitDepthFromHeic(build(pixi(12))), 12);
    assert.equal(bitDepthFromHeic(build(pixi(8))), 8);
  });
  it('reads depth from the HEVC config (hvcC)', () => {
    assert.equal(bitDepthFromHeic(build(hvcC(2))), 10);
    assert.equal(bitDepthFromHeic(build(hvcC(4))), 12);
    assert.equal(bitDepthFromHeic(build(hvcC(0))), 8);
  });
  it('reads depth from the AV1 config (av1C)', () => {
    assert.equal(bitDepthFromHeic(build(av1C(0, 1, 0))), 10);
    assert.equal(bitDepthFromHeic(build(av1C(2, 1, 1))), 12);
    assert.equal(bitDepthFromHeic(build(av1C(0, 0, 0))), 8);
  });
  it('prefers pixi over the codec config', () => {
    assert.equal(bitDepthFromHeic(build(hvcC(2), pixi(12))), 12);
  });
  it('defaults to 8 when nothing is present', () => {
    assert.equal(bitDepthFromHeic(build()), 8);
    assert.equal(bitDepthFromHeic(new Uint8Array(16)), 8);
  });
});
