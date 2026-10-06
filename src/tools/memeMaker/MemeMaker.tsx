import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import GifBoxRoundedIcon from '@mui/icons-material/GifBoxRounded';
import DragIndicatorRoundedIcon from '@mui/icons-material/DragIndicatorRounded';
import FormatAlignCenterRoundedIcon from '@mui/icons-material/FormatAlignCenterRounded';
import FormatAlignLeftRoundedIcon from '@mui/icons-material/FormatAlignLeftRounded';
import FormatAlignRightRoundedIcon from '@mui/icons-material/FormatAlignRightRounded';
import ImageRoundedIcon from '@mui/icons-material/ImageRounded';
import MovieRoundedIcon from '@mui/icons-material/MovieRounded';
import PauseRoundedIcon from '@mui/icons-material/PauseRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import SentimentVerySatisfiedRoundedIcon from '@mui/icons-material/SentimentVerySatisfiedRounded';
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded';
import VolumeOffRoundedIcon from '@mui/icons-material/VolumeOffRounded';
import VolumeUpRoundedIcon from '@mui/icons-material/VolumeUpRounded';
import AudiotrackRoundedIcon from '@mui/icons-material/AudiotrackRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import CropRoundedIcon from '@mui/icons-material/CropRounded';
import HighQualityRoundedIcon from '@mui/icons-material/HighQualityRounded';
import RepeatRoundedIcon from '@mui/icons-material/RepeatRounded';
import { useIncomingFiles } from '../../components/FileBridge';
import { FileButton, FileDropZone } from '../../components/FileDropZone';
import { Panel, PanelSection, Stage, StageDock, ToolIntro, Workbench } from '../../components/Workbench';
import { ExportFooter } from '../../components/ExportFooter';
import { ChoiceCard, ColorField, Segmented, SliderField, SwitchRow, type SegmentOption } from '../../components/controls';
import { TrimTimeline } from '../../components/TrimTimeline';
import { audioSpan, loopExtends, outputDuration, soundtrackSync, videoPassCount, videoWrapped } from '../../lib/meme/audio.ts';
import { cropPixels, dragCrop, fitAspect, FULL_CROP, isFullCrop, type CropHandle } from '../../lib/meme/crop.ts';
import { playableSource, trimSpan } from '../../lib/meme/media.ts';
import { clampRange, formatTimecode } from '../../lib/videoTrim';
import { canCopyImage } from '../../lib/meme/export.ts';
import { FONTS } from '../../lib/meme/fonts.ts';
import { renderScene, sameFrame, type Frame, type Scene } from '../../lib/meme/render.ts';
import type { CaptionSlot, Placement, Rect, TextAlign, TextStyle, Trim } from '../../lib/meme/types.ts';
import { MONO_FONT } from '../../theme';
import { cropRatio, DEFAULT_OFFSETS, EditorProvider, useEditor, type CropAspect, type EditorState } from './editor';

const MEDIA_ACCEPT = 'image/*,video/*';
const AUDIO_ACCEPT = 'audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.opus,.weba';
const SNAP = 0.015;
const FILL_PRESETS = ['#ffffff', '#111111', '#ffd23f', '#ff4d6d', '#4dd8ff', '#7cff6b'];
const STROKE_PRESETS = ['#000000', '#ffffff', '#5a2d00', '#2a1459', '#b0123a', '#0b4a6f'];
const CROP_ASPECTS: SegmentOption<CropAspect>[] = [
  { value: 'free', label: 'Free' },
  { value: 'original', label: 'Original' },
  { value: '1:1', label: '1:1' },
  { value: '4:5', label: '4:5' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
];
const SPEEDS: SegmentOption<number>[] = [0.5, 1, 1.5, 2, 3, 4].map((value) => ({ value, label: `${value}×` }));
const CROP_HANDLES: { handle: CropHandle; left: string; top: string }[] = [
  { handle: 'nw', left: '0%', top: '0%' },
  { handle: 'n', left: '50%', top: '0%' },
  { handle: 'ne', left: '100%', top: '0%' },
  { handle: 'e', left: '100%', top: '50%' },
  { handle: 'se', left: '100%', top: '100%' },
  { handle: 's', left: '50%', top: '100%' },
  { handle: 'sw', left: '0%', top: '100%' },
  { handle: 'w', left: '0%', top: '50%' },
];
const MOD = typeof navigator !== 'undefined' && /mac|iphone|ipad/i.test(navigator.platform) ? '⌘' : 'Ctrl';

export function MemeMaker() {
  return (
    <EditorProvider>
      <Studio />
    </EditorProvider>
  );
}

function Studio() {
  useShortcuts();
  useTrimLoop();
  usePlaybackSpeed();
  useSoundtrack();
  useStillSoundtrack();
  const { state, busy, openFile } = useEditor();
  return (
    <Workbench panelWidth={360}>
      <Controls />
      <Stage
        backdrop="grid"
        onFiles={state.media && !busy ? (files) => void openFile(files[0]) : undefined}
        dropLabel="Drop to replace"
        overlay={state.media && <MediaDock />}
      >
        <Preview />
      </Stage>
      <input
        id="meme-media-input"
        type="file"
        accept={MEDIA_ACCEPT}
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          if (file) void openFile(file);
        }}
      />
    </Workbench>
  );
}

