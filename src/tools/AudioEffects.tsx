import { useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import RadioRoundedIcon from '@mui/icons-material/RadioRounded';
import MemoryRoundedIcon from '@mui/icons-material/MemoryRounded';
import GraphicEqRoundedIcon from '@mui/icons-material/GraphicEqRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import AutoFixHighRoundedIcon from '@mui/icons-material/AutoFixHighRounded';
import AudioFileRoundedIcon from '@mui/icons-material/AudioFileRounded';
import { FileButton, FileDropZone } from '../components/FileDropZone';
import { ExportFooter } from '../components/ExportFooter';
import { FileQueueList } from '../components/FileQueueList';
import { useNotification } from '../components/NotificationProvider';
import { Panel, PanelSection, Stage, ToolIntro, Workbench } from '../components/Workbench';
import { ChoiceCard } from '../components/controls';
import { useFileQueue } from '../hooks/useFileQueue';
import { getAudioContextClass } from '../lib/spatial';
import { applyAudioEffect, AUDIO_EFFECTS, exportBitDepthFor, type AudioEffectId } from '../lib/audioEffects';
import { audioBufferToWavBlob } from '../lib/wav';
import { createTarBlob } from '../lib/tar';
import { stripExtension } from '../lib/image';
import { formatBytes } from '../lib/format';

const EFFECT_META: Record<AudioEffectId, { icon: typeof RadioRoundedIcon; blurb: string }> = {
  vintageRadio: { icon: RadioRoundedIcon, blurb: 'Band-limited, saturated, mono — a 1940s wireless set.' },
  bitcrusher8: { icon: MemoryRoundedIcon, blurb: 'Crunchy 8-bit quantization, chiptune grit.' },
  bitcrusher16: { icon: GraphicEqRoundedIcon, blurb: 'Subtle 16-bit reduction, cleaner digital edge.' },
};

export function AudioEffects() {
  const notify = useNotification();
  const ctxRef = useRef<AudioContext | null>(null);
  const queue = useFileQueue();
  const files = queue.items;
  const [effect, setEffect] = useState<AudioEffectId>('vintageRadio');
  const [progress, setProgress] = useState<number | null>(null);
  const [doneCount, setDoneCount] = useState(0);
  const [tar, setTar] = useState<{ url: string; name: string } | null>(null);

  const addFiles = (next: File[]) => {
    queue.add(next);
    setTar(null);
    setDoneCount(0);
  };

  const process = async () => {
    if (!files.length) {
      notify('Please select one or more audio files.', 'error');
      return;
    }
    if (!ctxRef.current) ctxRef.current = new (getAudioContextClass())();
    const ctx = ctxRef.current;
    setTar(null);
    setProgress(0);
    setDoneCount(0);

    try {
      const entries: { name: string; data: Uint8Array }[] = [];
      for (let i = 0; i < files.length; i++) {
        const arrayBuffer = await files[i].file.arrayBuffer();
        const input = await ctx.decodeAudioData(arrayBuffer.slice(0));
        const processed = await applyAudioEffect(ctx, input, effect);
        const wavBlob = audioBufferToWavBlob(processed, exportBitDepthFor(effect));
        const buf = await wavBlob.arrayBuffer();
        entries.push({ name: `${stripExtension(files[i].file.name)}_${effect}.wav`, data: new Uint8Array(buf) });
        setDoneCount(i + 1);
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

  const busy = progress !== null;

  return (
    <Workbench panelWidth={360}>
      <Panel
        footer={
          <ExportFooter
            progress={busy ? progress : null}
            primary={{
              label: `Apply to ${files.length || 'no'} file${files.length === 1 ? '' : 's'}`,
              icon: <AutoFixHighRoundedIcon />,
              busy,
              busyLabel: `Processing ${doneCount + 1} of ${files.length}…`,
              onClick: process,
              disabled: !files.length,
            }}
            secondary={tar && { href: tar.url, download: tar.name, label: 'Download all (TAR)' }}
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
                <ChoiceCard
                  key={e.id}
                  selected={selected}
                  disabled={busy}
                  onClick={() => {
                    setEffect(e.id);
                    setTar(null);
                  }}
                  sx={{ gap: 1.5, alignItems: 'flex-start', p: 1.5 }}
                >
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

      <Stage backdrop="grid" onFiles={files.length ? addFiles : undefined} dropLabel="Drop to add to the queue" center={!files.length}>
        {!files.length ? (
          <FileDropZone
            variant="hero"
            multiple
            accept="audio/*"
            icon={AudioFileRoundedIcon}
            title="Drop audio files"
            hint="WAV, MP3, OGG, M4A — as many as you like. They're processed in one batch."
            onFiles={addFiles}
          />
        ) : (
          <Box sx={{ width: '100%', maxWidth: 760, mx: 'auto' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, gap: 2 }}>
              <Box>
                <Typography variant="h5">Queue</Typography>
                <Typography variant="body2" color="text.secondary">
                  {files.length} file{files.length === 1 ? '' : 's'} · {formatBytes(files.reduce((n, f) => n + f.file.size, 0))} · WAV output
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button variant="outlined" size="small" disabled={busy} onClick={() => { queue.clear(); setTar(null); }}>
                  Clear
                </Button>
                <FileButton variant="outlined" size="small" multiple accept="audio/*" onFiles={addFiles} startIcon={<AddRoundedIcon />} disabled={busy}>
                  Add
                </FileButton>
              </Box>
            </Box>
            <FileQueueList
              items={files}
              onRemove={queue.remove}
              disabled={busy}
              status={(_, i) => (i < doneCount ? 'done' : busy && i === doneCount ? 'running' : 'idle')}
            />
          </Box>
        )}
      </Stage>
    </Workbench>
  );
}
