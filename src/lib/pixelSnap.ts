import { runOffThread } from './offThread';
import { snapKernel, type RgbaGrid } from './pixelSnapKernel';

export type PotMode = 'balanced' | 'up' | 'down' | 'grid-safe';

export interface SnapSettings {
  pixelSize: number | 'auto';
  colors: number;
  potMode: PotMode;
  targetSize: number | 'auto';
  preserveAlpha: boolean;
  dither: boolean;
  square: boolean;
}

export interface SnapResult {
  outCanvas: HTMLCanvasElement;
  beforeCanvas: HTMLCanvasElement;
  pixelSize: number;
  gridWidth: number;
  gridHeight: number;
  outWidth: number;
  outHeight: number;
  usedTarget: boolean;
}

const POT_SIZES = [16, 32, 64, 128, 256, 512, 1024, 2048, 4096];

function getSourceGrid(img: HTMLImageElement): RgbaGrid {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0);
  return { width: img.width, height: img.height, data: ctx.getImageData(0, 0, img.width, img.height).data };
}

function nearestPot(value: number): number {
  let best = POT_SIZES[0];
  let bestDist = Infinity;
  for (const s of POT_SIZES) {
    const d = Math.abs(s - value);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}

function ceilPot(value: number): number {
  for (const s of POT_SIZES) if (s >= value) return s;
  return POT_SIZES[POT_SIZES.length - 1];
}

function floorPot(value: number): number {
  let best = POT_SIZES[0];
  for (const s of POT_SIZES) if (s <= value) best = s;
  return best;
}

function chooseDimension(value: number, mode: PotMode, gridStep?: number): number {
  switch (mode) {
    case 'up':
      return ceilPot(value);
    case 'down':
      return floorPot(value);
    case 'grid-safe': {
      let result = nearestPot(value);
      if (gridStep && gridStep > 0) {
        while (result > POT_SIZES[0] && result % gridStep !== 0) result = floorPot(result - 1);
        if (result % gridStep !== 0) result = nearestPot(value);
      }
      return result;
    }
    default:
      return nearestPot(value);
  }
}

function gridToCanvas(grid: RgbaGrid): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = grid.width;
  canvas.height = grid.height;
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(grid.data), grid.width, grid.height), 0, 0);
  return canvas;
}

/** Snap an image to its pixel grid and reduce its palette. The pixel crunching runs in a worker. */
export async function processPixelSnap(img: HTMLImageElement, settings: SnapSettings): Promise<SnapResult> {
  const source = getSourceGrid(img);
  const sourceSize = { width: source.width, height: source.height };
  // The pixel buffer moves to the worker rather than being copied.
  const { grid: quantized, pixelSize } = await runOffThread(snapKernel, { grid: source, settings }, [source.data.buffer]);
  const small = quantized;

  let outW: number;
  let outH: number;
  if (settings.targetSize !== 'auto') {
    const longest = Math.max(sourceSize.width, sourceSize.height) || 1;
    const scale = settings.targetSize / longest;
    outW = nearestPot(sourceSize.width * scale);
    outH = nearestPot(sourceSize.height * scale);
  } else {
    outW = chooseDimension(sourceSize.width, settings.potMode, settings.potMode === 'grid-safe' ? small.width : undefined);
    outH = chooseDimension(sourceSize.height, settings.potMode, settings.potMode === 'grid-safe' ? small.height : undefined);
  }
  if (settings.square) {
    const s = settings.targetSize !== 'auto' ? settings.targetSize : Math.max(outW, outH);
    outW = s;
    outH = s;
  }

  const smallCanvas = gridToCanvas(quantized);
  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const outCtx = outCanvas.getContext('2d')!;
  outCtx.imageSmoothingEnabled = false;
  outCtx.clearRect(0, 0, outW, outH);
  outCtx.drawImage(smallCanvas, 0, 0, outW, outH);

  const beforeCanvas = document.createElement('canvas');
  beforeCanvas.width = sourceSize.width;
  beforeCanvas.height = sourceSize.height;
  beforeCanvas.getContext('2d')!.drawImage(img, 0, 0);

  return {
    outCanvas,
    beforeCanvas,
    pixelSize,
    gridWidth: small.width,
    gridHeight: small.height,
    outWidth: outW,
    outHeight: outH,
    usedTarget: settings.targetSize !== 'auto',
  };
}