/** Ctrl/⌘ S exports and Ctrl/⌘ O opens a file — while this tool is open. Enter or Esc finishes a crop. */
function useShortcuts() {
  const { openFile, exportMedia, busy, cropping, setCropping } = useEditor();
  useIncomingFiles((files) => {
    if (!busy) void openFile(files[0]);
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && event.target.closest('input, textarea, button, [role="slider"]');
      if (cropping && (event.key === 'Escape' || (event.key === 'Enter' && !typing))) {
        event.preventDefault();
        setCropping(false);
        return;
      }
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 's') {
        event.preventDefault();
        void exportMedia();
      } else if (key === 'o' && !busy) {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('#meme-media-input')?.click();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [exportMedia, busy, cropping, setCropping]);
}

/** Keep a trimmed clip looping between its in and out points while previewing. */
function useTrimLoop() {
  const { state, busy } = useEditor();
  const { media, trim } = state;
  useEffect(() => {
    const video = playableSource(media);
    const span = media && trimSpan(media, trim);
    // Untrimmed clips use the element's own loop; exports drive playback themselves.
    if (!video || !span || !trim || busy) return;
    const check = () => {
      const t = video.currentTime;
      if (!video.paused && !video.seeking && (t >= span.end || t < span.start - 0.05)) video.currentTime = span.start;
    };
    // Every frame for a tight loop; `timeupdate` covers background tabs where frames stop.
    let handle = requestAnimationFrame(function tick() {
      check();
      handle = requestAnimationFrame(tick);
    });
    const onEnded = () => {
      video.currentTime = span.start;
      void video.play().catch(() => undefined);
    };
    video.addEventListener('timeupdate', check);
    video.addEventListener('ended', onEnded);
    return () => {
      cancelAnimationFrame(handle);
      video.removeEventListener('timeupdate', check);
      video.removeEventListener('ended', onEnded);
    };
  }, [media, trim, busy]);
}

/** Apply the chosen speed and pitch setting to the preview element (which the recorder plays too). */
function usePlaybackSpeed() {
  const { state } = useEditor();
  const { media, speed, keepPitch } = state;
  useEffect(() => {
    const video = playableSource(media);
    if (!video) return;
    video.defaultPlaybackRate = speed;
    video.playbackRate = speed;
    video.preservesPitch = keepPitch;
  }, [media, speed, keepPitch]);
}

/**
 * Play the added soundtrack in step with the clip, and honor the preview mute.
 * Export takes the elements over while `busy` is set, so this steps aside then.
 */
function useSoundtrack() {
  const { state, busy } = useEditor();
  const { media, audio, replaceAudio, previewMuted } = state;
  const params = useRef(state);
  params.current = state;

  useEffect(() => {
    const video = playableSource(media);
    if (!video || busy) return;
    video.muted = previewMuted || Boolean(audio && replaceAudio);
  }, [media, audio, replaceAudio, previewMuted, busy]);

  useEffect(() => {
    const video = playableSource(media);
    const sound = audio?.element;
    if (!media || !video || !sound || busy) return;

    sound.loop = false;
    let appliedSpeed = Number.NaN;
    let appliedPitch = sound.preservesPitch;
    let raf = 0;
    let lastVideoTime = video.currentTime;
    let nextPlay = 0;
    let loops = 0;
    let timingSig = '';
    // Set when we ourselves seek back to the in-point, so the landing frame isn't counted again.
    let heldEnd = false;
    // Set when the piece restarts, so the seek back to the in-point isn't counted as a pass.
    let suppressWrap = false;
    let suppressWait = 0;

    const tick = () => {
      const current = params.current;
      const track = current.audio;
      if (!track || track.element !== sound) {
        raf = requestAnimationFrame(tick);
        return;
      }
      if (appliedSpeed !== current.audioSpeed) {
        sound.playbackRate = current.audioSpeed;
        sound.preservesPitch = current.audioKeepPitch;
        appliedSpeed = current.audioSpeed;
        appliedPitch = current.audioKeepPitch;
      } else if (appliedPitch !== current.audioKeepPitch) {
        sound.preservesPitch = current.audioKeepPitch;
        appliedPitch = current.audioKeepPitch;
      }
      if (sound.volume !== current.audioVolume) sound.volume = current.audioVolume;
      if (sound.muted !== current.previewMuted) sound.muted = current.previewMuted;

      const t = video.currentTime;
      // Captured before this tick seeks. A seek we start below would otherwise look like a pause and cut the soundtrack.
      const paused = video.paused || video.seeking;
      const moved = Math.abs(t - lastVideoTime) > 0.0005;
      const vSpan = current.media?.kind === 'video' ? trimSpan(current.media, current.trim) : trimSpan(media, current.trim);
      const aSpan = audioSpan(track.duration, current.audioTrim);
      const videoOut = vSpan ? outputDuration(vSpan.start, vSpan.end, current.speed) : 0;
      const audioOut = outputDuration(aSpan.start, aSpan.end, current.audioSpeed);
      const looping = current.loopVideo && loopExtends(videoOut, audioOut);
      const sig = `${current.loopVideo}|${current.speed}|${current.audioSpeed}|${vSpan?.start ?? ''}|${vSpan?.end ?? ''}|${aSpan.start}|${aSpan.end}`;
      let forceMoved = false;
      if (sig !== timingSig) {
        timingSig = sig;
        loops = 0;
        heldEnd = false;
        suppressWrap = false;
        lastVideoTime = t;
        forceMoved = true;
      }

      let syncTime = t;
      if (!forceMoved && looping && vSpan) {
        if (suppressWrap) {
          // Hold the soundtrack on the in-point while the picture seeks back there.
          syncTime = vSpan.start;
          lastVideoTime = t;
          const nearStart = Math.abs(t - vSpan.start) <= 0.2;
          if ((nearStart && !video.seeking) || ++suppressWait > 15) {
            suppressWrap = false;
            suppressWait = 0;
          }
        } else {
          if (t < vSpan.end - 0.05) heldEnd = false;
          const hitEnd = !video.paused && !video.seeking && !heldEnd && t >= vSpan.end - 0.001;
          const wrapped = videoWrapped({
            previous: lastVideoTime,
            current: t,
            start: vSpan.start,
            end: vSpan.end,
            paused: video.paused,
          });
          if (hitEnd) {
            // Count the pass here and report the in-point, so the playhead still sitting
            // on the out-point doesn't add the span a second time.
            loops += 1;
            syncTime = vSpan.start;
            lastVideoTime = vSpan.start;
            heldEnd = true;
            if (Math.abs(t - vSpan.start) > 0.01) video.currentTime = vSpan.start;
          } else if (wrapped) {
            loops += 1;
            lastVideoTime = t;
          } else if (!video.seeking && Math.abs(t - lastVideoTime) > 0.35) {
            loops = 0;
            lastVideoTime = t;
          } else if (!video.seeking) {
            lastVideoTime = t;
          }
        }
      } else {
        if (!looping) loops = 0;
        lastVideoTime = t;
      }

      const sync = soundtrackSync({
        videoPaused: paused,
        videoMoved: forceMoved || moved,
        videoTime: syncTime,
        videoStart: vSpan?.start ?? 0,
        videoSpeed: current.speed,
        audioTime: sound.currentTime,
        audioStart: aSpan.start,
        audioEnd: aSpan.end,
        audioSpeed: current.audioSpeed,
        videoLoops: loops,
        videoOut,
        loopVideo: current.loopVideo,
      });
      if (sync.restart && vSpan) {
        loops = 0;
        heldEnd = false;
        suppressWrap = true;
        suppressWait = 0;
        lastVideoTime = vSpan.start;
        if (Math.abs(video.currentTime - vSpan.start) > 0.04) video.currentTime = vSpan.start;
      }
      if (sync.seek !== null && !sound.seeking) sound.currentTime = sync.seek;
      if (sync.pause) {
        if (!sound.paused) sound.pause();
      } else if (sound.paused && performance.now() >= nextPlay) {
        nextPlay = performance.now() + 400;
        void sound.play().catch(() => undefined);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      sound.pause();
    };
  }, [media, audio, busy]);
}

/**
 * A still has no clock for its soundtrack to follow, so the preview loops the trimmed
 * span on its own, played and paused from the dock. Export takes over while `busy` is set.
 */
function useStillSoundtrack() {
  const { state, busy } = useEditor();
  const { media, audio } = state;
  const params = useRef(state);
  params.current = state;

  useEffect(() => {
    const sound = audio?.element;
    if (!media || playableSource(media) || !audio || !sound || busy) return;
    sound.loop = false;
    const span = () => audioSpan(audio.duration, params.current.audioTrim);
    const check = () => {
      const current = params.current;
      if (sound.playbackRate !== current.audioSpeed) sound.playbackRate = current.audioSpeed;
      // After the rate: assigning playbackRate can reset preservesPitch.
      if (sound.preservesPitch !== current.audioKeepPitch) sound.preservesPitch = current.audioKeepPitch;
      if (sound.volume !== current.audioVolume) sound.volume = current.audioVolume;
      if (sound.muted !== current.previewMuted) sound.muted = current.previewMuted;
      const { start, end } = span();
      const t = sound.currentTime;
      if (!sound.paused && !sound.seeking && (t >= end - 0.01 || t < start - 0.05)) sound.currentTime = start;
    };
    const onEnded = () => {
      sound.currentTime = span().start;
      void sound.play().catch(() => undefined);
    };
    // Every frame for a tight loop; `timeupdate` covers background tabs where frames stop.
    let raf = requestAnimationFrame(function tick() {
      check();
      raf = requestAnimationFrame(tick);
    });
    sound.addEventListener('timeupdate', check);
    sound.addEventListener('ended', onEnded);
    return () => {
      cancelAnimationFrame(raf);
      sound.removeEventListener('timeupdate', check);
      sound.removeEventListener('ended', onEnded);
      sound.pause();
    };
  }, [media, audio, busy]);
}

function useVideoTime(media: { currentTime: number } | null): number {
  const [time, setTime] = useState(0);
  useEffect(() => {
    if (!media) return;
    let handle = requestAnimationFrame(function tick() {
      setTime(media.currentTime);
      handle = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(handle);
  }, [media]);
  return time;
}

/* ------------------------------------------------------------------ *
 * Panel
 * ------------------------------------------------------------------ */

function Controls() {
  const { state, busy, cropping, exportMedia, exportGif, copyImage, openFile } = useEditor();
  const media = state.media;
  const locked = busy || cropping;
  const gifBusy = state.exporting?.kind === 'gif';
  const videoBusy = state.exporting?.kind === 'video';

  return (
    <Panel
      footer={
        <ExportFooter
          primary={{
            label: media?.kind === 'video' || state.audio ? 'Export video' : 'Export PNG',
            icon: <DownloadRoundedIcon />,
            busy: videoBusy,
            busyLabel: 'Recording…',
            onClick: () => void exportMedia(),
            disabled: !media || locked,
            title: `${MOD}+S`,
          }}
          aside={
            media?.kind === 'image' &&
            canCopyImage() && (
              <Tooltip title="Copy to clipboard">
                <span>
                  <Button size="large" variant="outlined" onClick={() => void copyImage()} disabled={locked} aria-label="Copy image" sx={{ minWidth: 0, px: 2, height: '100%' }}>
                    <ContentCopyRoundedIcon fontSize="small" />
                  </Button>
                </span>
              </Tooltip>
            )
          }
          secondary={
            media && {
              label: 'Export GIF',
              icon: <GifBoxRoundedIcon />,
              busy: gifBusy,
              busyLabel: 'Encoding…',
              onClick: () => void exportGif(),
              disabled: locked,
            }
          }
          status={
            cropping
              ? 'Finish cropping to export.'
              : media?.kind === 'video'
                ? 'GIFs are 10 fps, up to 10 seconds, scaled to 480px and dithered.'
                : media && state.audio
                  ? 'The video holds this picture for the soundtrack. GIF and copy leave the audio out.'
                  : undefined
          }
        />
        }
    >
      <ToolIntro />
      <Box component="fieldset" disabled={busy} sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}>
        <PanelSection title="Media">
          <FileDropZone
            accept={MEDIA_ACCEPT}
            title={media ? media.name : 'Choose a photo or clip'}
            hint={media ? `${media.width} × ${media.height} · ${media.animated ? 'animation' : media.kind}` : `Or drop, or paste with ${MOD}+V`}
            onFiles={(files) => void openFile(files[0])}
          />
        </PanelSection>
        {media && <CropSection />}
        {media?.kind === 'video' && <TrimSection />}
        {media?.kind === 'video' && <SpeedSection />}
        {media && <SoundtrackSection />}
        {media && <GoldfishSection />}
        <CaptionSection />
        <IconSection />
        <StyleSection />
      </Box>
    </Panel>
  );
}

function CropSection() {
  const { state, dispatch, cropping, setCropping, cropAspect, setCropAspect } = useEditor();
  const media = state.media;
  if (!media) return null;
  const cropped = !isFullCrop(state.crop);
  const px = cropPixels(state.crop, media.width, media.height);

  const chooseAspect = (aspect: CropAspect) => {
    setCropAspect(aspect);
    const ratio = cropRatio(aspect, media);
    if (ratio) dispatch({ type: 'crop', crop: fitAspect(state.crop ?? FULL_CROP, ratio, media.width, media.height) });
    setCropping(true);
  };

  return (
    <PanelSection
      title="Crop"
      action={
        cropped && (
          <Button size="small" variant="text" startIcon={<RestartAltRoundedIcon />} onClick={() => dispatch({ type: 'crop', crop: null })}>
            Reset
          </Button>
        )
      }
    >
      <Segmented<CropAspect> wrap aria-label="Crop aspect ratio" value={cropAspect} onChange={chooseAspect} options={CROP_ASPECTS} />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Button
          variant={cropping ? 'contained' : 'outlined'}
          startIcon={cropping ? <CheckRoundedIcon /> : <CropRoundedIcon />}
          onClick={() => setCropping(!cropping)}
          title={cropping ? 'Enter' : undefined}
        >
          {cropping ? 'Done' : 'Edit crop'}
        </Button>
        <Typography sx={{ fontFamily: MONO_FONT, fontSize: '0.8rem', color: 'text.secondary' }}>
          {cropped ? `${px.w} × ${px.h}` : 'Full frame'}
        </Typography>
      </Box>
    </PanelSection>
  );
}

function TrimSection() {
  const { state, dispatch, busy } = useEditor();
  const media = state.media;
  const video = playableSource(media);
  // Hold the playhead during export: re-rendering the timeline every frame starves the stage.
  const currentTime = useVideoTime(busy ? null : video);
  const span = media && trimSpan(media, state.trim);
  if (!media || !video || !span) return null;
  const trimmed = state.trim !== null && (span.start > 0.001 || span.end < media.duration - 0.001);

  const seek = (time: number) => {
    video.currentTime = Math.min(Math.max(0, time), media.duration);
  };

  return (
    <PanelSection
      title="Trim"
      action={
        trimmed && (
          <Button size="small" variant="text" startIcon={<RestartAltRoundedIcon />} onClick={() => dispatch({ type: 'trim', trim: null })}>
            Reset
          </Button>
        )
      }
    >
      <TrimTimeline
        duration={media.duration}
        currentTime={currentTime}
        start={span.start}
        end={span.end}
        disabled={busy}
        label="Clip trim"
        onSeek={seek}
        onChangeRange={(start, end) => {
          const next = clampRange(start, end, media.duration);
          // Hold on the frame being trimmed to, rather than looping past it.
          video.pause();
          dispatch({ type: 'trim', trim: next });
          seek(Math.abs(next.start - span.start) >= Math.abs(next.end - span.end) ? next.start : next.end);
        }}
      />
      <Typography sx={{ fontFamily: MONO_FONT, fontSize: '0.8rem', color: 'text.secondary', mt: -0.5 }}>
        {formatTimecode(span.start)} → {formatTimecode(span.end)} · {formatTimecode(span.end - span.start)} long
      </Typography>
    </PanelSection>
  );
}

function SpeedSection() {
  const { state, dispatch } = useEditor();
  const { media, speed, keepPitch } = state;
  const span = media && trimSpan(media, state.trim);
  return (
    <PanelSection
      title="Speed"
      action={
        span && (
          <Typography sx={{ fontFamily: MONO_FONT, fontSize: '0.8rem', color: 'text.secondary' }}>
            {formatTimecode((span.end - span.start) / speed)} out
          </Typography>
        )
      }
    >
      <Segmented<number> aria-label="Playback speed" value={speed} onChange={(next) => dispatch({ type: 'speed', speed: next })} options={SPEEDS} />
      {speed !== 1 && (
        <SwitchRow label="Keep audio pitch" checked={keepPitch} onChange={(next) => dispatch({ type: 'keepPitch', keepPitch: next })} />
      )}
    </PanelSection>
  );
}

function SoundtrackTimeline({
  element,
  duration,
  trim,
  speed,
  videoHeard,
  loopVideo,
  still,
  busy,
  onScrub,
  onChangeRange,
}: {
  element: HTMLAudioElement;
  duration: number;
  trim: Trim | null;
  speed: number;
  videoHeard: number | null;
  loopVideo: boolean;
  /** Under a still picture, which simply holds for as long as the track plays. */
  still: boolean;
  busy: boolean;
  onScrub: () => void;
  onChangeRange: (start: number, end: number) => void;
}) {
  const audioTime = useVideoTime(element);
  const span = audioSpan(duration, trim);
  const heard = outputDuration(span.start, span.end, speed);
  const tail = videoHeard !== null && heard + 0.05 < videoHeard ? videoHeard - heard : 0;
  const overrun = videoHeard !== null && heard > videoHeard + 0.05 ? heard - videoHeard : 0;
  const seek = (time: number) => {
    onScrub();
    element.currentTime = Math.min(Math.max(0, time), duration);
  };

  return (
    <>
      <TrimTimeline
        duration={duration}
        currentTime={audioTime}
        start={span.start}
        end={span.end}
        disabled={busy}
        label="Soundtrack trim"
        onSeek={seek}
        onChangeRange={onChangeRange}
      />
      <Typography sx={{ fontFamily: MONO_FONT, fontSize: '0.8rem', color: 'text.secondary', mt: -0.5 }}>
        {formatTimecode(span.start)} → {formatTimecode(span.end)} · {formatTimecode(heard)} heard
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>
        {still
          ? `The picture holds for all ${formatTimecode(heard)}.`
          : tail > 0
          ? `Starts with the clip, then silence for the last ${formatTimecode(tail)}.`
          : overrun > 0
            ? loopVideo
              ? 'Starts with the clip and keeps going while the picture repeats.'
              : `Starts with the clip. The last ${formatTimecode(overrun)} sits past the end.`
            : 'Starts with the clip.'}
      </Typography>
    </>
  );
}

function SoundtrackSection() {
  const { state, dispatch, busy, addAudioFile, clearAudio } = useEditor();
  const { media, audio, audioSpeed, audioKeepPitch, audioVolume, replaceAudio, loopVideo, previewMuted } = state;
  const element = audio?.element ?? null;
  if (!media) return null;
  const still = !playableSource(media);

  if (!audio || !element) {
    return (
      <PanelSection title="Soundtrack">
        <FileDropZone
          accept={AUDIO_ACCEPT}
          icon={AudiotrackRoundedIcon}
          title="Add an audio file"
          hint={
            still
              ? 'MP3, WAV, M4A, OGG or FLAC. Exports as a video that holds this picture for the track.'
              : 'MP3, WAV, M4A, OGG or FLAC. Trim it, then speed it up or slow it down.'
          }
          onFiles={(files) => void addAudioFile(files[0])}
        />
      </PanelSection>
    );
  }

  const span = audioSpan(audio.duration, state.audioTrim);
  const trimmed = state.audioTrim !== null && (span.start > 0.001 || span.end < audio.duration - 0.001);
  const videoSpan = trimSpan(media, state.trim);
  const videoHeard = videoSpan ? outputDuration(videoSpan.start, videoSpan.end, state.speed) : null;
  const audioHeard = outputDuration(span.start, span.end, audioSpeed);
  const extendsClip = videoHeard !== null && loopExtends(videoHeard, audioHeard);
  const passes = videoHeard !== null ? videoPassCount(videoHeard, audioHeard) : 1;
  const loopCaption = !loopVideo
    ? extendsClip
      ? `Turn this on and the picture repeats to cover the extra ${formatTimecode(audioHeard - (videoHeard ?? 0))}.`
      : 'Repeats the picture for as long as the soundtrack plays.'
    : extendsClip
      ? `On — the picture plays ${passes} times, then both start over.`
      : 'On — the soundtrack fits in one pass.';
  const pauseClip = () => {
    playableSource(media)?.pause();
  };

  return (
    <PanelSection
      title="Soundtrack"
      action={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {trimmed && (
            <Button size="small" variant="text" startIcon={<RestartAltRoundedIcon />} onClick={() => dispatch({ type: 'audioTrim', trim: null })}>
              Reset
            </Button>
          )}
          <Button size="small" variant="text" color="error" startIcon={<DeleteOutlineRoundedIcon />} onClick={clearAudio}>
            Remove
          </Button>
        </Box>
      }
    >
      <FileDropZone
        accept={AUDIO_ACCEPT}
        icon={AudiotrackRoundedIcon}
        title={audio.name}
        hint={`${formatTimecode(audio.duration)} · drop to replace`}
        onFiles={(files) => void addAudioFile(files[0])}
      />
      <SoundtrackTimeline
        element={element}
        duration={audio.duration}
        trim={state.audioTrim}
        speed={audioSpeed}
        videoHeard={videoHeard}
        loopVideo={loopVideo && extendsClip}
        still={still}
        busy={busy}
        onScrub={pauseClip}
        onChangeRange={(start, end) => {
          const next = clampRange(start, end, audio.duration);
          pauseClip();
          element.pause();
          dispatch({ type: 'audioTrim', trim: next });
          const edge = Math.abs(next.start - span.start) >= Math.abs(next.end - span.end) ? next.start : next.end;
          element.currentTime = Math.min(Math.max(0, edge), audio.duration);
        }}
      />
      {!still && (
        <>
          <Button
            fullWidth
            size="large"
            variant={loopVideo ? 'contained' : 'outlined'}
            startIcon={<RepeatRoundedIcon />}
            onClick={() => dispatch({ type: 'loopVideo', loopVideo: !loopVideo })}
            aria-pressed={loopVideo}
          >
            Loop video until audio finishes
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ mt: -0.75 }}>
            {loopCaption}
          </Typography>
        </>
      )}
      <SliderField
        label="Speed"
        aria-label="Soundtrack speed"
        value={audioSpeed}
        min={0.25}
        max={3}
        step={0.05}
        format={(value) => `${value.toFixed(2)}×`}
        onChange={(next) => dispatch({ type: 'audioSpeed', speed: next })}
      />
      {Math.abs(audioSpeed - 1) > 0.001 && (
        <SwitchRow label="Keep audio pitch" checked={audioKeepPitch} onChange={(next) => dispatch({ type: 'audioKeepPitch', keepPitch: next })} />
      )}
      <SliderField
        label="Volume"
        aria-label="Soundtrack volume"
        value={audioVolume}
        min={0}
        max={1}
        step={0.01}
        format={(value) => `${Math.round(value * 100)}%`}
        onChange={(next) => dispatch({ type: 'audioVolume', volume: next })}
      />
      {/* Stills and animations have no audio of their own to replace. */}
      {!still && !media.animated && (
        <SwitchRow
          label="Replace the clip's audio"
          hint="Mute the video's own soundtrack."
          checked={replaceAudio}
          onChange={(next) => dispatch({ type: 'replaceAudio', replaceAudio: next })}
        />
      )}
      {previewMuted ? (
        <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>
          The preview is muted. Unmute it on the picture to hear this track.
        </Typography>
      ) : (
        still && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>
            Play and pause it from the bar under the picture.
          </Typography>
        )
      )}
    </PanelSection>
  );
}

