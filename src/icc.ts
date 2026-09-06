// ---------------------------------------------------------------------------
// ICC profile extraction from HEIC (ISOBMFF container parsing)
// ---------------------------------------------------------------------------

/**
 * Extract an ICC colour profile from a HEIC file by parsing the ISOBMFF box
 * tree: meta → iprp → ipco → colr (colour_type 'prof' or 'rICC').
 *
 * Returns null when no ICC profile is present.
 */
export function extractIccFromHeic(data: Uint8Array): Uint8Array | null {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (const box of primaryProps(view, data.byteLength)) {
    if (box.type === BOX_COLR && box.end - box.payloadStart >= 4) {
      const colourType = view.getUint32(box.payloadStart);
      if (colourType === COLOUR_PROF || colourType === COLOUR_RICC) {
        return data.slice(box.payloadStart + 4, box.end);
      }
    }
  }
  return null;
}

/**
 * Read the per-channel bit depth (8/10/12) of the main image from the HEIC
 * container — binding-independent (libheif-js's per-handle query is mis-bound).
 *
 * iOS 10/12-bit photos are grid-tiled: the primary `grid` item declares an
 * 8-bit `pixi`, while the real depth lives in the tiles' `hvcC`/`pixi`. So we
 * take the MAX depth across every image property in ipco. Auxiliary images
 * (gain maps) are 8-bit on iOS, so the max is the main image's depth. Prefers
 * the direct `pixi`, falling back to the codec config (`hvcC` HEVC / `av1C` AV1).
 */
export function bitDepthFromHeic(data: Uint8Array): number {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const ipco = findIpco(view, data.byteLength);
  if (!ipco) return 8;

  let depth = 0;
  for (let off = ipco.payloadStart; off < ipco.end;) {
    const box = readBox(view, off, ipco.end);
    if (!box) break;
    const p = box.payloadStart;
    if (box.type === BOX_PIXI && box.end - p >= 6) {
      // FullBox(4) num_channels(1) bits_per_channel[num_channels]
      const num = view.getUint8(p + 4);
      for (let i = 0; i < num && p + 5 + i < box.end; i++) depth = Math.max(depth, view.getUint8(p + 5 + i));
    } else if (box.type === BOX_HVCC && box.end - p >= 18) {
      // HEVCDecoderConfigurationRecord: bitDepthLumaMinus8 in low 3 bits of byte 17
      depth = Math.max(depth, 8 + (view.getUint8(p + 17) & 0x07));
    } else if (box.type === BOX_AV1C && box.end - p >= 3) {
      // AV1CodecConfigurationRecord: byte1 seq_profile(top 3), byte2 high_bitdepth/twelve_bit
      const seqProfile = (view.getUint8(p + 1) >> 5) & 0x07;
      const b2 = view.getUint8(p + 2);
      const highBd = (b2 >> 6) & 1, twelve = (b2 >> 5) & 1;
      depth = Math.max(depth, !highBd ? 8 : (seqProfile === 2 && twelve ? 12 : 10));
    }
    off = box.end;
  }
  return depth || 8;
}

// meta → iprp → ipco (the ItemPropertyContainerBox holding image properties).
function findIpco(view: DataView, length: number): Box | undefined {
  const meta = findBox(view, 0, length, BOX_META);
  if (!meta) return;
  const iprp = findBox(view, meta.payloadStart + 4, meta.end, BOX_IPRP); // meta is a FullBox
  if (!iprp) return;
  return findBox(view, iprp.payloadStart, iprp.end, BOX_IPCO);
}

/**
 * The ipco property boxes belonging to the PRIMARY image, in association order.
 * Real HEICs pack properties for several images (thumbnail, gain map, main)
 * into one ipco, so we resolve the primary item (`pitm`) to its properties via
 * `ipma`. Falls back to every ipco child for simple single-image files.
 */
function primaryProps(view: DataView, length: number): Box[] {
  const meta = findBox(view, 0, length, BOX_META);
  if (!meta) return [];
  const iprp = findBox(view, meta.payloadStart + 4, meta.end, BOX_IPRP);
  const ipco = findIpco(view, length);
  if (!iprp || !ipco) return [];

  // ipco children in order: property index N (1-based) is the Nth child.
  const all: Box[] = [];
  for (let off = ipco.payloadStart; off < ipco.end;) {
    const b = readBox(view, off, ipco.end);
    if (!b) break;
    all.push(b);
    off = b.end;
  }

  const pitm = findBox(view, meta.payloadStart + 4, meta.end, BOX_PITM);
  const ipma = findBox(view, iprp.payloadStart, iprp.end, BOX_IPMA);
  if (!pitm || !ipma) return all;   // single-image: no association table needed

  const pitmVer = view.getUint8(pitm.payloadStart);
  const primaryId = pitmVer === 0 ? view.getUint16(pitm.payloadStart + 4) : view.getUint32(pitm.payloadStart + 4);

  const ipmaVer = view.getUint8(ipma.payloadStart);
  const wideIndex = (view.getUint32(ipma.payloadStart) & 0x000001) !== 0; // flags & 1 => 15-bit indices
  let o = ipma.payloadStart + 4;
  const entryCount = view.getUint32(o); o += 4;
  const indices: number[] = [];
  for (let e = 0; e < entryCount && o < ipma.end; e++) {
    const itemId = ipmaVer < 1 ? view.getUint16(o) : view.getUint32(o);
    o += ipmaVer < 1 ? 2 : 4;
    const assocCount = view.getUint8(o); o++;
    for (let a = 0; a < assocCount && o < ipma.end; a++) {
      let idx: number;
      if (wideIndex) { idx = view.getUint16(o) & 0x7fff; o += 2; }
      else { idx = view.getUint8(o) & 0x7f; o++; }
      if (itemId === primaryId) indices.push(idx);
    }
  }

  const props: Box[] = [];
  for (const idx of indices) if (idx >= 1 && idx <= all.length) props.push(all[idx - 1]);
  return props.length ? props : all;
}

