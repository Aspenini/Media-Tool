import type { ColorMatching, DitheringMode } from './palette';

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface PaletteKernelInput {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  palette: Rgb[];
  dithering: DitheringMode;
  matching: ColorMatching;
}

/**
 * Map every pixel onto the palette, optionally dithering.
 *
 * Everything it uses is nested inside on purpose — `runOffThread` rebuilds this
 * function from its own source inside a worker, where module scope doesn't exist.
 */
export function paletteKernel({ data, width, height, palette, dithering, matching }: PaletteKernelInput): Uint8ClampedArray {
  function findClosestColor(r: number, g: number, b: number, method: ColorMatching): Rgb {
    let closest = palette[0];
    let min = Infinity;
    for (const c of palette) {
      let distance: number;
      switch (method) {
        case 'manhattan':
          distance = Math.abs(r - c.r) + Math.abs(g - c.g) + Math.abs(b - c.b);
          break;
        case 'perceptual': {
          const dr = r - c.r;
          const dg = g - c.g;
          const db = b - c.b;
          distance = Math.sqrt(dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114);
          break;
        }
        default:
          distance = Math.sqrt((r - c.r) ** 2 + (g - c.g) ** 2 + (b - c.b) ** 2);
      }
      if (distance < min) {
        min = distance;
        closest = c;
      }
    }
    return closest;
  }

  const clamp = (v: number) => Math.max(0, Math.min(255, v));

  function applyFloydSteinberg(): void {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const oldR = data[idx];
        const oldG = data[idx + 1];
        const oldB = data[idx + 2];
        const nc = findClosestColor(oldR, oldG, oldB, 'euclidean');
        data[idx] = nc.r;
        data[idx + 1] = nc.g;
        data[idx + 2] = nc.b;
        const errR = oldR - nc.r;
        const errG = oldG - nc.g;
        const errB = oldB - nc.b;
        const spread = (nx: number, ny: number, f: number) => {
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) return;
          const o = (ny * width + nx) * 4;
          data[o] = clamp(data[o] + errR * f);
          data[o + 1] = clamp(data[o + 1] + errG * f);
          data[o + 2] = clamp(data[o + 2] + errB * f);
        };
        spread(x + 1, y, 7 / 16);
        spread(x - 1, y + 1, 3 / 16);
        spread(x, y + 1, 5 / 16);
        spread(x + 1, y + 1, 1 / 16);
      }
    }
  }

  function applyOrdered(): void {
    const bayer = [
      [0, 8, 2, 10],
      [12, 4, 14, 6],
      [3, 11, 1, 9],
      [15, 7, 13, 5],
    ];
    const amount = 32;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const t = (bayer[y % 4][x % 4] / 16 - 0.5) * amount;
        const nc = findClosestColor(clamp(data[idx] + t), clamp(data[idx + 1] + t), clamp(data[idx + 2] + t), 'euclidean');
        data[idx] = nc.r;
        data[idx + 1] = nc.g;
        data[idx + 2] = nc.b;
      }
    }
  }

  function applyAtkinson(): void {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const oldR = data[idx];
        const oldG = data[idx + 1];
        const oldB = data[idx + 2];
        const nc = findClosestColor(oldR, oldG, oldB, 'euclidean');
        data[idx] = nc.r;
        data[idx + 1] = nc.g;
        data[idx + 2] = nc.b;
        const errR = (oldR - nc.r) / 8;
        const errG = (oldG - nc.g) / 8;
        const errB = (oldB - nc.b) / 8;
        const spread = (nx: number, ny: number) => {
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) return;
          const o = (ny * width + nx) * 4;
          data[o] = clamp(data[o] + errR);
          data[o + 1] = clamp(data[o + 1] + errG);
          data[o + 2] = clamp(data[o + 2] + errB);
        };
        spread(x + 1, y);
        spread(x + 2, y);
        spread(x - 1, y + 1);
        spread(x, y + 1);
        spread(x + 1, y + 1);
        spread(x, y + 2);
      }
    }
  }

  if (dithering === 'floyd-steinberg') applyFloydSteinberg();
  else if (dithering === 'ordered') applyOrdered();
  else if (dithering === 'atkinson') applyAtkinson();
  else {
    for (let i = 0; i < data.length; i += 4) {
      const nc = findClosestColor(data[i], data[i + 1], data[i + 2], matching);
      data[i] = nc.r;
      data[i + 1] = nc.g;
      data[i + 2] = nc.b;
    }
  }

  return data;
}