function GoldfishSection() {
  const { state, dispatch, cropping } = useEditor();
  const on = state.goldfish;
  const video = state.media?.kind === 'video';
  return (
    <PanelSection title="Look">
      <Button
        fullWidth
        size="large"
        variant={on ? 'contained' : 'outlined'}
        startIcon={<HighQualityRoundedIcon />}
        disabled={cropping}
        title={cropping ? 'Finish cropping to preview this' : undefined}
        onClick={() => dispatch({ type: 'goldfish', goldfish: !on })}
        aria-pressed={on}
      >
        Appeal to goldfish
      </Button>
      <Typography variant="caption" color="text.secondary" sx={{ mt: -0.75 }}>
        {on
          ? video
            ? 'On — crisper edges, louder color, smoother motion.'
            : 'On — crisper edges and louder color.'
          : video
            ? 'Fake 4K: sharper edges, more vibrant color, smoother motion.'
            : 'Fake 4K: sharper edges and more vibrant color.'}
      </Typography>
    </PanelSection>
  );
}

function CaptionField({ slot, label }: { slot: CaptionSlot; label: string }) {
  const { state, style, dispatch, fieldRefs, rememberField } = useEditor();
  return (
    <TextField
      label={label}
      multiline
      minRows={2}
      placeholder={slot === 'bottom' ? 'Optional' : 'Say something…'}
      value={state.captions[slot]}
      inputRef={fieldRefs[slot]}
      onFocus={() => rememberField(slot)}
      onChange={(event) => dispatch({ type: 'caption', slot, text: event.target.value })}
      slotProps={{ htmlInput: { spellCheck: false, style: { textTransform: style.allCaps ? 'uppercase' : 'none' } } }}
    />
  );
}

