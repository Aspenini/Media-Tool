export type ColorMatching = 'euclidean' | 'perceptual' | 'manhattan';
export type DitheringMode = 'none' | 'floyd-steinberg' | 'ordered' | 'atkinson';

export interface PaletteDef {
  id: string;
  label: string;
  colors: string[];
}

function randomColors(count: number): string[] {
  return Array.from({ length: count }, () => {
    const r = Math.floor(Math.random() * 256);
    const g = Math.floor(Math.random() * 256);
    const b = Math.floor(Math.random() * 256);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  });
}

const BASE_16 = [
  '#000000', '#0000AA', '#00AA00', '#00AAAA', '#AA0000', '#AA00AA', '#AA5500', '#AAAAAA',
  '#555555', '#5555FF', '#55FF55', '#55FFFF', '#FF5555', '#FF55FF', '#FFFF55', '#FFFFFF',
];

const PICO8 = [
  '#000000', '#1D2B53', '#7E2553', '#008751', '#AB5236', '#5F574F', '#C2C3C7', '#FFF1E8',
  '#FF004D', '#FFA300', '#FFEC27', '#00E756', '#29ADFF', '#83769C', '#FF77A8', '#FFCCAA',
];

export const PALETTES: PaletteDef[] = [
  { id: '8bit', label: '8-bit (256 colors) - Classic PC gaming', colors: [...BASE_16, ...randomColors(240)] },
  { id: '16bit', label: '16-bit (16 colors) - PICO-8 style', colors: PICO8 },
  {
    id: 'nes',
    label: 'NES (54 colors) - Nintendo Entertainment System',
    colors: ['#000000', '#FFFFFF', '#7C7C7C', '#BCBCBC', '#880000', '#A80000', '#F83800', '#F83800', ...Array(46).fill('#F83800')],
  },
  { id: 'gameboy', label: 'Game Boy (4 colors) - Classic monochrome', colors: ['#0F380F', '#306230', '#8BAC0F', '#9BBC0F'] },
  { id: 'cga', label: 'CGA (4 colors) - Early PC graphics', colors: ['#000000', '#00AA00', '#AA0000', '#AAAA00'] },
  { id: 'ega', label: 'EGA (16 colors) - Enhanced Graphics Adapter', colors: BASE_16 },
  { id: 'vga', label: 'VGA (256 colors) - Video Graphics Array', colors: [...BASE_16, ...randomColors(240)] },
  {
    id: 'dawnbringer16',
    label: 'DawnBringer 16 - Popular pixel art palette',
    colors: ['#140c1c', '#442434', '#30346d', '#4e4a4e', '#854c30', '#346856', '#d04648', '#757161', '#597dce', '#d27d2c', '#8595a1', '#6daa2c', '#d2aa99', '#6dc2ca', '#dad45e', '#deeed6'],
  },
  { id: 'pico8', label: 'PICO-8 (16 colors) - Fantasy console palette', colors: PICO8 },
  {
    id: 'aap64',
    label: 'AAP-64 - 64-color palette',
    colors: [
      '#000000', '#1A1A1A', '#2A2A2A', '#3A3A3A', '#4A4A4A', '#5A5A5A', '#6A6A6A', '#7A7A7A',
      '#8A8A8A', '#9A9A9A', '#AAAAAA', '#BABABA', '#CACACA', '#DADADA', '#EAEAEA', '#FFFFFF',
      '#000055', '#0000AA', '#0000FF', '#005500', '#005555', '#0055AA', '#0055FF', '#00AA00',
      '#00AA55', '#00AAAA', '#00AAFF', '#00FF00', '#00FF55', '#00FFAA', '#00FFFF', '#550000',
      '#550055', '#5500AA', '#5500FF', '#555500', '#555555', '#5555AA', '#5555FF', '#55AA00',
      '#55AA55', '#55AAAA', '#55AAFF', '#55FF00', '#55FF55', '#55FFAA', '#55FFFF', '#AA0000',
      '#AA0055', '#AA00AA', '#AA00FF', '#AA5500', '#AA5555', '#AA55AA', '#AA55FF', '#AAAA00',
      '#AAAA55', '#AAAAAA', '#AAAAFF', '#AAFF00', '#AAFF55', '#AAFFAA', '#AAFFFF', '#FF0000',
    ],
  },
  {
    id: 'arnes16',
    label: "Arne's 16 - 16-color pixel art palette",
    colors: ['#000000', '#9D9D9D', '#FFFFFF', '#BE2633', '#E06F8B', '#493C2B', '#A46422', '#EB8931', '#F7E26B', '#A3E04D', '#2B3F4F', '#44891A', '#A3AAAE', '#C3D64D', '#FF9D3C', '#D4CC9E'],
  },
];

export function getPalette(id: string): PaletteDef {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

function findClosestColor(r: number, g: number, b: number, palette: Rgb[], method: ColorMatching): Rgb {
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

function clamp(v: number): number {
  return Math.max(0, Math.min(255, v));
}

function applyFloydSteinberg(data: Uint8ClampedArray, width: number, height: number, palette: Rgb[]): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const oldR = data[idx];
      const oldG = data[idx + 1];
      const oldB = data[idx + 2];
      const nc = findClosestColor(oldR, oldG, oldB, palette, 'euclidean');
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

const BAYER_4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

function applyOrdered(data: Uint8ClampedArray, width: number, height: number, palette: Rgb[]): void {
  const amount = 32;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const t = (BAYER_4[y % 4][x % 4] / 16 - 0.5) * amount;
      const nc = findClosestColor(clamp(data[idx] + t), clamp(data[idx + 1] + t), clamp(data[idx + 2] + t), palette, 'euclidean');
      data[idx] = nc.r;
      data[idx + 1] = nc.g;
      data[idx + 2] = nc.b;
    }
  }
}

function applyAtkinson(data: Uint8ClampedArray, width: number, height: number, palette: Rgb[]): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const oldR = data[idx];
      const oldG = data[idx + 1];
      const oldB = data[idx + 2];
      const nc = findClosestColor(oldR, oldG, oldB, palette, 'euclidean');
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

export interface PaletteRenderResult {
  width: number;
  height: number;
  imageData: ImageData;
}

/** Render an image through a palette + dithering, returning ImageData (max 400px). */
export function renderPalette(
  img: HTMLImageElement,
  paletteId: string,
  dithering: DitheringMode,
  matching: ColorMatching,
): PaletteRenderResult {
  const palette = getPalette(paletteId).colors.map(hexToRgb);
  const maxSize = 400;
  const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
  const width = Math.max(1, Math.floor(img.width * scale));
  const height = Math.max(1, Math.floor(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, width, height);
  const source = ctx.getImageData(0, 0, width, height);
  const data = source.data;

  if (dithering === 'floyd-steinberg') {
    applyFloydSteinberg(data, width, height, palette);
  } else if (dithering === 'ordered') {
    applyOrdered(data, width, height, palette);
  } else if (dithering === 'atkinson') {
    applyAtkinson(data, width, height, palette);
  } else {
    for (let i = 0; i < data.length; i += 4) {
      const nc = findClosestColor(data[i], data[i + 1], data[i + 2], palette, matching);
      data[i] = nc.r;
      data[i + 1] = nc.g;
      data[i + 2] = nc.b;
    }
  }

  return { width, height, imageData: source };
}
