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
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import { useIncomingFiles } from '../../components/FileBridge';
import { FileButton, FileDropZone } from '../../components/FileDropZone';
import { Panel, PanelSection, Stage, StageDock, ToolIntro, Workbench } from '../../components/Workbench';
import { ExportFooter } from '../../components/ExportFooter';
import { ChoiceCard, ColorField, Segmented, SliderField, SwitchRow } from '../../components/controls';
import { canCopyImage } from '../../lib/meme/export.ts';
import { FONTS } from '../../lib/meme/fonts.ts';
import { renderScene, sameFrame, type Frame, type Scene } from '../../lib/meme/render.ts';
import type { CaptionSlot, Placement, Rect, TextAlign, TextStyle } from '../../lib/meme/types.ts';
import { MONO_FONT } from '../../theme';
import { DEFAULT_OFFSETS, EditorProvider, useEditor } from './editor';

const MEDIA_ACCEPT = 'image/*,video/*';
const SNAP = 0.015;
const FILL_PRESETS = ['#ffffff', '#111111', '#ffd23f', '#ff4d6d', '#4dd8ff', '#7cff6b'];
const STROKE_PRESETS = ['#000000', '#ffffff', '#5a2d00', '#2a1459', '#b0123a', '#0b4a6f'];
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

/** Ctrl/⌘ S exports and Ctrl/⌘ O opens a file — while this tool is open. */
function useShortcuts() {
  const { openFile, exportMedia, busy } = useEditor();
  useIncomingFiles((files) => {
    if (!busy) void openFile(files[0]);
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
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
  }, [exportMedia, busy]);
}

/* ------------------------------------------------------------------ *
 * Panel
 * ------------------------------------------------------------------ */

function Controls() {
  const { state, busy, exportMedia, exportGif, copyImage, openFile } = useEditor();
  const media = state.media;
  const gifBusy = state.exporting?.kind === 'gif';
  const videoBusy = state.exporting?.kind === 'video';

  return (
    <Panel
      footer={
        <ExportFooter
          primary={{
            label: media?.kind === 'video' ? 'Export video' : 'Export PNG',
            icon: <DownloadRoundedIcon />,
            busy: videoBusy,
            busyLabel: 'Recording…',
            onClick: () => void exportMedia(),
            disabled: !media || busy,
            title: `${MOD}+S`,
          }}
          aside={
            media?.kind === 'image' &&
            canCopyImage() && (
              <Tooltip title="Copy to clipboard">
                <span>
                  <Button size="large" variant="outlined" onClick={() => void copyImage()} disabled={busy} aria-label="Copy image" sx={{ minWidth: 0, px: 2, height: '100%' }}>
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
              disabled: busy,
            }
          }
          status={media?.kind === 'video' ? 'GIFs are 10 fps, up to 10 seconds, scaled to 480px and dithered.' : undefined}
        />
        }
    >
      <ToolIntro />
      <Box component="fieldset" disabled={busy} sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}>
        <PanelSection title="Media">
          <FileDropZone
            accept={MEDIA_ACCEPT}
            title={media ? media.name : 'Choose a photo or clip'}
            hint={media ? `${media.width} × ${media.height} · ${media.kind}` : `Or drop, or paste with ${MOD}+V`}
            onFiles={(files) => void openFile(files[0])}
          />
        </PanelSection>
        <CaptionSection />
        <IconSection />
        <StyleSection />
      </Box>
    </Panel>
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
  const { state, style, atlas, fontsVersion, canvasRef, dispatch, loading } = useEditor();
  const { media, placement, captions, offsets } = state;
  const [frame, setFrame] = useState<Frame | null>(null);
  const [snapped, setSnapped] = useState(false);
  const frameRef = useRef<Frame | null>(null);

  const sceneRef = useRef<Scene | null>(null);
  sceneRef.current = media ? { media, placement, captions, offsets, style, icons: atlas } : null;

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
  useLayoutEffect(draw, [draw, media, placement, captions, offsets, style, atlas, fontsVersion]);

  // Video repaints every display frame (which is also what the recorder captures).
  useEffect(() => {
    if (media?.kind !== 'video') return;
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
      {frame && placement === 'overlay' && (
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
      {state.exporting && media.kind === 'video' && <ExportOverlay kind={state.exporting.kind} progress={state.exporting.progress} />}
      {loading && (
        <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
          <CircularProgress />
        </Box>
      )}
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

function ExportOverlay({ kind, progress }: { kind: 'video' | 'gif'; progress: number }) {
  const { cancelExport } = useEditor();
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
          {gif ? 'Sampling frames at a shareable size. Stay on this tab.' : 'The clip plays through once in real time. Keep this tab in front.'}
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

function useVideoFlags(video: HTMLVideoElement | null) {
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
  const video = media?.source instanceof HTMLVideoElement ? media.source : null;
  const { paused, muted } = useVideoFlags(video);
  if (!media) return null;

  const moved = state.placement === 'overlay' && (state.offsets.top !== DEFAULT_OFFSETS.top || state.offsets.bottom !== DEFAULT_OFFSETS.bottom);
  const KindIcon = media.kind === 'video' ? MovieRoundedIcon : ImageRoundedIcon;

  return (
    <StageDock>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, minWidth: 0 }}>
        <KindIcon fontSize="small" sx={{ color: 'primary.main' }} />
        <Typography variant="body2" noWrap sx={{ fontWeight: 600, maxWidth: 180 }} title={media.name}>
          {media.name}
        </Typography>
        <Typography sx={{ fontFamily: MONO_FONT, fontSize: '0.75rem', color: 'text.secondary' }}>
          {media.width}×{media.height}
        </Typography>
      </Box>
      {video && (
        <>
          <Tooltip title={paused ? 'Play' : 'Pause'}>
            <span>
              <IconButton size="small" disabled={busy} onClick={() => (paused ? void video.play() : video.pause())} aria-label={paused ? 'Play' : 'Pause'}>
                {paused ? <PlayArrowRoundedIcon fontSize="small" /> : <PauseRoundedIcon fontSize="small" />}
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title={muted ? 'Unmute preview' : 'Mute preview'}>
            <IconButton
              size="small"
              onClick={() => {
                video.muted = !video.muted;
              }}
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
