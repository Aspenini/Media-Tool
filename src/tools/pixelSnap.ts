import { showNotification } from '../ui/notification.js';

type PotMode = 'balanced' | 'up' | 'down' | 'grid-safe';

interface SnapSettings {
  pixelSize: number | 'auto';
  colors: number;
  potMode: PotMode;
  targetSize: number | 'auto';
  preserveAlpha: boolean;
  dither: boolean;
  square: boolean;
}

interface RgbaGrid {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

let snapImage: HTMLImageElement | null = null;
let snapFileName = 'image';
let lastOutputSize: { w: number; h: number } | null = null;

const POT_SIZES = [16, 32, 64, 128, 256, 512, 1024, 2048, 4096];

function readSettings(): SnapSettings {
  const pixelSizeRaw = (document.getElementById('snapPixelSize') as HTMLSelectElement)?.value || 'auto';
  const colors = parseInt((document.getElementById('snapColors') as HTMLSelectElement)?.value || '16', 10);
  const potMode = ((document.getElementById('snapPotMode') as HTMLSelectElement)?.value || 'balanced') as PotMode;
  const targetSizeRaw = (document.getElementById('snapOutputSize') as HTMLSelectElement)?.value || 'auto';
  const preserveAlpha = (document.getElementById('snapPreserveAlpha') as HTMLInputElement)?.checked ?? true;
  const dither = (document.getElementById('snapDither') as HTMLInputElement)?.checked ?? false;
  const square = (document.getElementById('snapSquare') as HTMLInputElement)?.checked ?? false;

  return {
    pixelSize: pixelSizeRaw === 'auto' ? 'auto' : parseInt(pixelSizeRaw, 10),
    colors: Number.isFinite(colors) ? colors : 16,
    potMode,
    targetSize: targetSizeRaw === 'auto' ? 'auto' : parseInt(targetSizeRaw, 10),
    preserveAlpha,
    dither,
    square,
  };
}

function getSourceGrid(img: HTMLImageElement): RgbaGrid {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  return { width: img.width, height: img.height, data: imageData.data };
}

/**
 * Detect the most likely "fake pixel" size by looking at the spacing between
 * strong luminance edges. Falls back to a sensible value when no grid is found.
 */
function detectPixelSize(grid: RgbaGrid): number {
  const { width, height, data } = grid;
  const lum = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    lum[i] = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
  }

