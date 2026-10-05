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
}

export interface SoundtrackSync {
  /** Pause the element. When false, it should be playing. */
  pause: boolean;
  /** Seek here before playing or pausing, or null to leave the playhead alone. */
  seek: number | null;
}

/**
 * Decide what the soundtrack element should do this frame.
 * While the video is paused, the playhead only follows a video seek — dragging
 * the audio trim can preview a point in the file without being yanked back.
 */
export function soundtrackSync(input: SoundtrackSyncInput): SoundtrackSync {
  const { audioStart, audioEnd } = input;
  if (!(audioEnd > audioStart)) return { pause: true, seek: null };

  const expected = audioTimeFor(input.videoTime, input.videoStart, input.videoSpeed, audioStart, input.audioSpeed);
  if (expected >= audioEnd - 0.03) return { pause: true, seek: null };

  const target = Math.min(Math.max(expected, audioStart), audioEnd - 0.001);
  const drift = Math.abs(input.audioTime - target);
  if (input.videoPaused) {
    return { pause: true, seek: input.videoMoved && drift > 0.05 ? target : null };
  }
  return { pause: false, seek: drift > 0.12 ? target : null };
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