function CaptionSection() {
  const { state, dispatch } = useEditor();
  const bar = state.placement === 'bar';
  return (
    <PanelSection title="Caption">
      <Segmented<Placement>
        aria-label="Caption placement"
        value={state.placement}
        onChange={(placement) => dispatch({ type: 'placement', placement })}
        options={[
          { value: 'overlay', label: 'On the media' },
          { value: 'bar', label: 'Bar on top' },
        ]}
      />
      <CaptionField slot="top" label={bar ? 'Caption' : 'Top text'} />
      {!bar && <CaptionField slot="bottom" label="Bottom text" />}
      {!bar && state.media && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: -0.5 }}>
          <DragIndicatorRoundedIcon sx={{ fontSize: 14 }} /> Drag captions on the preview to move them.
        </Typography>
      )}
    </PanelSection>
  );
}

function IconSection() {
  const { icons, insertIcon, removeIcon, addIconFile } = useEditor();
  return (
    <PanelSection title="Inline icons">
      <Typography variant="caption" color="text.secondary" sx={{ mt: -0.75 }}>
        Click one to drop it in at the cursor, or type a token like <Box component="code">:star:</Box>
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(40px, 1fr))', gap: 0.75 }}>
        {icons.map((icon) => (
          <Box key={icon.id} sx={{ position: 'relative', '&:hover .remove-icon': { opacity: 1 } }}>
            <Tooltip title={`:${icon.id}:`}>
              <IconButton
                aria-label={`Insert ${icon.label}`}
                // Keep focus (and the caret) in the caption while clicking.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertIcon(icon.id)}
                sx={{ width: '100%', aspectRatio: '1 / 1', borderRadius: 2, border: '1px solid', borderColor: 'divider', p: 0.75 }}
              >
                <Box component="img" src={icon.src} alt="" draggable={false} sx={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </IconButton>
            </Tooltip>
            {icon.custom && (
              <IconButton
                className="remove-icon"
                size="small"
                aria-label={`Remove ${icon.label}`}
                onClick={() => removeIcon(icon.id)}
                sx={{ position: 'absolute', top: -6, right: -6, width: 18, height: 18, p: 0, bgcolor: 'error.main', color: '#fff', opacity: { xs: 1, md: 0 }, '&:hover': { bgcolor: 'error.dark' } }}
              >
                <CloseRoundedIcon sx={{ fontSize: 12 }} />
              </IconButton>
            )}
          </Box>
        ))}
        <Tooltip title="Upload your own icon">
          <FileButton
            variant="outlined"
            accept="image/*"
            onFiles={(files) => void addIconFile(files[0])}
            aria-label="Upload your own icon"
            sx={{ minWidth: 0, p: 0, aspectRatio: '1 / 1', borderRadius: 2, borderStyle: 'dashed' }}
          >
            <AddRoundedIcon />
          </FileButton>
        </Tooltip>
      </Box>
    </PanelSection>
  );
}

