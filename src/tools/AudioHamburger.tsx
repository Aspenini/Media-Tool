import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Slider from '@mui/material/Slider';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import PauseRoundedIcon from '@mui/icons-material/PauseRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import { ToolShell } from '../components/ToolShell';
import { FileDropZone } from '../components/FileDropZone';
import { useNotification } from '../components/NotificationProvider';
import {
  AZIMUTH_LEFT,
  AZIMUTH_RIGHT,
  defaultPanForIndex,
  dotHue,
  HamburgerEngine,
  MAX_PAN_DIST,
  MAX_PAN_HEIGHT,
  MIN_PAN_DIST,
  MIN_PAN_HEIGHT,
  ONE_PER_SIDE_DIST,
  WORLD_R_FOR_SCALE,
  type HamburgerTrack,
} from '../lib/hamburger';
import { worldFromPan } from '../lib/spatial';

type Transport = 'stopped' | 'playing' | 'paused';

const PCT_PER_UNIT = (36 * 0.92) / WORLD_R_FOR_SCALE;

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function AudioHamburger() {
  const notify = useNotification();
  const engineRef = useRef<HamburgerEngine | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const tracksRef = useRef<HamburgerTrack[]>([]);
  const draggingId = useRef<string | null>(null);

  const [tracks, setTracks] = useState<HamburgerTrack[]>([]);
  const [volume, setVolume] = useState(0.85);
  const [transport, setTransport] = useState<Transport>('stopped');
  const [onePerSide, setOnePerSide] = useState(false);
  const [swapped, setSwapped] = useState(false);
  const [status, setStatus] = useState('Add tracks, drag each dot around your head on the map, then press Play all.');
  const [exporting, setExporting] = useState(false);

  tracksRef.current = tracks;

  useEffect(() => {
    const engine = new HamburgerEngine(() => {
      setTransport('stopped');
      setStatus('Playback finished.');
    });
    engineRef.current = engine;
    return () => engine.dispose();
  }, []);

  useEffect(() => {
    engineRef.current?.setVolume(volume, tracks.length);
  }, [volume, tracks.length]);

  const twoTrack = tracks.length === 2;
  const locked = onePerSide && twoTrack;

  const commitPositions = (next: HamburgerTrack[]) => {
    setTracks(next);
    if (transport !== 'stopped') engineRef.current?.syncPositions(next);
  };

  const applyOnePerSide = (flip: boolean) => {
    setTracks((prev) => {
      if (prev.length !== 2) return prev;
      const [a, b] = flip ? [AZIMUTH_RIGHT, AZIMUTH_LEFT] : [AZIMUTH_LEFT, AZIMUTH_RIGHT];
      const next = [
        { ...prev[0], azimuth: a, distance: ONE_PER_SIDE_DIST, height: 0 },
        { ...prev[1], azimuth: b, distance: ONE_PER_SIDE_DIST, height: 0 },
      ];
      if (transport !== 'stopped') engineRef.current?.syncPositions(next);
      return next;
    });
  };

  const handleFiles = (files: File[]) => {
    const baseLen = tracks.length;
    const additions = files.map((file, i) => ({
      id: newId(),
      file,
      name: file.name,
      ...defaultPanForIndex(baseLen + i, baseLen + files.length),
    }));
    const next = [...tracks, ...additions];
    setTracks(next);
    setStatus(`${next.length} track(s). Drag dots on the map to place each sound, then Play all.`);
  };

  const removeTrack = (id: string) => {
    engineRef.current?.forget(id);
    const next = tracks.filter((t) => t.id !== id);
    setTracks(next);
    if (transport !== 'stopped') engineRef.current?.syncPositions(next);
  };

  const moveTrack = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= tracks.length) return;
    const next = [...tracks];
    [next[index], next[target]] = [next[target], next[index]];
    setTracks(next);
  };

  const play = async () => {
    const engine = engineRef.current;
    if (!engine || !tracks.length) return;
    const { played } = await engine.play(tracks);
    if (!played) {
      setStatus('No decodable tracks.');
      notify('No decodable tracks to play.', 'error');
      return;
    }
    engine.setVolume(volume, played);
    setTransport('playing');
    setStatus(played === 1 ? 'Playing one layer.' : `Playing ${played} layers at once.`);
  };

  const pause = () => {
    engineRef.current?.pause();
    setTransport('paused');
    setStatus('Paused.');
  };

  const stop = () => {
    engineRef.current?.stop(true);
    setTransport('stopped');
    setStatus(tracks.length ? 'Stopped. Press Play all again from the same map layout.' : 'Add audio files to begin.');
  };

  const download = async () => {
    if (!tracks.length || exporting) return;
    setExporting(true);
    setStatus('Rendering binaural mix (offline). Large mixes take longer…');
    try {
      await engineRef.current?.downloadMix(tracks, volume);
      setStatus('Saved stereo binaural WAV (same positions as on the map). Use headphones.');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not render the mix.', 'error');
      setStatus('Export failed.');
    } finally {
      setExporting(false);
    }
  };

  // Pointer drag on the map.
  const pointerToPan = (id: string, clientX: number, clientY: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const scalePx = ((Math.min(rect.width, rect.height) * 0.36) / WORLD_R_FOR_SCALE) * 0.92;
    if (scalePx <= 0) return;
    setTracks((prev) => {
      const next = prev.map((t) => {
        if (t.id !== id) return t;
        const x = (clientX - rect.left - rect.width / 2) / scalePx;
        const z = (clientY - rect.top - rect.height / 2) / scalePx + t.height * 0.22;
        let dist = Math.hypot(x, z);
        dist = Math.min(MAX_PAN_DIST, Math.max(MIN_PAN_DIST, dist));
        return { ...t, azimuth: Math.atan2(x, -z), distance: dist };
      });
      if (transport !== 'stopped') engineRef.current?.syncPositions(next);
      return next;
    });
  };

  const onDotPointerDown = (id: string) => (e: React.PointerEvent) => {
    if (locked) return;
    e.preventDefault();
    draggingId.current = id;
    const move = (ev: PointerEvent) => {
      if (draggingId.current) pointerToPan(draggingId.current, ev.clientX, ev.clientY);
    };
    const up = () => {
      draggingId.current = null;
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    pointerToPan(id, e.clientX, e.clientY);
  };

  const onDotWheel = (id: string) => (e: React.WheelEvent) => {
    if (locked) return;
    const step = e.deltaY < 0 ? 0.16 : -0.16;
    const next = tracksRef.current.map((t) =>
      t.id === id ? { ...t, height: Math.min(MAX_PAN_HEIGHT, Math.max(MIN_PAN_HEIGHT, t.height + step)) } : t,
    );
    commitPositions(next);
  };

  return (
    <ToolShell title="Audio Hamburger" description="Play several tracks at once in 3D space. Drag each dot on the map around your head to set direction and distance; scroll on a dot to change height. Headphones recommended — nothing leaves your machine.">
      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) minmax(0, 1fr)' }, alignItems: 'start' }}>
        <Paper variant="outlined" sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2.5, borderRadius: 3 }}>
          <FileDropZone accept="audio/*" multiple title="Add audio files" hint="or click to browse — one or many" onFiles={handleFiles} />

          <Box>
            <Typography variant="overline" color="text.secondary">
              Stack — {tracks.length} tracks
            </Typography>
            {tracks.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No files yet.
              </Typography>
            ) : (
              <List dense disablePadding>
                {tracks.map((track, index) => (
                  <ListItem
                    key={track.id}
                    disableGutters
                    sx={{ gap: 1, px: 1, py: 0.5, borderRadius: 1.5, '&:hover': { backgroundColor: 'action.hover' } }}
                    secondaryAction={
                      <IconButton edge="end" size="small" onClick={() => removeTrack(track.id)} aria-label="Remove">
                        <CloseRoundedIcon fontSize="small" />
                      </IconButton>
                    }
                  >
                    <Box sx={{ width: 12, height: 12, borderRadius: '50%', background: dotHue(index, tracks.length), flexShrink: 0 }} />
                    <Typography variant="body2" noWrap sx={{ flexGrow: 1 }} title={track.name}>
                      {track.name}
                    </Typography>
                    <IconButton size="small" disabled={index === 0} onClick={() => moveTrack(index, -1)} aria-label="Move up">
                      <ArrowUpwardRoundedIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" disabled={index === tracks.length - 1} onClick={() => moveTrack(index, 1)} aria-label="Move down">
                      <ArrowDownwardRoundedIcon fontSize="small" />
                    </IconButton>
                  </ListItem>
                ))}
              </List>
            )}
          </Box>

          {twoTrack && (
            <Stack direction="row" spacing={2} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={onePerSide}
                    onChange={(e) => {
                      setOnePerSide(e.target.checked);
                      if (e.target.checked) applyOnePerSide(swapped);
                    }}
                  />
                }
                label="One per side"
              />
              <Button
                variant="outlined"
                disabled={!onePerSide}
                onClick={() => {
                  const flip = !swapped;
                  setSwapped(flip);
                  applyOnePerSide(flip);
                }}
              >
                Swap sides
              </Button>
            </Stack>
          )}

          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Master volume — {Math.round(volume * 100)}%
            </Typography>
            <Slider value={volume} onChange={(_, v) => setVolume(v as number)} min={0} max={2} step={0.01} />
          </Box>

          <Stack direction="row" spacing={1.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
            <Button onClick={play} disabled={!tracks.length || transport === 'playing' || exporting} startIcon={<PlayArrowRoundedIcon />}>
              Play all
            </Button>
            <Button variant="outlined" onClick={pause} disabled={transport !== 'playing' || exporting} startIcon={<PauseRoundedIcon />}>
              Pause
            </Button>
            <Button variant="outlined" color="inherit" onClick={stop} disabled={transport === 'stopped' || exporting} startIcon={<StopRoundedIcon />}>
              Stop
            </Button>
            <Button variant="outlined" onClick={download} disabled={!tracks.length || exporting} startIcon={<DownloadRoundedIcon />}>
              Download mix (WAV)
            </Button>
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {status}
          </Typography>
        </Paper>

        <Paper variant="outlined" sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2, borderRadius: 3 }}>
          <Box
            ref={stageRef}
            sx={{
              position: 'relative',
              width: '100%',
              aspectRatio: '1 / 1',
              borderRadius: 3,
              overflow: 'hidden',
              touchAction: 'none',
              background: 'radial-gradient(circle at 50% 50%, rgba(34,211,238,0.16), transparent 70%)',
              border: '1px solid',
              borderColor: 'divider',
              cursor: locked ? 'not-allowed' : 'crosshair',
            }}
          >
            <Box sx={{ position: 'absolute', inset: 0, '&::before, &::after': { content: '""', position: 'absolute', background: 'rgba(148,163,184,0.18)' }, '&::before': { left: '50%', top: 0, bottom: 0, width: '1px' }, '&::after': { top: '50%', left: 0, right: 0, height: '1px' } }} />
            <Box sx={{ position: 'absolute', left: '50%', top: '50%', width: 22, height: 22, borderRadius: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(248,250,252,0.9)', boxShadow: '0 0 14px rgba(248,250,252,0.5)' }} title="You (listener)" />
            {tracks.map((track, index) => {
              const { x, y, z } = worldFromPan(track.azimuth, track.distance, track.height);
              const left = 50 + x * PCT_PER_UNIT;
              const top = 50 + z * PCT_PER_UNIT - y * PCT_PER_UNIT * 0.22;
              return (
                <Box
                  key={track.id}
                  onPointerDown={onDotPointerDown(track.id)}
                  onWheel={onDotWheel(track.id)}
                  title={`${track.name} — drag for direction & distance; scroll for height`}
                  sx={{
                    position: 'absolute',
                    left: `${left}%`,
                    top: `${top}%`,
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    transform: 'translate(-50%, -50%)',
                    background: dotHue(index, tracks.length),
                    zIndex: 10 + index,
                    cursor: locked ? 'not-allowed' : 'grab',
                    boxShadow: '0 0 12px rgba(0,0,0,0.5)',
                    border: '2px solid rgba(255,255,255,0.65)',
                    transition: draggingId.current === track.id ? 'none' : 'left 0.12s, top 0.12s',
                  }}
                />
              );
            })}
          </Box>
          <Typography variant="body2" color="text.secondary">
            Each dot is one track. Drag around the center for direction and distance; scroll on a dot for height.
          </Typography>
        </Paper>
      </Box>
    </ToolShell>
  );
}
