import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import RadioRoundedIcon from '@mui/icons-material/RadioRounded';
import MemoryRoundedIcon from '@mui/icons-material/MemoryRounded';
import GraphicEqRoundedIcon from '@mui/icons-material/GraphicEqRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import AutoFixHighRoundedIcon from '@mui/icons-material/AutoFixHighRounded';
import AudioFileRoundedIcon from '@mui/icons-material/AudioFileRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import PauseRoundedIcon from '@mui/icons-material/PauseRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import { FileButton, FileDropZone } from '../components/FileDropZone';
import { ExportFooter } from '../components/ExportFooter';
import { FileQueueList } from '../components/FileQueueList';
import { useNotification } from '../components/NotificationProvider';
import { Panel, PanelSection, Stage, ToolIntro, Workbench } from '../components/Workbench';
import { ChoiceCard } from '../components/controls';
import { useFileQueue, type QueuedFile } from '../hooks/useFileQueue';
import { getAudioContextClass } from '../lib/spatial';
import { applyAudioEffect, AUDIO_EFFECTS, exportBitDepthFor, type AudioEffectId } from '../lib/audioEffects';
import { audioBufferToWavBlob } from '../lib/wav';
import { stripExtension } from '../lib/image';
import { formatBytes } from '../lib/format';
import { downloadUrl } from '../lib/download';

const EFFECT_META: Record<AudioEffectId, { icon: typeof RadioRoundedIcon; blurb: string }> = {
  vintageRadio: { icon: RadioRoundedIcon, blurb: 'Band-limited, saturated, mono — a 1940s wireless set.' },
  bitcrusher8: { icon: MemoryRoundedIcon, blurb: 'Crunchy 8-bit quantization, chiptune grit.' },
  bitcrusher16: { icon: GraphicEqRoundedIcon, blurb: 'Subtle 16-bit reduction, cleaner digital edge.' },
};

/** Browsers can drop downloads fired in the same tick; space them out. */
const DOWNLOAD_GAP_MS = 350;

interface Track extends QueuedFile {
  /** For previewing the untouched file. */
  originalUrl: string;
  result: { url: string; name: string; bytes: number } | null;
}

function disposeTrack(track: Track) {
  URL.revokeObjectURL(track.originalUrl);
  if (track.result) URL.revokeObjectURL(track.result.url);
}

function withoutResult(track: Track): Track {
  if (!track.result) return track;
  URL.revokeObjectURL(track.result.url);
  return { ...track, result: null };
}

/** Which clip is playing: a track id plus original or processed. */
type PlayingKey = `${string}:${'original' | 'result'}`;

/** One shared <audio> element, so starting a preview stops the previous one. */
function usePreviewPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<PlayingKey | null>(null);

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    const stopped = () => setPlaying(null);
    audio.addEventListener('ended', stopped);
    audio.addEventListener('pause', stopped);
    return () => {
      audio.pause();
      audio.removeAttribute('src');
      audio.removeEventListener('ended', stopped);
      audio.removeEventListener('pause', stopped);
    };
  }, []);

  const toggle = (key: PlayingKey, url: string) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing === key) {
      audio.pause();
      return;
    }
    audio.src = url;
    void audio.play().then(
      () => setPlaying(key),
      () => setPlaying(null),
    );
  };

  const stop = () => audioRef.current?.pause();

  return { playing, toggle, stop };
}