function StyleSection() {
  const { state, style, dispatch } = useEditor();
  const set = (patch: Partial<TextStyle>) => dispatch({ type: 'style', patch });

  return (
    <PanelSection
      title={state.placement === 'bar' ? 'Style · bar' : 'Style · overlay'}
      action={
        <Button size="small" variant="text" startIcon={<RestartAltRoundedIcon />} onClick={() => dispatch({ type: 'resetStyle' })}>
          Reset
        </Button>
      }
    >
      <Box role="radiogroup" aria-label="Font" sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 0.75 }}>
        {FONTS.map((font) => (
          <ChoiceCard
            key={font.id}
            selected={style.fontId === font.id}
            onClick={() => set({ fontId: font.id })}
            aria-label={font.label}
            sx={{ flexDirection: 'column', alignItems: 'center', px: 0.5, py: 1, minWidth: 0 }}
          >
            <Typography sx={{ fontFamily: font.family, fontWeight: font.weight, fontSize: '1.25rem', lineHeight: 1.1 }}>Aa</Typography>
            <Typography noWrap sx={{ fontSize: '0.62rem', color: 'text.secondary', mt: 0.5, maxWidth: '100%' }}>
              {font.label}
            </Typography>
          </ChoiceCard>
        ))}
      </Box>

      <SliderField label="Size" value={style.sizePct} min={2.5} max={16} step={0.1} format={(v) => `${v.toFixed(1)}%`} onChange={(sizePct) => set({ sizePct })} />
      <SliderField
        label="Outline"
        value={style.strokeWidth}
        min={0}
        max={0.3}
        step={0.01}
        format={(v) => (v === 0 ? 'None' : `${Math.round(v * 100)}%`)}
        onChange={(strokeWidth) => set({ strokeWidth })}
      />

      <ColorField label="Fill" value={style.fill} presets={FILL_PRESETS} onChange={(fill) => set({ fill })} />
      {style.strokeWidth > 0 && <ColorField label="Outline color" value={style.stroke} presets={STROKE_PRESETS} onChange={(stroke) => set({ stroke })} />}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <ToggleButtonGroup exclusive size="small" value={style.align} onChange={(_, align: TextAlign | null) => align && set({ align })} aria-label="Alignment">
          <ToggleButton value="left" aria-label="Align left">
            <FormatAlignLeftRoundedIcon fontSize="small" />
          </ToggleButton>
          <ToggleButton value="center" aria-label="Align center">
            <FormatAlignCenterRoundedIcon fontSize="small" />
          </ToggleButton>
          <ToggleButton value="right" aria-label="Align right">
            <FormatAlignRightRoundedIcon fontSize="small" />
          </ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ flex: 1 }}>
          <SwitchRow label="All caps" checked={style.allCaps} onChange={(allCaps) => set({ allCaps })} />
        </Box>
      </Box>
    </PanelSection>
  );
}

