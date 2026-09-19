import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { alpha, useTheme } from '@mui/material/styles';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import PauseRoundedIcon from '@mui/icons-material/PauseRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import HeadphonesRoundedIcon from '@mui/icons-material/HeadphonesRounded';
import { useIncomingFiles } from '../components/FileBridge';
import { FileDropZone } from '../components/FileDropZone';
import { ListenerHead } from '../components/ListenerHead';
import { useNotification } from '../components/NotificationProvider';
import { usePersistentState } from '../hooks/usePersistentState';
import { Panel, PanelSection, Stage, StageDock, StageTag, ToolIntro, Workbench } from '../components/Workbench';
import { ExportFooter } from '../components/ExportFooter';
import { FieldLabel, Segmented, SliderField, SwitchRow } from '../components/controls';
import { OrbitalEngine, type OrbitalParams, type OrbitalTick, type PlaybackState } from '../lib/orbital';
import type { DistanceModel } from '../lib/spatial';
import { MONO_FONT } from '../theme';

const RADIUS_MIN = 0.05;
const RADIUS_MAX = 6;

export function AudioSpinning() {
  const notify = useNotification();
  const engineRef = useRef<OrbitalEngine | null>(null);

  const [speed, setSpeed] = usePersistentState('speed', 0.6);
  const [radius, setRadius] = usePersistentState('radius', 1.8);
  const [height, setHeight] = usePersistentState('height', 0);
  const [volume, setVolume] = usePersistentState('volume', 1);
  const [echo, setEcho] = usePersistentState('echo', 0.12);
  const [echoDelay, setEchoDelay] = usePersistentState('echoDelay', 200);
  const [echoLink, setEchoLink] = usePersistentState('echoLink', false);
  const [doppler, setDoppler] = usePersistentState('doppler', 1);
  const [distanceModel, setDistanceModel] = usePersistentState<DistanceModel>('distanceModel', 'inverse');

  const [fileName, setFileName] = useState<string | null>(null);
  const [status, setStatus] = useState('Load a file to begin.');
  const [tick, setTick] = useState<OrbitalTick>({ angleDeg: 0, x: 0, z: -1.8, playback: 'Stopped' });
  const [rendering, setRendering] = useState(false);

  const hasFile = fileName !== null;

  const params: OrbitalParams = {
    speed,
    radius,
    height,
    doppler,
    distanceModel,
    echo,
    echoDelayMs: echoDelay,
    echoLinkDistance: echoLink,
    volume,
    radiusMin: RADIUS_MIN,
    radiusMax: RADIUS_MAX,
  };

  useEffect(() => {
    const engine = new OrbitalEngine(
      params,
      (t) => setTick(t),
      (state: PlaybackState) => {
        setTick((prev) => ({ ...prev, playback: state }));
        if (state === 'Playing') setStatus('Orbiting. Use headphones for the full effect.');
        else if (state === 'Paused') setStatus('Paused — Play continues from the same point.');
        else setStatus('Stopped. Ready to play again.');
      },
    );
    engineRef.current = engine;
    return () => engine.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    engineRef.current?.setParams(params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speed, radius, height, volume, echo, echoDelay, echoLink, doppler, distanceModel]);

  const playback = tick.playback;

  const handleFiles = async (files: File[]) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.stop();
    try {
      await engine.load(files[0]);
      setFileName(files[0].name);
      setStatus('Loaded. Press Play to start the orbit.');
    } catch {
      setFileName(null);
      setStatus('Could not decode that audio file. Try MP3, WAV, M4A, or OGG.');
      notify('Could not decode that audio file.', 'error');
    }
  };

  useIncomingFiles(handleFiles);

  const download = async () => {
    if (!engineRef.current?.hasBuffer()) {
      notify('Load an audio file first.', 'error');
      return;
    }
    setRendering(true);
    setStatus('Rendering binaural mix… long files take a while.');
    try {
      await engineRef.current.downloadWav();
      setStatus('Saved a binaural stereo WAV. Play it back on headphones.');
    } catch {
      notify('Could not render 3D audio. Try a shorter file or another format.', 'error');
      setStatus('Render failed.');
    } finally {
      setRendering(false);
    }
  };

  return (
    <Workbench panelWidth={340}>
      <Stage
        backdrop="plain"
        onFiles={hasFile ? handleFiles : undefined}
        overlay={
          <>
            <StageTag>
              <HeadphonesRoundedIcon sx={{ fontSize: 13, verticalAlign: '-2px', mr: 0.5 }} />
              headphones recommended
            </StageTag>
            {hasFile && (
              <StageDock>
                <Tooltip title={playback === 'Playing' ? 'Pause' : 'Play'}>
                  <IconButton
                    onClick={() => (playback === 'Playing' ? engineRef.current?.pause() : void engineRef.current?.play())}
                    sx={(t) => ({ bgcolor: 'primary.main', color: t.palette.primary.contrastText, '&:hover': { bgcolor: 'primary.dark' } })}
                  >
                    {playback === 'Playing' ? <PauseRoundedIcon /> : <PlayArrowRoundedIcon />}
                  </IconButton>
                </Tooltip>
                <Tooltip title="Stop">
                  <IconButton onClick={() => engineRef.current?.stop()}>
                    <StopRoundedIcon />
                  </IconButton>
                </Tooltip>
                <Box sx={{ px: 1.5, minWidth: 0 }}>
                  <Typography variant="body2" noWrap sx={{ fontWeight: 600, maxWidth: 220 }}>
                    {fileName}
                  </Typography>
                  <Typography sx={{ fontFamily: MONO_FONT, fontSize: '0.72rem', color: 'text.secondary' }}>
                    {playback.toLowerCase()} · {tick.angleDeg.toFixed(0).padStart(3, '0')}°
                  </Typography>
                </Box>
              </StageDock>
            )}
          </>
        }
      >
        {!hasFile ? (
          <FileDropZone
            variant="hero"
            accept="audio/*"
            icon={HeadphonesRoundedIcon}
            title="Drop a song to send it spinning"
            hint="MP3, WAV, M4A or OGG. It stays on your machine."
            onFiles={handleFiles}
          />
        ) : (
          <OrbitRadar x={tick.x} z={tick.z} radius={radius} height={height} angle={tick.angleDeg} playing={playback === 'Playing'} />
        )}
      </Stage>

      <Panel
        footer={
          <ExportFooter
            primary={{
              variant: 'outlined',
              label: 'Download 3D WAV',
              icon: <DownloadRoundedIcon />,
              busy: rendering,
              busyLabel: 'Rendering…',
              onClick: download,
              disabled: !hasFile,
            }}
            status={status}
          />
        }
      >
        <ToolIntro />
        <PanelSection title="Source">
          <FileDropZone accept="audio/*" title={fileName ?? 'Choose an audio file'} hint="MP3, WAV, M4A, OGG" onFiles={handleFiles} />
        </PanelSection>
        <PanelSection title="Orbit">
          <SliderField label="Speed" value={speed} onChange={setSpeed} min={0.05} max={3} step={0.01} format={(v) => `${v.toFixed(2)} rps`} />
          <SliderField label="Radius" value={radius} onChange={setRadius} min={RADIUS_MIN} max={RADIUS_MAX} step={0.01} format={(v) => `${v.toFixed(2)} m`} />
          <SliderField label="Height" value={height} onChange={setHeight} min={-10} max={10} step={0.01} format={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)} m`} />
        </PanelSection>
        <PanelSection title="Sound">
          <SliderField label="Volume" value={volume} onChange={setVolume} min={0} max={2} step={0.01} format={(v) => `${Math.round(v * 100)}%`} />
          <SliderField label="Doppler" value={doppler} onChange={setDoppler} min={0} max={4} step={0.01} format={(v) => `${v.toFixed(2)}×`} />
          <Box>
            <FieldLabel>Distance falloff</FieldLabel>
            <Segmented
              aria-label="Distance model"
              value={distanceModel}
              onChange={setDistanceModel}
              options={[
                { value: 'inverse', label: 'Inverse' },
                { value: 'linear', label: 'Linear' },
                { value: 'exponential', label: 'Exponential' },
              ]}
            />
          </Box>
        </PanelSection>
        <PanelSection title="Echo">
          <SliderField label="Wet" value={echo} onChange={setEcho} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} />
          <SliderField label="Delay" value={echoDelay} onChange={setEchoDelay} min={20} max={800} step={1} disabled={echoLink} format={(v) => `${v} ms`} />
          <SwitchRow label="Follow distance" hint="Delay tracks the orbit radius" checked={echoLink} onChange={setEchoLink} />
        </PanelSection>
      </Panel>
    </Workbench>
  );
}

function OrbitRadar({ x, z, radius, height, angle, playing }: { x: number; z: number; radius: number; height: number; angle: number; playing: boolean }) {
  const theme = useTheme();
  const accent = theme.palette.primary.main;
  const ink = theme.palette.text.primary;
  const R = 38;
  const r = Math.max(radius, 0.05);
  const cx = 50 + (x / r) * R;
  const cy = 50 + (z / r) * R;
  // Height scales the dot: above your head is bigger, below is smaller.
  const dotR = Math.max(1.6, 3 + height * 0.15);

  return (
    <Box sx={{ width: 'min(100%, 72vh, 640px)', aspectRatio: '1 / 1', position: 'relative', mb: 8 }}>
      <Box component="svg" viewBox="0 0 100 100" sx={{ width: '100%', height: '100%', overflow: 'visible' }}>
        <defs>
          <radialGradient id="spin-glow">
            <stop offset="0%" stopColor={accent} stopOpacity="0.22" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="spin-sweep" gradientUnits="userSpaceOnUse" x1="50" y1="50" x2={cx} y2={cy}>
            <stop offset="0%" stopColor={accent} stopOpacity="0" />
            <stop offset="100%" stopColor={accent} stopOpacity="0.8" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="48" fill="url(#spin-glow)" />
        {[0.25, 0.5, 0.75].map((f) => (
          <circle key={f} cx="50" cy="50" r={48 * f} fill="none" stroke={ink} strokeOpacity="0.08" strokeWidth="0.25" />
        ))}
        <line x1="50" y1="2" x2="50" y2="98" stroke={ink} strokeOpacity="0.08" strokeWidth="0.25" />
        <line x1="2" y1="50" x2="98" y2="50" stroke={ink} strokeOpacity="0.08" strokeWidth="0.25" />
        {Array.from({ length: 72 }, (_, i) => {
          const a = (i / 72) * Math.PI * 2;
          const long = i % 6 === 0;
          const r1 = 48;
          const r2 = long ? 45.5 : 47;
          return (
            <line
              key={i}
              x1={50 + Math.sin(a) * r1}
              y1={50 - Math.cos(a) * r1}
              x2={50 + Math.sin(a) * r2}
              y2={50 - Math.cos(a) * r2}
              stroke={ink}
              strokeOpacity={long ? 0.35 : 0.15}
              strokeWidth="0.3"
            />
          );
        })}
        {(['FRONT', 'RIGHT', 'BACK', 'LEFT'] as const).map((label, i) => {
          const a = (i / 4) * Math.PI * 2;
          return (
            <text
              key={label}
              x={50 + Math.sin(a) * 42}
              y={50 - Math.cos(a) * 42 + 1}
              fontSize="2.2"
              fontFamily={MONO_FONT}
              textAnchor="middle"
              fill={ink}
              fillOpacity="0.4"
              letterSpacing="0.2"
            >
              {label}
            </text>
          );
        })}
        <circle cx="50" cy="50" r={R} fill="none" stroke={accent} strokeOpacity="0.45" strokeWidth="0.35" strokeDasharray="1 1.2" />
        <line x1="50" y1="50" x2={cx} y2={cy} stroke="url(#spin-sweep)" strokeWidth="0.6" />
        {/* Listener, seen from above, facing up. */}
        <ListenerHead size={4} />
        {/* Source */}
        <circle cx={cx} cy={cy} r={dotR * 2.4} fill={accent} fillOpacity={playing ? 0.18 : 0.1}>
          {playing && <animate attributeName="r" values={`${dotR * 1.6};${dotR * 3};${dotR * 1.6}`} dur="1.4s" repeatCount="indefinite" />}
        </circle>
        <circle cx={cx} cy={cy} r={dotR} fill={accent} stroke="#fff" strokeWidth="0.5" />
      </Box>
      <Box sx={{ position: 'absolute', left: 0, bottom: -4, display: 'flex', gap: 3, fontFamily: MONO_FONT, fontSize: '0.72rem', color: 'text.secondary' }}>
        <span>θ {angle.toFixed(0)}°</span>
        <span>x {x.toFixed(2)}</span>
        <span>z {z.toFixed(2)}</span>
      </Box>
      <Typography sx={{ position: 'absolute', right: 0, bottom: -4, fontFamily: MONO_FONT, fontSize: '0.72rem', color: alpha(accent, 0.9) }}>
        r {radius.toFixed(2)}m · h {height.toFixed(1)}m
      </Typography>
    </Box>
  );
}
