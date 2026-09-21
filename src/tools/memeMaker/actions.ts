import { useCallback, useRef, useState, type Dispatch, type RefObject } from 'react';
import sampleUrl from '../../assets/meme-sample.jpg';
import { assetUrl } from '../../lib/assetUrl';
import type { NotificationType } from '../../components/NotificationProvider';
import { canvasToPng, copyPng, downloadBlob, extensionFor, recordVideo } from '../../lib/meme/export.ts';
import { canvasToGif, GIF_MAX_DURATION, recordGif } from '../../lib/meme/gif.ts';
import { baseName, loadIconFile, loadMediaFile, loadMediaUrl } from '../../lib/meme/media.ts';
import type { IconAtlas, MediaAsset } from '../../lib/meme/types.ts';
import type { EditorAction, EditorState } from './editor';

type Notify = (message: string, type?: NotificationType) => void;

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export interface EditorActions {
  loading: boolean;
  openFile(file: File): Promise<void>;
  openSample(): Promise<void>;
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
  notify: Notify;
}): EditorActions {
  const { stateRef, dispatch, setMedia, atlas, canvasRef, notify } = options;
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

  const openFile = useCallback((file: File) => load(() => loadMediaFile(file), "Couldn't open that file."), [load]);

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
    const { media, exporting } = stateRef.current;
    const canvas = canvasRef.current;
    if (!media || !canvas || exporting) return;
    const name = `${baseName(media.name)}-meme`;

    if (media.kind === 'image') {
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
    try {
      const blob = await recordVideo({
        canvas,
        video: media.source as HTMLVideoElement,
        signal: controller.signal,
        onProgress: (value) => dispatch({ type: 'exporting', exporting: { kind: 'video', progress: value } }),
      });
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
  }, [stateRef, canvasRef, dispatch, notify]);

  const exportGif = useCallback(async () => {
    const { media, placement, captions, offsets, styles, exporting } = stateRef.current;
    const canvas = canvasRef.current;
    if (!media || !canvas || exporting) return;
    const name = `${baseName(media.name)}-meme`;

    if (media.kind === 'image') {
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
        },
        video: media.source as HTMLVideoElement,
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
  }, [stateRef, canvasRef, dispatch, notify]);

  const copyImage = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || stateRef.current.media?.kind !== 'image') return;
    try {
      await copyPng(canvas);
      notify('Copied to clipboard', 'success');
    } catch {
      notify('Your browser blocked clipboard access. Use Export instead.', 'error');
    }
  }, [stateRef, canvasRef, notify]);

  const cancelExport = useCallback(() => abortRef.current?.abort(), []);

  return { loading, openFile, openSample, addIconFile, exportMedia, exportGif, copyImage, cancelExport };
}
