/**
 * Image resizing and format conversion.
 *
 * The browser canvas handles the common path (PNG/JPEG/WEBP in and out) with no
 * download cost. ImageMagick is compiled to WASM and weighs ~5 MB gzipped, so it
 * is imported on demand only when the canvas cannot do the job — an exotic input
 * format such as TIFF/PSD, or an output format the browser cannot encode.
 */

export type OutputFormat = 'png' | 'jpeg' | 'webp' | 'avif' | 'tiff' | 'bmp' | 'gif';

export type Engine = 'canvas' | 'magick';

export interface FormatInfo {
  value: OutputFormat;
  label: string;
  mime: string;
  ext: string;
  /** Whether a quality setting applies. */
  lossy: boolean;
  /** Canvas can never encode this — always needs ImageMagick. */
  needsMagick: boolean;
}

export const OUTPUT_FORMATS: readonly FormatInfo[] = [
  { value: 'png', label: 'PNG', mime: 'image/png', ext: 'png', lossy: false, needsMagick: false },
  { value: 'jpeg', label: 'JPEG', mime: 'image/jpeg', ext: 'jpg', lossy: true, needsMagick: false },
  { value: 'webp', label: 'WebP', mime: 'image/webp', ext: 'webp', lossy: true, needsMagick: false },
  { value: 'avif', label: 'AVIF', mime: 'image/avif', ext: 'avif', lossy: true, needsMagick: false },
  { value: 'tiff', label: 'TIFF', mime: 'image/tiff', ext: 'tiff', lossy: false, needsMagick: true },
  { value: 'bmp', label: 'BMP', mime: 'image/bmp', ext: 'bmp', lossy: false, needsMagick: true },
  { value: 'gif', label: 'GIF', mime: 'image/gif', ext: 'gif', lossy: false, needsMagick: true },
];

export function formatInfo(format: OutputFormat): FormatInfo {
  const found = OUTPUT_FORMATS.find((f) => f.value === format);
  if (!found) throw new Error(`Unknown output format: ${format}`);
  return found;
}

/* ------------------------------------------------------------------ *
 * Capability probing
 * ------------------------------------------------------------------ */

const encodeSupport = new Map<string, Promise<boolean>>();

/** Whether canvas.toBlob can actually produce this MIME type in this browser. */
export function canCanvasEncode(mime: string): Promise<boolean> {
  const cached = encodeSupport.get(mime);
  if (cached) return cached;
  const probe = new Promise<boolean>((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    try {
      // Browsers silently fall back to PNG for types they cannot encode.
      canvas.toBlob((blob) => resolve(blob != null && blob.type === mime), mime);
    } catch {
      resolve(false);
    }
  });
  encodeSupport.set(mime, probe);
  return probe;
}

/* ------------------------------------------------------------------ *
 * Dimension helpers
 * ------------------------------------------------------------------ */

export interface Dimensions {
  width: number;
  height: number;
}

/** Clamp to at least 1px and round, so a canvas is always allocatable. */
export function normalizeDimensions(width: number, height: number): Dimensions {
  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

/** Height that preserves the source aspect ratio for a given width. */
export function heightForWidth(source: Dimensions, width: number): number {
  return Math.max(1, Math.round((width * source.height) / source.width));
}

/** Width that preserves the source aspect ratio for a given height. */
export function widthForHeight(source: Dimensions, height: number): number {
  return Math.max(1, Math.round((height * source.width) / source.height));
}

/* ------------------------------------------------------------------ *
 * Canvas path
 * ------------------------------------------------------------------ */

/**
 * Draw `source` at the target size.
 *
 * A single drawImage call produces aliased, gritty results when shrinking by a
 * large factor, because the browser samples too few source pixels. Halving
 * repeatedly until within 2x of the target keeps every source pixel contributing,
 * which is the standard fix. Pixel-art mode skips all of it and uses
 * nearest-neighbour so hard edges survive.
 */
export function drawResized(
  source: CanvasImageSource,
  sourceSize: Dimensions,
  target: Dimensions,
  pixelArt: boolean,
): HTMLCanvasElement {
  const output = document.createElement('canvas');
  output.width = target.width;
  output.height = target.height;
  const ctx = output.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  if (pixelArt) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, 0, 0, target.width, target.height);
    return output;
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  let current: CanvasImageSource = source;
  let currentWidth = sourceSize.width;
  let currentHeight = sourceSize.height;

  while (currentWidth > target.width * 2 && currentHeight > target.height * 2) {
    const stepWidth = Math.max(target.width, Math.floor(currentWidth / 2));
    const stepHeight = Math.max(target.height, Math.floor(currentHeight / 2));
    const step = document.createElement('canvas');
    step.width = stepWidth;
    step.height = stepHeight;
    const stepCtx = step.getContext('2d');
    if (!stepCtx) break;
    stepCtx.imageSmoothingEnabled = true;
    stepCtx.imageSmoothingQuality = 'high';
    stepCtx.drawImage(current, 0, 0, stepWidth, stepHeight);
    current = step;
    currentWidth = stepWidth;
    currentHeight = stepHeight;
  }

  ctx.drawImage(current, 0, 0, target.width, target.height);
  return output;
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error(`Could not encode ${mime}`))),
      mime,
      quality,
    );
  });
}

/** Decode via the browser. Returns null when the browser cannot read the format. */
async function decodeWithBrowser(file: File): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(file);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * ImageMagick path (lazy)
 * ------------------------------------------------------------------ */

type MagickModule = typeof import('@imagemagick/magick-wasm');

let magickPromise: Promise<MagickModule> | null = null;

