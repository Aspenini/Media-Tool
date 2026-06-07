import { useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import { ToolShell } from '../components/ToolShell';
import { FileDropZone } from '../components/FileDropZone';
import { DownloadButton } from '../components/DownloadButton';
import { useNotification } from '../components/NotificationProvider';
import { getAudioContextClass } from '../lib/spatial';
import { applyAudioEffect, AUDIO_EFFECTS, exportBitDepthFor, type AudioEffectId } from '../lib/audioEffects';
import { audioBufferToWavBlob } from '../lib/wav';
import { createTarBlob } from '../lib/tar';
import { stripExtension } from '../lib/image';

export function AudioEffects() {
  const notify = useNotification();
  const ctxRef = useRef<AudioContext | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [effect, setEffect] = useState<AudioEffectId>('vintageRadio');
  const [progress, setProgress] = useState<number | null>(null);
  const [tar, setTar] = useState<{ url: string; name: string } | null>(null);

  const process = async () => {
    if (!files.length) {
      notify('Please select one or more audio files.', 'error');
      return;
    }
    if (!ctxRef.current) ctxRef.current = new (getAudioContextClass())();
    const ctx = ctxRef.current;
    setTar(null);
    setProgress(0);

    try {
      const entries: { name: string; data: Uint8Array }[] = [];
      for (let i = 0; i < files.length; i++) {
        const arrayBuffer = await files[i].arrayBuffer();
        const input = await ctx.decodeAudioData(arrayBuffer.slice(0));
        const processed = await applyAudioEffect(ctx, input, effect);
        const wavBlob = audioBufferToWavBlob(processed, exportBitDepthFor(effect));
        const buf = await wavBlob.arrayBuffer();
        entries.push({ name: `${stripExtension(files[i].name)}_${effect}.wav`, data: new Uint8Array(buf) });
        setProgress(Math.round(((i + 1) / files.length) * 100));
        await new Promise((r) => setTimeout(r, 10));
      }
      const tarBlob = createTarBlob(entries);
      setTar({ url: URL.createObjectURL(tarBlob), name: `audio_${effect}_${files.length}files.tar` });
      notify(`${files.length} file(s) processed. Archive ready to download.`, 'success');
    } catch (error) {
      notify('Error processing files: ' + (error instanceof Error ? error.message : String(error)), 'error');
    } finally {
      setProgress(null);
    }
  };

  return (
    <ToolShell title="Audio Effects" description="Apply vintage radio and bitcrusher effects to one or more audio files. Output is bundled as a TAR archive of WAV files.">
      <FileDropZone accept="audio/*" multiple title="Drop audio files here" hint="or click to browse — WAV, MP3, OGG, M4A" onFiles={setFiles} />
      {files.length > 0 && (
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          {files.map((f) => (
            <Chip key={f.name} label={f.name} size="small" />
          ))}
        </Stack>
      )}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
        <TextField select label="Effect" value={effect} onChange={(e) => setEffect(e.target.value as AudioEffectId)} sx={{ minWidth: 280 }}>
          {AUDIO_EFFECTS.map((e) => (
            <MenuItem key={e.id} value={e.id}>
              {e.label}
            </MenuItem>
          ))}
        </TextField>
        <Button onClick={process} disabled={!files.length || progress !== null}>
          Generate Effect
        </Button>
      </Stack>
      {progress !== null && (
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
            Processing… {progress}%
          </Typography>
          <LinearProgress variant="determinate" value={progress} sx={{ borderRadius: 1 }} />
        </Box>
      )}
      {tar && <DownloadButton href={tar.url} download={tar.name} label="Download All (TAR)" />}
    </ToolShell>
  );
}