  const spacing = new Array(Math.max(width, height)).fill(0);
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

/** Area-average downsample into a (gridW x gridH) RGBA grid, alpha-weighted. */
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
          // Weight color by alpha so transparent pixels don't pollute the color.
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
      } else {
        out[o] = out[o + 1] = out[o + 2] = 0;
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

  let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
  for (const p of pixels) {
    rMin = Math.min(rMin, p[0]); rMax = Math.max(rMax, p[0]);
    gMin = Math.min(gMin, p[1]); gMax = Math.max(gMax, p[1]);
    bMin = Math.min(bMin, p[2]); bMax = Math.max(bMax, p[2]);
  }

  const rRange = rMax - rMin;
  const gRange = gMax - gMin;
  const bRange = bMax - bMin;
  const channel = rRange >= gRange && rRange >= bRange ? 0 : gRange >= bRange ? 1 : 2;

  pixels.sort((a, b) => a[channel] - b[channel]);
  const mid = Math.floor(pixels.length / 2);

  return [
    ...medianCut(pixels.slice(0, mid), depth + 1, maxDepth),
    ...medianCut(pixels.slice(mid), depth + 1, maxDepth),
  ];
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
  // Dedupe identical entries.
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

function quantize(grid: RgbaGrid, settings: SnapSettings): RgbaGrid {
  const alphaThreshold = settings.preserveAlpha ? 8 : 0;
  const palette = buildPalette(grid, settings.colors, alphaThreshold);
  const out = new Uint8ClampedArray(grid.data);

  if (settings.dither) {
    // Floyd-Steinberg over the small grid.
    const work = Float32Array.from(out);
    const { width, height } = grid;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const o = (y * width + x) * 4;
        const oldR = work[o];
        const oldG = work[o + 1];
        const oldB = work[o + 2];
        const nc = nearestColor(oldR, oldG, oldB, palette);
        out[o] = nc[0];
        out[o + 1] = nc[1];
        out[o + 2] = nc[2];
        const errR = oldR - nc[0];
        const errG = oldG - nc[1];
        const errB = oldB - nc[2];
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

  // Alpha cleanup: snap to fully opaque/transparent when preserving alpha.
  for (let i = 0; i < grid.width * grid.height; i++) {
    const o = i * 4;
    if (settings.preserveAlpha) {
      out[o + 3] = out[o + 3] < alphaThreshold ? 0 : 255;
    } else {
      out[o + 3] = 255;
    }
  }

  return { width: grid.width, height: grid.height, data: out };
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
  let result: number;
  switch (mode) {
    case 'up':
      result = ceilPot(value);
      break;
    case 'down':
      result = floorPot(value);
      break;
    case 'grid-safe': {
      // Nearest POT, then ensure it divides cleanly by the grid step.
      result = nearestPot(value);
      if (gridStep && gridStep > 0) {
        while (result > POT_SIZES[0] && result % gridStep !== 0) {
          result = floorPot(result - 1);
        }
        if (result % gridStep !== 0) result = nearestPot(value);
      }
      break;
    }
    case 'balanced':
    default:
      result = nearestPot(value);
  }
  return result;
}

function gridToCanvas(grid: RgbaGrid): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = grid.width;
  canvas.height = grid.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(grid.data), grid.width, grid.height), 0, 0);
  return canvas;
}

function process(): void {
  if (!snapImage) return;
  const settings = readSettings();

  const source = getSourceGrid(snapImage);
  const pixelSize = settings.pixelSize === 'auto' ? detectPixelSize(source) : settings.pixelSize;

  const small = downsample(source, pixelSize);
  const quantized = quantize(small, settings);

  // Decide power-of-two output size.
  let outW: number;
  let outH: number;

  if (settings.targetSize !== 'auto') {
    // Pin the longest side to the chosen target, scale the other side to keep
    // aspect ratio, then snap both to the nearest power-of-two.
    const longest = Math.max(source.width, source.height) || 1;
    const scale = settings.targetSize / longest;
    outW = nearestPot(source.width * scale);
    outH = nearestPot(source.height * scale);
  } else {
    outW = chooseDimension(source.width, settings.potMode, settings.potMode === 'grid-safe' ? small.width : undefined);
    outH = chooseDimension(source.height, settings.potMode, settings.potMode === 'grid-safe' ? small.height : undefined);
  }

  if (settings.square) {
    const s = settings.targetSize !== 'auto' ? settings.targetSize : Math.max(outW, outH);
    outW = s;
    outH = s;
  }

  lastOutputSize = { w: outW, h: outH };

  const smallCanvas = gridToCanvas(quantized);

  const outCanvas = document.getElementById('snapAfterCanvas') as HTMLCanvasElement;
  const outCtx = outCanvas.getContext('2d')!;
  outCanvas.width = outW;
  outCanvas.height = outH;
  outCtx.imageSmoothingEnabled = false;
  outCtx.clearRect(0, 0, outW, outH);
  outCtx.drawImage(smallCanvas, 0, 0, outW, outH);

  // Show the original (capped for display) on the before canvas.
  const beforeCanvas = document.getElementById('snapBeforeCanvas') as HTMLCanvasElement;
  const beforeCtx = beforeCanvas.getContext('2d')!;
  beforeCanvas.width = source.width;
  beforeCanvas.height = source.height;
  beforeCtx.imageSmoothingEnabled = false;
  beforeCtx.drawImage(snapImage, 0, 0);

  const info = document.getElementById('snapInfo');
  if (info) {
    info.textContent =
      `Pixel size: ${pixelSize}px${settings.pixelSize === 'auto' ? ' (auto)' : ''}  •  ` +
      `Internal grid: ${small.width}×${small.height}  •  ` +
      `Colors: ${settings.colors}  •  ` +
      `Output: ${outW}×${outH}${settings.targetSize !== 'auto' ? ' (target)' : ''}`;
  }

  outCanvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.getElementById('snapDownload') as HTMLAnchorElement;
    if (link) {
      if (link.dataset.previousUrl) URL.revokeObjectURL(link.dataset.previousUrl);
      link.href = url;
      link.dataset.previousUrl = url;
      link.download = `${snapFileName}_snapped_${outW}x${outH}_${settings.colors}c.png`;
      link.style.display = 'inline-block';
    }
  }, 'image/png');
}

