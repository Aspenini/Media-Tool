import { compositionDuration, loopExtends, outputDuration } from "./audio.ts";
import { getAudioContextClass } from "../spatial.ts";

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

/** A soundtrack mixed into the export. Played from its own element so pitch and trim stay exact. */
export interface RecordSoundtrack {
  url: string;
  /** In/out points on the audio file, in seconds. */
  start: number;
  end: number;
  /** Playback rate of the file. Independent of the video's speed. */
  speed: number;
  /** Keep the soundtrack's pitch when `speed` isn't 1×. */
  keepPitch: boolean;
  /** 0–1, applied on the element (capture follows it). */
  volume: number;
  /** Leave the clip's own audio out of the mix. */
  replace: boolean;
  /** Repeat the clip until this soundtrack ends, when the soundtrack is longer. */
  loopVideo?: boolean;
}

export interface RecordOptions {
  canvas: HTMLCanvasElement;
  video: HTMLVideoElement;
  /** In/out points in seconds; defaults to the whole clip. */
  start?: number;
  end?: number;
  /** Playback rate; 2 records the span in half the time, so the clip comes out twice as fast. */
  speed?: number;
  /** Keep the video element's pitch at rates other than 1×. */
  keepPitch?: boolean;
  /** Canvas capture rate. Higher when motion smoothing needs the extra frames. */
  fps?: number;
  soundtrack?: RecordSoundtrack;
  /** 0–1, reported as the clip plays through. */
  onProgress: (progress: number) => void;
  signal: AbortSignal;
}

function captureMedia(element: HTMLMediaElement): MediaStream | null {
  const node = element as HTMLMediaElement & {
    captureStream?: () => MediaStream;
    mozCaptureStream?: () => MediaStream;
  };
  try {
    return node.captureStream?.() ?? node.mozCaptureStream?.() ?? null;
  } catch {
    return null;
  }
}

function seekMedia(element: HTMLMediaElement, time: number): Promise<void> {
  const t = Math.max(0, time);
  if (Math.abs(element.currentTime - t) < 0.001 && !element.seeking) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      element.removeEventListener("seeked", done);
      resolve();
    };
    const timer = setTimeout(done, 2000);
    element.addEventListener("seeked", done, { once: true });
    element.currentTime = t;
  });
}

async function openExportAudio(track: RecordSoundtrack): Promise<HTMLAudioElement> {
  const audio = document.createElement("audio");
  audio.preload = "auto";
  audio.src = track.url;
  await new Promise<void>((resolve, reject) => {
    audio.addEventListener("loadeddata", () => resolve(), { once: true });
    audio.addEventListener("error", () => reject(new Error("Couldn't read the soundtrack for export.")), { once: true });
  });
  const rate = Number.isFinite(track.speed) && track.speed > 0 ? track.speed : 1;
  audio.loop = false;
  audio.defaultPlaybackRate = rate;
  audio.playbackRate = rate;
  audio.preservesPitch = track.keepPitch;
  audio.volume = Math.min(1, Math.max(0, track.volume));
  audio.muted = false;
  await seekMedia(audio, track.start);
  return audio;
}

interface SoundtrackGraph {
  /** `element` captures the playing soundtrack. `buffer` is the fallback when the browser can't. */
  mode: "element" | "buffer";
  close: () => void;
  startBuffer: () => void;
}

/**
 * Mix the clip's audio (unless replaced) and the soundtrack into one track.
 * MediaRecorder is unreliable with two audio tracks, so they meet in an AudioContext.
 * The buffer fallback can't preserve pitch; it's only used when captureStream has no audio.
 */