/* ------------------------------------------------------------------ *
 * Stage
 * ------------------------------------------------------------------ */

function pct(value: number, of: number): string {
  return `${(value / of) * 100}%`;
}

function Preview() {
  const { state, style, atlas, fontsVersion, canvasRef, dispatch, loading, cropping } = useEditor();
  const { media, crop, placement, captions, offsets } = state;
  const [frame, setFrame] = useState<Frame | null>(null);
  const [snapped, setSnapped] = useState(false);
  const frameRef = useRef<Frame | null>(null);

  const sceneRef = useRef<Scene | null>(null);
  sceneRef.current = media
    ? {
        media,
        placement,
        captions,
        offsets,
        style,
        icons: atlas,
        crop,
        bare: cropping,
        goldfish: state.goldfish,
        smoothMotion: state.goldfish && media.kind === 'video',
      }
    : null;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const scene = sceneRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !scene || !ctx) return;
    const next = renderScene(canvas, ctx, scene);
    if (!sameFrame(frameRef.current, next)) {
      frameRef.current = next;
      setFrame(next);
    }
  }, [canvasRef]);

  // Stills repaint only when something they depend on changes.
  useLayoutEffect(draw, [draw, media, crop, cropping, placement, captions, offsets, style, atlas, fontsVersion, state.goldfish]);

  // Video repaints once per presented frame, and the recorder captures each repaint.
  // Painting on every display refresh instead beats against the clip's frame rate
  // and the capture rate, so exports repeat and drop frames unevenly.
  useEffect(() => {
    const video = playableSource(media);
    if (!video) return;
    if (typeof video.requestVideoFrameCallback === 'function') {
      let lastFrame = -Infinity;
      let paintedTime = Number.NaN;
      const paint = () => {
        paintedTime = video.currentTime;
        draw();
      };
      let handle = video.requestVideoFrameCallback(function onVideoFrame(now) {
        lastFrame = now;
        paint();
        handle = video.requestVideoFrameCallback(onVideoFrame);
      });
      // The source element isn't in the DOM, and not every browser presents frames for it.
      // Catch moves the callback missed (or never sends), without repainting a still frame.
      // Animations present their own frames, and their clock moves between them, so they skip this.
      let watch = 0;
      if (video instanceof HTMLVideoElement) {
        watch = requestAnimationFrame(function tick(now) {
          if (now - lastFrame > 200 && video.currentTime !== paintedTime) paint();
          watch = requestAnimationFrame(tick);
        });
      }
      return () => {
        video.cancelVideoFrameCallback(handle);
        cancelAnimationFrame(watch);
      };
    }
    let handle = requestAnimationFrame(function loop() {
      draw();
      handle = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(handle);
  }, [media, draw]);

  useEffect(() => {
    if (!media) {
      frameRef.current = null;
      setFrame(null);
    }
  }, [media]);

  if (!media) return <EmptyState />;

  const moveCaption = (slot: CaptionSlot, box: Rect, nextTop: number, snap: boolean) => {
    const current = frameRef.current;
    if (!current) return;
    const area = current.media;
    let top = Math.min(Math.max(nextTop, area.y), area.y + area.h - box.h);
    const centred = area.y + area.h / 2 - box.h / 2;
    const isSnapped = snap && Math.abs(top - centred) < area.h * SNAP;
    if (isSnapped) top = centred;
    setSnapped(isSnapped);
    const edge = slot === 'top' ? top : top + box.h;
    dispatch({ type: 'offset', slot, value: (edge - area.y) / area.h });
  };

  const ratio = frame ? frame.width / frame.height : 1;

  return (
    <Box
      sx={{
        position: 'relative',
        lineHeight: 0,
        mb: 9,
        opacity: loading ? 0.4 : 1,
        // Fit any aspect ratio in the stage, upscaling small media up to 2×.
        width: frame ? `min(100%, calc((100dvh - 250px) * ${ratio}), ${frame.width * 2}px)` : '100%',
      }}
    >
      <Box
        component="canvas"
        ref={canvasRef}
        role="img"
        aria-label="Meme preview"
        sx={(theme) => ({
          display: 'block',
          width: '100%',
          height: 'auto',
          borderRadius: 1.5,
          boxShadow: theme.palette.mode === 'dark' ? '0 0 0 1px rgba(255,255,255,0.06), 0 24px 60px -18px rgba(0,0,0,0.85)' : '0 0 0 1px rgba(0,0,0,0.06), 0 24px 50px -24px rgba(0,0,0,0.35)',
        })}
      />
      {frame && cropping && <CropOverlay />}
      {frame && !cropping && placement === 'overlay' && (
        <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {snapped && (
            <Box
              sx={{
                position: 'absolute',
                left: -12,
                right: -12,
                top: pct(frame.media.y + frame.media.h / 2, frame.height),
                borderTop: '1.5px dashed',
                borderColor: 'primary.main',
              }}
            />
          )}
          {(['top', 'bottom'] as const).map((slot) => {
            const box = frame.boxes[slot];
            return box ? <CaptionHandle key={slot} slot={slot} box={box} frame={frame} onMove={moveCaption} onRelease={() => setSnapped(false)} /> : null;
          })}
        </Box>
      )}
      {state.exporting && (media.kind === 'video' || state.exporting.kind === 'video') && <ExportOverlay kind={state.exporting.kind} progress={state.exporting.progress} />}
      {loading && (
        <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
          <CircularProgress />
        </Box>
      )}
    </Box>
  );
}

function CropOverlay() {
  const { state, dispatch, cropAspect } = useEditor();
  const areaRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ handle: CropHandle; x: number; y: number; start: Rect } | null>(null);
  const media = state.media;
  if (!media) return null;
  const crop = state.crop ?? FULL_CROP;
  const ratio = cropRatio(cropAspect, media);
  const px = cropPixels(crop, media.width, media.height);
  const update = (next: Rect) => dispatch({ type: 'crop', crop: isFullCrop(next) ? null : next });
  const box = { position: 'absolute', left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` } as const;

  const begin = (handle: CropHandle) => (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    areaRef.current?.setPointerCapture(event.pointerId);
    drag.current = { handle, x: event.clientX, y: event.clientY, start: crop };
  };
  const end = () => {
    drag.current = null;
  };

  return (
    <Box
      ref={areaRef}
      onPointerMove={(event) => {
        const current = drag.current;
        const rect = areaRef.current?.getBoundingClientRect();
        if (!current || !rect || rect.width <= 0 || rect.height <= 0) return;
        const dx = (event.clientX - current.x) / rect.width;
        const dy = (event.clientY - current.y) / rect.height;
        update(dragCrop(current.start, current.handle, dx, dy, ratio, media.width, media.height));
      }}
      onPointerUp={end}
      onPointerCancel={end}
      sx={{ position: 'absolute', inset: 0, touchAction: 'none', userSelect: 'none' }}
    >
      {/* Only the shade is clipped to the canvas, so handles on a full-frame crop stay grabbable. */}
      <Box aria-hidden sx={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 1.5, pointerEvents: 'none' }}>
        <Box sx={{ ...box, boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)' }} />
      </Box>
      <Box
        role="group"
        tabIndex={0}
        aria-label={`Crop area, ${px.w} by ${px.h}. Drag to move, drag the handles to resize, or use arrow keys. Enter to finish.`}
        onPointerDown={begin('move')}
        onKeyDown={(event: React.KeyboardEvent) => {
          const step = event.shiftKey ? 0.05 : 0.01;
          const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
          const move = moves[event.key];
          if (!move) return;
          event.preventDefault();
          update(dragCrop(crop, 'move', move[0], move[1], ratio, media.width, media.height));
        }}
        sx={(theme) => ({
          ...box,
          cursor: 'move',
          outline: '1.5px solid #fff',
          '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}` },
        })}
      >
        {/* Rule-of-thirds guides. */}
        <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: '33.333%', right: '33.333%', borderLeft: '1px solid', borderRight: '1px solid', borderColor: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }} />
        <Box sx={{ position: 'absolute', left: 0, right: 0, top: '33.333%', bottom: '33.333%', borderTop: '1px solid', borderBottom: '1px solid', borderColor: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }} />
        <Typography
          aria-hidden
          sx={{ position: 'absolute', left: 6, top: 6, px: 0.75, borderRadius: 1, bgcolor: 'rgba(0,0,0,0.6)', color: '#fff', fontFamily: MONO_FONT, fontSize: '0.7rem', lineHeight: 1.6, pointerEvents: 'none' }}
        >
          {px.w}×{px.h}
        </Typography>
        {CROP_HANDLES.map(({ handle, left, top }) => (
          <Box
            key={handle}
            aria-hidden
            onPointerDown={begin(handle)}
            sx={{
              position: 'absolute',
              left,
              top,
              width: 28,
              height: 28,
              transform: 'translate(-50%, -50%)',
              display: 'grid',
              placeItems: 'center',
              cursor: `${handle}-resize`,
              '&::after': {
                content: '""',
                width: handle.length === 2 ? 14 : handle === 'n' || handle === 's' ? 22 : 6,
                height: handle.length === 2 ? 14 : handle === 'n' || handle === 's' ? 6 : 22,
                borderRadius: 1,
                bgcolor: '#fff',
                boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
              },
            }}
          />
        ))}
      </Box>
    </Box>
  );
}

