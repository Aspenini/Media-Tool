import { clampRange } from "../videoTrim.ts";
import type { Trim } from "./types.ts";

const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|weba)$/i;

/** A file the user dropped in as a video meme's soundtrack. */
export interface AudioTrack {
  name: string;
  /** Seconds. Always finite — files with no readable length are rejected. */
  duration: number;
  /** Blob URL owned by this track (revoked on dispose). */
  url: string;
  /** Preview element. Export opens its own element on the same URL. */
  element: HTMLAudioElement;
}

export function isAudioFile(file: File): boolean {
  return file.type.startsWith("audio/") || AUDIO_EXT.test(file.name);
}

function positiveRate(speed: number): number {
  return Number.isFinite(speed) && speed > 0 ? speed : 1;
}

/**
 * Where the soundtrack playhead belongs, in seconds of the audio file.
 * Video speed turns media time into output time; audio speed maps that back
 * onto the file, so the two rates stay independent.
 */
export function audioTimeFor(
  videoTime: number,
  videoStart: number,
  videoSpeed: number,
  audioStart: number,
  audioSpeed: number,
): number {
  const elapsed = Math.max(0, videoTime - videoStart) / positiveRate(videoSpeed);
  return audioStart + elapsed * positiveRate(audioSpeed);
}

/** How long a trimmed span lasts after a playback rate. Speeding up shortens it. */
export function outputDuration(start: number, end: number, speed: number): number {
  return Math.max(0, end - start) / positiveRate(speed);
}

/** True when the soundtrack's output runs long enough that repeating the clip covers new audio. */
export function loopExtends(videoOut: number, audioOut: number): boolean {
  return videoOut > 0.001 && audioOut > videoOut + 0.05;
}

/** Output seconds the piece should last. Looping uses the soundtrack when it is the longer one. */
export function compositionDuration(videoOut: number, audioOut: number, loopVideo: boolean): number {
  const video = Math.max(0, videoOut);
  if (loopVideo && loopExtends(video, audioOut)) return Math.max(0, audioOut);
  return video;
}

/** How many times the picture plays to cover the soundtrack. 1 when the audio already fits. */
export function videoPassCount(videoOut: number, audioOut: number): number {
  if (!loopExtends(videoOut, audioOut)) return 1;
  return Math.ceil((audioOut - 0.001) / videoOut);
}

/**
 * Video file time at `outputT` seconds into the piece.
 * With `loop`, time wraps inside `[start, end)`; otherwise it stops just shy of `end`.
 */
export function sourceTimeAt(outputT: number, start: number, end: number, speed: number, loop: boolean): number {
  const rate = positiveRate(speed);
  const span = Math.max(0, end - start);
  if (!(span > 0)) return start;
  const videoOut = span / rate;
  let into = Math.max(0, outputT);
  if (loop && videoOut > 0) into = into % videoOut;
  return start + Math.min(into * rate, Math.max(0, span - 0.001));
}

/** True when playback jumped from the out-point back to the in-point (a finished pass). */
export function videoWrapped(input: {
  previous: number;
  current: number;
  start: number;
  end: number;
  paused: boolean;
}): boolean {
  if (input.paused) return false;
  const span = input.end - input.start;
  if (!(span > 0.05)) return false;
  const slack = Math.min(0.3, span * 0.45);
  const jumpedBack = input.previous - input.current > span * 0.5;
  const nearStart = input.current <= input.start + slack;
  const wasLate = input.previous >= input.end - slack;
  return jumpedBack && nearStart && wasLate;
}

/** Trimmed region of an audio file, or the whole file. */
export function audioSpan(duration: number, trim: Trim | null): Trim {
  if (!Number.isFinite(duration) || duration <= 0) return { start: 0, end: 0 };
  if (!trim) return { start: 0, end: duration };
  return clampRange(trim.start, trim.end, duration);
}

export interface SoundtrackSyncInput {
  videoPaused: boolean;
  /** The video clock moved since the last check — playback, a loop, or a seek. */
  videoMoved: boolean;
  videoTime: number;
  videoStart: number;
  videoSpeed: number;
  audioTime: number;
  audioStart: number;
  audioEnd: number;
  audioSpeed: number;
  /** Completed video passes. Used when `loopVideo` repeats a shorter clip. */
  videoLoops?: number;
  /** Output seconds of one video pass. */
  videoOut?: number;
  /** Repeat the picture until the soundtrack ends, then start both over. */
  loopVideo?: boolean;
}

