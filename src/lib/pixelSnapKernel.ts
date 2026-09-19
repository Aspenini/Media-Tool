import type { SnapSettings } from './pixelSnap';

export interface RgbaGrid {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface SnapKernelInput {
  grid: RgbaGrid;
  settings: SnapSettings;
}

export interface SnapKernelOutput {
  grid: RgbaGrid;
  pixelSize: number;
}

/**
 * The pixel crunching behind PixelSnap: find the pixel grid, average the image
 * down onto it, and reduce it to a palette.
 *
 * Everything it uses is nested inside on purpose — `runOffThread` rebuilds this
 * function from its own source inside a worker, where module scope doesn't exist.
 */
export function snapKernel({ grid: source, settings }: SnapKernelInput): SnapKernelOutput {
  function detectPixelSize(grid: RgbaGrid): number {
    const { width, height, data } = grid;
    const lum = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const o = i * 4;
      lum[i] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
    }

    const spacing = new Array<number>(Math.max(width, height)).fill(0);
    const threshold = 24;
    const recordEdges = (line: number[]) => {
      let last = -1;
      for (let i = 1; i < line.length; i++) {
        if (Math.abs(line[i] - line[i - 1]) > threshold) {
          if (last >= 0) {
            const gap = i - last;
            if (gap >= 1 && gap < spacing.length) spacing[gap]++;
          }
          last = i;
        }
      }
    };

    const rowStep = Math.max(1, Math.floor(height / 64));
    for (let y = 0; y < height; y += rowStep) {
      const row: number[] = [];
      for (let x = 0; x < width; x++) row.push(lum[y * width + x]);
      recordEdges(row);
    }
    const colStep = Math.max(1, Math.floor(width / 64));
    for (let x = 0; x < width; x += colStep) {
      const col: number[] = [];
      for (let y = 0; y < height; y++) col.push(lum[y * width + x]);
      recordEdges(col);
    }

    let best = 1;
    let bestCount = 0;
    for (let g = 2; g < spacing.length; g++) {
      if (spacing[g] > bestCount) {
        bestCount = spacing[g];
        best = g;
      }
    }

    if (bestCount < 4) {
      const target = Math.max(width, height) / 128;
      let nearest = 1;
      let nearestDist = Infinity;
      for (const candidate of [2, 4, 8, 16, 32, 64]) {
        const d = Math.abs(candidate - target);
        if (d < nearestDist) {
          nearestDist = d;
          nearest = candidate;
        }
      }
      return nearest;
    }
    return Math.max(1, Math.min(best, 64));
  }

