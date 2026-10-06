import { describe, expect, test } from 'bun:test';
import {
  audioSpan,
  audioTimeFor,
  compositionDuration,
  isAudioFile,
  loopExtends,
  outputDuration,
  sourceTimeAt,
  soundtrackSync,
  videoPassCount,
  videoWrapped,
} from '../meme/audio';

const file = (name: string, type = '') => new File(['x'], name, { type });

describe('isAudioFile', () => {
  test('accepts audio mime types and common extensions', () => {
    expect(isAudioFile(file('song.mp3', 'audio/mpeg'))).toBe(true);
    expect(isAudioFile(file('voice.WAV'))).toBe(true);
    expect(isAudioFile(file('clip.m4a', 'audio/mp4'))).toBe(true);
    expect(isAudioFile(file('take.flac'))).toBe(true);
  });

  test('rejects video and images', () => {
    expect(isAudioFile(file('clip.mp4', 'video/mp4'))).toBe(false);
    expect(isAudioFile(file('meme.png', 'image/png'))).toBe(false);
    expect(isAudioFile(file('notes.txt', 'text/plain'))).toBe(false);
  });
});

describe('audioTimeFor', () => {
  test('locks a 1× soundtrack to output time', () => {
    // 1.5s past a video in-point of 1s, audio in-point of 0.5s.
    expect(audioTimeFor(2.5, 1, 1, 0.5, 1)).toBeCloseTo(2);
  });

  test('a sped-up clip consumes the soundtrack in output time, not media time', () => {
    // 2s of video at 2× is 1s of output, so a 1× track has advanced 1s.
    expect(audioTimeFor(3, 1, 2, 0, 1)).toBeCloseTo(1);
  });

  test('slowing the soundtrack stretches it across the clip', () => {
    // 2s of output at 0.5× reads 1s of the file.
    expect(audioTimeFor(2, 0, 1, 0, 0.5)).toBeCloseTo(1);
  });

  test('time before the video in-point stays on the audio in-point', () => {
    expect(audioTimeFor(0.2, 1, 1, 4, 1)).toBeCloseTo(4);
  });

  test('a bad rate is treated as 1×', () => {
    expect(audioTimeFor(2, 0, 0, 0, Number.NaN)).toBeCloseTo(2);
  });
});

describe('outputDuration', () => {
  test('speeding up shortens the span', () => {
    expect(outputDuration(1, 3, 2)).toBeCloseTo(1);
  });

  test('slowing down lengthens it', () => {
    expect(outputDuration(0, 2, 0.5)).toBeCloseTo(4);
  });
});

describe('compositionDuration', () => {
  test('keeps the video length when looping is off or the audio fits', () => {
    expect(compositionDuration(2, 5, false)).toBeCloseTo(2);
    expect(compositionDuration(5, 2, true)).toBeCloseTo(5);
    expect(loopExtends(5, 2)).toBe(false);
  });

  test('uses the soundtrack when the picture repeats to cover it', () => {
    expect(loopExtends(2, 5)).toBe(true);
    expect(compositionDuration(2, 5, true)).toBeCloseTo(5);
    expect(videoPassCount(2, 5)).toBe(3);
    expect(videoPassCount(2, 4)).toBe(2);
    expect(videoPassCount(2, 2)).toBe(1);
  });
});

describe('sourceTimeAt', () => {
  test('wraps inside the trim while looping and clamps when not', () => {
    expect(sourceTimeAt(2.5, 1, 3, 1, true)).toBeCloseTo(1.5);
    expect(sourceTimeAt(2, 0, 2, 1, true)).toBeCloseTo(0);
    expect(sourceTimeAt(2.5, 1, 3, 1, false)).toBeCloseTo(2.999);
  });

  test('a sped-up clip maps output time back onto the file', () => {
    expect(sourceTimeAt(0.5, 1, 5, 2, true)).toBeCloseTo(2);
  });
});

describe('videoWrapped', () => {
  test('spots a jump from the out-point back to the in-point', () => {
    expect(videoWrapped({ previous: 1.95, current: 0.02, start: 0, end: 2, paused: false })).toBe(true);
  });

  test('ignores a pause and a seek that does not land on the in-point', () => {
    expect(videoWrapped({ previous: 1.95, current: 0.02, start: 0, end: 2, paused: true })).toBe(false);
    expect(videoWrapped({ previous: 1.2, current: 0.4, start: 0, end: 2, paused: false })).toBe(false);
  });
});

describe('audioSpan', () => {
  test('a missing trim is the whole file', () => {
    expect(audioSpan(8, null)).toEqual({ start: 0, end: 8 });
  });

  test('clamps a trim into the file', () => {
    expect(audioSpan(5, { start: -1, end: 9 })).toEqual({ start: 0, end: 5 });
  });

  test('an unknown duration is empty', () => {
    expect(audioSpan(Number.POSITIVE_INFINITY, null)).toEqual({ start: 0, end: 0 });
  });
});

describe('soundtrackSync', () => {
  const base = {
    videoPaused: false,
    videoMoved: true,
    videoTime: 1,
    videoStart: 0,
    videoSpeed: 1,
    audioTime: 1,
    audioStart: 0,
    audioEnd: 4,
    audioSpeed: 1,
  };

  test('plays when the playhead is close enough', () => {
    expect(soundtrackSync(base)).toEqual({ pause: false, seek: null, restart: false });
  });

  test('seeks when playback has drifted', () => {
    expect(soundtrackSync({ ...base, audioTime: 2 })).toEqual({ pause: false, seek: 1, restart: false });
  });

  test('pauses once the trim runs out', () => {
    expect(soundtrackSync({ ...base, videoTime: 4, audioTime: 3.9 })).toEqual({ pause: true, seek: null, restart: false });
  });

  test('while paused, ignores the audio playhead unless the video moved', () => {
    expect(soundtrackSync({ ...base, videoPaused: true, videoMoved: false, audioTime: 3 })).toEqual({ pause: true, seek: null, restart: false });
    expect(soundtrackSync({ ...base, videoPaused: true, videoMoved: true, audioTime: 3 })).toEqual({ pause: true, seek: 1, restart: false });
  });

  test('a repeated clip keeps the soundtrack moving through later passes', () => {
    expect(
      soundtrackSync({
        ...base,
        videoTime: 0.25,
        audioTime: 2.25,
        audioEnd: 5,
        videoLoops: 1,
        videoOut: 2,
        loopVideo: true,
      }),
    ).toEqual({ pause: false, seek: null, restart: false });
  });

  test('looping off ignores completed passes and follows the picture', () => {
    expect(
      soundtrackSync({
        ...base,
        videoTime: 0.25,
        audioTime: 2.25,
        videoLoops: 1,
        videoOut: 2,
        loopVideo: false,
      }),
    ).toEqual({ pause: false, seek: 0.25, restart: false });
  });

  test('restarts both once the looped soundtrack reaches its end', () => {
    expect(
      soundtrackSync({
        ...base,
        videoTime: 1.2,
        audioTime: 5,
        audioEnd: 5,
        videoLoops: 2,
        videoOut: 2,
        loopVideo: true,
      }),
    ).toEqual({ pause: false, seek: 0, restart: true });
  });
});
