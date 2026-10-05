import { cropPixels } from "./crop.ts";
import { fontById, fontSpec } from "./fonts.ts";
import { paintMedia } from "./goldfish.ts";
import { layoutText, type TextBlock } from "./layout.ts";
import type { CaptionSlot, IconAtlas, MediaAsset, Placement, Rect, TextStyle } from "./types.ts";

/** Longest output edge. Video is capped lower so MediaRecorder can keep up. */
const MAX_EDGE = { image: 2560, video: 1920 } as const;
const BAR_COLOR = "#ffffff";

export interface Scene {
  media: MediaAsset;
  placement: Placement;
  captions: Record<CaptionSlot, string>;
  offsets: Record<CaptionSlot, number>;
  style: TextStyle;
  icons: IconAtlas;
  /** Normalised source crop; null for the full frame. */
  crop: Rect | null;
  /** Draw only the uncropped media, no captions or bar — the crop editor's view. */
  bare?: boolean;
  /** Fake-4K grade: sharper edges and louder color. Applied to the picture only. */
  goldfish?: boolean;
  /** Blend with the previous video frame. Preview and video export; not GIF sampling. */
  smoothMotion?: boolean;
}

export interface Frame {
  width: number;
  height: number;
  media: Rect;
  /** Where each overlay caption landed, in canvas pixels. Used for drag handles. */
  boxes: Partial<Record<CaptionSlot, Rect>>;
}

function outputSize(media: MediaAsset, source: Rect): { width: number; height: number } {
  const scale = Math.min(1, MAX_EDGE[media.kind] / Math.max(source.w, source.h));
  return {
    width: Math.max(1, Math.round(source.w * scale)),
    height: Math.max(1, Math.round(source.h * scale)),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function drawBlock(
  ctx: CanvasRenderingContext2D,
  block: TextBlock,
  originX: number,
  originY: number,
  style: TextStyle,
  icons: IconAtlas,
): void {
  const font = fontById(style.fontId);
  ctx.font = fontSpec(font, block.fontSize);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.miterLimit = 2;

  const baselineOf = (row: number) => originY + row * block.lineHeight + (block.lineHeight + block.capHeight) / 2;

  // Stroke everything first so an outline never bleeds over a neighbouring word's fill.
  if (style.strokeWidth > 0) {
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = block.fontSize * style.strokeWidth * 2;
    block.lines.forEach((line, row) => {
      for (const token of line.tokens) {
        if (token.kind === "text") ctx.strokeText(token.value, originX + token.x, baselineOf(row));
      }
    });
  }

  ctx.fillStyle = style.fill;
  block.lines.forEach((line, row) => {
    const baseline = baselineOf(row);
    for (const token of line.tokens) {
      if (token.kind === "text") {
        ctx.fillText(token.value, originX + token.x, baseline);
        continue;
      }
      const image = icons.get(token.value);
      if (!image) continue;
      // Centre icons on the capitals, the way Galaxy's dialogue boxes sit stars inline.
      const top = baseline - block.capHeight / 2 - block.iconSize / 2;
      ctx.drawImage(image, originX + token.x + block.iconPad, top, block.iconSize, block.iconSize);
    }
  });
}

export function renderScene(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, scene: Scene): Frame {
  const { media, style, icons } = scene;
  const source = cropPixels(scene.bare ? null : scene.crop, media.width, media.height);
  const { width, height } = outputSize(media, source);
  const fontSize = Math.max(14, width * (style.sizePct / 100));
  const padX = width * 0.05;

  const layout = (text: string) =>
    layoutText({
      ctx,
      text,
      maxWidth: width - padX * 2,
      font: fontById(style.fontId),
      fontSize,
      align: style.align,
      allCaps: style.allCaps,
      icons,
    });

  const bar = scene.placement === "bar" && !scene.bare ? layout(scene.captions.top) : null;
  const barPad = fontSize * 0.55;
  const barHeight = bar ? Math.round(bar.height + barPad * 2) : 0;
  const frame: Frame = {
    width,
    height: height + barHeight,
    media: { x: 0, y: barHeight, w: width, h: height },
    boxes: {},
  };

  if (canvas.width !== frame.width) canvas.width = frame.width;
  if (canvas.height !== frame.height) canvas.height = frame.height;
  ctx.clearRect(0, 0, frame.width, frame.height);
  const graded = Boolean(scene.goldfish) && !scene.bare;
  paintMedia(ctx, canvas, media.source, source.x, source.y, source.w, source.h, 0, barHeight, width, height, {
    goldfish: graded,
    smooth: graded && Boolean(scene.smoothMotion) && media.kind === "video",
    time: media.source instanceof HTMLVideoElement ? media.source.currentTime : null,
  });
  if (scene.bare) return frame;

  if (bar) {
    ctx.fillStyle = BAR_COLOR;
    ctx.fillRect(0, 0, width, barHeight);
    drawBlock(ctx, bar, padX, barPad, style, icons);
    return frame;
  }

  for (const slot of ["top", "bottom"] as const) {
    const block = layout(scene.captions[slot]);
    if (block.empty) continue;
    const anchor = scene.offsets[slot] * height;
    const y = clamp(slot === "top" ? anchor : anchor - block.height, 0, height - block.height);
    drawBlock(ctx, block, padX, frame.media.y + y, style, icons);
    frame.boxes[slot] = {
      x: padX + block.inkLeft,
      y: frame.media.y + y,
      w: block.inkRight - block.inkLeft,
      h: block.height,
    };
  }

  return frame;
}

export function sameFrame(a: Frame | null, b: Frame): boolean {
  if (!a || a.width !== b.width || a.height !== b.height || a.media.y !== b.media.y) return false;
  const rect = (r?: Rect) => (r ? `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.w)},${Math.round(r.h)}` : "");
  return rect(a.boxes.top) === rect(b.boxes.top) && rect(a.boxes.bottom) === rect(b.boxes.bottom);
}