async function connectSoundtrack(
  stream: MediaStream,
  video: HTMLVideoElement,
  exportAudio: HTMLAudioElement,
  track: RecordSoundtrack,
  ctx: AudioContext,
): Promise<SoundtrackGraph> {
  const dest = ctx.createMediaStreamDestination();
  const nodes: AudioNode[] = [];
  const disconnect = () => {
    for (const node of nodes) {
      try {
        node.disconnect();
      } catch {
        // Already disconnected when the recording stopped.
      }
    }
  };

  try {
    if (!track.replace) {
      const tracks = captureMedia(video)?.getAudioTracks() ?? [];
      if (tracks.length) {
        const src = ctx.createMediaStreamSource(new MediaStream(tracks));
        src.connect(dest);
        nodes.push(src);
      }
    }

    const audioTracks = captureMedia(exportAudio)?.getAudioTracks() ?? [];
    let mode: SoundtrackGraph["mode"] = "element";
    let startBuffer = () => {};

    if (audioTracks.length) {
      const src = ctx.createMediaStreamSource(new MediaStream(audioTracks));
      src.connect(dest);
      nodes.push(src);
    } else {
      mode = "buffer";
      const bytes = await (await fetch(track.url)).arrayBuffer();
      const buffer = await ctx.decodeAudioData(bytes.slice(0));
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = Number.isFinite(track.speed) && track.speed > 0 ? track.speed : 1;
      const gain = ctx.createGain();
      gain.gain.value = Math.min(1, Math.max(0, track.volume));
      source.connect(gain);
      gain.connect(dest);
      gain.connect(ctx.destination);
      nodes.push(source, gain);
      const offset = Math.max(0, Math.min(track.start, Math.max(0, buffer.duration - 0.05)));
      const duration = Math.max(0.05, Math.min(track.end, buffer.duration) - offset);
      let started = false;
      startBuffer = () => {
        if (started) return;
        started = true;
        try {
          source.start(0, offset, duration);
        } catch {
          // Already started or the context closed.
        }
      };
    }

    if (!dest.stream.getAudioTracks().length) {
      throw new Error("Couldn't capture the soundtrack in this browser.");
    }
    for (const audioTrack of dest.stream.getAudioTracks()) stream.addTrack(audioTrack);

    return { mode, startBuffer, close: disconnect };
  } catch (error) {
    disconnect();
    throw error;
  }
}

/**
 * Plays the clip from its in-point while recording the canvas, which the stage keeps
 * repainting every animation frame. With `soundtrack.loopVideo` and a longer soundtrack,
 * the picture repeats until that audio ends. Resolves with the encoded clip, or null if aborted.
 */
