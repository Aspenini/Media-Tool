import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Slider from '@mui/material/Slider';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import PauseRoundedIcon from '@mui/icons-material/PauseRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import { ToolShell } from '../components/ToolShell';
import { FileDropZone } from '../components/FileDropZone';
import { useNotification } from '../components/NotificationProvider';
import { OrbitalEngine, type OrbitalParams, type OrbitalTick, type PlaybackState } from '../lib/orbital';
import type { DistanceModel } from '../lib/spatial';

const RADIUS_MIN = 0.05;
const RADIUS_MAX = 6;

function LabelledSlider({ label, value, suffix, ...sliderProps }: { label: string; value: number; suffix?: string } & React.ComponentProps<typeof Slider>) {
  return (
    <Box>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        {label} — {value.toFixed(2)}
        {suffix ? ` ${suffix}` : ''}
      </Typography>
      <Slider value={value} {...sliderProps} />
    </Box>
  );
}

export function AudioSpinning() {
  const notify = useNotification();
  const engineRef = useRef<OrbitalEngine | null>(null);

  const [speed, setSpeed] = useState(0.6);
  const [radius, setRadius] = useState(1.8);
  const [height, setHeight] = useState(0);
  const [volume, setVolume] = useState(1);
  const [echo, setEcho] = useState(0.12);
  const [echoDelay, setEchoDelay] = useState(200);
  const [echoLink, setEchoLink] = useState(false);
  const [doppler, setDoppler] = useState(1);
  const [distanceModel, setDistanceModel] = useState<DistanceModel>('inverse');

  const [fileName, setFileName] = useState('No file loaded.');
  const [hasFile, setHasFile] = useState(false);
  const [status, setStatus] = useState('Load a file to begin.');
  const [tick, setTick] = useState<OrbitalTick>({ angleDeg: 0, x: 0, z: -1.8, playback: 'Stopped' });
  const [rendering, setRendering] = useState(false);

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
        if (state === 'Playing') setStatus('Orbiting audio is playing. Use headphones for the full effect.');
        else if (state === 'Paused') setStatus('Paused. Press Play to continue from the same point.');
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
      setHasFile(true);
      setStatus('Loaded. Press Play to start orbiting audio.');
    } catch {
      setHasFile(false);
      setStatus('Could not decode that audio file. Try MP3, WAV, M4A, or OGG.');
      notify('Could not decode that audio file.', 'error');
    }
  };

  const download = async () => {
    if (!engineRef.current?.hasBuffer()) {
      notify('Load an audio file first.', 'error');
      return;
    }
    setRendering(true);
    setStatus('Rendering binaural (3D) mix… This can take a while for long files.');
    try {
      await engineRef.current.downloadWav();
      setStatus('Saved binaural WAV (stereo). Use headphones when playing it back.');
    } catch {
      notify('Could not render 3D audio. Try a shorter file or another format.', 'error');
      setStatus('Render failed.');
    } finally {
      setRendering(false);
    }
  };

  const leftPct = 50 + (tick.x / Math.max(radius, 0.05)) * 38;
  const topPct = 50 + (tick.z / Math.max(radius, 0.05)) * 38;

  return (
    <ToolShell title="Audio Spinning" description="Upload an audio file, press play, and the sound source orbits your head in real time using the Web Audio API. Best with headphones. Fully local — no upload.">
      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) minmax(0, 1fr)' }, alignItems: 'start' }}>
        <Paper variant="outlined" sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2.5, borderRadius: 3 }}>
          <FileDropZone accept="audio/*" title={hasFile ? fileName : 'Drop an audio file'} hint="or click to browse" onFiles={handleFiles} />
          <LabelledSlider label="Orbit speed" value={speed} suffix="rps" min={0.05} max={3} step={0.01} onChange={(_, v) => setSpeed(v as number)} />
          <LabelledSlider label="Orbit radius" value={radius} suffix="m" min={RADIUS_MIN} max={RADIUS_MAX} step={0.01} onChange={(_, v) => setRadius(v as number)} />
          <LabelledSlider label="Height" value={height} suffix="m" min={-10} max={10} step={0.01} onChange={(_, v) => setHeight(v as number)} />
          <LabelledSlider label="Volume" value={volume} min={0} max={2} step={0.01} onChange={(_, v) => setVolume(v as number)} />
          <LabelledSlider label="Echo (wet)" value={echo} min={0} max={1} step={0.01} onChange={(_, v) => setEcho(v as number)} />
          <LabelledSlider label="Echo delay" value={echoDelay} suffix="ms" min={20} max={800} step={1} disabled={echoLink} onChange={(_, v) => setEchoDelay(v as number)} />
          <FormControlLabel control={<Checkbox checked={echoLink} onChange={(e) => setEchoLink(e.target.checked)} />} label="Follow distance — echo delay tracks orbit radius" />
          <LabelledSlider label="Doppler intensity" value={doppler} min={0} max={4} step={0.01} onChange={(_, v) => setDoppler(v as number)} />
          <TextField select label="Distance model" value={distanceModel} onChange={(e) => setDistanceModel(e.target.value as DistanceModel)}>
            <MenuItem value="inverse">inverse</MenuItem>
            <MenuItem value="linear">linear</MenuItem>
            <MenuItem value="exponential">exponential</MenuItem>
          </TextField>
          <Stack direction="row" spacing={1.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
            <Button onClick={() => void engineRef.current?.play()} disabled={!hasFile} startIcon={<PlayArrowRoundedIcon />}>
              Play
            </Button>
            <Button variant="outlined" onClick={() => engineRef.current?.pause()} disabled={playback !== 'Playing'} startIcon={<PauseRoundedIcon />}>
              Pause
            </Button>
            <Button variant="outlined" color="inherit" onClick={() => engineRef.current?.stop()} disabled={!hasFile} startIcon={<StopRoundedIcon />}>
              Stop
            </Button>
            <Button variant="outlined" onClick={download} disabled={!hasFile || rendering} startIcon={<DownloadRoundedIcon />}>
              Download 3D WAV
            </Button>
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {status}
          </Typography>
        </Paper>

        <Paper variant="outlined" sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2, borderRadius: 3 }}>
          <Box
            sx={{
              position: 'relative',
              width: '100%',
              aspectRatio: '1 / 1',
              borderRadius: 3,
              overflow: 'hidden',
              background: 'radial-gradient(circle at 50% 50%, rgba(99,102,241,0.18), transparent 70%)',
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Box sx={{ position: 'absolute', inset: 0, '&::before, &::after': { content: '""', position: 'absolute', background: 'rgba(148,163,184,0.18)' }, '&::before': { left: '50%', top: 0, bottom: 0, width: '1px' }, '&::after': { top: '50%', left: 0, right: 0, height: '1px' } }} />
            <Box
              component="svg"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            >
              <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(96,165,250,0.35)" strokeWidth="0.5" strokeDasharray="2 2" />
            </Box>
            <Box sx={{ position: 'absolute', left: '50%', top: '50%', width: 16, height: 16, borderRadius: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(248,250,252,0.85)', boxShadow: '0 0 12px rgba(248,250,252,0.6)' }} />
            <Box
              sx={{
                position: 'absolute',
                left: `${leftPct}%`,
                top: `${topPct}%`,
                width: 18,
                height: 18,
                borderRadius: '50%',
                transform: 'translate(-50%, -50%)',
                background: '#60a5fa',
                boxShadow: '0 0 18px rgba(96,165,250,0.85)',
                transition: playback === 'Playing' ? 'none' : 'left 0.2s, top 0.2s',
              }}
            />
          </Box>
          <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(2, 1fr)' }}>
            <Readout label="Angle" value={`${tick.angleDeg.toFixed(0)}°`} />
            <Readout label="Direction" value="Clockwise" />
            <Readout label="X / Z" value={`${tick.x.toFixed(2)} / ${tick.z.toFixed(2)}`} />
            <Readout label="Playback" value={tick.playback} />
          </Box>
        </Paper>
      </Box>
    </ToolShell>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <Paper variant="outlined" sx={{ px: 2, py: 1.25, borderRadius: 2 }}>
      <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </Typography>
      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
        {value}
      </Typography>
    </Paper>
  );
}
