import { runOffThread } from "../offThread.ts";
import { renderScene, type Scene } from "./render.ts";

/** Longest edge for a still GIF. Video is smaller so the file stays shareable. */
export const GIF_MAX_EDGE = { still: 1280, video: 480 } as const;
/** ~10 fps — GIF delay is in hundredths of a second, so 10 is exact. */
export const GIF_FPS = 10;
/** Longer clips are truncated so the GIF stays Discord/Twitter-friendly. */
export const GIF_MAX_DURATION = 10;
export const GIF_COLORS = 256;

export interface GifKernelInput {
  /** `frameCount * width * height * 4` RGBA pixels, frames packed back to back. */
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  frameCount: number;
  /** Frame delay in hundredths of a second. Ignored for a single frame. */
  delayCs: number;
  loop: boolean;
  maxColors: number;
}

export function gifSize(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const edge = Math.max(w, h);
  if (edge <= maxEdge) return { width: w, height: h };
  const scale = maxEdge / edge;
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
}

/**
 * Quantize, dither and pack frames into a GIF89a.
 *
 * Nested on purpose — `runOffThread` rebuilds this from its own source in a worker.
 */
export function gifKernel({ pixels, width, height, frameCount, delayCs, loop, maxColors }: GifKernelInput): Uint8Array {
  const colors = Math.max(2, Math.min(256, maxColors));
  const pixelCount = width * height;
  const stride = pixelCount * 4;

  function makeWriter() {
    let buf = new Uint8Array(1 << 18);
    let pos = 0;
    const grow = (need: number) => {
      if (pos + need <= buf.length) return;
      let next = buf.length;
      while (next < pos + need) next *= 2;
      const grown = new Uint8Array(next);
      grown.set(buf);
      buf = grown;
    };
    return {
      u8(value: number) {
        grow(1);
        buf[pos++] = value & 255;
      },
      u16(value: number) {
        grow(2);
        buf[pos++] = value & 255;
        buf[pos++] = (value >> 8) & 255;
      },
      bytes(data: Uint8Array) {
        grow(data.length);
        buf.set(data, pos);
        pos += data.length;
      },
      ascii(text: string) {
        for (let i = 0; i < text.length; i++) this.u8(text.charCodeAt(i));
      },
      result() {
        return buf.slice(0, pos);
      },
    };
  }

  function samplePixels(): Uint32Array {
    const total = pixelCount * frameCount;
    const target = Math.min(total, 65536);
    const step = Math.max(1, Math.floor(total / target));
    const out = new Uint32Array(Math.ceil(total / step));
    let n = 0;
    for (let i = 0; i < total; i += step) {
      const o = i * 4;
      out[n++] = (pixels[o] << 16) | (pixels[o + 1] << 8) | pixels[o + 2];
    }
    return out.subarray(0, n);
  }

  function channelOf(packed: number, channel: number): number {
    return channel === 0 ? (packed >> 16) & 255 : channel === 1 ? (packed >> 8) & 255 : packed & 255;
  }

  function medianCut(samples: Uint32Array, max: number): Uint8Array {
    type Box = { from: number; to: number };
    const boxes: Box[] = [{ from: 0, to: samples.length }];

    function stats(box: Box): { channel: number; range: number } {
      let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
      for (let i = box.from; i < box.to; i++) {
        const p = samples[i];
        const r = (p >> 16) & 255, g = (p >> 8) & 255, b = p & 255;
        if (r < rMin) rMin = r;
        if (r > rMax) rMax = r;
        if (g < gMin) gMin = g;
        if (g > gMax) gMax = g;
        if (b < bMin) bMin = b;
        if (b > bMax) bMax = b;
      }
      const rRange = rMax - rMin, gRange = gMax - gMin, bRange = bMax - bMin;
      if (rRange >= gRange && rRange >= bRange) return { channel: 0, range: rRange };
      if (gRange >= bRange) return { channel: 1, range: gRange };
      return { channel: 2, range: bRange };
    }

    while (boxes.length < max) {
      let best = -1;
      let bestRange = 0;
      for (let i = 0; i < boxes.length; i++) {
        if (boxes[i].to - boxes[i].from < 2) continue;
        const { range } = stats(boxes[i]);
        if (range > bestRange) {
          bestRange = range;
          best = i;
        }
      }
      if (best < 0 || bestRange === 0) break;
      const box = boxes[best];
      const { channel } = stats(box);
      samples.subarray(box.from, box.to).sort((a, b) => channelOf(a, channel) - channelOf(b, channel));
      const mid = (box.from + box.to) >>> 1;
      boxes[best] = { from: box.from, to: mid };
      boxes.push({ from: mid, to: box.to });
    }

    const palette = new Uint8Array(256 * 3);
    for (let i = 0; i < boxes.length; i++) {
      const { from, to } = boxes[i];
      let r = 0, g = 0, b = 0;
      const count = to - from;
      for (let p = from; p < to; p++) {
        const v = samples[p];
        r += (v >> 16) & 255;
        g += (v >> 8) & 255;
        b += v & 255;
      }
      const o = i * 3;
      palette[o] = Math.round(r / count);
      palette[o + 1] = Math.round(g / count);
      palette[o + 2] = Math.round(b / count);
    }
    return palette;
  }

  function buildLut(palette: Uint8Array, used: number): Uint8Array {
    const bits = 5;
    const size = 1 << bits;
    const lut = new Uint8Array(size * size * size);
    for (let r = 0; r < size; r++) {
      const R = Math.round((r * 255) / (size - 1));
      for (let g = 0; g < size; g++) {
        const G = Math.round((g * 255) / (size - 1));
        for (let b = 0; b < size; b++) {
          const B = Math.round((b * 255) / (size - 1));
          let best = 0;
          let bestD = Infinity;
          for (let i = 0; i < used; i++) {
            const o = i * 3;
            const dr = R - palette[o], dg = G - palette[o + 1], db = B - palette[o + 2];
            const d = dr * dr + dg * dg + db * db;
            if (d < bestD) {
              bestD = d;
              best = i;
            }
          }
          lut[(r << 10) | (g << 5) | b] = best;
        }
      }
    }
    return lut;
  }

  function ditherFrame(frameOffset: number, palette: Uint8Array, lut: Uint8Array, indices: Uint8Array): void {
    const rgb = new Uint8ClampedArray(pixelCount * 4);
    rgb.set(pixels.subarray(frameOffset, frameOffset + stride));
    const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
    const spread = (x: number, y: number, er: number, eg: number, eb: number, f: number) => {
      if (x < 0 || x >= width || y < 0 || y >= height) return;
      const o = (y * width + x) * 4;
      rgb[o] = clamp(rgb[o] + er * f);
      rgb[o + 1] = clamp(rgb[o + 1] + eg * f);
      rgb[o + 2] = clamp(rgb[o + 2] + eb * f);
    };
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const o = (y * width + x) * 4;
        const r = rgb[o], g = rgb[o + 1], b = rgb[o + 2];
        const idx = lut[((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)];
        indices[y * width + x] = idx;
        const po = idx * 3;
        spread(x + 1, y, r - palette[po], g - palette[po + 1], b - palette[po + 2], 7 / 16);
        spread(x - 1, y + 1, r - palette[po], g - palette[po + 1], b - palette[po + 2], 3 / 16);
        spread(x, y + 1, r - palette[po], g - palette[po + 1], b - palette[po + 2], 5 / 16);
        spread(x + 1, y + 1, r - palette[po], g - palette[po + 1], b - palette[po + 2], 1 / 16);
      }
    }
  }

  function lzw(indices: Uint8Array): Uint8Array {
    const minCodeSize = 8;
    const clear = 1 << minCodeSize;
    const eoi = clear + 1;
    let codeSize = minCodeSize + 1;
    let nextCode = eoi + 1;
    const dict = new Map<number, number>();

    let acc = 0;
    let bits = 0;
    const out: number[] = [];
    const write = (code: number, size: number) => {
      acc |= code << bits;
      bits += size;
      while (bits >= 8) {
        out.push(acc & 255);
        acc >>>= 8;
        bits -= 8;
      }
    };

    const reset = () => {
      dict.clear();
      nextCode = eoi + 1;
      codeSize = minCodeSize + 1;
    };

    write(clear, codeSize);
    let prefix = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i];
      const key = (prefix << 8) | k;
      const existing = dict.get(key);
      if (existing !== undefined) {
        prefix = existing;
        continue;
      }
      write(prefix, codeSize);
      // Bump after the write, before assigning the new code — same timing as
      // compress.c / GIFLIB, which browsers expect.
      if (nextCode < 4096) {
        if (nextCode >= 1 << codeSize && codeSize < 12) codeSize++;
        dict.set(key, nextCode++);
      } else {
        write(clear, codeSize);
        reset();
      }
      prefix = k;
    }
    write(prefix, codeSize);
    write(eoi, codeSize);
    if (bits > 0) out.push(acc & 255);
    return Uint8Array.from(out);
  }

  function writeSubBlocks(w: ReturnType<typeof makeWriter>, data: Uint8Array): void {
    for (let i = 0; i < data.length; ) {
      const n = Math.min(255, data.length - i);
      w.u8(n);
      w.bytes(data.subarray(i, i + n));
      i += n;
    }
    w.u8(0);
  }

  const samples = samplePixels();
  const used = Math.min(colors, Math.max(1, samples.length));
  const palette = medianCut(samples, used);
  const usedColors = Math.max(1, Math.min(used, 256));
  const lut = buildLut(palette, usedColors);

  const w = makeWriter();
  w.ascii("GIF89a");
  w.u16(width);
  w.u16(height);
  w.u8(0xf7); // global 256-color table
  w.u8(0);
  w.u8(0);
  w.bytes(palette);

  if (loop && frameCount > 1) {
    w.u8(0x21);
    w.u8(0xff);
    w.u8(11);
    w.ascii("NETSCAPE2.0");
    w.u8(3);
    w.u8(1);
    w.u16(0);
    w.u8(0);
  }

  const indices = new Uint8Array(pixelCount);
  const delay = frameCount > 1 ? Math.max(2, delayCs) : 0;
  for (let f = 0; f < frameCount; f++) {
    ditherFrame(f * stride, palette, lut, indices);
    w.u8(0x21);
    w.u8(0xf9);
    w.u8(4);
    w.u8(0x08); // do not dispose
    w.u16(delay);
    w.u8(0);
    w.u8(0);
    w.u8(0x2c);
    w.u16(0);
    w.u16(0);
    w.u16(width);
    w.u16(height);
    w.u8(0);
    w.u8(8);
    writeSubBlocks(w, lzw(indices));
  }
  w.u8(0x3b);
  return w.result();
}

