/**
 * Animated GIF, WebP, PNG and AVIF files, played back like a muted <video>.
 * Frames are decoded once with ImageDecoder; the player keeps its own clock and
 * mirrors the parts of HTMLVideoElement the meme tools use (seek events,
 * playback rate, looping, requestVideoFrameCallback), so trims, speed,
 * soundtracks and both exports work on it unchanged.
 */

/** Browsers treat GIF delays this short as "as fast as possible" and play them at 100 ms. */
const MIN_DELAY_MS = 10;
const DEFAULT_DELAY_MS = 100;
/** Decoded frames are held as bitmaps; past this, they are scaled down to fit. */
const MAX_DECODED_BYTES = 384 * 1024 * 1024;
const MAX_FRAMES = 2000;

/** Formats that can carry animation, by extension, as the decoder names them. APNG decodes as PNG. */
const ANIMATED_TYPES: Record<string, string> = {
  gif: "image/gif",
  webp: "image/webp",
  png: "image/png",
  apng: "image/png",
  avif: "image/avif",
};

/** Seconds a frame stays up, from its decoded duration in microseconds. */
export function frameDelaySeconds(durationUs: number | null | undefined): number {
  const ms = typeof durationUs === "number" && Number.isFinite(durationUs) ? durationUs / 1000 : 0;
  return (ms > MIN_DELAY_MS ? ms : DEFAULT_DELAY_MS) / 1000;
}

/** Index of the frame showing at `time`, given each frame's start time in ascending order. */
export function frameIndexAt(starts: readonly number[], time: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  if (hi < 0) return 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid]! <= time) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** The decoder MIME type for a file that might be animated, or null for formats that never are. */
export function animatedTypeFor(file: { type: string; name: string }): string | null {
  const type = file.type.toLowerCase();
  if (type.startsWith("image/") && ANIMATED_TYPES[type.slice(6)]) return ANIMATED_TYPES[type.slice(6)]!;
  const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase();
  return ext ? (ANIMATED_TYPES[ext] ?? null) : null;
}

interface Frame {
  image: ImageBitmap;
  start: number;
}

export class FramePlayer extends EventTarget {
  readonly duration: number;
  readonly videoWidth: number;
  readonly videoHeight: number;
  loop = true;
  muted = true;
  volume = 1;
  preservesPitch = true;
  defaultPlaybackRate = 1;

  readonly #frames: Frame[];
  readonly #starts: number[];
  #rate = 1;
  #paused = true;
  #ended = false;
  #seeking = false;
  /** Media time at `#since`; the clock runs from there while playing. */
  #base = 0;
  #since = 0;
  #raf = 0;
  #ticker: ReturnType<typeof setInterval> | null = null;
  #callbacks = new Map<number, VideoFrameRequestCallback>();
  #nextCallback = 1;
  #shownFrame = -1;
  #presented = 0;
  #closed = false;

  /** `frames` start at 0 in ascending order; `duration` is where the last one ends. */
  constructor(frames: Frame[], duration: number, width: number, height: number) {
    super();
    this.#frames = frames;
    this.#starts = frames.map((frame) => frame.start);
    this.duration = duration;
    this.videoWidth = width;
    this.videoHeight = height;
  }

  get paused(): boolean {
    return this.#paused;
  }

  get ended(): boolean {
    return this.#ended;
  }

  get seeking(): boolean {
    return this.#seeking;
  }

  get playbackRate(): number {
    return this.#rate;
  }