export function AudioEffects() {
  const notify = useNotification();
  const ctxRef = useRef<AudioContext | null>(null);
  const queue = useFileQueue<Track>({
    create: (file, id) => ({ id, file, originalUrl: URL.createObjectURL(file), result: null }),
    dispose: disposeTrack,
  });
  const tracks = queue.items;
  const player = usePreviewPlayer();
  const [effect, setEffect] = useState<AudioEffectId>('vintageRadio');
  const [runningId, setRunningId] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  const busy = progress !== null;
  const finished = tracks.filter((t) => t.result);
  const pending = tracks.length - finished.length;

  const chooseEffect = (next: AudioEffectId) => {
    setEffect(next);
    // Results were made with the old effect.
    player.stop();
    queue.updateAll(withoutResult);
  };

  const process = async () => {
    if (!tracks.length) return;
    if (!ctxRef.current) ctxRef.current = new (getAudioContextClass())();
    const ctx = ctxRef.current;
    const todo = [...tracks];
    player.stop();
    setProgress(0);
    let failures = 0;

    for (let i = 0; i < todo.length; i++) {
      const track = todo[i];
      setRunningId(track.id);
      try {
        const input = await ctx.decodeAudioData((await track.file.arrayBuffer()).slice(0));
        const processed = await applyAudioEffect(ctx, input, effect);
        const wav = audioBufferToWavBlob(processed, exportBitDepthFor(effect));
        queue.update(track.id, (current) => {
          if (current.result) URL.revokeObjectURL(current.result.url);
          return { result: { url: URL.createObjectURL(wav), name: `${stripExtension(track.file.name)}_${effect}.wav`, bytes: wav.size } };
        });
      } catch (error) {
        failures++;
        notify(`${track.file.name}: ${error instanceof Error ? error.message : "couldn't be processed"}`, 'error');
      }
      setProgress(Math.round(((i + 1) / todo.length) * 100));
      // Let the list repaint between files.
      await new Promise((r) => setTimeout(r, 10));
    }

    setRunningId(null);
    setProgress(null);
    if (!failures) notify(`${todo.length} file${todo.length === 1 ? '' : 's'} ready — preview or download them.`, 'success');
  };

  const downloadAll = async () => {
    for (let i = 0; i < finished.length; i++) {
      const { url, name } = finished[i].result!;
      downloadUrl(url, name);
      if (i < finished.length - 1) await new Promise((r) => setTimeout(r, DOWNLOAD_GAP_MS));
    }
  };

  const runningIndex = tracks.findIndex((t) => t.id === runningId);

  return (
    <Workbench panelWidth={360}>
      <Panel
        footer={
          <ExportFooter
            progress={progress}
            primary={{
              label: pending ? `Apply to ${tracks.length || 'no'} file${tracks.length === 1 ? '' : 's'}` : 'Process again',
              icon: <AutoFixHighRoundedIcon />,
              variant: pending ? 'contained' : 'outlined',
              busy,
              busyLabel: `Processing ${Math.max(1, runningIndex + 1)} of ${tracks.length}…`,
              onClick: process,
              disabled: !tracks.length,
            }}
            secondary={
              finished.length > 0 && {
                label: finished.length === 1 ? 'Download WAV' : `Download all ${finished.length} files`,
                icon: <DownloadRoundedIcon />,
                variant: 'contained',
                onClick: () => void downloadAll(),
                disabled: busy,
              }
            }
            status={finished.length > 1 ? 'Each file downloads separately — allow multiple downloads if your browser asks.' : undefined}
          />
        }
      >
        <ToolIntro />
        <PanelSection title="Effect">
          <Box role="radiogroup" aria-label="Effect" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {AUDIO_EFFECTS.map((e) => {
              const meta = EFFECT_META[e.id];
              const Icon = meta.icon;
              const selected = e.id === effect;
              return (
                <ChoiceCard key={e.id} selected={selected} disabled={busy} onClick={() => chooseEffect(e.id)} sx={{ gap: 1.5, alignItems: 'flex-start', p: 1.5 }}>
                  <Box
                    sx={(theme) => ({
                      width: 38,
                      height: 38,
                      flexShrink: 0,
                      borderRadius: 2,
                      display: 'grid',
                      placeItems: 'center',
                      color: selected ? theme.palette.primary.contrastText : 'text.secondary',
                      bgcolor: selected ? 'primary.main' : 'action.hover',
                    })}
                  >
                    <Icon fontSize="small" />
                  </Box>
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 650 }}>
                      {e.label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.4, display: 'block' }}>
                      {meta.blurb}
                    </Typography>
                  </Box>
                </ChoiceCard>
              );
            })}
          </Box>
        </PanelSection>
      </Panel>

      <Stage backdrop="grid" onFiles={tracks.length ? queue.add : undefined} dropLabel="Drop to add to the queue" center={!tracks.length}>
        {!tracks.length ? (
          <FileDropZone
            variant="hero"
            multiple
            accept="audio/*"
            icon={AudioFileRoundedIcon}
            title="Drop audio files"
            hint="WAV, MP3, OGG, M4A — as many as you like. Preview each one before you download."
            onFiles={queue.add}
          />
        ) : (
          <Box sx={{ width: '100%', maxWidth: 760, mx: 'auto' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, gap: 2 }}>
              <Box>
                <Typography variant="h5">Queue</Typography>
                <Typography variant="body2" color="text.secondary">
                  {tracks.length} file{tracks.length === 1 ? '' : 's'} · {formatBytes(tracks.reduce((n, t) => n + t.file.size, 0))} · WAV output
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="outlined"
                  size="small"
                  disabled={busy}
                  onClick={() => {
                    player.stop();
                    queue.clear();
                  }}
                >
                  Clear
                </Button>
                <FileButton variant="outlined" size="small" multiple accept="audio/*" onFiles={queue.add} startIcon={<AddRoundedIcon />} disabled={busy}>
                  Add
                </FileButton>
              </Box>
            </Box>
            <FileQueueList
              items={tracks}
              disabled={busy}
              onRemove={(id) => {
                if (player.playing?.startsWith(`${id}:`)) player.stop();
                queue.remove(id);
              }}
              status={(t) => (t.id === runningId ? 'running' : 'idle')}
              meta={(t) => (t.result ? `→ ${formatBytes(t.result.bytes)}` : formatBytes(t.file.size))}
              actions={(t) => (
                <>
                  <PreviewButton label="Original" playing={player.playing === `${t.id}:original`} onClick={() => player.toggle(`${t.id}:original`, t.originalUrl)} />
                  <PreviewButton
                    label="Processed"
                    accent
                    disabled={!t.result}
                    playing={player.playing === `${t.id}:result`}
                    onClick={() => t.result && player.toggle(`${t.id}:result`, t.result.url)}
                  />
                  <Tooltip title={t.result ? `Download ${t.result.name}` : 'Process first'}>
                    <span>
                      <IconButton size="small" disabled={!t.result} aria-label={`Download ${t.file.name}`} onClick={() => t.result && downloadUrl(t.result.url, t.result.name)}>
                        <DownloadRoundedIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </>
              )}
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5, textAlign: 'center' }}>
              {finished.length ? 'Compare each file before and after, then download the ones you want.' : 'Play the originals now; the processed version appears after you apply the effect.'}
            </Typography>
          </Box>
        )}
      </Stage>
    </Workbench>
  );
}

function PreviewButton({ label, playing, onClick, disabled, accent }: { label: string; playing: boolean; onClick: () => void; disabled?: boolean; accent?: boolean }) {
  return (
    <Button
      size="small"
      variant={playing ? 'contained' : 'text'}
      color={accent ? 'primary' : 'inherit'}
      disabled={disabled}
      onClick={onClick}
      startIcon={playing ? <PauseRoundedIcon /> : <PlayArrowRoundedIcon />}
      aria-label={`${playing ? 'Pause' : 'Play'} ${label.toLowerCase()}`}
      sx={{ minWidth: 0, px: 1.25, fontSize: '0.75rem', '& .MuiButton-startIcon': { mr: { xs: 0, sm: 0.75 } } }}
    >
      <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
        {label}
      </Box>
    </Button>
  );
}
