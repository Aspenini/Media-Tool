import { useCallback, useRef, useState, type Dispatch, type RefObject } from 'react';
import sampleUrl from '../../assets/meme-sample.jpg';
import { assetUrl } from '../../lib/assetUrl';
import type { NotificationType } from '../../components/NotificationProvider';
import { audioSpan, disposeAudio, isAudioFile, loadAudioFile, loopExtends, outputDuration } from '../../lib/meme/audio.ts';
import { canvasToPng, copyPng, downloadBlob, extensionFor, recordStill, recordVideo, type RecordSoundtrack } from '../../lib/meme/export.ts';
import { canvasToGif, GIF_MAX_DURATION, recordGif } from '../../lib/meme/gif.ts';
import { baseName, loadIconFile, loadMediaFile, loadMediaUrl, playableSource, trimSpan } from '../../lib/meme/media.ts';
import type { IconAtlas, MediaAsset } from '../../lib/meme/types.ts';
import type { EditorAction, EditorState } from './editor';

type Notify = (message: string, type?: NotificationType) => void;

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Output seconds a GIF should cover by repeating the clip, or undefined for one pass. */
function gifCoverSeconds(
  media: MediaAsset,
  trim: EditorState['trim'],
  speed: number,
  audio: EditorState['audio'],
  audioTrim: EditorState['audioTrim'],
  audioSpeed: number,
  loopVideo: boolean,
): number | undefined {
  if (!loopVideo || !audio || media.kind !== 'video') return undefined;
  const videoSpan = trimSpan(media, trim);
  if (!videoSpan) return undefined;
  const soundtrack = audioSpan(audio.duration, audioTrim);
  const videoOut = outputDuration(videoSpan.start, videoSpan.end, speed);
  const audioOut = outputDuration(soundtrack.start, soundtrack.end, audioSpeed);
  return loopExtends(videoOut, audioOut) ? audioOut : undefined;
}

export interface EditorActions {
  loading: boolean;
  openFile(file: File): Promise<void>;
  openSample(): Promise<void>;
  addAudioFile(file: File): Promise<void>;
  clearAudio(): void;
  addIconFile(file: File): Promise<void>;
  exportMedia(): Promise<void>;
  exportGif(): Promise<void>;
  copyImage(): Promise<void>;
  cancelExport(): void;
}