async function encodeRgbaFrames(input: GifKernelInput): Promise<Uint8Array> {
  const big = input.frameCount > 1 || input.width * input.height > 600_000;
  if (big) return runOffThread(gifKernel, input, [input.pixels.buffer]);
  return gifKernel(input);
}

function scaleCanvas(source: HTMLCanvasElement, maxEdge: number): HTMLCanvasElement {
  const target = gifSize(source.width, source.height, maxEdge);
  if (target.width === source.width && target.height === source.height) return source;

  let src: CanvasImageSource = source;
  let w = source.width;
  let h = source.height;
  while (w > target.width * 2 && h > target.height * 2) {
    const nextW = Math.max(target.width, Math.floor(w / 2));
    const nextH = Math.max(target.height, Math.floor(h / 2));
    const step = document.createElement("canvas");
    step.width = nextW;
    step.height = nextH;
    const ctx = step.getContext("2d");
    if (!ctx) break;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, nextW, nextH);
    src = step;
    w = nextW;
    h = nextH;
  }

  const out = document.createElement("canvas");
  out.width = target.width;
  out.height = target.height;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Couldn't scale the frame.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, target.width, target.height);
  return out;
}

function readFrame(canvas: HTMLCanvasElement, maxEdge: number): ImageData {
  const scaled = scaleCanvas(canvas, maxEdge);
  const ctx = scaled.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Couldn't read the canvas.");
  return ctx.getImageData(0, 0, scaled.width, scaled.height);
}