export async function recordVideo({
  canvas,
  video,
  start = 0,
  end,
  speed = 1,
  keepPitch = true,
  fps = 30,
  soundtrack,
  onProgress,
  signal,
}: RecordOptions): Promise<Blob | null> {
  if (!canRecordVideo()) throw new Error("This browser can't record canvas video. Try Chrome, Edge, or Firefox.");

  const mimeType = pickRecorderMime();
  const captureFps = Number.isFinite(fps) && fps > 0 ? fps : 30;
  const stream = new MediaStream(canvas.captureStream(captureFps).getVideoTracks());
  // Built in the click turn, before any await, so the context is allowed to run.
  const mixCtx = soundtrack ? new (getAudioContextClass())() : null;
  if (mixCtx?.state === "suspended") void mixCtx.resume();
  const closeMix = () => {
    if (mixCtx && mixCtx.state !== "closed") void mixCtx.close();
  };

  // Pause before unmuting, so a replaced-off mix doesn't blast the clip's audio early.
  video.pause();
  const prevMuted = video.muted;
  const prevVolume = video.volume;
  if (soundtrack && !soundtrack.replace) {
    video.muted = false;
    video.volume = 1;
  }

  let exportAudio: HTMLAudioElement | null = null;
  try {
    exportAudio = soundtrack ? await openExportAudio(soundtrack) : null;
  } catch (error) {
    closeMix();
    video.muted = prevMuted;
    video.volume = prevVolume;
    for (const track of stream.getTracks()) track.stop();
    throw error;
  }
  const releaseExportAudio = () => {
    if (!exportAudio) return;
    exportAudio.pause();
    exportAudio.removeAttribute("src");
    exportAudio.load();
    exportAudio = null;
  };
  if (signal.aborted) {
    closeMix();
    releaseExportAudio();
    video.muted = prevMuted;
    video.volume = prevVolume;
    for (const track of stream.getTracks()) track.stop();
    return null;
  }

  let graph: SoundtrackGraph | null = null;
  try {
    if (soundtrack && exportAudio && mixCtx) {
      graph = await connectSoundtrack(stream, video, exportAudio, soundtrack, mixCtx);
    } else {
      try {
        for (const track of captureMedia(video)?.getAudioTracks() ?? []) stream.addTrack(track);
      } catch {
        // No audio capture in this browser; export silently.
      }
    }
  } catch (error) {
    graph?.close();
    closeMix();
    releaseExportAudio();
    video.muted = prevMuted;
    video.volume = prevVolume;
    for (const track of stream.getTracks()) track.stop();
    throw error;
  }
  if (signal.aborted) {
    graph?.close();
    closeMix();
    releaseExportAudio();
    video.muted = prevMuted;
    video.volume = prevVolume;
    for (const track of stream.getTracks()) track.stop();
    return null;
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
    exportAudio?.pause();
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
  const videoOut = span / rate;
  const audioOut = soundtrack ? outputDuration(soundtrack.start, soundtrack.end, soundtrack.speed) : 0;
  const loopVideo = Boolean(soundtrack?.loopVideo) && loopExtends(videoOut, audioOut);
  const total = Math.max(0.1, compositionDuration(videoOut, audioOut, loopVideo));
  // Completed passes. While a seek back to the in-point is in flight, ignore the playhead
  // still sitting on the out-point so the soundtrack clock doesn't jump ahead a pass.
  let loops = 0;
  let wrapping = false;
  const outputNow = () => {
    if (wrapping) return loops * videoOut;
    const into = Math.min(videoOut, Math.max(0, (video.currentTime - start) / rate));
    return loops * videoOut + into;
  };
  const check = () => {
    if (recorder.state === "inactive") return;
    const outputT = outputNow();
    onProgress(Math.min(1, Math.max(0, outputT / total)));
    if (exportAudio && graph?.mode === "element" && soundtrack) {
      const audioRate = Number.isFinite(soundtrack.speed) && soundtrack.speed > 0 ? soundtrack.speed : 1;
      const expected = soundtrack.start + outputT * audioRate;
      if (expected >= soundtrack.end - 0.03) {
        if (!exportAudio.paused) exportAudio.pause();
      } else if (!exportAudio.seeking && Math.abs(exportAudio.currentTime - expected) > 0.15) {
        exportAudio.currentTime = Math.min(expected, Math.max(soundtrack.start, soundtrack.end - 0.001));
      }
    }
    if (wrapping) return;
    const atEnd = video.ended || video.currentTime >= clipEnd;
    if (!loopVideo && atEnd) {
      stop();
      return;
    }
    if (outputT >= total - 0.001) {
      stop();
      return;
    }
    if (loopVideo && atEnd) {
      wrapping = true;
      loops += 1;
      void seekMedia(video, start).finally(() => {
        wrapping = false;
        if (recorder.state !== "inactive" && video.paused) void video.play().catch(() => undefined);
      });
    }
  };
  // Poll every display frame: `timeupdate` only fires ~4×/s, too coarse for an out-point,
  // but it keeps firing when animation frames are throttled in a background tab.
  let watch = 0;
  const onFrame = () => {
    check();
    if (recorder.state !== "inactive") watch = requestAnimationFrame(onFrame);
  };
  video.addEventListener("timeupdate", check);
  video.addEventListener("ended", check);
  signal.addEventListener("abort", stop, { once: true });
  const safety = setTimeout(stop, total * 1000 + 3000);

  try {
    recorder.start(250);
    watch = requestAnimationFrame(onFrame);
    try {
      if (graph?.mode === "buffer") graph.startBuffer();
      else if (exportAudio) {
        try {
          await exportAudio.play();
        } catch {
          throw new Error("Couldn't play the soundtrack. Click the preview and export again.");
        }
      }
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
    video.removeEventListener("ended", check);
    signal.removeEventListener("abort", stop);
    for (const track of stream.getTracks()) track.stop();
    graph?.close();
    closeMix();
    releaseExportAudio();
    video.loop = wasLooping;
    video.defaultPlaybackRate = prevDefault;
    video.playbackRate = prevRate;
    video.preservesPitch = prevPitch;
    video.muted = prevMuted;
    video.volume = prevVolume;
    void video.play().catch(() => undefined);
  }

  if (signal.aborted) return null;
  onProgress(1);
  return new Blob(chunks, { type: recorder.mimeType || mimeType || "video/webm" });
}

export function extensionFor(blob: Blob): string {
  return blob.type.includes("mp4") ? "mp4" : "webm";
}