export function useEditorActions(options: {
  stateRef: RefObject<EditorState>;
  dispatch: Dispatch<EditorAction>;
  setMedia: (media: MediaAsset | null) => void;
  atlas: IconAtlas;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** The main canvas shows the uncropped crop editor while this is set, so it can't be exported. */
  croppingRef: RefObject<boolean>;
  notify: Notify;
}): EditorActions {
  const { stateRef, dispatch, setMedia, atlas, canvasRef, croppingRef, notify } = options;
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const atlasRef = useRef(atlas);
  atlasRef.current = atlas;

  const load = useCallback(
    async (task: () => Promise<MediaAsset>, failure: string) => {
      if (stateRef.current.exporting) return;
      setLoading(true);
      try {
        setMedia(await task());
      } catch (error) {
        notify(message(error, failure), 'error');
      } finally {
        setLoading(false);
      }
    },
    [stateRef, setMedia, notify],
  );

  const addAudioFile = useCallback(
    async (file: File) => {
      if (stateRef.current.exporting) return;
      const media = stateRef.current.media;
      if (!media) {
        notify('Open a photo or clip first, then add audio.', 'error');
        return;
      }
      if (!isAudioFile(file)) {
        notify(`“${file.name}” isn't an audio file.`, 'error');
        return;
      }
      try {
        const track = await loadAudioFile(file);
        const previous = stateRef.current.audio;
        dispatch({ type: 'audio', audio: track });
        if (previous) disposeAudio(previous);
        notify(`Added ${track.name}`, 'success');
        // A clip carries the soundtrack along as it plays. A still has nothing to follow, so start it here.
        if (!playableSource(media) && !stateRef.current.previewMuted) void track.element.play().catch(() => undefined);
      } catch (error) {
        notify(message(error, "Couldn't open that audio."), 'error');
      }
    },
    [stateRef, dispatch, notify],
  );

  const clearAudio = useCallback(() => {
    const previous = stateRef.current.audio;
    if (!previous) return;
    dispatch({ type: 'audio', audio: null });
    disposeAudio(previous);
  }, [stateRef, dispatch]);

  const openFile = useCallback(
    (file?: File) => {
      if (!file) return Promise.resolve();
      if (isAudioFile(file)) return addAudioFile(file);
      return load(() => loadMediaFile(file), "Couldn't open that file.");
    },
    [addAudioFile, load],
  );

  const openSample = useCallback(() => load(() => loadMediaUrl(assetUrl(sampleUrl), 'sample.jpg'), "Couldn't load the sample."), [load]);

  const addIconFile = useCallback(
    async (file: File) => {
      try {
        const icon = await loadIconFile(file, (id) => atlasRef.current.has(id));
        dispatch({ type: 'addIcon', icon });
        notify(`Added :${icon.id}:`, 'success');
      } catch (error) {
        notify(message(error, "Couldn't add that icon."), 'error');
      }
    },
    [dispatch, notify],
  );

  const exportMedia = useCallback(async () => {
    const {
      media,
      trim,
      speed,
      keepPitch,
      audio,
      audioTrim,
      audioSpeed,
      audioKeepPitch,
      audioVolume,
      replaceAudio,
      loopVideo,
      exporting,
    } = stateRef.current;
    const canvas = canvasRef.current;
    if (!media || !canvas || exporting || croppingRef.current) return;
    const name = `${baseName(media.name)}-meme`;

    const video = playableSource(media);
    const soundtrack: RecordSoundtrack | undefined = audio
      ? {
          url: audio.url,
          ...audioSpan(audio.duration, audioTrim),
          speed: audioSpeed,
          keepPitch: audioKeepPitch,
          volume: audioVolume,
          replace: replaceAudio,
          loopVideo,
        }
      : undefined;

    if (!video && !soundtrack) {
      try {
        downloadBlob(await canvasToPng(canvas), `${name}.png`);
        notify('PNG saved', 'success');
      } catch (error) {
        notify(message(error, 'Export failed.'), 'error');
      }
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    dispatch({ type: 'exporting', exporting: { kind: 'video', progress: 0 } });
    const onProgress = (value: number) => dispatch({ type: 'exporting', exporting: { kind: 'video', progress: value } });
    try {
      const blob = video
        ? await recordVideo({
            canvas,
            video,
            ...trimSpan(media, trim),
            speed,
            keepPitch,
            soundtrack,
            signal: controller.signal,
            onProgress,
          })
        : soundtrack
          ? await recordStill({ canvas, soundtrack, signal: controller.signal, onProgress })
          : null;
      if (blob) {
        downloadBlob(blob, `${name}.${extensionFor(blob)}`);
        notify(`${extensionFor(blob).toUpperCase()} saved`, 'success');
      } else {
        notify('Export cancelled');
      }
    } catch (error) {
      notify(message(error, 'Recording failed.'), 'error');
    } finally {
      abortRef.current = null;
      dispatch({ type: 'exporting', exporting: null });
    }
  }, [stateRef, canvasRef, croppingRef, dispatch, notify]);

  const exportGif = useCallback(async () => {
    const { media, crop, trim, speed, placement, captions, offsets, styles, goldfish, exporting, audio, audioTrim, audioSpeed, loopVideo } =
      stateRef.current;
    const canvas = canvasRef.current;
    if (!media || !canvas || exporting || croppingRef.current) return;
    const name = `${baseName(media.name)}-meme`;
    const video = playableSource(media);

    if (!video) {
      dispatch({ type: 'exporting', exporting: { kind: 'gif', progress: 0 } });
      try {
        downloadBlob(await canvasToGif(canvas), `${name}.gif`);
        notify('GIF saved', 'success');
      } catch (error) {
        notify(message(error, 'GIF export failed.'), 'error');
      } finally {
        dispatch({ type: 'exporting', exporting: null });
      }
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    dispatch({ type: 'exporting', exporting: { kind: 'gif', progress: 0 } });
    try {
      const result = await recordGif({
        scene: {
          media,
          placement,
          captions,
          offsets,
          style: styles[placement],
          icons: atlasRef.current,
          crop,
          goldfish,
        },
        video,
        ...trimSpan(media, trim),
        speed,
        coverSeconds: gifCoverSeconds(media, trim, speed, audio, audioTrim, audioSpeed, loopVideo),
        signal: controller.signal,
        onProgress: (progress) => dispatch({ type: 'exporting', exporting: { kind: 'gif', progress } }),
      });
      if (result) {
        downloadBlob(result.blob, `${name}.gif`);
        notify(result.truncated ? `GIF saved (first ${GIF_MAX_DURATION} seconds)` : 'GIF saved', 'success');
      } else {
        notify('Export cancelled');
      }
    } catch (error) {
      notify(message(error, 'GIF export failed.'), 'error');
    } finally {
      abortRef.current = null;
      dispatch({ type: 'exporting', exporting: null });
    }
  }, [stateRef, canvasRef, croppingRef, dispatch, notify]);

  const copyImage = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || stateRef.current.media?.kind !== 'image' || croppingRef.current) return;
    try {
      await copyPng(canvas);
      notify('Copied to clipboard', 'success');
    } catch {
      notify('Your browser blocked clipboard access. Use Export instead.', 'error');
    }
  }, [stateRef, canvasRef, croppingRef, notify]);

  const cancelExport = useCallback(() => abortRef.current?.abort(), []);

  return { loading, openFile, openSample, addAudioFile, clearAudio, addIconFile, exportMedia, exportGif, copyImage, cancelExport };
}
