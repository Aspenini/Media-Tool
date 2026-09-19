import { useEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Slider from '@mui/material/Slider';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useTheme } from '@mui/material/styles';
import GraphicEqRoundedIcon from '@mui/icons-material/GraphicEqRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import { DownloadButton } from '../components/DownloadButton';
import { useNotification } from '../components/NotificationProvider';
import { Panel, PanelSection, Stage, ToolIntro, Workbench } from '../components/Workbench';
import { FieldLabel, Segmented, SliderField, SwitchRow } from '../components/controls';
import { getAudioContextClass } from '../lib/spatial';
import { audioBufferToWavBlob } from '../lib/wav';
import { generatePagnaiBuffer, type PagnaiParams, type WaveType } from '../lib/pagnai';
import { DISPLAY_FONT, MONO_FONT } from '../theme';

const WAVE_GLYPHS: Record<WaveType, string> = {
  sine: 'M2 12 C 6 2, 10 2, 14 12 S 22 22, 26 12',
  square: 'M2 17 V7 H10 V17 H18 V7 H26',
  sawtooth: 'M2 17 L10 7 V17 L18 7 V17 L26 7',
  triangle: 'M2 17 L8 7 L14 17 L20 7 L26 17',
  noise: 'M2 12 L4 8 L6 15 L8 5 L10 18 L12 9 L14 14 L16 6 L18 16 L20 10 L22 17 L24 7 L26 12',
};

const WAVE_NAMES: Record<WaveType, string> = { sine: 'Sine', square: 'Square', sawtooth: 'Saw', triangle: 'Tri', noise: 'Noise' };

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

