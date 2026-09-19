/**
 * Batch resizing: turn one set of settings into a per-image output size, then
 * render and encode each image (rotation, padding onto a background, and an
 * optional target file size included).
 */
import {
  canCanvasEncode,
  canvasToBlob,
  convertImage,
  convertWithMagick,
  drawResized,
  formatInfo,
  normalizeDimensions,
  type Dimensions,
  type Engine,
  type OutputFormat,
  type SourceImage,
} from './imageResize';

export type ResizeMode = 'size' | 'percent' | 'preset';
/** What happens when the requested box has a different shape than the image. */
export type FitMode = 'stretch' | 'pad' | 'crop';
export type Rotation = 0 | 90 | 180 | 270;

export interface ResizeSettings {
  mode: ResizeMode;
  /** `size` mode; either may be blank. */
  width: number | null;
  height: number | null;
  lockAspect: boolean;
  /** `percent` mode. */
  percent: number;
  /** `preset` mode box. */
  preset: Dimensions | null;
  fit: FitMode;
}

export interface SocialPreset {
  id: string;
  label: string;
  size: Dimensions;
}

export const SOCIAL_PRESETS: SocialPreset[] = [
  { id: 'ig-post', label: 'Instagram post', size: { width: 1080, height: 1080 } },
  { id: 'ig-portrait', label: 'Instagram portrait', size: { width: 1080, height: 1350 } },
  { id: 'ig-story', label: 'Instagram / TikTok story', size: { width: 1080, height: 1920 } },
  { id: 'x-post', label: 'X (Twitter) post', size: { width: 1600, height: 900 } },
  { id: 'x-header', label: 'X (Twitter) header', size: { width: 1500, height: 500 } },
  { id: 'fb-post', label: 'Facebook post', size: { width: 1200, height: 630 } },
  { id: 'fb-cover', label: 'Facebook cover', size: { width: 851, height: 315 } },
  { id: 'yt-thumb', label: 'YouTube thumbnail', size: { width: 1280, height: 720 } },
  { id: 'yt-banner', label: 'YouTube banner', size: { width: 2560, height: 1440 } },
  { id: 'li-post', label: 'LinkedIn post', size: { width: 1200, height: 627 } },
  { id: 'pin', label: 'Pinterest pin', size: { width: 1000, height: 1500 } },
  { id: 'discord-avatar', label: 'Discord avatar', size: { width: 128, height: 128 } },
];

export function rotatedSize(size: Dimensions, rotation: Rotation): Dimensions {
  return rotation === 90 || rotation === 270 ? { width: size.height, height: size.width } : size;
}

export interface OutputPlan {
  /** Final canvas size. */
  canvas: Dimensions;
  /** Where the (rotated) image is drawn inside the canvas; may overflow when cropping. */
  draw: { x: number; y: number; width: number; height: number };
}

function fitBox(src: Dimensions, box: Dimensions, fit: FitMode): OutputPlan {
  const canvas = normalizeDimensions(box.width, box.height);
  if (fit === 'stretch') return { canvas, draw: { x: 0, y: 0, ...canvas } };
  const scale =
    fit === 'pad'
      ? Math.min(canvas.width / src.width, canvas.height / src.height)
      : Math.max(canvas.width / src.width, canvas.height / src.height);
  const width = Math.max(1, Math.round(src.width * scale));
  const height = Math.max(1, Math.round(src.height * scale));
  return {
    canvas,
    draw: { x: Math.round((canvas.width - width) / 2), y: Math.round((canvas.height - height) / 2), width, height },
  };
}

function whole(size: Dimensions): OutputPlan {
  const canvas = normalizeDimensions(size.width, size.height);
  return { canvas, draw: { x: 0, y: 0, ...canvas } };
}

/** The output size and placement for one image under the shared settings. */
export function planOutput(source: Dimensions, rotation: Rotation, s: ResizeSettings): OutputPlan {
  const src = rotatedSize(source, rotation);
  const aspect = src.width / src.height;

  if (s.mode === 'percent') {
    const f = Math.max(0.01, s.percent) / 100;
    return whole({ width: src.width * f, height: src.height * f });
  }

  if (s.mode === 'preset') {
    return s.preset ? fitBox(src, s.preset, s.fit) : whole(src);
  }

  const w = s.width && s.width > 0 ? s.width : null;
  const h = s.height && s.height > 0 ? s.height : null;
  if (!w && !h) return whole(src);
  if (w && !h) return whole({ width: w, height: w / aspect });
  if (h && !w) return whole({ width: h * aspect, height: h });
  // Both given: with the lock on, fit inside the box keeping the shape.
  if (s.lockAspect) {
    const scale = Math.min(w! / src.width, h! / src.height);
    return whole({ width: src.width * scale, height: src.height * scale });
  }
  return fitBox(src, { width: w!, height: h! }, s.fit);
}