function loadFile(file: File): void {
  if (!file.type.startsWith('image/')) {
    showNotification('Please select a valid image file.', 'error');
    return;
  }
  snapFileName = file.name.replace(/\.[^/.]+$/, '') || 'image';
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      snapImage = img;
      const settings = document.getElementById('snapSettings');
      const comparison = document.getElementById('snapComparison');
      if (settings) settings.style.display = 'block';
      if (comparison) comparison.style.display = 'block';
      process();
      showNotification('Image loaded. Adjust settings and re-convert as needed.', 'success');
    };
    img.onerror = () => showNotification('Could not load that image.', 'error');
    img.src = (ev.target?.result as string) ?? '';
  };
  reader.readAsDataURL(file);
}

export function initPixelSnap(): void {
  const fileInput = document.getElementById('snapInput') as HTMLInputElement | null;
  const dropZone = document.getElementById('snapDropZone');
  const convertBtn = document.querySelector<HTMLButtonElement>('[data-snap-convert]');
  const clearBtn = document.querySelector<HTMLButtonElement>('[data-snap-clear]');
  if (!fileInput) return;

  fileInput.addEventListener('change', (e) => {
    const files = (e.target as HTMLInputElement).files;
    if (files?.length) loadFile(files[0]);
  });

  if (dropZone) {
    ['dragenter', 'dragover'].forEach((evt) =>
      dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropZone.classList.add('snap-dropzone-active');
      })
    );
    ['dragleave', 'drop'].forEach((evt) =>
      dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropZone.classList.remove('snap-dropzone-active');
      })
    );
    dropZone.addEventListener('drop', (e) => {
      const dt = (e as DragEvent).dataTransfer;
      if (dt?.files?.length) loadFile(dt.files[0]);
    });
    dropZone.addEventListener('click', () => fileInput.click());
  }

  ['snapPixelSize', 'snapColors', 'snapPotMode', 'snapOutputSize'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', () => {
      if (snapImage) process();
    });
  });
  ['snapPreserveAlpha', 'snapDither', 'snapSquare'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', () => {
      if (snapImage) process();
    });
  });

  convertBtn?.addEventListener('click', () => {
    if (!snapImage) {
      showNotification('Drop or select an image first.', 'error');
      return;
    }
    process();
    showNotification(
      lastOutputSize ? `Converted to ${lastOutputSize.w}×${lastOutputSize.h}.` : 'Converted.',
      'success'
    );
  });

  clearBtn?.addEventListener('click', () => {
    snapImage = null;
    if (fileInput) fileInput.value = '';
    const settings = document.getElementById('snapSettings');
    const comparison = document.getElementById('snapComparison');
    if (settings) settings.style.display = 'none';
    if (comparison) comparison.style.display = 'none';
    const link = document.getElementById('snapDownload') as HTMLAnchorElement;
    if (link) {
      if (link.dataset.previousUrl) URL.revokeObjectURL(link.dataset.previousUrl);
      link.style.display = 'none';
    }
    showNotification('Image cleared.', 'success');
  });
}
