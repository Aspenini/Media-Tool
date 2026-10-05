export { downloadBlob } from "../download.ts";

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't encode the PNG."))), "image/png");
  });
}

export function canCopyImage(): boolean {
  return typeof ClipboardItem !== "undefined" && typeof navigator.clipboard?.write === "function";
}

export async function copyPng(canvas: HTMLCanvasElement): Promise<void> {
  // Hand ClipboardItem a promise so Safari keeps the user-gesture context.
  await navigator.clipboard.write([new ClipboardItem({ "image/png": canvasToPng(canvas) })]);
}

function pickRecorderMime(): string {
  const candidates = [
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

export function canRecordVideo(): boolean {
  return typeof MediaRecorder !== "undefined" && typeof HTMLCanvasElement.prototype.captureStream === "function";
}

export interface RecordOptions {
  canvas: HTMLCanvasElement;
  video: HTMLVideoElement;
  /** In/out points in seconds; defaults to the whole clip. */
  start?: number;
  end?: number;
  /** Playback rate; 2 records the span in half the time, so the clip comes out twice as fast. */
  speed?: number;
  /** Keep the audio's pitch at rates other than 1×. */
  keepPitch?: boolean;
  /** 0–1, reported as the clip plays through. */
  onProgress: (progress: number) => void;
  signal: AbortSignal;
}

/**
 * Plays the clip once from its in-point to its out-point while recording the canvas, which
 * the stage keeps repainting every animation frame. Resolves with the encoded clip, or null if aborted.
 */
export async function recordVideo({ canvas, video, start = 0, end, speed = 1, keepPitch = true, onProgress, signal }: RecordOptions): Promise<Blob | null> {
  if (!canRecordVideo()) throw new Error("This browser can't record canvas video. Try Chrome, Edge, or Firefox.");

  const mimeType = pickRecorderMime();
  const stream = new MediaStream(canvas.captureStream(30).getVideoTracks());
  try {
    const capture = (video as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.();
    for (const track of capture?.getAudioTracks() ?? []) stream.addTrack(track);
  } catch {
    // No audio capture in this browser; export silently.
  }

  const recorder = new MediaRecorder(stream, {
    ...(mimeType ? { mimeType } : {}),
    videoBitsPerSecond: 8_000_000,
  });
  const chunks: Blob[] = [];
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });
  const stopped = new Promise<void>((resolve, reject) => {
    recorder.addEventListener("stop", () => resolve(), { once: true });
    recorder.addEventListener("error", () => reject(new Error("Recording failed.")), { once: true });
  });
  // Observed below via `await`; this just keeps an early failure from going unhandled.
  stopped.catch(() => undefined);
  const stop = () => {
    if (recorder.state !== "inactive") recorder.stop();
    video.pause();
  };

  const rate = Number.isFinite(speed) && speed > 0 ? speed : 1;
  const wasLooping = video.loop;
  const prevRate = video.playbackRate;
  const prevDefault = video.defaultPlaybackRate;
  const prevPitch = video.preservesPitch;
  video.loop = false;
  video.pause();
  // Set pitch after the rate. Assigning playbackRate can reset preservesPitch.
  video.defaultPlaybackRate = rate;
  video.playbackRate = rate;
  video.preservesPitch = keepPitch;
  video.currentTime = start;
  if (video.seeking) await new Promise((resolve) => video.addEventListener("seeked", resolve, { once: true }));

  const clipEnd = end ?? (Number.isFinite(video.duration) && video.duration > 0 ? video.duration : start + 10);
  const span = Math.max(0.1, clipEnd - start);
  const check = () => {
    onProgress(Math.min(1, Math.max(0, (video.currentTime - start) / span)));
    if (video.currentTime >= clipEnd) stop();
  };
  // Poll every display frame: `timeupdate` only fires ~4×/s, too coarse for an out-point,
  // but it keeps firing when animation frames are throttled in a background tab.
  let watch = 0;
  const onFrame = () => {
    check();
    if (recorder.state !== "inactive") watch = requestAnimationFrame(onFrame);
  };
  video.addEventListener("timeupdate", check);
  video.addEventListener("ended", stop, { once: true });
  signal.addEventListener("abort", stop, { once: true });
  const safety = setTimeout(stop, (span / rate) * 1000 + 3000);

  try {
    recorder.start(250);
    watch = requestAnimationFrame(onFrame);
    try {
      await video.play();
    } catch (error) {
      // A very short clip can end (or hit its out-point) before play() settles; anything else is a real failure.
      if (!video.ended && recorder.state !== "inactive") throw error;
    }
    await stopped;
  } finally {
    stop();
    clearTimeout(safety);
    cancelAnimationFrame(watch);
    video.removeEventListener("timeupdate", check);
    video.removeEventListener("ended", stop);
    signal.removeEventListener("abort", stop);
    for (const track of stream.getTracks()) track.stop();
    video.loop = wasLooping;
    video.defaultPlaybackRate = prevDefault;
    video.playbackRate = prevRate;
    video.preservesPitch = prevPitch;
    void video.play().catch(() => undefined);
  }

  if (signal.aborted) return null;
  onProgress(1);
  return new Blob(chunks, { type: recorder.mimeType || mimeType || "video/webm" });
}

export function extensionFor(blob: Blob): string {
  return blob.type.includes("mp4") ? "mp4" : "webm";
}