  function downsample(grid: RgbaGrid, pixelSize: number): RgbaGrid {
    const gridW = Math.max(1, Math.ceil(grid.width / pixelSize));
    const gridH = Math.max(1, Math.ceil(grid.height / pixelSize));
    const out = new Uint8ClampedArray(gridW * gridH * 4);

    for (let gy = 0; gy < gridH; gy++) {
      for (let gx = 0; gx < gridW; gx++) {
        const x0 = gx * pixelSize;
        const y0 = gy * pixelSize;
        const x1 = Math.min(grid.width, x0 + pixelSize);
        const y1 = Math.min(grid.height, y0 + pixelSize);
        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        let aSum = 0;
        let count = 0;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const o = (y * grid.width + x) * 4;
            const a = grid.data[o + 3];
            rSum += grid.data[o] * a;
            gSum += grid.data[o + 1] * a;
            bSum += grid.data[o + 2] * a;
            aSum += a;
            count++;
          }
        }
        const o = (gy * gridW + gx) * 4;
        if (aSum > 0) {
          out[o] = Math.round(rSum / aSum);
          out[o + 1] = Math.round(gSum / aSum);
          out[o + 2] = Math.round(bSum / aSum);
        }
        out[o + 3] = count > 0 ? Math.round(aSum / count) : 0;
      }
    }
    return { width: gridW, height: gridH, data: out };
  }

  function medianCut(pixels: number[][], depth: number, maxDepth: number): number[][] {
    if (depth >= maxDepth || pixels.length === 0) {
      if (pixels.length === 0) return [[0, 0, 0]];
      const avg = [0, 0, 0];
      for (const p of pixels) {
        avg[0] += p[0];
        avg[1] += p[1];
        avg[2] += p[2];
      }
      return [[Math.round(avg[0] / pixels.length), Math.round(avg[1] / pixels.length), Math.round(avg[2] / pixels.length)]];
    }
    let rMin = 255;
    let rMax = 0;
    let gMin = 255;
    let gMax = 0;
    let bMin = 255;
    let bMax = 0;
    for (const p of pixels) {
      rMin = Math.min(rMin, p[0]);
      rMax = Math.max(rMax, p[0]);
      gMin = Math.min(gMin, p[1]);
      gMax = Math.max(gMax, p[1]);
      bMin = Math.min(bMin, p[2]);
      bMax = Math.max(bMax, p[2]);
    }
    const rRange = rMax - rMin;
    const gRange = gMax - gMin;
    const bRange = bMax - bMin;
    const channel = rRange >= gRange && rRange >= bRange ? 0 : gRange >= bRange ? 1 : 2;
    pixels.sort((a, b) => a[channel] - b[channel]);
    const mid = Math.floor(pixels.length / 2);
    return [...medianCut(pixels.slice(0, mid), depth + 1, maxDepth), ...medianCut(pixels.slice(mid), depth + 1, maxDepth)];
  }

  function buildPalette(grid: RgbaGrid, colorCount: number, alphaThreshold: number): number[][] {
    const pixels: number[][] = [];
    for (let i = 0; i < grid.width * grid.height; i++) {
      const o = i * 4;
      if (grid.data[o + 3] < alphaThreshold) continue;
      pixels.push([grid.data[o], grid.data[o + 1], grid.data[o + 2]]);
    }
    if (pixels.length === 0) return [[0, 0, 0]];
    const maxDepth = Math.max(1, Math.round(Math.log2(colorCount)));
    const palette = medianCut(pixels, 0, maxDepth);
    const seen = new Set<string>();
    const unique: number[][] = [];
    for (const c of palette) {
      const key = `${c[0]},${c[1]},${c[2]}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(c);
      }
    }
    return unique;
  }

  function nearestColor(r: number, g: number, b: number, palette: number[][]): number[] {
    let best = palette[0];
    let bestDist = Infinity;
    for (const c of palette) {
      const dr = r - c[0];
      const dg = g - c[1];
      const db = b - c[2];
      const dist = dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114;
      if (dist < bestDist) {
        bestDist = dist;
        best = c;
      }
    }
    return best;
  }

  function quantize(grid: RgbaGrid, options: SnapSettings): RgbaGrid {
    const alphaThreshold = options.preserveAlpha ? 8 : 0;
    const palette = buildPalette(grid, options.colors, alphaThreshold);
    const out = new Uint8ClampedArray(grid.data);

    if (options.dither) {
      const work = Float32Array.from(out);
      const { width, height } = grid;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const o = (y * width + x) * 4;
          const nc = nearestColor(work[o], work[o + 1], work[o + 2], palette);
          const errR = work[o] - nc[0];
          const errG = work[o + 1] - nc[1];
          const errB = work[o + 2] - nc[2];
          out[o] = nc[0];
          out[o + 1] = nc[1];
          out[o + 2] = nc[2];
          const spread = (dx: number, dy: number, f: number) => {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) return;
            const no = (ny * width + nx) * 4;
            work[no] += errR * f;
            work[no + 1] += errG * f;
            work[no + 2] += errB * f;
          };
          spread(1, 0, 7 / 16);
          spread(-1, 1, 3 / 16);
          spread(0, 1, 5 / 16);
          spread(1, 1, 1 / 16);
        }
      }
    } else {
      for (let i = 0; i < grid.width * grid.height; i++) {
        const o = i * 4;
        const nc = nearestColor(out[o], out[o + 1], out[o + 2], palette);
        out[o] = nc[0];
        out[o + 1] = nc[1];
        out[o + 2] = nc[2];
      }
    }

    for (let i = 0; i < grid.width * grid.height; i++) {
      const o = i * 4;
      out[o + 3] = options.preserveAlpha ? (out[o + 3] < alphaThreshold ? 0 : 255) : 255;
    }
    return { width: grid.width, height: grid.height, data: out };
  }

  const pixelSize = settings.pixelSize === 'auto' ? detectPixelSize(source) : settings.pixelSize;
  return { grid: quantize(downsample(source, pixelSize), settings), pixelSize };
}
