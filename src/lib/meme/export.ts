export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Revoking synchronously can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

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
  /** 0–1, reported as the clip plays through. */
  onProgress: (progress: number) => void;
  signal: AbortSignal;
}

/**
 * Plays the clip once from the start while recording the canvas, which the stage keeps
 * repainting every animation frame. Resolves with the encoded clip, or null if aborted.
 */
export async function recordVideo({ canvas, video, onProgress, signal }: RecordOptions): Promise<Blob | null> {
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
  };

  const wasLooping = video.loop;
  video.loop = false;
  video.pause();
  video.currentTime = 0;
  if (video.seeking) await new Promise((resolve) => video.addEventListener("seeked", resolve, { once: true }));

  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 10;
  const onTime = () => onProgress(Math.min(1, video.currentTime / duration));
  video.addEventListener("timeupdate", onTime);
  video.addEventListener("ended", stop, { once: true });
  signal.addEventListener("abort", stop, { once: true });
  const safety = setTimeout(stop, duration * 1000 + 3000);

  try {
    recorder.start(250);
    try {
      await video.play();
    } catch (error) {
      // A very short clip can end before play() settles; anything else is a real failure.
      if (!video.ended) throw error;
    }
    await stopped;
  } finally {
    stop();
    clearTimeout(safety);
    video.removeEventListener("timeupdate", onTime);
    video.removeEventListener("ended", stop);
    signal.removeEventListener("abort", stop);
    for (const track of stream.getTracks()) track.stop();
    video.loop = wasLooping;
    void video.play().catch(() => undefined);
  }

  if (signal.aborted) return null;
  onProgress(1);
  return new Blob(chunks, { type: recorder.mimeType || mimeType || "video/webm" });
}

export function extensionFor(blob: Blob): string {
  return blob.type.includes("mp4") ? "mp4" : "webm";
}
