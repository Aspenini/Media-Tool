import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import ContentCutRoundedIcon from '@mui/icons-material/ContentCutRounded';
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded';
import { useFileDrag } from '../components/FileDropZone';
import { DownloadButton } from '../components/DownloadButton';
import { useNotification } from '../components/NotificationProvider';
import { Artboard, Panel, PanelSection, Stage, ToolIntro, Workbench } from '../components/Workbench';
import { ChoiceCard, SwitchRow } from '../components/controls';
import { drawDiagonalSlice, extractNumber, loadImageFromFile, type DiagonalDirection } from '../lib/image';
import { MONO_FONT } from '../theme';

interface SliceOutput {
  url: string;
  name: string;
}

interface Slot {
  file: File;
  preview: string;
}

export function Slicer() {
  const notify = useNotification();
  const [slotA, setSlotA] = useState<Slot | null>(null);
  const [slotB, setSlotB] = useState<Slot | null>(null);
  const [direction, setDirection] = useState<DiagonalDirection>('tl2br');
  const [allDirections, setAllDirections] = useState(false);
  const [outputs, setOutputs] = useState<SliceOutput[]>([]);

  const setSlot = (which: 'a' | 'b') => (files: File[]) => {
    const file = files[0];
    if (!file.type.startsWith('image/')) {
      notify('Please choose an image file.', 'error');
      return;
    }
    const next = { file, preview: URL.createObjectURL(file) };
    (which === 'a' ? setSlotA : setSlotB)((prev) => {
      if (prev) URL.revokeObjectURL(prev.preview);
      return next;
    });
    setOutputs([]);
  };

  // Dropping two files at once fills both slots.
  const fillBoth = (files: File[]) => {
    setSlot('a')([files[0]]);
    if (files[1]) setSlot('b')([files[1]]);
  };

  const swap = () => {
    setSlotA(slotB);
    setSlotB(slotA);
    setOutputs([]);
  };

  const handleGenerate = async () => {
    if (!slotA || !slotB) {
      notify('Please add both images first.', 'error');
      return;
    }
    try {
      const [img1, img2] = await Promise.all([loadImageFromFile(slotA.file), loadImageFromFile(slotB.file)]);
      const num1 = extractNumber(slotA.file.name);
      const num2 = extractNumber(slotB.file.name);
      const w = img1.width;
      const h = img1.height;

      const make = (a: HTMLImageElement, b: HTMLImageElement, dir: DiagonalDirection, name: string): SliceOutput => ({
        url: drawDiagonalSlice(a, b, w, h, dir),
        name,
      });

      setOutputs(
        allDirections
          ? [
              make(img1, img2, 'tl2br', `tl2br_${num1}_${num2}.png`),
              make(img2, img1, 'tl2br', `tl2br_${num2}_${num1}.png`),
              make(img1, img2, 'tr2bl', `tr2bl_${num1}_${num2}.png`),
              make(img2, img1, 'tr2bl', `tr2bl_${num2}_${num1}.png`),
            ]
          : [make(img1, img2, direction, `${direction}_${num1}_${num2}.png`)],
      );
    } catch {
      notify('Could not process the images.', 'error');
    }
  };

  return (
    <Workbench panelWidth={320}>
      <Panel
        footer={
          <Button size="large" onClick={handleGenerate} disabled={!slotA || !slotB} startIcon={<ContentCutRoundedIcon />}>
            Slice {allDirections ? '4 variants' : 'image'}
          </Button>
        }
      >
        <ToolIntro />
        <PanelSection title="Cut direction">
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.25 }}>
            {(['tl2br', 'tr2bl'] as const).map((dir) => (
              <DirectionTile key={dir} dir={dir} selected={!allDirections && direction === dir} disabled={allDirections} onClick={() => setDirection(dir)} />
            ))}
          </Box>
          <SwitchRow label="All four variants" hint="Both diagonals, both orders" checked={allDirections} onChange={setAllDirections} />
        </PanelSection>
        <PanelSection title="Naming">
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
            Output files are named from the numbers in your filenames, e.g. <Box component="code" sx={{ color: 'text.primary' }}>tl2br_3_7.png</Box>. The first image sets the output size.
          </Typography>
        </PanelSection>
      </Panel>

      <Stage backdrop="dots" center={false}>
        <Box sx={{ width: '100%', maxWidth: 1000, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr auto 1fr' }, gap: 2, alignItems: 'center' }}>
            <ImageSlot label="A" slot={slotA} onFiles={(f) => (f.length > 1 ? fillBoth(f) : setSlot('a')(f))} />
            <Button variant="outlined" onClick={swap} disabled={!slotA && !slotB} aria-label="Swap images" sx={{ minWidth: 0, px: 1, justifySelf: 'center' }}>
              <SwapHorizRoundedIcon />
            </Button>
            <ImageSlot label="B" slot={slotB} onFiles={setSlot('b')} />
          </Box>

          {outputs.length > 0 && (
            <Box>
              <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                Results
              </Typography>
              <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: outputs.length > 1 ? 'repeat(auto-fill, minmax(200px, 1fr))' : 'minmax(0, 480px)', justifyContent: 'center' }}>
                {outputs.map((out) => (
                  <Box key={out.name} sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                    <Artboard>
                      <img src={out.url} alt={out.name} />
                    </Artboard>
                    <DownloadButton variant="outlined" size="small" href={out.url} download={out.name} label={out.name} sx={{ fontFamily: MONO_FONT, fontSize: '0.75rem' }} />
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </Box>
      </Stage>
    </Workbench>
  );
}

function ImageSlot({ label, slot, onFiles }: { label: string; slot: Slot | null; onFiles: (files: File[]) => void }) {
  const { active, handlers } = useFileDrag(onFiles);
  return (
    <Box
      component="label"
      {...handlers}
      sx={(theme) => ({
        position: 'relative',
        aspectRatio: '1 / 1',
        borderRadius: 4,
        overflow: 'hidden',
        cursor: 'pointer',
        display: 'grid',
        placeItems: 'center',
        border: slot ? '1px solid' : '1.5px dashed',
        borderColor: active ? 'primary.main' : 'divider',
        bgcolor: active ? alpha(theme.palette.primary.main, 0.1) : 'background.paper',
        transition: 'border-color 150ms',
        '&:hover': { borderColor: 'primary.main' },
        '&:hover .slot-hint': { opacity: 1 },
      })}
    >
      {slot ? (
        <>
          <Box component="img" src={slot.preview} alt={slot.file.name} sx={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          <Box
            className="slot-hint"
            sx={{ position: 'absolute', inset: 'auto 0 0 0', p: 1.25, background: 'linear-gradient(transparent, rgba(0,0,0,0.75))', color: '#fff', opacity: 0.85, transition: 'opacity 150ms' }}
          >
            <Typography noWrap sx={{ fontFamily: MONO_FONT, fontSize: '0.75rem' }}>
              {slot.file.name}
            </Typography>
          </Box>
        </>
      ) : (
        <Box sx={{ textAlign: 'center', px: 2 }}>
          <Typography sx={{ fontFamily: (t) => t.typography.h1.fontFamily, fontSize: '3.5rem', fontWeight: 700, lineHeight: 1, color: 'primary.main' }}>{label}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Drop or click to add
          </Typography>
        </Box>
      )}
      <Box
        sx={(theme) => ({
          position: 'absolute',
          top: 10,
          left: 10,
          width: 26,
          height: 26,
          borderRadius: 1.5,
          display: slot ? 'grid' : 'none',
          placeItems: 'center',
          fontWeight: 700,
          fontSize: '0.8rem',
          color: theme.palette.primary.contrastText,
          bgcolor: 'primary.main',
        })}
      >
        {label}
      </Box>
      <input
        type="file"
        accept="image/*"
        multiple={label === 'A'}
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) onFiles(files);
          e.target.value = '';
        }}
      />
    </Box>
  );
}

function DirectionTile({ dir, selected, disabled, onClick }: { dir: DiagonalDirection; selected: boolean; disabled: boolean; onClick: () => void }) {
  const tl = dir === 'tl2br';
  return (
    <ChoiceCard
      role="button"
      selected={selected}
      disabled={disabled}
      onClick={onClick}
      aria-label={tl ? 'Top-left to bottom-right' : 'Top-right to bottom-left'}
      sx={{ flexDirection: 'column', alignItems: 'center', gap: 1, p: 1.25 }}
    >
      <Box component="svg" viewBox="0 0 60 60" sx={{ width: '100%', maxWidth: 88, borderRadius: 1.5, display: 'block' }}>
        <polygon points={tl ? '0,0 60,0 60,60' : '0,0 60,0 0,60'} fill="currentColor" opacity="0.18" />
        <polygon points={tl ? '0,0 0,60 60,60' : '60,0 60,60 0,60'} fill="currentColor" opacity="0.45" />
        <line x1={tl ? 0 : 60} y1="0" x2={tl ? 60 : 0} y2="60" stroke="currentColor" strokeWidth="2.5" />
        <text x={tl ? 42 : 18} y="22" fontSize="13" fontWeight="700" textAnchor="middle" fill="currentColor">A</text>
        <text x={tl ? 18 : 42} y="48" fontSize="13" fontWeight="700" textAnchor="middle" fill="currentColor">B</text>
      </Box>
      <Typography sx={{ fontFamily: MONO_FONT, fontSize: '0.72rem', color: selected ? 'primary.main' : 'text.secondary' }}>{tl ? '↘ tl2br' : '↙ tr2bl'}</Typography>
    </ChoiceCard>
  );
}
