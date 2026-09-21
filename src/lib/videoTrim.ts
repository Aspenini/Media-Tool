/**
 * Load a video, cut it to an in/out range, and re-encode with MediaRecorder.
 * Browser-only: the helpers at the top are pure and tested; the rest talks to DOM APIs.
 */

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|ogv|mkv)$/i;

export const MIN_TRIM_SECONDS = 0.1;

export function isVideoFile(file: File): boolean {
  return file.type.startsWith('video/') || VIDEO_EXT.test(file.name);
}

/** Display clock, e.g. "0:05.0" or "1:02:03.1". */
export function formatTimecode(seconds: number): string {
  const tenths = Math.max(0, Math.round((Number.isFinite(seconds) ? seconds : 0) * 10));
  const h = Math.floor(tenths / 36_000);
  const m = Math.floor((tenths % 36_000) / 600);
  const s = Math.floor((tenths % 600) / 10);
  const t = tenths % 10;
  const ss = `${String(s).padStart(2, '0')}.${t}`;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
}

/** Filesystem-friendly span, e.g. "12.5s" or "1m05.0s". */
export function formatCompactTime(seconds: number): string {
  const tenths = Math.max(0, Math.round((Number.isFinite(seconds) ? seconds : 0) * 10));
  const m = Math.floor(tenths / 600);
  const s = Math.floor((tenths % 600) / 10);
  const t = tenths % 10;
  if (m === 0) return `${s}.${t}s`;
  return `${m}m${String(s).padStart(2, '0')}.${t}s`;
}

/** Parse "1:23", "1:23.5", "1:02:03", or a bare number of seconds. */
export function parseTimecode(text: string): number | null {
  const raw = text.trim();
  if (!raw) return null;
  const parts = raw.split(':');
  if (parts.length > 3 || parts.some((p) => p === '')) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;
  if (parts.length === 1) return nums[0];
  if (parts.length === 2) return nums[0] * 60 + nums[1];
  return nums[0] * 3600 + nums[1] * 60 + nums[2];
}

export function clampRange(start: number, end: number, duration: number): { start: number; end: number } {
  const dur = Number.isFinite(duration) && duration > 0 ? duration : 0;
  if (dur === 0) return { start: 0, end: 0 };
  const span = Math.min(MIN_TRIM_SECONDS, dur);
  let a = Number.isFinite(start) ? start : 0;
  let b = Number.isFinite(end) ? end : dur;
  a = Math.min(Math.max(0, a), dur);
  b = Math.min(Math.max(0, b), dur);
  if (b < a) b = a;
  if (b - a < span) {
    if (a + span <= dur) b = a + span;
    else {
      b = dur;
      a = Math.max(0, dur - span);
    }
  }
  return { start: a, end: b };
}

export function trimmedName(fileName: string, start: number, end: number, ext: string): string {
  const base = fileName.replace(/\.[^/.]+$/, '') || 'clip';
  return `${base}_${formatCompactTime(start)}-${formatCompactTime(end)}.${ext}`;
}

export function extensionForVideo(blob: Blob): string {
  return blob.type.includes('mp4') ? 'mp4' : 'webm';
}

export function canTrimVideo(): boolean {
  return typeof MediaRecorder !== 'undefined' && typeof document !== 'undefined';
}

export interface VideoInfo {
  url: string;
  duration: number;
  width: number;
  height: number;
}

/**
 * WebM files written by MediaRecorder often report an Infinity duration until
 * the whole file has been scanned. Seeking far past the end forces it.
 */
async function resolveDuration(video: HTMLVideoElement): Promise<void> {
  if (Number.isFinite(video.duration) && video.duration > 0) return;
  await new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      video.removeEventListener('durationchange', onChange);
      resolve();
    };
    const onChange = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) done();
    };
    const timer = setTimeout(done, 3000);
    video.addEventListener('durationchange', onChange);
    video.currentTime = Number.MAX_SAFE_INTEGER;
  });
  video.currentTime = 0;
  if (video.seeking) await seekTo(video, 0);
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  const t = Math.max(0, time);
  if (Math.abs(video.currentTime - t) < 0.001 && !video.seeking) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Could not seek in this video.'));
    };
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };
    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', onError, { once: true });
    video.currentTime = t;
  });
}

function detachVideo(video: HTMLVideoElement): void {
  video.pause();
  video.removeAttribute('src');
  video.load();
}

export async function probeVideo(file: File): Promise<VideoInfo> {
  if (!isVideoFile(file)) throw new Error(`“${file.name}” isn't a video.`);
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.addEventListener('loadeddata', () => resolve(), { once: true });
      video.addEventListener(
        'error',
        () => reject(new Error('That video format isn\'t supported by this browser.')),
        { once: true },
      );
    });
    await resolveDuration(video);
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) throw new Error("Couldn't read this video's duration.");
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) throw new Error("Couldn't read this video's size.");
    return { url, duration, width, height };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  } finally {
    detachVideo(video);
  }
}