export interface SoundtrackSync {
  /** Pause the element. When false, it should be playing. */
  pause: boolean;
  /** Seek here before playing or pausing, or null to leave the playhead alone. */
  seek: number | null;
  /** The looped soundtrack finished; the caller resets its pass count and the picture. */
  restart: boolean;
}

/**
 * Decide what the soundtrack element should do this frame.
 * While the video is paused, the playhead only follows a video seek — dragging
 * the audio trim can preview a point in the file without being yanked back.
 * With `loopVideo`, completed passes keep the soundtrack moving, and the piece
 * starts over once that soundtrack reaches its out-point.
 */
export function soundtrackSync(input: SoundtrackSyncInput): SoundtrackSync {
  const { audioStart, audioEnd } = input;
  if (!(audioEnd > audioStart)) return { pause: true, seek: null, restart: false };

  const videoOutIn = input.videoOut ?? 0;
  const videoOut = Number.isFinite(videoOutIn) && videoOutIn > 0 ? videoOutIn : 0;
  const rawLoops = input.videoLoops ?? 0;
  const loops = Number.isFinite(rawLoops) && rawLoops > 0 ? Math.floor(rawLoops) : 0;
  const audioRate = positiveRate(input.audioSpeed);
  const videoRate = positiveRate(input.videoSpeed);
  const audioOut = (audioEnd - audioStart) / audioRate;
  const looping = Boolean(input.loopVideo) && loopExtends(videoOut, audioOut);

  const elapsed = Math.max(0, input.videoTime - input.videoStart) / videoRate;
  const into = looping ? Math.min(elapsed, videoOut) : elapsed;
  let outputT = looping ? loops * videoOut + into : into;

  if (looping && !input.videoPaused && outputT >= audioOut - 0.03) {
    return { pause: false, seek: audioStart, restart: true };
  }
  if (looping) outputT = Math.min(outputT, Math.max(0, audioOut - 0.001));

  const expected = audioStart + outputT * audioRate;
  if (!looping && expected >= audioEnd - 0.03) return { pause: true, seek: null, restart: false };

  const target = Math.min(Math.max(expected, audioStart), audioEnd - 0.001);
  const drift = Math.abs(input.audioTime - target);
  if (input.videoPaused) {
    return { pause: true, seek: input.videoMoved && drift > 0.05 ? target : null, restart: false };
  }
  return { pause: false, seek: drift > 0.12 ? target : null, restart: false };
}

/**
 * Some audio files (MediaRecorder WebM, in particular) report an Infinity
 * duration until the demuxer has scanned them. Seeking past the end forces it.
 */
async function resolveDuration(audio: HTMLAudioElement): Promise<void> {
  if (Number.isFinite(audio.duration) && audio.duration > 0) return;
  await new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      audio.removeEventListener("durationchange", onChange);
      resolve();
    };
    const onChange = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) done();
    };
    const timer = setTimeout(done, 3000);
    audio.addEventListener("durationchange", onChange);
    audio.currentTime = Number.MAX_SAFE_INTEGER;
  });
  audio.currentTime = 0;
}

export async function loadAudioFile(file: File): Promise<AudioTrack> {
  if (!isAudioFile(file)) throw new Error(`“${file.name}” isn't an audio file.`);
  const url = URL.createObjectURL(file);
  const element = document.createElement("audio");
  element.preload = "auto";
  element.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      element.addEventListener("loadedmetadata", () => resolve(), { once: true });
      element.addEventListener("error", () => reject(new Error("That audio format isn't supported by this browser.")), {
        once: true,
      });
    });
    await resolveDuration(element);
    if (!Number.isFinite(element.duration) || element.duration <= 0) {
      throw new Error("Couldn't read that audio's length.");
    }
    return { name: file.name, duration: element.duration, url, element };
  } catch (error) {
    URL.revokeObjectURL(url);
    element.removeAttribute("src");
    element.load();
    throw error;
  }
}

export function disposeAudio(track: AudioTrack): void {
  track.element.pause();
  track.element.removeAttribute("src");
  track.element.load();
  if (track.url.startsWith("blob:")) URL.revokeObjectURL(track.url);
}
