import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import PauseRoundedIcon from '@mui/icons-material/PauseRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded';
import LayersRoundedIcon from '@mui/icons-material/LayersRounded';
import { useIncomingFiles } from '../components/FileBridge';
import { useFileQueue } from '../hooks/useFileQueue';
import { FileButton, FileDropZone } from '../components/FileDropZone';
import { ListenerHead } from '../components/ListenerHead';
import { useNotification } from '../components/NotificationProvider';
import { usePersistentState } from '../hooks/usePersistentState';
import { Panel, PanelSection, Stage, StageDock, ToolIntro, Workbench } from '../components/Workbench';
import { ExportFooter } from '../components/ExportFooter';
import { SliderField, SwitchRow } from '../components/controls';
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
import { MONO_FONT } from '../theme';

type Transport = 'stopped' | 'playing' | 'paused';

const PCT_PER_UNIT = (36 * 0.92) / WORLD_R_FOR_SCALE;

export function AudioHamburger() {
  const notify = useNotification();
  const engineRef = useRef<HamburgerEngine | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const tracksRef = useRef<HamburgerTrack[]>([]);
  const draggingId = useRef<string | null>(null);

  const queue = useFileQueue<HamburgerTrack>({
    create: (file, id) => ({ id, file, name: file.name, ...defaultPanForIndex(0, 1) }),
    dispose: (track) => engineRef.current?.forget(track.id),
  });
  const tracks = queue.items;
  const [volume, setVolume] = usePersistentState('volume', 0.85);
  const [transport, setTransport] = useState<Transport>('stopped');
  const [onePerSide, setOnePerSide] = usePersistentState('onePerSide', false);
  const [swapped, setSwapped] = usePersistentState('swapped', false);
  const [status, setStatus] = useState('Add tracks, then drag each dot around your head.');
  const [exporting, setExporting] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);

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

  /** Apply a change to every track and keep a running mix in sync with it. */
  const commitPositions = (map: (track: HamburgerTrack) => HamburgerTrack) => {
    queue.updateAll(map);
    if (transport !== 'stopped') engineRef.current?.syncPositions(tracksRef.current.map(map));
  };

  const applyOnePerSide = (flip: boolean) => {
    if (tracks.length !== 2) return;
    const [a, b] = flip ? [AZIMUTH_RIGHT, AZIMUTH_LEFT] : [AZIMUTH_LEFT, AZIMUTH_RIGHT];
    const next = [
      { ...tracks[0], azimuth: a, distance: ONE_PER_SIDE_DIST, height: 0 },
      { ...tracks[1], azimuth: b, distance: ONE_PER_SIDE_DIST, height: 0 },
    ];
    queue.updateAll((track) => next.find((t) => t.id === track.id) ?? track);
    if (transport !== 'stopped') engineRef.current?.syncPositions(next);
  };

  const handleFiles = (files: File[]) => {
    const baseLen = tracks.length;
    const added = queue.add(files);
    // Spread the new dots across the front, leaving placed ones alone.
    added.forEach((track, i) => queue.update(track.id, defaultPanForIndex(baseLen + i, baseLen + added.length)));
    const total = baseLen + added.length;
    setStatus(`${total} layer${total === 1 ? '' : 's'}. Drag dots to place them, then play.`);
  };

  useIncomingFiles(handleFiles);

  const removeTrack = (id: string) => {
    queue.remove(id);
    if (transport !== 'stopped') engineRef.current?.syncPositions(tracksRef.current.filter((t) => t.id !== id));
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
    setStatus(tracks.length ? 'Stopped. Play again from the same layout.' : 'Add audio files to begin.');
  };

  const download = async () => {
    if (!tracks.length || exporting) return;
    setExporting(true);
    setStatus('Rendering binaural mix offline — large stacks take longer…');
    try {
      await engineRef.current?.downloadMix(tracks, volume);
      setStatus('Saved a stereo binaural WAV matching the map. Use headphones.');
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
    commitPositions((t) => {
      if (t.id !== id) return t;
      const x = (clientX - rect.left - rect.width / 2) / scalePx;
      const z = (clientY - rect.top - rect.height / 2) / scalePx + t.height * 0.22;
      const dist = Math.min(MAX_PAN_DIST, Math.max(MIN_PAN_DIST, Math.hypot(x, z)));
      return { ...t, azimuth: Math.atan2(x, -z), distance: dist };
    });
  };

  const onDotPointerDown = (id: string) => (e: React.PointerEvent) => {
    if (locked) return;
    e.preventDefault();
    draggingId.current = id;
    setFocusId(id);
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

  const nudgeHeight = (id: string, step: number) =>
    commitPositions((t) => (t.id === id ? { ...t, height: Math.min(MAX_PAN_HEIGHT, Math.max(MIN_PAN_HEIGHT, t.height + step)) } : t));

  /** Keyboard equivalent of dragging: turn around the head and move closer or further. */
  const nudgePosition = (id: string, dAzimuthDeg: number, dDistance: number) =>
    commitPositions((t) =>
      t.id === id
        ? {
            ...t,
            azimuth: t.azimuth + (dAzimuthDeg * Math.PI) / 180,
            distance: Math.min(MAX_PAN_DIST, Math.max(MIN_PAN_DIST, t.distance + dDistance)),
          }
        : t,
    );

  const onDotWheel = (id: string) => (e: React.WheelEvent) => {
    if (locked) return;
    nudgeHeight(id, e.deltaY < 0 ? 0.16 : -0.16);
  };

  return (
    <Workbench panelWidth={340}>
      <Panel
        footer={
          <ExportFooter
            primary={{
              variant: 'outlined',
              label: 'Download mix (WAV)',
              icon: <DownloadRoundedIcon />,
              busy: exporting,
              busyLabel: 'Rendering…',
              onClick: download,
              disabled: !tracks.length,
            }}
            status={status}
          />
        }
      >
        <ToolIntro />
        <PanelSection
          title={`Layers · ${tracks.length}`}
          action={
            <FileButton size="small" variant="outlined" multiple accept="audio/*" onFiles={handleFiles} startIcon={<AddRoundedIcon />}>
              Add
            </FileButton>
          }
        >
          {tracks.length === 0 ? (
            <FileDropZone multiple accept="audio/*" title="Add audio files" hint="One or many" onFiles={handleFiles} />
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {tracks.map((track, index) => (
                <Box
                  key={track.id}
                  onMouseEnter={() => setFocusId(track.id)}
                  onMouseLeave={() => setFocusId(null)}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '22px minmax(0, 1fr) auto',
                    alignItems: 'center',
                    gap: 1,
                    pl: 1,
                    pr: 0.25,
                    py: 0.5,
                    borderRadius: 2,
                    bgcolor: focusId === track.id ? 'action.hover' : 'transparent',
                  }}
                >
                  <Box
                    sx={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      bgcolor: dotHue(index, tracks.length),
                      color: '#0b0b0c',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                    }}
                  >
                    {index + 1}
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" noWrap title={track.name} sx={{ fontWeight: 550 }}>
                      {track.name}
                    </Typography>
                    <Typography sx={{ fontFamily: MONO_FONT, fontSize: '0.68rem', color: 'text.secondary' }}>
                      {((track.azimuth * 180) / Math.PI).toFixed(0)}° · {track.distance.toFixed(1)}m · h{track.height >= 0 ? '+' : ''}
                      {track.height.toFixed(1)}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex' }}>
                    <IconButton size="small" disabled={index === 0} onClick={() => queue.move(track.id, -1)} aria-label="Move up">
                      <ArrowUpwardRoundedIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                    <IconButton size="small" disabled={index === tracks.length - 1} onClick={() => queue.move(track.id, 1)} aria-label="Move down">
                      <ArrowDownwardRoundedIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                    <IconButton size="small" onClick={() => removeTrack(track.id)} aria-label={`Remove ${track.name}`}>
                      <CloseRoundedIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </PanelSection>
        <PanelSection title="Mix">
          <SliderField label="Master volume" value={volume} onChange={setVolume} min={0} max={2} step={0.01} format={(v) => `${Math.round(v * 100)}%`} />
          {twoTrack && (
            <>
              <SwitchRow
                label="One per side"
                hint="Pin track 1 left and track 2 right"
                checked={onePerSide}
                onChange={(checked) => {
                  setOnePerSide(checked);
                  if (checked) applyOnePerSide(swapped);
                }}
              />
              <Button
                variant="outlined"
                disabled={!onePerSide}
                startIcon={<SwapHorizRoundedIcon />}
                onClick={() => {
                  const flip = !swapped;
                  setSwapped(flip);
                  applyOnePerSide(flip);
                }}
              >
                Swap sides
              </Button>
            </>
          )}
        </PanelSection>
      </Panel>

      <Stage
        backdrop="plain"
        onFiles={handleFiles}
        dropLabel="Drop to add layers"
        overlay={
          tracks.length > 0 && (
            <StageDock>
              {transport === 'playing' ? (
                <Button onClick={pause} disabled={exporting} startIcon={<PauseRoundedIcon />}>
                  Pause
                </Button>
              ) : (
                <Button onClick={play} disabled={exporting} startIcon={<PlayArrowRoundedIcon />}>
                  {transport === 'paused' ? 'Resume' : 'Play all'}
                </Button>
              )}
              <Tooltip title="Stop">
                <span>
                  <IconButton onClick={stop} disabled={transport === 'stopped' || exporting}>
                    <StopRoundedIcon />
                  </IconButton>
                </span>
              </Tooltip>
              <Typography sx={{ fontFamily: MONO_FONT, fontSize: '0.75rem', color: 'text.secondary', px: 1 }}>
                {tracks.length} layer{tracks.length === 1 ? '' : 's'} · {transport}
              </Typography>
            </StageDock>
          )
        }
      >
        {tracks.length === 0 ? (
          <FileDropZone
            variant="hero"
            multiple
            accept="audio/*"
            icon={LayersRoundedIcon}
            title="Stack up some tracks"
            hint="Drop several audio files. Each becomes a dot you can place around your head."
            onFiles={handleFiles}
          />
        ) : (
          <Box sx={{ width: 'min(100%, 72vh, 680px)', mb: 8 }}>
            <Box ref={stageRef} sx={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', touchAction: 'none', cursor: locked ? 'not-allowed' : 'default' }}>
              <MapBackdrop />
              {tracks.map((track, index) => {
                const { x, y, z } = worldFromPan(track.azimuth, track.distance, track.height);
                const left = 50 + x * PCT_PER_UNIT;
                const top = 50 + z * PCT_PER_UNIT - y * PCT_PER_UNIT * 0.22;
                const size = Math.max(22, 30 + track.height * 4);
                const color = dotHue(index, tracks.length);
                const focused = focusId === track.id;
                return (
                  <Box
                    key={track.id}
                    role="slider"
                    tabIndex={0}
                    aria-label={`${track.name} position`}
                    aria-valuetext={`${((track.azimuth * 180) / Math.PI).toFixed(0)} degrees, ${track.distance.toFixed(1)} metres, height ${track.height.toFixed(1)}`}
                    onPointerDown={onDotPointerDown(track.id)}
                    onWheel={onDotWheel(track.id)}
                    onMouseEnter={() => setFocusId(track.id)}
                    onMouseLeave={() => draggingId.current !== track.id && setFocusId(null)}
                    onKeyDown={(e) => {
                      if (locked) return;
                      const big = e.shiftKey ? 3 : 1;
                      const moves: Record<string, () => void> = {
                        ArrowLeft: () => nudgePosition(track.id, -5 * big, 0),
                        ArrowRight: () => nudgePosition(track.id, 5 * big, 0),
                        ArrowUp: () => nudgePosition(track.id, 0, -0.15 * big),
                        ArrowDown: () => nudgePosition(track.id, 0, 0.15 * big),
                        PageUp: () => nudgeHeight(track.id, 0.16 * big),
                        PageDown: () => nudgeHeight(track.id, -0.16 * big),
                        '+': () => nudgeHeight(track.id, 0.16),
                        '-': () => nudgeHeight(track.id, -0.16),
                      };
                      const move = moves[e.key];
                      if (!move) return;
                      e.preventDefault();
                      move();
                    }}
                    title={`${track.name} — drag or use arrow keys for direction & distance; scroll or PageUp/PageDown for height`}
                    sx={{
                      position: 'absolute',
                      left: `${left}%`,
                      top: `${top}%`,
                      width: size,
                      height: size,
                      borderRadius: '50%',
                      transform: 'translate(-50%, -50%)',
                      bgcolor: color,
                      color: '#0b0b0c',
                      display: 'grid',
                      placeItems: 'center',
                      fontWeight: 700,
                      fontSize: '0.78rem',
                      zIndex: focused ? 50 : 10 + index,
                      cursor: locked ? 'not-allowed' : 'grab',
                      boxShadow: `0 0 0 3px rgba(255,255,255,${focused ? 0.9 : 0.5}), 0 0 24px ${color}`,
                      transition: draggingId.current === track.id ? 'none' : 'left 0.12s, top 0.12s, width 0.12s, height 0.12s',
                      '&:active': { cursor: locked ? 'not-allowed' : 'grabbing' },
                      '&:focus-visible': { outline: '2px solid #fff', outlineOffset: 3 },
                    }}
                  >
                    {index + 1}
                    {focused && (
                      <Box
                        sx={{
                          position: 'absolute',
                          top: '100%',
                          mt: 1,
                          px: 1,
                          py: 0.25,
                          borderRadius: 1,
                          bgcolor: 'rgba(0,0,0,0.75)',
                          color: '#fff',
                          fontFamily: MONO_FONT,
                          fontSize: '0.68rem',
                          fontWeight: 400,
                          whiteSpace: 'nowrap',
                          pointerEvents: 'none',
                        }}
                      >
                        {track.name}
                      </Box>
                    )}
                  </Box>
                );
              })}
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 2 }}>
              Drag a dot, or focus one and use the arrow keys, for direction and distance · scroll or PageUp/PageDown for height
            </Typography>
          </Box>
        )}
      </Stage>
    </Workbench>
  );
}

function MapBackdrop() {
  const theme = useTheme();
  const ink = theme.palette.text.primary;
  const accent = theme.palette.primary.main;
  const inner = 36 * 0.92 * (MIN_PAN_DIST / WORLD_R_FOR_SCALE);
  const outer = 36 * 0.92 * (MAX_PAN_DIST / WORLD_R_FOR_SCALE);
  return (
    <Box component="svg" viewBox="0 0 100 100" sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
      <defs>
        <radialGradient id="burger-floor">
          <stop offset="0%" stopColor={accent} stopOpacity="0.16" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r={Math.min(50, outer)} fill="url(#burger-floor)" />
      {[1, 2, 3, 4].map((m) => (
        <circle key={m} cx="50" cy="50" r={36 * 0.92 * (m / WORLD_R_FOR_SCALE)} fill="none" stroke={ink} strokeOpacity="0.09" strokeWidth="0.25" />
      ))}
      {[1, 2, 3, 4].map((m) => (
        <text key={m} x={50 + 36 * 0.92 * (m / WORLD_R_FOR_SCALE) + 0.8} y="49" fontSize="1.9" fontFamily={MONO_FONT} fill={ink} fillOpacity="0.3">
          {m}m
        </text>
      ))}
      <circle cx="50" cy="50" r={inner} fill="none" stroke={accent} strokeOpacity="0.35" strokeWidth="0.25" strokeDasharray="0.8 0.8" />
      <line x1="50" y1="4" x2="50" y2="96" stroke={ink} strokeOpacity="0.07" strokeWidth="0.25" />
      <line x1="4" y1="50" x2="96" y2="50" stroke={ink} strokeOpacity="0.07" strokeWidth="0.25" />
      <text x="50" y="3" fontSize="2.2" fontFamily={MONO_FONT} textAnchor="middle" fill={ink} fillOpacity="0.45">
        FRONT
      </text>
      <text x="50" y="99" fontSize="2.2" fontFamily={MONO_FONT} textAnchor="middle" fill={ink} fillOpacity="0.45">
        BACK
      </text>
      <text x="1" y="50.8" fontSize="2.2" fontFamily={MONO_FONT} fill={ink} fillOpacity="0.45">
        L
      </text>
      <text x="99" y="50.8" fontSize="2.2" fontFamily={MONO_FONT} textAnchor="end" fill={ink} fillOpacity="0.45">
        R
      </text>
      <ListenerHead size={3.4} />
    </Box>
  );
}