function noteFor(freq: number): string {
  if (!(freq > 0)) return '—';
  const midi = Math.round(12 * Math.log2(freq / 440) + 69);
  const cents = Math.round((12 * Math.log2(freq / 440) + 69 - midi) * 100);
  const name = `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
  return cents === 0 ? name : `${name} ${cents > 0 ? '+' : ''}${cents}¢`;
}

// Frequency slider runs on a log scale so the musical range gets most of the travel.
const F_MIN = 20;
const F_MAX = 20000;
const toSlider = (f: number) => Math.log(Math.min(F_MAX, Math.max(F_MIN, f)) / F_MIN) / Math.log(F_MAX / F_MIN);
const fromSlider = (v: number) => Math.round(F_MIN * Math.pow(F_MAX / F_MIN, v));

export function Pagnai() {
  const notify = useNotification();
  const ctxRef = useRef<AudioContext | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  const [waveType, setWaveType] = useState<WaveType>('sine');
  const [frequency, setFrequency] = useState(440);
  const [duration, setDuration] = useState(2);
  const [volume, setVolume] = useState(0.5);
  const [modulation, setModulation] = useState(false);
  const [modFreq, setModFreq] = useState(5);
  const [modDepth, setModDepth] = useState(50);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);

  const params: PagnaiParams = { waveType, frequency, duration, volume, modulation, modFreq, modDepth };

  // A short window of the signal, rendered offline, for the oscilloscope.
  const preview = useMemo(() => {
    const sampleRate = 48000;
    const cycles = modulation ? Math.min(1, 1 / Math.max(modFreq, 0.1)) : 4 / Math.max(frequency, 1);
    const seconds = Math.min(1, Math.max(0.002, cycles));
    try {
      const offline = new OfflineAudioContext(1, 1, sampleRate);
      return generatePagnaiBuffer(offline, { ...params, duration: seconds }).getChannelData(0);
    } catch {
      return new Float32Array(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waveType, frequency, volume, modulation, modFreq, modDepth]);

  const ensureCtx = (): AudioContext => {
    if (!ctxRef.current) ctxRef.current = new (getAudioContextClass())();
    if (ctxRef.current.state === 'suspended') void ctxRef.current.resume();
    return ctxRef.current;
  };

  const stop = () => {
    if (sourceRef.current) {
      try {
        sourceRef.current.stop();
      } catch {
        /* already stopped */
      }
      sourceRef.current = null;
    }
    setPlaying(false);
  };

  useEffect(() => () => stop(), []);

  const generate = (): AudioBuffer | null => {
    try {
      const ctx = ensureCtx();
      const buffer = generatePagnaiBuffer(ctx, params);
      bufferRef.current = buffer;
      const blob = audioBufferToWavBlob(buffer);
      setAudioUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
      return buffer;
    } catch (error) {
      notify('Error generating audio: ' + (error instanceof Error ? error.message : String(error)), 'error');
      return null;
    }
  };

  const play = () => {
    // Always play what the controls currently say.
    const buffer = generate();
    if (!buffer) return;
    const ctx = ensureCtx();
    stop();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => setPlaying(false);
    source.start(0);
    sourceRef.current = source;
    setPlaying(true);
  };

  return (
    <Workbench panelWidth={340}>
      <Panel
        footer={
          <>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
              <Button size="large" onClick={playing ? stop : play} startIcon={playing ? <StopRoundedIcon /> : <PlayArrowRoundedIcon />}>
                {playing ? 'Stop' : 'Play'}
              </Button>
              <Button size="large" variant="outlined" onClick={() => generate() && notify('WAV rendered — ready to download.', 'success')} startIcon={<GraphicEqRoundedIcon />}>
                Render
              </Button>
            </Box>
            {audioUrl && <DownloadButton variant="outlined" href={audioUrl} download="pagnai_audio.wav" label="Download WAV" />}
          </>
        }
      >
        <ToolIntro />
        <PanelSection title="Oscillator">
          <Box>
            <FieldLabel value={WAVE_NAMES[waveType]}>Waveform</FieldLabel>
            <Segmented
              aria-label="Waveform"
              value={waveType}
              onChange={setWaveType}
              options={(Object.keys(WAVE_GLYPHS) as WaveType[]).map((w) => ({
                value: w,
                title: WAVE_NAMES[w],
                label: (
                  <Box component="svg" viewBox="0 0 28 24" sx={{ width: 26, height: 20 }} aria-label={WAVE_NAMES[w]}>
                    <path d={WAVE_GLYPHS[w]} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </Box>
                ),
              }))}
            />
          </Box>
          <Box>
            <FieldLabel value={noteFor(frequency)}>Frequency</FieldLabel>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 96px', gap: 1.5, alignItems: 'center' }}>
              <Slider
                value={toSlider(frequency)}
                onChange={(_, v) => setFrequency(fromSlider(v as number))}
                min={0}
                max={1}
                step={0.001}
                disabled={waveType === 'noise'}
                aria-label="Frequency"
              />
              <TextField
                type="number"
                value={frequency}
                onChange={(e) => setFrequency(Number(e.target.value))}
                disabled={waveType === 'noise'}
                slotProps={{ htmlInput: { min: 20, max: 20000, step: 1, 'aria-label': 'Frequency in hertz' } }}
              />
            </Box>
          </Box>
          <SliderField label="Volume" value={volume} onChange={setVolume} min={0} max={1} step={0.01} format={(v) => `${Math.round(v * 100)}%`} />
          <SliderField label="Duration" value={duration} onChange={setDuration} min={0.1} max={30} step={0.1} format={(v) => `${v.toFixed(1)} s`} />
        </PanelSection>
        <PanelSection title="Frequency modulation">
          <SwitchRow label="Enable FM" hint="Wobble the pitch with a second oscillator" checked={modulation} onChange={setModulation} disabled={waveType === 'noise'} />
          <SliderField label="Rate" value={modFreq} onChange={setModFreq} min={0.1} max={100} step={0.1} format={(v) => `${v.toFixed(1)} Hz`} disabled={!modulation || waveType === 'noise'} />
          <SliderField label="Depth" value={modDepth} onChange={setModDepth} min={0} max={500} step={1} format={(v) => `±${v} Hz`} disabled={!modulation || waveType === 'noise'} />
        </PanelSection>
      </Panel>

      <Stage backdrop="void" center>
        <Box sx={{ width: '100%', maxWidth: 1100, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
            <Box>
              <Typography sx={{ fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: { xs: '3rem', md: '5rem' }, lineHeight: 0.9, letterSpacing: '-0.04em', color: '#fff' }}>
                {waveType === 'noise' ? 'noise' : frequency}
                {waveType !== 'noise' && (
                  <Box component="span" sx={{ fontSize: '0.4em', color: 'primary.main', ml: 1 }}>
                    Hz
                  </Box>
                )}
              </Typography>
              <Typography sx={{ fontFamily: MONO_FONT, color: 'rgba(255,255,255,0.5)', mt: 1 }}>
                {waveType === 'noise' ? 'white noise' : `${noteFor(frequency)} · ${WAVE_NAMES[waveType].toLowerCase()}`}
                {modulation && waveType !== 'noise' ? ` · FM ${modFreq}Hz ±${modDepth}` : ''}
              </Typography>
            </Box>
            <Typography sx={{ fontFamily: MONO_FONT, fontSize: '0.8rem', color: playing ? 'primary.main' : 'rgba(255,255,255,0.4)' }}>
              {playing ? '● playing' : `${duration.toFixed(1)}s · ${Math.round(volume * 100)}%`}
            </Typography>
          </Box>
          <Scope data={preview} playing={playing} />
          {audioUrl && <Box component="audio" src={audioUrl} controls sx={{ width: '100%', colorScheme: 'dark', height: 40 }} />}
        </Box>
      </Stage>
    </Workbench>
  );
}

function Scope({ data, playing }: { data: Float32Array; playing: boolean }) {
  const theme = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(800);
  const accent = theme.palette.primary.main;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(200, Math.round(entry.contentRect.width))));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const height = Math.round(width * 0.38);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Graticule
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 10; i++) {
      const x = Math.round((width / 10) * i) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let i = 1; i < 4; i++) {
      const y = Math.round((height / 4) * i) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath();
    ctx.moveTo(0, height / 2 + 0.5);
    ctx.lineTo(width, height / 2 + 0.5);
    ctx.stroke();

    if (!data.length) return;
    const mid = height / 2;
    const amp = height * 0.44;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.shadowColor = accent;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    if (data.length > width * 2) {
      // Dense signal: draw a min/max envelope per pixel column.
      const per = data.length / width;
      for (let x = 0; x < width; x++) {
        let lo = 1;
        let hi = -1;
        const start = Math.floor(x * per);
        const end = Math.min(data.length, Math.floor((x + 1) * per));
        for (let i = start; i < end; i++) {
          if (data[i] < lo) lo = data[i];
          if (data[i] > hi) hi = data[i];
        }
        ctx.moveTo(x + 0.5, mid - hi * amp);
        ctx.lineTo(x + 0.5, mid - lo * amp);
      }
    } else {
      for (let i = 0; i < data.length; i++) {
        const x = (i / (data.length - 1)) * width;
        const y = mid - data[i] * amp;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
  }, [data, width, accent]);

  return (
    <Box
      sx={{
        position: 'relative',
        borderRadius: 4,
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.035), transparent 70%), #0a0a0c',
        boxShadow: playing ? `0 0 0 1px ${theme.palette.primary.main}, 0 0 60px -10px ${theme.palette.primary.main}` : 'none',
        transition: 'box-shadow 300ms',
      }}
    >
      <Box component="canvas" ref={canvasRef} sx={{ display: 'block', width: '100%', aspectRatio: '1 / 0.38' }} />
    </Box>
  );
}
