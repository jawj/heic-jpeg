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

  const meta = findBox(view, 0, data.byteLength, BOX_META);
  if (!meta) return null;

  // meta is a FullBox — skip 4-byte version+flags
  const metaPayload = meta.payloadStart + 4;

  const iprp = findBox(view, metaPayload, meta.end, BOX_IPRP);
  if (!iprp) return null;

  const ipco = findBox(view, iprp.payloadStart, iprp.end, BOX_IPCO);
  if (!ipco) return null;

  // Walk ipco children looking for a colr box with an ICC profile
  let offset = ipco.payloadStart;
  while (offset < ipco.end) {
    const box = readBox(view, offset, ipco.end);
    if (!box) break;
    if (box.type === BOX_COLR && box.end - box.payloadStart >= 4) {
      const colourType = view.getUint32(box.payloadStart);
      if (colourType === COLOUR_PROF || colourType === COLOUR_RICC) {
        return data.slice(box.payloadStart + 4, box.end);
      }
    }
    offset = box.end;
  }

  return null;
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
const BOX_IPRP = fourcc('iprp');
const BOX_IPCO = fourcc('ipco');
const BOX_COLR = fourcc('colr');
const COLOUR_PROF = fourcc('prof');
const COLOUR_RICC = fourcc('rICC');

function fourcc(s: string): number {
  return (s.charCodeAt(0) << 24) | (s.charCodeAt(1) << 16) | (s.charCodeAt(2) << 8) | s.charCodeAt(3);
}
