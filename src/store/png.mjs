import { deflateSync, inflateSync } from 'node:zlib';

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}

export function crc32(buf, crc = 0xffffffff) {
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/** Encode an RGBA buffer (w*h*4 bytes) as an 8-bit RGBA PNG. */
export function encodePng(rgba, width, height, { filter = 'adaptive', level = 6 } = {}) {
  const bpp = 4;
  const stride = width * bpp;
  if (rgba.length < stride * height) throw new Error(`rgba buffer too small for ${width}x${height}`);
  const raw = Buffer.alloc((stride + 1) * height);
  const scratch = filter === 'adaptive' ? Array.from({ length: 5 }, () => Buffer.alloc(stride)) : null;
  for (let y = 0; y < height; y++) {
    const row = rgba.subarray(y * stride, (y + 1) * stride);
    const prev = y ? rgba.subarray((y - 1) * stride, y * stride) : null;
    let best = 0;
    let bestBuf;
    if (filter === 'adaptive') {
      let bestScore = Infinity;
      for (let f = 0; f < 5; f++) {
        const out = scratch[f];
        applyFilter(f, row, prev, out, bpp);
        let score = 0;
        for (let i = 0; i < stride; i++) score += Math.abs((out[i] << 24) >> 24);
        if (score < bestScore) { bestScore = score; best = f; bestBuf = out; }
      }
    } else {
      bestBuf = Buffer.alloc(stride);
      applyFilter(0, row, prev, bestBuf, bpp);
    }
    raw[y * (stride + 1)] = best;
    bestBuf.copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level })), chunk('IEND', Buffer.alloc(0))]);
}

function applyFilter(f, row, prev, out, bpp) {
  for (let i = 0; i < row.length; i++) {
    const a = i >= bpp ? row[i - bpp] : 0;
    const b = prev ? prev[i] : 0;
    const c = prev && i >= bpp ? prev[i - bpp] : 0;
    const x = row[i];
    out[i] = f === 0 ? x : f === 1 ? x - a : f === 2 ? x - b : f === 3 ? x - ((a + b) >> 1) : x - paeth(a, b, c);
  }
}

function unfilter(f, row, prev, bpp) {
  for (let i = 0; i < row.length; i++) {
    const a = i >= bpp ? row[i - bpp] : 0;
    const b = prev ? prev[i] : 0;
    const c = prev && i >= bpp ? prev[i - bpp] : 0;
    switch (f) {
      case 1: row[i] += a; break;
      case 2: row[i] += b; break;
      case 3: row[i] += (a + b) >> 1; break;
      case 4: row[i] += paeth(a, b, c); break;
    }
  }
}

/** Read width/height (and colour type) from a PNG header without decoding. */
export function pngInfo(buf) {
  if (buf.length < 29 || !buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), depth: buf[24], colorType: buf[25], interlace: buf[28] };
}

/** Decode an 8-bit, non-interlaced PNG (gray, gray+alpha, RGB, RGBA or palette) to RGBA. */
export function decodePng(buf) {
  const info = pngInfo(buf);
  if (info.depth !== 8) throw new Error(`unsupported PNG bit depth ${info.depth}`);
  if (info.interlace) throw new Error('interlaced PNG not supported');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[info.colorType];
  if (!channels) throw new Error(`unsupported PNG colour type ${info.colorType}`);
  const idat = [];
  let palette = null, trns = null;
  let pos = 8;
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IDAT') idat.push(data);
    else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const { width, height } = info;
  const stride = width * channels;
  const rgba = Buffer.alloc(width * height * 4);
  let prev = null;
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    unfilter(f, row, prev, channels);
    const o = y * width * 4;
    for (let x = 0; x < width; x++) {
      const i = x * channels, p = o + x * 4;
      switch (info.colorType) {
        case 0: rgba[p] = rgba[p + 1] = rgba[p + 2] = row[i]; rgba[p + 3] = 255; break;
        case 4: rgba[p] = rgba[p + 1] = rgba[p + 2] = row[i]; rgba[p + 3] = row[i + 1]; break;
        case 2: rgba[p] = row[i]; rgba[p + 1] = row[i + 1]; rgba[p + 2] = row[i + 2]; rgba[p + 3] = 255; break;
        case 6: rgba[p] = row[i]; rgba[p + 1] = row[i + 1]; rgba[p + 2] = row[i + 2]; rgba[p + 3] = row[i + 3]; break;
        case 3: {
          const k = row[i] * 3;
          rgba[p] = palette[k]; rgba[p + 1] = palette[k + 1]; rgba[p + 2] = palette[k + 2];
          rgba[p + 3] = trns && row[i] < trns.length ? trns[row[i]] : 255;
        }
      }
    }
    prev = row;
  }
  return { width, height, data: rgba };
}

/** Width/height of a JPEG from its SOF marker. */
export function jpegInfo(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('not a JPEG');
  let pos = 2;
  while (pos + 9 < buf.length) {
    if (buf[pos] !== 0xff) { pos++; continue; }
    const marker = buf[pos + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 || marker === 0xff) { pos += 2; continue; }
    const len = buf.readUInt16BE(pos + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(pos + 5), width: buf.readUInt16BE(pos + 7) };
    }
    pos += 2 + len;
  }
  throw new Error('JPEG has no SOF marker');
}

/** Box-filter (area average) resize of an RGBA buffer; nearest neighbour when enlarging. */
export function resizeRgba(src, sw, sh, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const y0 = Math.floor((y * sh) / dh), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * sh) / dh));
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor((x * sw) / dw), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * sw) / dw));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
        const i = (yy * sw + xx) * 4;
        r += src[i]; g += src[i + 1]; b += src[i + 2]; a += src[i + 3]; n++;
      }
      const o = (y * dw + x) * 4;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n;
    }
  }
  return out;
}