/** True once the engine is in memory, so the UI can stop warning about the download. */
export function isMagickLoaded(): boolean {
  return magickPromise !== null;
}

/**
 * Resolve a bundler-emitted asset path.
 *
 * The two environments disagree, so both are handled:
 *  - Production emits a path relative to the chunk that references it
 *    (`./magick-<hash>.wasm` inside `/assets/`), which only resolves correctly
 *    against `import.meta.url`.
 *  - Bun's dev server emits a root-absolute `/_bun/asset/...` path but reports
 *    `import.meta.url` as a `file://` URL, which would produce a `file://` asset
 *    URL and fail.
 */
function resolveAssetUrl(path: string): URL {
  const base = import.meta.url.startsWith('http') ? import.meta.url : location.href;
  return new URL(path, base);
}

/** Import and initialise ImageMagick, at most once per page. */
export function loadMagick(): Promise<MagickModule> {
  if (!magickPromise) {
    magickPromise = (async () => {
      const [mod, wasm] = await Promise.all([
        import('@imagemagick/magick-wasm'),
        import('@imagemagick/magick-wasm/magick.wasm'),
      ]);
      const response = await fetch(resolveAssetUrl(wasm.default));
      if (!response.ok) throw new Error(`Could not fetch the ImageMagick engine (${response.status})`);
      await mod.initializeImageMagick(new Uint8Array(await response.arrayBuffer()));
      return mod;
    })().catch((error: unknown) => {
      // Allow a later retry rather than caching a permanent failure.
      magickPromise = null;
      throw error;
    });
  }
  return magickPromise;
}

function magickFormatFor(magick: MagickModule, format: OutputFormat) {
  const formats = magick.MagickFormat;
  const map = {
    png: formats.Png,
    jpeg: formats.Jpeg,
    webp: formats.WebP,
    avif: formats.Avif,
    tiff: formats.Tiff,
    bmp: formats.Bmp,
    gif: formats.Gif,
  } as const;
  return map[format];
}

async function convertWithMagick(
  file: File,
  target: Dimensions | null,
  format: OutputFormat,
  quality: number,
  pixelArt: boolean,
): Promise<{ blob: Blob; size: Dimensions }> {
  const magick = await loadMagick();
  const input = new Uint8Array(await file.arrayBuffer());
  const info = formatInfo(format);

  return magick.ImageMagick.read(input, (image) => {
    if (target && (target.width !== image.width || target.height !== image.height)) {
      // Point sampling preserves hard pixel edges; Lanczos is the best general resample.
      image.resize(
        target.width,
        target.height,
        pixelArt ? magick.FilterType.Point : magick.FilterType.Lanczos,
      );
    }
    if (info.lossy) image.quality = Math.round(quality * 100);

    const size = { width: image.width, height: image.height };
    return image.write(magickFormatFor(magick, format), (data) => ({
      // Copy: the view points at wasm memory that is reused after this callback.
      blob: new Blob([new Uint8Array(data)], { type: info.mime }),
      size,
    }));
  });
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

export interface SourceImage {
  file: File;
  size: Dimensions;
  /** Object URL for previewing the original; caller revokes it. */
  previewUrl: string;
  /** Null when only ImageMagick could decode this file. */
  bitmap: ImageBitmap | null;
}

/** Read a file far enough to report its dimensions, using ImageMagick if needed. */
export async function readSource(file: File): Promise<SourceImage> {
  const bitmap = await decodeWithBrowser(file);
  if (bitmap) {
    return {
      file,
      size: { width: bitmap.width, height: bitmap.height },
      previewUrl: URL.createObjectURL(file),
      bitmap,
    };
  }

  // Browser cannot decode it (TIFF, PSD, TGA...). Ask ImageMagick for the size and
  // transcode a PNG preview the browser can display.
  const magick = await loadMagick();
  const input = new Uint8Array(await file.arrayBuffer());
  const { size, preview } = magick.ImageMagick.read(input, (image) => ({
    size: { width: image.width, height: image.height },
    preview: image.write(
      magick.MagickFormat.Png,
      (data) => new Blob([new Uint8Array(data)], { type: 'image/png' }),
    ),
  }));

  return { file, size, previewUrl: URL.createObjectURL(preview), bitmap: null };
}

export interface ConvertRequest {
  source: SourceImage;
  target: Dimensions;
  format: OutputFormat;
  /** 0..1, applied to lossy formats only. */
  quality: number;
  pixelArt: boolean;
}

export interface ConvertResult {
  blob: Blob;
  size: Dimensions;
  engine: Engine;
}

/**
 * Resize and convert, choosing the cheapest engine that can do the job.
 *
 * Canvas is used whenever the browser both decoded the input and can encode the
 * requested output; otherwise ImageMagick is loaded on demand.
 */
export async function convertImage(request: ConvertRequest): Promise<ConvertResult> {
  const { source, format, quality, pixelArt } = request;
  const target = normalizeDimensions(request.target.width, request.target.height);
  const info = formatInfo(format);

  const canvasCanEncode = info.needsMagick ? false : await canCanvasEncode(info.mime);

  if (source.bitmap && canvasCanEncode) {
    const canvas = drawResized(source.bitmap, source.size, target, pixelArt);
    const blob = await canvasToBlob(canvas, info.mime, quality);
    return { blob, size: target, engine: 'canvas' };
  }

  const { blob, size } = await convertWithMagick(source.file, target, format, quality, pixelArt);
  return { blob, size, engine: 'magick' };
}

/** Human-readable byte size, e.g. "1.4 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
