import { describe, expect, test } from 'bun:test';
import { gifKernel, gifSize, type GifKernelInput } from '../meme/gif';

function rgba(width: number, height: number, fill: (x: number, y: number) => [number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = fill(x, y);
      const o = (y * width + x) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  }
  return data;
}

function encode(partial: Partial<GifKernelInput> & Pick<GifKernelInput, 'pixels' | 'width' | 'height'>): Uint8Array {
  return gifKernel({
    frameCount: 1,
    delayCs: 0,
    loop: false,
    maxColors: 256,
    ...partial,
  });
}

interface DecodedFrame {
  indices: Uint8Array;
  delayCs: number;
  palette: Uint8Array;
}

interface DecodedGif {
  width: number;
  height: number;
  loop: boolean;
  frames: DecodedFrame[];
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

function decodeLzw(minCodeSize: number, data: Uint8Array): Uint8Array {
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  let codeSize = minCodeSize + 1;
  let nextCode = eoi + 1;
  const table: number[][] = [];
  for (let i = 0; i < clear; i++) table[i] = [i];

  let bitPos = 0;
  const read = (size: number): number => {
    let value = 0;
    let shift = 0;
    let got = 0;
    while (got < size) {
      const byteIndex = bitPos >> 3;
      if (byteIndex >= data.length) return eoi;
      const take = Math.min(size - got, 8 - (bitPos & 7));
      const bits = (data[byteIndex] >> (bitPos & 7)) & ((1 << take) - 1);
      value |= bits << shift;
      bitPos += take;
      shift += take;
      got += take;
    }
    return value;
  };

  const out: number[] = [];
  let prev: number[] | null = null;
  for (;;) {
    const code = read(codeSize);
    if (code === eoi) break;
    if (code === clear) {
      table.length = clear;
      for (let i = 0; i < clear; i++) table[i] = [i];
      nextCode = eoi + 1;
      codeSize = minCodeSize + 1;
      prev = null;
      continue;
    }
    let entry: number[];
    if (code < nextCode && table[code]) entry = table[code];
    else if (code === nextCode && prev) entry = prev.concat(prev[0]);
    else throw new Error(`bad LZW code ${code} (next=${nextCode})`);
    for (const v of entry) out.push(v);
    if (prev && nextCode < 4096) {
      table[nextCode++] = prev.concat(entry[0]);
      if (nextCode === 1 << codeSize && codeSize < 12) codeSize++;
    }
    prev = entry;
  }
  return Uint8Array.from(out);
}

function decodeGif(bytes: Uint8Array): DecodedGif {
  const ascii = (start: number, n: number) => String.fromCharCode(...bytes.subarray(start, start + n));
  expect(ascii(0, 6)).toBe('GIF89a');
  const width = bytes[6] | (bytes[7] << 8);
  const height = bytes[8] | (bytes[9] << 8);
  const packed = bytes[10];
  const gctSize = 2 << (packed & 7);
  let pos = 13;
  let gct: Uint8Array | null = null;
  if (packed & 0x80) {
    gct = bytes.subarray(pos, pos + gctSize * 3);
    pos += gctSize * 3;
  }

  let loop = false;
  const frames: DecodedFrame[] = [];
  let delayCs = 0;

  while (pos < bytes.length) {
    const b = bytes[pos++];
    if (b === 0x3b) break;
    if (b === 0x21) {
      const label = bytes[pos++];
      if (label === 0xf9) {
        pos++; // block size 4
        pos++; // packed
        delayCs = bytes[pos] | (bytes[pos + 1] << 8);
        pos += 2;
        pos++; // transparent
        pos++; // terminator
      } else if (label === 0xff) {
        const n = bytes[pos++];
        const id = ascii(pos, n);
        pos += n;
        if (id === 'NETSCAPE2.0') loop = true;
        while (bytes[pos] !== 0) pos += 1 + bytes[pos];
        pos++;
      } else {
        while (bytes[pos] !== 0) pos += 1 + bytes[pos];
        pos++;
      }
      continue;
    }
    if (b !== 0x2c) throw new Error(`unexpected block 0x${b.toString(16)} at ${pos - 1}`);
    pos += 8; // x,y,w,h
    const ipacked = bytes[pos++];
    let palette = gct;
    if (ipacked & 0x80) {
      const lctSize = 2 << (ipacked & 7);
      palette = bytes.subarray(pos, pos + lctSize * 3);
      pos += lctSize * 3;
    }
    if (!palette) throw new Error('image has no color table');
    const minCodeSize = bytes[pos++];
    const chunks: Uint8Array[] = [];
    for (;;) {
      const n = bytes[pos++];
      if (n === 0) break;
      chunks.push(bytes.subarray(pos, pos + n));
      pos += n;
    }
    frames.push({
      indices: decodeLzw(minCodeSize, concat(chunks)),
      delayCs,
      palette: palette.slice(),
    });
  }

  return { width, height, loop, frames };
}

function colorAt(frame: DecodedFrame, width: number, x: number, y: number): [number, number, number] {
  const idx = frame.indices[y * width + x];
  const o = idx * 3;
  return [frame.palette[o], frame.palette[o + 1], frame.palette[o + 2]];
}

describe('gifSize', () => {
  test('leaves small frames alone', () => {
    expect(gifSize(320, 240, 480)).toEqual({ width: 320, height: 240 });
  });

  test('fits the long edge and keeps aspect', () => {
    expect(gifSize(1920, 1080, 480)).toEqual({ width: 480, height: 270 });
    expect(gifSize(1080, 1920, 480)).toEqual({ width: 270, height: 480 });
  });
});

describe('gifKernel', () => {
  test('writes a GIF89a with the right screen size and a trailer', () => {
    const bytes = encode({ pixels: rgba(4, 3, () => [255, 0, 0]), width: 4, height: 3 });
    expect(String.fromCharCode(...bytes.subarray(0, 6))).toBe('GIF89a');
    expect(bytes[bytes.length - 1]).toBe(0x3b);
    const gif = decodeGif(bytes);
    expect(gif.width).toBe(4);
    expect(gif.height).toBe(3);
    expect(gif.frames).toHaveLength(1);
    expect(gif.loop).toBe(false);
    expect(gif.frames[0].indices).toHaveLength(12);
  });

  test('keeps a two-color checkerboard as two colors near the originals', () => {
    const bytes = encode({
      pixels: rgba(4, 4, (x, y) => ((x + y) % 2 === 0 ? [255, 0, 0] : [0, 0, 255])),
      width: 4,
      height: 4,
    });
    const gif = decodeGif(bytes);
    const seen = new Set<string>();
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const [r, g, b] = colorAt(gif.frames[0], 4, x, y);
        seen.add(`${r},${g},${b}`);
        if ((x + y) % 2 === 0) {
          expect(r).toBeGreaterThan(200);
          expect(b).toBeLessThan(55);
        } else {
          expect(b).toBeGreaterThan(200);
          expect(r).toBeLessThan(55);
        }
      }
    }
    expect(seen.size).toBe(2);
  });

