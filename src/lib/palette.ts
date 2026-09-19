import { runOffThread } from './offThread';
import { paletteKernel, type Rgb } from './paletteKernel';

export type ColorMatching = 'euclidean' | 'perceptual' | 'manhattan';
export type DitheringMode = 'none' | 'floyd-steinberg' | 'ordered' | 'atkinson';

export interface PaletteDef {
  id: string;
  label: string;
  colors: string[];
}

const hex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

/** 3-3-2 RGB: the classic "8-bit color" — 8 levels of red and green, 4 of blue. */
const RGB_332: string[] = Array.from({ length: 256 }, (_, i) => hex(((i >> 5) & 7) * (255 / 7), ((i >> 2) & 7) * (255 / 7), (i & 3) * (255 / 3)));

/** VGA DAC values are 6-bit (0–63); scale to 8-bit. */
const dac = (v: number) => Math.round((v * 255) / 63);

/**
 * The IBM VGA BIOS default 256-color palette (mode 13h): the 16 EGA colors, a
 * 16-step gray ramp, then 9 groups of 24 hues (3 intensities × 3 saturations),
 * and 8 blacks.
 */
function vgaDefaultPalette(): string[] {
  const colors: string[] = [...BASE_16];
  const grays = [0, 5, 8, 11, 14, 17, 20, 24, 28, 32, 36, 40, 45, 50, 56, 63];
  for (const g of grays) colors.push(hex(dac(g), dac(g), dac(g)));
  // Five component levels per intensity/saturation group, from min to max.
  const groups = [
    [0, 16, 31, 47, 63], [31, 39, 47, 55, 63], [45, 49, 54, 58, 63],
    [0, 7, 14, 21, 28], [14, 17, 21, 24, 28], [20, 22, 24, 26, 28],
    [0, 4, 8, 12, 16], [8, 10, 12, 14, 16], [11, 12, 13, 15, 16],
  ];
  // Hue wheel as (r, g, b) indexes into the level list: blue → red → green → blue.
  const wheel = [
    [0, 0, 4], [1, 0, 4], [2, 0, 4], [3, 0, 4], [4, 0, 4], [4, 0, 3], [4, 0, 2], [4, 0, 1],
    [4, 0, 0], [4, 1, 0], [4, 2, 0], [4, 3, 0], [4, 4, 0], [3, 4, 0], [2, 4, 0], [1, 4, 0],
    [0, 4, 0], [0, 4, 1], [0, 4, 2], [0, 4, 3], [0, 4, 4], [0, 3, 4], [0, 2, 4], [0, 1, 4],
  ];
  for (const levels of groups) {
    for (const [r, g, b] of wheel) colors.push(hex(dac(levels[r]), dac(levels[g]), dac(levels[b])));
  }
  while (colors.length < 256) colors.push('#000000');
  return colors;
}

/** The widely used NES (2C02) palette, with its duplicate blacks removed. */
const NES = [
  '#7C7C7C', '#0000FC', '#0000BC', '#4428BC', '#940084', '#A80020', '#A81000', '#881400',
  '#503000', '#007800', '#006800', '#005800', '#004058', '#000000',
  '#BCBCBC', '#0078F8', '#0058F8', '#6844FC', '#D800CC', '#E40058', '#F83800', '#E45C10',
  '#AC7C00', '#00B800', '#00A800', '#00A844', '#008888',
  '#F8F8F8', '#3CBCFC', '#6888FC', '#9878F8', '#F878F8', '#F85898', '#F87858', '#FCA044',
  '#F8B800', '#B8F818', '#58D854', '#58F898', '#00E8D8', '#787878',
  '#FCFCFC', '#A4E4FC', '#B8B8F8', '#D8B8F8', '#F8B8F8', '#F8A4C0', '#F0D0B0', '#FCE0A8',
  '#F8D878', '#D8F878', '#B8F8B8', '#B8F8D8', '#00FCFC', '#F8D8F8',
];

const BASE_16 = [
  '#000000', '#0000AA', '#00AA00', '#00AAAA', '#AA0000', '#AA00AA', '#AA5500', '#AAAAAA',
  '#555555', '#5555FF', '#55FF55', '#55FFFF', '#FF5555', '#FF55FF', '#FFFF55', '#FFFFFF',
];

const PICO8 = [
  '#000000', '#1D2B53', '#7E2553', '#008751', '#AB5236', '#5F574F', '#C2C3C7', '#FFF1E8',
  '#FF004D', '#FFA300', '#FFEC27', '#00E756', '#29ADFF', '#83769C', '#FF77A8', '#FFCCAA',
];

export const PALETTES: PaletteDef[] = [
  { id: '8bit', label: '8-bit (256 colors) - 3-3-2 RGB', colors: RGB_332 },
  { id: '16bit', label: '16-bit (16 colors) - PICO-8 style', colors: PICO8 },
  {
    id: 'nes',
    label: `NES (${NES.length} colors) - Nintendo Entertainment System`,
    colors: NES,
  },
  { id: 'gameboy', label: 'Game Boy (4 colors) - Classic monochrome', colors: ['#0F380F', '#306230', '#8BAC0F', '#9BBC0F'] },
  { id: 'cga', label: 'CGA (4 colors) - Palette 0, low intensity', colors: ['#000000', '#00AA00', '#AA0000', '#AA5500'] },
  { id: 'ega', label: 'EGA (16 colors) - Enhanced Graphics Adapter', colors: BASE_16 },
  { id: 'vga', label: 'VGA (256 colors) - IBM BIOS default palette', colors: vgaDefaultPalette() },
  {
    id: 'dawnbringer16',
    label: 'DawnBringer 16 - Popular pixel art palette',
    colors: ['#140c1c', '#442434', '#30346d', '#4e4a4e', '#854c30', '#346856', '#d04648', '#757161', '#597dce', '#d27d2c', '#8595a1', '#6daa2c', '#d2aa99', '#6dc2ca', '#dad45e', '#deeed6'],
  },
  { id: 'pico8', label: 'PICO-8 (16 colors) - Fantasy console palette', colors: PICO8 },
  {
    id: 'aap64',
    label: 'RGB 64 - Gray ramp + 4-level RGB',
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

function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

export interface PaletteRenderResult {
  width: number;
  height: number;
  imageData: ImageData;
}

/** Render an image through a palette + dithering, returning ImageData (max 400px). The mapping runs in a worker. */
export async function renderPalette(
  img: HTMLImageElement,
  paletteId: string,
  dithering: DitheringMode,
  matching: ColorMatching,
): Promise<PaletteRenderResult> {
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

  const mapped = await runOffThread(paletteKernel, { data, width, height, palette, dithering, matching });
  if (mapped !== data) source.data.set(mapped);

  return { width, height, imageData: source };
}
