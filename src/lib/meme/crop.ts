import type { Rect } from "./types.ts";

/**
 * Crop rects are normalised to the source media (0–1 on both axes), so they're
 * independent of the preview size and of the output scale.
 */
export const FULL_CROP: Rect = { x: 0, y: 0, w: 1, h: 1 };

/** Smallest crop edge, as a fraction of the media. */
export const MIN_CROP = 0.04;

export type CropHandle = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function isFullCrop(crop: Rect | null): boolean {
  if (!crop) return true;
  const eps = 1e-4;
  return crop.x < eps && crop.y < eps && crop.w > 1 - eps && crop.h > 1 - eps;
}

/** Source pixels covered by a crop. */
export function cropPixels(crop: Rect | null, width: number, height: number): Rect {
  const c = crop ?? FULL_CROP;
  const x = Math.round(c.x * width);
  const y = Math.round(c.y * height);
  return {
    x,
    y,
    w: Math.max(1, Math.min(width - x, Math.round(c.w * width))),
    h: Math.max(1, Math.min(height - y, Math.round(c.h * height))),
  };
}

/**
 * Normalised width:height for a pixel aspect ratio on media of the given shape.
 * A 16:9 crop on a 16:9 video is 1:1 in normalised units.
 */
function normalisedRatio(aspect: number, mediaWidth: number, mediaHeight: number): number {
  return (aspect * mediaHeight) / mediaWidth;
}

/** The largest crop with the given pixel aspect that fits the media, centred on the current crop. */
export function fitAspect(crop: Rect, aspect: number, mediaWidth: number, mediaHeight: number): Rect {
  const k = normalisedRatio(aspect, mediaWidth, mediaHeight);
  const w = Math.min(1, k);
  const h = w / k;
  return {
    x: clamp(crop.x + crop.w / 2 - w / 2, 0, 1 - w),
    y: clamp(crop.y + crop.h / 2 - h / 2, 0, 1 - h),
    w,
    h,
  };
}

/**
 * Drag a crop handle by (dx, dy), normalised. With an aspect (pixel width / height),
 * corners scale from the opposite corner and edges scale around the crop's centre line.
 */
export function dragCrop(
  start: Rect,
  handle: CropHandle,
  dx: number,
  dy: number,
  aspect: number | null,
  mediaWidth: number,
  mediaHeight: number,
): Rect {
  if (handle === "move") {
    return { ...start, x: clamp(start.x + dx, 0, 1 - start.w), y: clamp(start.y + dy, 0, 1 - start.h) };
  }

  const west = handle.includes("w");
  const east = handle.includes("e");
  const north = handle.includes("n");
  const south = handle.includes("s");
  const right = start.x + start.w;
  const bottom = start.y + start.h;

  if (!aspect) {
    const l = west ? clamp(start.x + dx, 0, right - MIN_CROP) : start.x;
    const r = east ? clamp(right + dx, l + MIN_CROP, 1) : right;
    const t = north ? clamp(start.y + dy, 0, bottom - MIN_CROP) : start.y;
    const b = south ? clamp(bottom + dy, t + MIN_CROP, 1) : bottom;
    return { x: l, y: t, w: r - l, h: b - t };
  }

  const k = normalisedRatio(aspect, mediaWidth, mediaHeight);
  const anchorX = west ? right : east ? start.x : start.x + start.w / 2;
  const anchorY = north ? bottom : south ? start.y : start.y + start.h / 2;

  const wFromX = west ? start.w - dx : start.w + dx;
  const hFromY = north ? start.h - dy : start.h + dy;
  let w: number;
  if ((west || east) && (north || south)) w = Math.max(wFromX, hFromY * k);
  else if (west || east) w = wFromX;
  else w = hFromY * k;

  const spaceX = west ? anchorX : east ? 1 - anchorX : 2 * Math.min(anchorX, 1 - anchorX);
  const spaceY = north ? anchorY : south ? 1 - anchorY : 2 * Math.min(anchorY, 1 - anchorY);
  const maxW = Math.min(spaceX, spaceY * k);
  const minW = Math.max(MIN_CROP, MIN_CROP * k);
  w = Math.min(Math.max(w, minW), maxW);
  const h = w / k;

  return {
    x: west ? anchorX - w : east ? anchorX : anchorX - w / 2,
    y: north ? anchorY - h : south ? anchorY : anchorY - h / 2,
    w,
    h,
  };
}