/** The output format for "keep original", falling back to PNG for formats we can't write. */
export function originalFormat(file: File): OutputFormat {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  if (type === 'image/jpeg' || /\.jpe?g$/.test(name)) return 'jpeg';
  if (type === 'image/webp' || name.endsWith('.webp')) return 'webp';
  if (type === 'image/avif' || name.endsWith('.avif')) return 'avif';
  if (type === 'image/gif' || name.endsWith('.gif')) return 'gif';
  if (type === 'image/bmp' || name.endsWith('.bmp')) return 'bmp';
  if (type === 'image/tiff' || /\.tiff?$/.test(name)) return 'tiff';
  return 'png';
}

export interface ExportRequest {
  source: SourceImage;
  rotation: Rotation;
  settings: ResizeSettings;
  format: OutputFormat;
  /** 0..1 for lossy formats; ignored when `targetBytes` is set. */
  quality: number;
  pixelArt: boolean;
  /** Background for padding; null is transparent (white for formats without alpha). */
  background: string | null;
  /** Aim for at most this many bytes (lossy formats only). */
  targetBytes: number | null;
}

export interface ExportResult {
  blob: Blob;
  size: Dimensions;
  engine: Engine;
  /** Set when a target size was requested but could not be reached. */
  missedTarget?: boolean;
}

async function sourceBitmap(source: SourceImage): Promise<ImageBitmap> {
  if (source.bitmap) return source.bitmap;
  // ImageMagick-only inputs (TIFF, PSD…) already have a PNG preview we can decode.
  const blob = await (await fetch(source.previewUrl)).blob();
  return createImageBitmap(blob);
}

function render(bitmap: ImageBitmap, req: ExportRequest, plan: OutputPlan, opaque: boolean): HTMLCanvasElement {
  const { canvas: size, draw } = plan;
  const out = document.createElement('canvas');
  out.width = size.width;
  out.height = size.height;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  const fill = req.background ?? (opaque ? '#ffffff' : null);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, size.width, size.height);
  }

  // Resize the unrotated image to the drawn size, then rotate it into place.
  const quarter = req.rotation === 90 || req.rotation === 270;
  const scaledSize = quarter ? { width: draw.height, height: draw.width } : { width: draw.width, height: draw.height };
  const scaled = drawResized(bitmap, { width: bitmap.width, height: bitmap.height }, scaledSize, req.pixelArt);

  ctx.imageSmoothingEnabled = !req.pixelArt;
  ctx.save();
  ctx.translate(draw.x + draw.width / 2, draw.y + draw.height / 2);
  ctx.rotate((req.rotation * Math.PI) / 180);
  ctx.drawImage(scaled, -scaledSize.width / 2, -scaledSize.height / 2);
  ctx.restore();
  return out;
}

/** Highest quality whose encoding fits in `targetBytes` (binary search). */
async function encodeToTarget(canvas: HTMLCanvasElement, mime: string, targetBytes: number): Promise<{ blob: Blob; missed: boolean }> {
  let lo = 0.02;
  let hi = 0.95;
  let best: Blob | null = null;
  for (let i = 0; i < 8; i++) {
    const q = (lo + hi) / 2;
    const blob = await canvasToBlob(canvas, mime, q);
    if (blob.size <= targetBytes) {
      best = blob;
      lo = q;
    } else {
      hi = q;
    }
  }
  if (best) return { blob: best, missed: false };
  return { blob: await canvasToBlob(canvas, mime, 0.02), missed: true };
}

export async function exportImage(req: ExportRequest): Promise<ExportResult> {
  const info = formatInfo(req.format);
  const plan = planOutput(req.source.size, req.rotation, req.settings);
  const simple =
    req.rotation === 0 &&
    plan.draw.x === 0 &&
    plan.draw.y === 0 &&
    plan.draw.width === plan.canvas.width &&
    plan.draw.height === plan.canvas.height &&
    !req.targetBytes;

  // Plain resizes keep the existing path, including ImageMagick for exotic inputs.
  if (simple) {
    return convertImage({ source: req.source, target: plan.canvas, format: req.format, quality: req.quality, pixelArt: req.pixelArt });
  }

  const bitmap = await sourceBitmap(req.source);
  const opaque = req.format === 'jpeg' || req.format === 'bmp';
  const canvas = render(bitmap, req, plan, opaque);
  const canvasCanEncode = !info.needsMagick && (await canCanvasEncode(info.mime));

  if (canvasCanEncode) {
    if (req.targetBytes && info.lossy) {
      const { blob, missed } = await encodeToTarget(canvas, info.mime, req.targetBytes);
      return { blob, size: plan.canvas, engine: 'canvas', missedTarget: missed };
    }
    return { blob: await canvasToBlob(canvas, info.mime, req.quality), size: plan.canvas, engine: 'canvas' };
  }

  // Compose on canvas, then let ImageMagick write the format the browser can't.
  const png = await canvasToBlob(canvas, 'image/png', 1);
  const { blob, size } = await convertWithMagick(new File([png], 'composed.png', { type: 'image/png' }), null, req.format, req.quality, req.pixelArt);
  return { blob, size, engine: 'magick' };
}