function CaptionHandle({
  slot,
  box,
  frame,
  onMove,
  onRelease,
}: {
  slot: CaptionSlot;
  box: Rect;
  frame: Frame;
  onMove: (slot: CaptionSlot, box: Rect, top: number, snap: boolean) => void;
  onRelease: () => void;
}) {
  const { canvasRef, fieldRefs, busy } = useEditor();
  const grab = useRef<number | null>(null);

  const canvasY = (clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return rect ? ((clientY - rect.top) / rect.height) * frame.height : 0;
  };

  if (busy) return null;

  return (
    <Box
      component="button"
      type="button"
      aria-label={`${slot === 'top' ? 'Top' : 'Bottom'} caption. Drag or use arrow keys to move, Enter to edit.`}
      onPointerDown={(event: React.PointerEvent<HTMLButtonElement>) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        grab.current = canvasY(event.clientY) - box.y;
      }}
      onPointerMove={(event: React.PointerEvent) => {
        if (grab.current === null) return;
        onMove(slot, box, canvasY(event.clientY) - grab.current, !event.altKey);
      }}
      onPointerUp={() => {
        grab.current = null;
        onRelease();
      }}
      onPointerCancel={() => {
        grab.current = null;
        onRelease();
      }}
      onKeyDown={(event: React.KeyboardEvent) => {
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
          const step = frame.media.h * (event.shiftKey ? 0.05 : 0.01);
          onMove(slot, box, box.y + (event.key === 'ArrowUp' ? -step : step), false);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          fieldRefs[slot].current?.focus();
        }
      }}
      onKeyUp={onRelease}
      onDoubleClick={() => fieldRefs[slot].current?.focus()}
      sx={(theme) => ({
        position: 'absolute',
        left: pct(box.x, frame.width),
        top: pct(box.y, frame.height),
        width: pct(box.w, frame.width),
        height: pct(box.h, frame.height),
        pointerEvents: 'auto',
        p: 0,
        border: 0,
        borderRadius: 1.5,
        bgcolor: 'transparent',
        cursor: 'grab',
        touchAction: 'none',
        outline: '2px dashed transparent',
        outlineOffset: 6,
        transition: 'outline-color 150ms, background-color 150ms',
        '&:hover, &:focus-visible': { outlineColor: 'rgba(255,255,255,0.85)', bgcolor: alpha(theme.palette.primary.main, 0.06) },
        '&:focus-visible, &:active': { outlineColor: theme.palette.primary.main },
        '&:active': { cursor: 'grabbing', bgcolor: alpha(theme.palette.primary.main, 0.1) },
        '& .grip': { opacity: { xs: 1, md: 0 }, transform: { xs: 'translate(0, -50%)', md: 'translate(6px, -50%)' } },
        '&:hover .grip, &:focus-visible .grip, &:active .grip': { opacity: 1, transform: 'translate(0, -50%)' },
      })}
    >
      <Box
        className="grip"
        aria-hidden
        sx={(theme) => ({
          position: 'absolute',
          top: '50%',
          left: -34,
          width: 22,
          height: 34,
          borderRadius: 2,
          display: 'grid',
          placeItems: 'center',
          bgcolor: 'primary.main',
          color: theme.palette.primary.contrastText,
          boxShadow: 2,
          transition: 'opacity 150ms, transform 150ms',
        })}
      >
        <DragIndicatorRoundedIcon sx={{ fontSize: 16 }} />
      </Box>
    </Box>
  );
}

