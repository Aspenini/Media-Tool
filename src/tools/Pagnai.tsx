import { useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Slider from '@mui/material/Slider';
import Typography from '@mui/material/Typography';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import Collapse from '@mui/material/Collapse';
import GraphicEqRoundedIcon from '@mui/icons-material/GraphicEqRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import { ToolShell } from '../components/ToolShell';
import { DownloadButton } from '../components/DownloadButton';
import { useNotification } from '../components/NotificationProvider';
import { getAudioContextClass } from '../lib/spatial';
import { audioBufferToWavBlob } from '../lib/wav';
import { generatePagnaiBuffer, WAVE_TYPES, type WaveType } from '../lib/pagnai';

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

  const ensureCtx = (): AudioContext => {
    if (!ctxRef.current) ctxRef.current = new (getAudioContextClass())();
    if (ctxRef.current.state === 'suspended') void ctxRef.current.resume();
    return ctxRef.current;
  };

  const generate = () => {
    try {
      const ctx = ensureCtx();
      const buffer = generatePagnaiBuffer(ctx, { waveType, frequency, duration, volume, modulation, modFreq, modDepth });
      bufferRef.current = buffer;
      const blob = audioBufferToWavBlob(buffer);
      setAudioUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
      notify('Audio generated successfully!', 'success');
    } catch (error) {
      notify('Error generating audio: ' + (error instanceof Error ? error.message : String(error)), 'error');
    }
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

  const play = () => {
    const buffer = bufferRef.current;
    if (!buffer) {
      notify('Please generate audio first!', 'error');
      return;
    }
    const ctx = ensureCtx();
    stop();
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.onended = () => setPlaying(false);
    source.start(0);
    sourceRef.current = source;
    setPlaying(true);
  };

  return (
    <ToolShell title="PAGNAI" description="Procedural Audio Generation, Not Artificial Intelligence. Generate procedural audio using mathematical algorithms and signal synthesis.">
      <TextField select label="Wave type" value={waveType} onChange={(e) => setWaveType(e.target.value as WaveType)} sx={{ maxWidth: 280 }}>
        {WAVE_TYPES.map((w) => (
          <MenuItem key={w.id} value={w.id}>
            {w.label}
          </MenuItem>
        ))}
      </TextField>
      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' }, alignItems: 'center' }}>
        <TextField type="number" label="Frequency (Hz)" value={frequency} onChange={(e) => setFrequency(Number(e.target.value))} slotProps={{ htmlInput: { min: 20, max: 20000, step: 1 } }} />
        <TextField type="number" label="Duration (s)" value={duration} onChange={(e) => setDuration(Number(e.target.value))} slotProps={{ htmlInput: { min: 0.1, max: 30, step: 0.1 } }} />
        <Box>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Volume — {Math.round(volume * 100)}%
          </Typography>
          <Slider value={volume} onChange={(_, v) => setVolume(v as number)} min={0} max={1} step={0.01} />
        </Box>
      </Box>
      <FormControlLabel control={<Checkbox checked={modulation} onChange={(e) => setModulation(e.target.checked)} />} label="Enable Frequency Modulation" />
      <Collapse in={modulation}>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, maxWidth: 520 }}>
          <TextField type="number" label="Mod. frequency" value={modFreq} onChange={(e) => setModFreq(Number(e.target.value))} slotProps={{ htmlInput: { min: 0.1, max: 100, step: 0.1 } }} />
          <TextField type="number" label="Mod. depth" value={modDepth} onChange={(e) => setModDepth(Number(e.target.value))} slotProps={{ htmlInput: { min: 0, max: 500, step: 1 } }} />
        </Box>
      </Collapse>
      <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
        <Button onClick={generate} startIcon={<GraphicEqRoundedIcon />}>
          Generate Audio
        </Button>
        <Button variant="outlined" onClick={play} disabled={!audioUrl} startIcon={<PlayArrowRoundedIcon />}>
          Play
        </Button>
        <Button variant="outlined" color="inherit" onClick={stop} disabled={!playing} startIcon={<StopRoundedIcon />}>
          Stop
        </Button>
      </Stack>
      {audioUrl && (
        <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
          <Box component="audio" src={audioUrl} controls sx={{ width: '100%', maxWidth: 480 }} />
          <DownloadButton href={audioUrl} download="pagnai_audio.wav" label="Download Generated Audio" />
        </Stack>
      )}
    </ToolShell>
  );
}