  set playbackRate(rate: number) {
    const next = Number.isFinite(rate) && rate > 0 ? rate : 1;
    if (next === this.#rate) return;
    this.#rebase();
    this.#rate = next;
    this.#emit("ratechange");
  }

  get currentTime(): number {
    this.#advance();
    return this.#base + (this.#paused ? 0 : ((performance.now() - this.#since) / 1000) * this.#rate);
  }

  set currentTime(time: number) {
    const t = Math.min(Math.max(0, Number.isFinite(time) ? time : 0), this.duration);
    this.#base = t;
    this.#since = performance.now();
    this.#ended = false;
    this.#seeking = true;
    this.#shownFrame = -1;
    this.#emit("seeking");
    // Like a real element, seeks settle asynchronously, so `seeked` listeners added after the assignment still fire.
    setTimeout(() => {
      if (this.#closed) return;
      this.#seeking = false;
      this.#emit("seeked");
      this.#emit("timeupdate");
      this.#schedule();
    }, 0);
  }

  /** The bitmap showing at the current time. */
  get frame(): ImageBitmap {
    return this.#frames[frameIndexAt(this.#starts, this.currentTime)]!.image;
  }

  play(): Promise<void> {
    if (this.#closed) return Promise.resolve();
    if (this.#ended || this.#base >= this.duration) {
      this.#base = 0;
      this.#ended = false;
      this.#shownFrame = -1;
    }
    if (this.#paused) {
      this.#paused = false;
      this.#since = performance.now();
      this.#emit("play");
      this.#emit("playing");
    }
    this.#ticker ??= setInterval(() => {
      this.#advance();
      if (!this.#paused) this.#emit("timeupdate");
    }, 250);
    this.#schedule();
    return Promise.resolve();
  }

  pause(): void {
    if (this.#paused) return;
    this.#rebase();
    this.#paused = true;
    this.#stopTicker();
    this.#emit("timeupdate");
    this.#emit("pause");
  }

  requestVideoFrameCallback(callback: VideoFrameRequestCallback): number {
    const id = this.#nextCallback++;
    this.#callbacks.set(id, callback);
    this.#schedule();
    return id;
  }

  cancelVideoFrameCallback(id: number): void {
    this.#callbacks.delete(id);
  }

  close(): void {
    this.pause();
    this.#closed = true;
    cancelAnimationFrame(this.#raf);
    this.#raf = 0;
    this.#callbacks.clear();
    for (const frame of this.#frames) frame.image.close();
  }

  #emit(type: string): void {
    this.dispatchEvent(new Event(type));
  }

  /** Fold the running clock into `#base`, so rate changes and pauses don't jump. */
  #rebase(): void {
    this.#base = this.currentTime;
    this.#since = performance.now();
  }

  #stopTicker(): void {
    if (this.#ticker !== null) clearInterval(this.#ticker);
    this.#ticker = null;
  }

  /** Wrap at the end when looping; otherwise stop there and fire `ended`. */
  #advance(): void {
    if (this.#paused || this.duration <= 0) return;
    const raw = this.#base + ((performance.now() - this.#since) / 1000) * this.#rate;
    if (raw < this.duration) return;
    if (this.loop) {
      this.#base = raw % this.duration;
      this.#since = performance.now();
      return;
    }
    this.#base = this.duration;
    this.#paused = true;
    this.#ended = true;
    this.#stopTicker();
    queueMicrotask(() => {
      this.#emit("timeupdate");
      this.#emit("pause");
      this.#emit("ended");
    });
  }

  /** Run the frame loop while there's something to present: playback, or a frame not yet shown. */
  #schedule(): void {
    if (this.#raf || this.#closed) return;
    this.#raf = requestAnimationFrame((now) => {
      this.#raf = 0;
      const time = this.currentTime;
      const index = frameIndexAt(this.#starts, time);
      if (index !== this.#shownFrame && !this.#seeking && this.#callbacks.size) {
        this.#shownFrame = index;
        this.#presented += 1;
        const due = [...this.#callbacks.values()];
        this.#callbacks.clear();
        const metadata = {
          presentationTime: now,
          expectedDisplayTime: now,
          width: this.videoWidth,
          height: this.videoHeight,
          mediaTime: this.#starts[index] ?? 0,
          presentedFrames: this.#presented,
        } as VideoFrameCallbackMetadata;
        for (const callback of due) callback(now, metadata);
      }
      // Idle once nobody is waiting, or a paused frame has been shown; seeks, play and new callbacks restart it.
      if (this.#callbacks.size && (!this.#paused || this.#shownFrame === -1)) this.#schedule();
    });
  }
}

/**
 * Decode an animated image into a FramePlayer. Resolves null when the browser
 * can't decode it frame by frame, or when the file has a single frame, so the
 * caller can fall back to treating it as a still.
 */
export async function decodeAnimation(file: Blob, type: string, maxEdge: number): Promise<FramePlayer | null> {
  if (typeof ImageDecoder === "undefined" || typeof createImageBitmap !== "function") return null;
  try {
    if (!(await ImageDecoder.isTypeSupported(type))) return null;
  } catch {
    return null;
  }

  const decoder = new ImageDecoder({ data: await file.arrayBuffer(), type });
  const frames: Frame[] = [];
  try {
    await decoder.tracks.ready;
    // Most PNGs and WebPs are stills; the header says so before anything is decoded.
    if (!decoder.tracks.selectedTrack?.animated) return null;
    await decoder.completed;
    const track = decoder.tracks.selectedTrack;
    if (!track || track.frameCount < 2) return null;

    const count = Math.min(track.frameCount, MAX_FRAMES);
    const first = (await decoder.decode({ frameIndex: 0 })).image;
    const srcW = first.displayWidth;
    const srcH = first.displayHeight;
    first.close();
    const byEdge = Math.min(1, maxEdge / Math.max(srcW, srcH));
    const byMemory = Math.min(1, Math.sqrt(MAX_DECODED_BYTES / Math.max(1, srcW * srcH * 4 * count)));
    const scale = Math.min(byEdge, byMemory);
    const width = Math.max(1, Math.round(srcW * scale));
    const height = Math.max(1, Math.round(srcH * scale));

    let start = 0;
    for (let frameIndex = 0; frameIndex < count; frameIndex++) {
      const { image } = await decoder.decode({ frameIndex });
      try {
        const bitmap =
          scale < 1
            ? await createImageBitmap(image, { resizeWidth: width, resizeHeight: height, resizeQuality: "high" })
            : await createImageBitmap(image);
        frames.push({ image: bitmap, start });
        start += frameDelaySeconds(image.duration);
      } finally {
        image.close();
      }
    }
    return new FramePlayer(frames, start, width, height);
  } catch {
    for (const frame of frames) frame.image.close();
    return null;
  } finally {
    decoder.close();
  }
}
