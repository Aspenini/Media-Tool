/**
 * The "appeal to goldfish" look: an overcooked fake-4K pass.
 * Vibrance and contrast first, then a clarity overlay and a one-pixel edge
 * halo so detail pops, then (for video) a blend with the previous frame so
 * motion looks smoother than the source. Captions are drawn after this, so
 * the type stays clean.
 */

/** CSS filter for the grade. Sum-preserving: midtones lift, color gets loud. */
export const GOLDFISH_GRADE = "saturate(1.85) contrast(1.22) brightness(1.05)";

/** How much of the previous video frame stays mixed in. */
export const GOLDFISH_BLEND = 0.38;

/**
 * True when `nextTime` is the next frame of the same shot, not a repeat,
 * a seek, or a loop back to the start. Those jumps must not ghost.
 */
export function shouldBlendFrames(previousTime: number, nextTime: number): boolean {
  if (!Number.isFinite(previousTime) || !Number.isFinite(nextTime)) return false;
  const delta = nextTime - previousTime;
  return delta > 0.0005 && delta < 0.25;
}

interface Hold {
  raw: HTMLCanvasElement;
  prev: HTMLCanvasElement;
  out: HTMLCanvasElement;
  copy: HTMLCanvasElement;
  currTime: number;
  blending: boolean;
  w: number;
  h: number;
}

const holds = new WeakMap<HTMLCanvasElement, Hold>();

function blank(): HTMLCanvasElement {
  return document.createElement("canvas");
}

function holdFor(dest: HTMLCanvasElement, w: number, h: number): Hold {
  let hold = holds.get(dest);
  if (!hold) {
    hold = { raw: blank(), prev: blank(), out: blank(), copy: blank(), currTime: Number.NaN, blending: false, w: 0, h: 0 };
    holds.set(dest, hold);
  }
  if (hold.w !== w || hold.h !== h) {
    hold.w = w;
    hold.h = h;
    hold.currTime = Number.NaN;
    hold.blending = false;
    for (const canvas of [hold.raw, hold.prev, hold.out, hold.copy]) {
      canvas.width = w;
      canvas.height = h;
    }
  }
  return hold;
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  return canvas.getContext("2d");
}

export interface PaintMediaOptions {
  /** Grade, clarity, and edge halo. */
  goldfish: boolean;
  /** Mix the previous video frame in. Off for stills and for GIF sampling. */
  smooth: boolean;
  /** Video media time, or null for a still. */
  time: number | null;
}

/**
 * Draw the source rect into `ctx` at (dx, dy, dw, dh). With the goldfish pass
 * off, this is a plain drawImage. The scratch buffers are keyed by `dest` so
 * the preview and a GIF export don't share a previous frame.
 */
export function paintMedia(
  ctx: CanvasRenderingContext2D,
  dest: HTMLCanvasElement,
  source: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  options: PaintMediaOptions,
): void {
  if (!options.goldfish || dw < 1 || dh < 1 || sw < 1 || sh < 1) {
    holds.delete(dest);
    ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
    return;
  }

  const hold = holdFor(dest, dw, dh);
  const raw = context2d(hold.raw);
  const out = context2d(hold.out);
  const copy = context2d(hold.copy);
  if (!raw || !out || !copy) {
    ctx.drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh);
    return;
  }

  if (options.smooth && options.time !== null) {
    const time = options.time;
    if (!Number.isFinite(hold.currTime)) {
      hold.currTime = time;
      hold.blending = false;
    } else if (Math.abs(time - hold.currTime) > 0.0005) {
      // `raw` still holds the outgoing frame. Keep it only across a small step.
      hold.blending = shouldBlendFrames(hold.currTime, time);
      if (hold.blending) {
        const prev = context2d(hold.prev);
        prev?.clearRect(0, 0, dw, dh);
        prev?.drawImage(hold.raw, 0, 0);
      }
      hold.currTime = time;
    }
  }

  raw.setTransform(1, 0, 0, 1, 0, 0);
  raw.imageSmoothingEnabled = true;
  raw.imageSmoothingQuality = "high";
  raw.clearRect(0, 0, dw, dh);
  raw.filter = GOLDFISH_GRADE;
  try {
    raw.drawImage(source, sx, sy, sw, sh, 0, 0, dw, dh);
  } catch {
    raw.filter = "none";
    raw.drawImage(source, sx, sy, sw, sh, 0, 0, dw, dh);
  } finally {
    raw.filter = "none";
  }

  out.setTransform(1, 0, 0, 1, 0, 0);
  out.globalAlpha = 1;
  out.globalCompositeOperation = "source-over";
  out.clearRect(0, 0, dw, dh);
  out.drawImage(hold.raw, 0, 0);
  if (options.smooth && hold.blending) {
    out.save();
    out.globalAlpha = GOLDFISH_BLEND;
    out.drawImage(hold.prev, 0, 0);
    out.restore();
  }

  // Clarity plus a one-pixel halo. Punch the blended frame so the smooth pass
  // doesn't leave the picture soft.
  copy.setTransform(1, 0, 0, 1, 0, 0);
  copy.clearRect(0, 0, dw, dh);
  copy.drawImage(hold.out, 0, 0);
  out.save();
  out.globalCompositeOperation = "overlay";
  out.globalAlpha = 0.55;
  out.filter = "contrast(1.55) saturate(1.2)";
  try {
    out.drawImage(hold.copy, 0, 0);
  } catch {
    out.filter = "none";
    out.drawImage(hold.copy, 0, 0);
  }
  out.filter = "none";
  out.globalAlpha = 0.22;
  out.drawImage(hold.copy, -1, 0);
  out.drawImage(hold.copy, 1, 0);
  out.drawImage(hold.copy, 0, -1);
  out.drawImage(hold.copy, 0, 1);
  out.restore();

  ctx.drawImage(hold.out, dx, dy);
}