// ---------------------------------------------------------------------------
// ICC profile injection into JPEG via APP2 markers
// ---------------------------------------------------------------------------

const ICC_HEADER = new TextEncoder().encode('ICC_PROFILE\0');

/** Max ICC payload per APP2 marker: 65535 − 2 (length field) − 14 (header) */
const MAX_CHUNK = 65535 - 2 - ICC_HEADER.length - 2; // 65519

/**
 * Inject an ICC colour profile into a JPEG byte stream by inserting APP2
 * markers immediately after SOI (0xFF 0xD8).
 *
 * Follows the ICC specification for JPEG embedding: one or more APP2
 * (0xFF 0xE2) segments, each with the header "ICC_PROFILE\0", a one-based
 * sequence number, the total chunk count, and up to 65 519 bytes of profile
 * data.
 */
export function injectIccIntoJpeg(
  jpeg: Uint8Array,
  iccProfile: Uint8Array,
): Uint8Array {
  const markers = buildIccMarkers(iccProfile);
  // Insert after SOI (first 2 bytes)
  const out = new Uint8Array(jpeg.length + markers.length);
  out.set(jpeg.subarray(0, 2)); // SOI
  out.set(markers, 2);
  out.set(jpeg.subarray(2), 2 + markers.length);
  return out;
}

function buildIccMarkers(profile: Uint8Array): Uint8Array {
  const totalChunks = Math.ceil(profile.length / MAX_CHUNK) || 1;
  const parts: Uint8Array[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const chunkData = profile.subarray(i * MAX_CHUNK, (i + 1) * MAX_CHUNK);
    const segLen = 2 + ICC_HEADER.length + 2 + chunkData.length; // length field covers itself + payload
    const marker = new Uint8Array(2 + segLen); // 0xFF 0xE2 + segment
    marker[0] = 0xff;
    marker[1] = 0xe2; // APP2
    marker[2] = (segLen >> 8) & 0xff;
    marker[3] = segLen & 0xff;
    marker.set(ICC_HEADER, 4);
    marker[4 + ICC_HEADER.length] = i + 1; // sequence (1-based)
    marker[4 + ICC_HEADER.length + 1] = totalChunks;
    marker.set(chunkData, 4 + ICC_HEADER.length + 2);
    parts.push(marker);
  }

  const totalLen = parts.reduce((s, p) => s + p.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const p of parts) {
    result.set(p, offset);
    offset += p.length;
  }
  return result;
}

// ---------------------------------------------------------------------------
// ISOBMFF box helpers
// ---------------------------------------------------------------------------

interface Box {
  type: number;
  payloadStart: number;
  end: number;
}

function readBox(view: DataView, offset: number, limit: number): Box | undefined {
  if (offset + 8 > limit) return;
  
  let size = view.getUint32(offset);
  const type = view.getUint32(offset + 4);
  let payloadStart = offset + 8;

  if (size === 1) {
    // 64-bit extended size
    if (offset + 16 > limit) return;

    size = Number(view.getBigUint64(offset + 8));
    payloadStart = offset + 16;
    
  } else if (size === 0) {
    size = limit - offset; // extends to end
  }

  const end = offset + size;
  if (end > limit) return;

  return { type, payloadStart, end };
}

function findBox(
  view: DataView,
  start: number,
  end: number,
  targetType: number,
): Box | undefined {
  let offset = start;
  while (offset < end) {
    const box = readBox(view, offset, end);
    if (!box) return;
    if (box.type === targetType) return box;
    offset = box.end;
  }
}

// FourCC constants (big-endian u32)

const BOX_META = fourcc('meta');
const BOX_PITM = fourcc('pitm');
const BOX_IPRP = fourcc('iprp');
const BOX_IPCO = fourcc('ipco');
const BOX_IPMA = fourcc('ipma');
const BOX_COLR = fourcc('colr');
const BOX_PIXI = fourcc('pixi');
const BOX_HVCC = fourcc('hvcC');
const BOX_AV1C = fourcc('av1C');
const COLOUR_PROF = fourcc('prof');
const COLOUR_RICC = fourcc('rICC');

function fourcc(s: string): number {
  return (s.charCodeAt(0) << 24) | (s.charCodeAt(1) << 16) | (s.charCodeAt(2) << 8) | s.charCodeAt(3);
}