  test('animates two frames with a netscape loop and the given delay', () => {
    const a = rgba(2, 2, () => [255, 0, 0]);
    const b = rgba(2, 2, () => [0, 255, 0]);
    const pixels = new Uint8ClampedArray(a.length + b.length);
    pixels.set(a, 0);
    pixels.set(b, a.length);
    const bytes = encode({ pixels, width: 2, height: 2, frameCount: 2, delayCs: 10, loop: true });
    const gif = decodeGif(bytes);
    expect(gif.loop).toBe(true);
    expect(gif.frames).toHaveLength(2);
    expect(gif.frames[0].delayCs).toBe(10);
    expect(gif.frames[1].delayCs).toBe(10);
    expect(gif.frames[0].indices).toHaveLength(4);
    expect(gif.frames[1].indices).toHaveLength(4);
    const [r] = colorAt(gif.frames[0], 2, 0, 0);
    const [, g] = colorAt(gif.frames[1], 2, 0, 0);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeGreaterThan(200);
  });

  test('round-trips a large enough image that LZW has to grow the code size', () => {
    const bytes = encode({
      pixels: rgba(64, 64, (x, y) => [x * 4, y * 4, (x + y) & 255]),
      width: 64,
      height: 64,
    });
    const gif = decodeGif(bytes);
    expect(gif.frames[0].indices).toHaveLength(64 * 64);
  });

  test('survives an LZW table reset on a noisy image', () => {
    const bytes = encode({
      pixels: rgba(160, 160, (x, y) => [(x * 41 + y * 17) & 255, (x * 13 + y) & 255, (y * 29 + x) & 255]),
      width: 160,
      height: 160,
    });
    const gif = decodeGif(bytes);
    expect(gif.frames[0].indices).toHaveLength(160 * 160);
  });
});