export async function canvasToGif(canvas: HTMLCanvasElement): Promise<Blob> {
  const frame = readFrame(canvas, GIF_MAX_EDGE.still);
  const bytes = await encodeRgbaFrames({
    pixels: frame.data,
    width: frame.width,
    height: frame.height,
    frameCount: 1,
    delayCs: 0,
    loop: false,
    maxColors: GIF_COLORS,
  });
  return new Blob([new Uint8Array(bytes)], { type: "image/gif" });
}

export interface RecordGifOptions {
  scene: Scene;
  video: HTMLVideoElement;
  signal: AbortSignal;
  onProgress: (progress: number) => void;
}

function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  const duration = Number.isFinite(video.duration) ? video.duration : time;
  const t = Math.min(Math.max(0, time), Math.max(0, duration - 0.001));
  if (Math.abs(video.currentTime - t) < 0.0005 && !video.seeking) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = (ok: boolean) => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      ok ? resolve() : reject(new Error("Seek failed."));
    };
    const onSeeked = () => finish(true);
    const onError = () => finish(false);
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.currentTime = t;
  });
}

/**
 * Seeks through the clip, paints each sampled frame with captions, then encodes
 * a dithered, downscaled GIF. Resolves with the blob, or null if aborted.
 */
export async function recordGif({ scene, video, signal, onProgress }: RecordGifOptions): Promise<{ blob: Blob; truncated: boolean } | null> {
  const raw = video.duration;
  const duration = Number.isFinite(raw) && raw > 0 ? raw : GIF_MAX_DURATION;
  const truncated = duration > GIF_MAX_DURATION + 0.05;
  const clip = Math.min(duration, GIF_MAX_DURATION);
  const delayCs = Math.max(2, Math.round(100 / GIF_FPS));
  const fps = 100 / delayCs;
  const frameCount = Math.max(1, Math.round(clip * fps));

  const work = document.createElement("canvas");
  const ctx = work.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Couldn't create a drawing surface.");

  const wasLooping = video.loop;
  const wasPaused = video.paused;
  const savedTime = video.currentTime;
  video.loop = false;
  video.pause();

  try {
    await seekVideo(video, 0);
    if (signal.aborted) return null;
    renderScene(work, ctx, scene);
    const first = readFrame(work, GIF_MAX_EDGE.video);
    const { width, height } = first;
    const pixels = new Uint8ClampedArray(frameCount * width * height * 4);
    pixels.set(first.data, 0);
    onProgress(1 / (frameCount + 1));

    for (let i = 1; i < frameCount; i++) {
      if (signal.aborted) return null;
      const t = Math.min((i / fps), clip - 0.001);
      await seekVideo(video, t);
      if (signal.aborted) return null;
      renderScene(work, ctx, scene);
      const frame = readFrame(work, GIF_MAX_EDGE.video);
      if (frame.width !== width || frame.height !== height) {
        throw new Error("Frame size changed mid-export.");
      }
      pixels.set(frame.data, i * width * height * 4);
      onProgress((i + 1) / (frameCount + 1));
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }

    if (signal.aborted) return null;
    onProgress(frameCount / (frameCount + 1));
    const bytes = await encodeRgbaFrames({
      pixels,
      width,
      height,
      frameCount,
      delayCs,
      loop: true,
      maxColors: GIF_COLORS,
    });
    if (signal.aborted) return null;
    onProgress(1);
    return { blob: new Blob([new Uint8Array(bytes)], { type: "image/gif" }), truncated };
  } finally {
    video.loop = wasLooping;
    video.currentTime = savedTime;
    if (!wasPaused) void video.play().catch(() => undefined);
  }
}