function pickRecorderMime(): string {
  const candidates = [
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

function captureElement(video: HTMLVideoElement): MediaStream | null {
  const el = video as HTMLVideoElement & {
    captureStream?: (fps?: number) => MediaStream;
    mozCaptureStream?: (fps?: number) => MediaStream;
  };
  try {
    return el.captureStream?.() ?? el.mozCaptureStream?.() ?? null;
  } catch {
    return null;
  }
}

function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const edge = Math.max(width, height);
  if (edge <= maxEdge) return { width, height };
  const scale = maxEdge / edge;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export interface TrimRequest {
  file: File;
  start: number;
  end: number;
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
}

/**
 * Re-encode `file` between `start` and `end` seconds. Prefers capturing the
 * video element directly (keeps audio); falls back to drawing into a canvas.
 */
export async function trimVideoFile(req: TrimRequest): Promise<Blob> {
  if (!canTrimVideo()) throw new Error("This browser can't record video. Try Chrome, Edge, or Firefox.");
  const { start, end } = clampRange(req.start, req.end, Number.POSITIVE_INFINITY);
  if (end - start < MIN_TRIM_SECONDS) throw new Error('That selection is too short to export.');

  const url = URL.createObjectURL(req.file);
  const video = document.createElement('video');
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      video.addEventListener('loadeddata', () => resolve(), { once: true });
      video.addEventListener('error', () => reject(new Error("Couldn't open this video for export.")), { once: true });
    });
    await resolveDuration(video);
    const duration = Number.isFinite(video.duration) ? video.duration : end;
    const range = clampRange(start, end, duration);

    const mimeType = pickRecorderMime();
    const captured = captureElement(video);
    let stream: MediaStream;
    let draw: (() => void) | null = null;
    let canvas: HTMLCanvasElement | null = null;

    if (captured?.getVideoTracks().length) {
      stream = new MediaStream([...captured.getVideoTracks(), ...captured.getAudioTracks()]);
    } else {
      const size = fitWithin(video.videoWidth || 1280, video.videoHeight || 720, 1920);
      canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable');
      if (typeof canvas.captureStream !== 'function') {
        throw new Error("This browser can't record video. Try Chrome, Edge, or Firefox.");
      }
      stream = canvas.captureStream(30);
      try {
        for (const track of captured?.getAudioTracks() ?? []) stream.addTrack(track);
      } catch {
        /* no audio */
      }
      draw = () => {
        ctx.drawImage(video, 0, 0, size.width, size.height);
      };
    }

    const recorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: 8_000_000,
    });
    const chunks: Blob[] = [];
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    });
    const stopped = new Promise<void>((resolve, reject) => {
      recorder.addEventListener('stop', () => resolve(), { once: true });
      recorder.addEventListener('error', () => reject(new Error('Recording failed.')), { once: true });
    });
    stopped.catch(() => undefined);

    let raf = 0;
    const stop = () => {
      cancelAnimationFrame(raf);
      if (recorder.state !== 'inactive') recorder.stop();
    };

    const wasMuted = video.muted;
    const wasVolume = video.volume;
    video.loop = false;
    video.pause();
    await seekTo(video, range.start);

    if (req.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const span = Math.max(range.end - range.start, 0.001);
    const tick = () => {
      draw?.();
      const t = video.currentTime;
      req.onProgress?.(Math.min(1, Math.max(0, (t - range.start) / span)));
      if (t >= range.end - 0.02 || video.ended) {
        stop();
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    req.signal?.addEventListener('abort', stop, { once: true });
    const safety = setTimeout(stop, span * 1000 + 4000);

    try {
      video.muted = false;
      video.volume = 1;
      recorder.start(250);
      draw?.();
      raf = requestAnimationFrame(tick);
      try {
        await video.play();
      } catch {
        video.muted = true;
        await video.play();
      }
      await stopped;
    } finally {
      stop();
      clearTimeout(safety);
      req.signal?.removeEventListener('abort', stop);
      video.muted = wasMuted;
      video.volume = wasVolume;
      for (const track of stream.getTracks()) {
        // Stopping a live captureStream track can stall the element; only stop clones/canvas tracks.
        if (!captured || !captured.getTracks().includes(track)) track.stop();
      }
    }

    if (req.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    req.onProgress?.(1);
    const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'video/webm' });
    if (!blob.size) throw new Error('Export produced an empty file.');
    return blob;
  } finally {
    detachVideo(video);
    URL.revokeObjectURL(url);
  }
}