function videoExportNote(state: EditorState): string {
  if (state.media?.kind === 'image' && state.audio) return 'The soundtrack plays through once while the picture holds. Keep this tab in front.';
  const media = state.media?.kind === 'video' ? state.media : null;
  const span = media ? trimSpan(media, state.trim) : null;
  const videoOut = span ? outputDuration(span.start, span.end, state.speed) : 0;
  const soundtrack = state.audio ? audioSpan(state.audio.duration, state.audioTrim) : null;
  const audioOut = soundtrack ? outputDuration(soundtrack.start, soundtrack.end, state.audioSpeed) : 0;
  const looping = Boolean(state.audio) && state.loopVideo && loopExtends(videoOut, audioOut);
  const speed = state.speed === 1 ? '' : ` at ${state.speed}×`;
  const gold = state.goldfish ? ' Appeal to goldfish makes this pass heavier.' : '';
  if (looping) return `The clip repeats${speed} until the soundtrack ends.${gold} Keep this tab in front.`;
  return `The clip plays through once${speed}${state.audio ? ' with your soundtrack' : ''}${state.goldfish ? '. Appeal to goldfish makes this pass heavier' : ''}. Keep this tab in front.`;
}

function ExportOverlay({ kind, progress }: { kind: 'video' | 'gif'; progress: number }) {
  const { cancelExport, state } = useEditor();
  const gif = kind === 'gif';
  return (
    <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', bgcolor: 'rgba(0,0,0,0.45)', borderRadius: 1.5, lineHeight: 1.5 }}>
      <Paper sx={{ p: 2.5, width: 'min(320px, 90%)', borderRadius: 4, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box
            sx={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              bgcolor: gif ? 'primary.main' : 'error.main',
              animation: 'meme-rec 1.2s ease-in-out infinite',
              '@keyframes meme-rec': { '50%': { opacity: 0.3 } },
            }}
          />
          <Typography sx={{ fontWeight: 700, flex: 1 }}>{gif ? 'Encoding GIF' : 'Recording'}</Typography>
          <Typography sx={{ fontFamily: MONO_FONT, fontSize: '0.85rem' }}>{Math.round(progress * 100)}%</Typography>
        </Box>
        <LinearProgress variant="determinate" value={progress * 100} aria-label="Export progress" />
        <Typography variant="body2" color="text.secondary">
          {gif ? 'Sampling frames at a shareable size. Stay on this tab.' : videoExportNote(state)}
        </Typography>
        <Button variant="outlined" size="small" onClick={cancelExport} sx={{ alignSelf: 'flex-start' }}>
          Cancel
        </Button>
      </Paper>
    </Box>
  );
}

function EmptyState() {
  const { openFile, openSample, loading, icons } = useEditor();
  const floaters = ['star', 'coin', 'shroom', 'heart', 'planet'].map((id) => icons.find((icon) => icon.id === id)).filter((icon) => icon !== undefined);

  return (
    <Box sx={{ flex: 1, alignSelf: 'stretch', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <FileDropZone
        variant="hero"
        accept={MEDIA_ACCEPT}
        icon={SentimentVerySatisfiedRoundedIcon}
        title="Drop a photo or clip"
        hint={`PNG, JPG, WEBP, GIF, MP4, WEBM or MOV. You can also paste with ${MOD}+V.`}
        onFiles={(files) => void openFile(files[0])}
        footer={
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <Button
              variant="outlined"
              startIcon={loading ? <CircularProgress size={16} /> : <AutoAwesomeRoundedIcon />}
              disabled={loading}
              onClick={(event) => {
                // Don't let the click fall through to the drop zone's file picker.
                event.stopPropagation();
                void openSample();
              }}
            >
              Try the sample
            </Button>
            <Box sx={{ display: 'flex', gap: 1.5 }} aria-hidden>
              {floaters.map((icon, i) => (
                <Box
                  key={icon.id}
                  component="img"
                  src={icon.src}
                  alt=""
                  sx={{
                    width: 28,
                    height: 28,
                    animation: `meme-float 3.2s ease-in-out ${i * 0.3}s infinite`,
                    '@keyframes meme-float': { '50%': { transform: 'translateY(-6px)' } },
                  }}
                />
              ))}
            </Box>
          </Box>
        }
      />
    </Box>
  );
}

/* ------------------------------------------------------------------ *
 * Media dock
 * ------------------------------------------------------------------ */

function useVideoFlags(video: (EventTarget & { paused: boolean; muted: boolean }) | null) {
  const [flags, setFlags] = useState({ paused: true, muted: true });
  useEffect(() => {
    if (!video) return;
    const sync = () => setFlags({ paused: video.paused, muted: video.muted });
    sync();
    const events = ['play', 'pause', 'volumechange'] as const;
    for (const name of events) video.addEventListener(name, sync);
    return () => {
      for (const name of events) video.removeEventListener(name, sync);
    };
  }, [video]);
  return flags;
}

function MediaDock() {
  const { state, busy, setMedia, dispatch, openFile } = useEditor();
  const media = state.media;
  const video = playableSource(media);
  // A still with a soundtrack gets the same controls, driving the track instead.
  const player = video ?? (media && state.audio ? state.audio.element : null);
  const { paused } = useVideoFlags(player);
  const muted = state.previewMuted;
  if (!media) return null;

  const moved = state.placement === 'overlay' && (state.offsets.top !== DEFAULT_OFFSETS.top || state.offsets.bottom !== DEFAULT_OFFSETS.bottom);
  const KindIcon = media.animated ? GifBoxRoundedIcon : media.kind === 'video' ? MovieRoundedIcon : ImageRoundedIcon;
  const croppedSize = cropPixels(state.crop, media.width, media.height);

  return (
    <StageDock>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, minWidth: 0 }}>
        <KindIcon fontSize="small" sx={{ color: 'primary.main' }} />
        <Typography variant="body2" noWrap sx={{ fontWeight: 600, maxWidth: 180 }} title={media.name}>
          {media.name}
        </Typography>
        <Typography sx={{ fontFamily: MONO_FONT, fontSize: '0.75rem', color: 'text.secondary' }}>
          {croppedSize.w}×{croppedSize.h}
        </Typography>
      </Box>
      {player && (
        <>
          <Tooltip title={paused ? 'Play' : 'Pause'}>
            <span>
              <IconButton
                size="small"
                disabled={busy}
                onClick={() => (paused ? void player.play().catch(() => undefined) : player.pause())}
                aria-label={paused ? 'Play' : 'Pause'}
              >
                {paused ? <PlayArrowRoundedIcon fontSize="small" /> : <PauseRoundedIcon fontSize="small" />}
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title={muted ? 'Unmute preview' : 'Mute preview'}>
            <IconButton
              size="small"
              onClick={() => dispatch({ type: 'previewMuted', previewMuted: !muted })}
              aria-label={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? <VolumeOffRoundedIcon fontSize="small" /> : <VolumeUpRoundedIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </>
      )}
      {moved && (
        <Button size="small" variant="text" disabled={busy} startIcon={<RestartAltRoundedIcon />} onClick={() => dispatch({ type: 'resetOffsets' })}>
          Reset positions
        </Button>
      )}
      <FileButton size="small" variant="text" accept={MEDIA_ACCEPT} disabled={busy} onFiles={(files) => void openFile(files[0])} startIcon={<SwapHorizRoundedIcon />}>
        Replace
      </FileButton>
      <Tooltip title="Remove media">
        <span>
          <IconButton size="small" disabled={busy} onClick={() => setMedia(null)} aria-label="Remove media" sx={{ color: 'error.main' }}>
            <DeleteOutlineRoundedIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
    </StageDock>
  );
}
