import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import PaletteRoundedIcon from '@mui/icons-material/PaletteRounded';
import { FileDropZone } from '../components/FileDropZone';
import { DownloadButton } from '../components/DownloadButton';
import { useNotification } from '../components/NotificationProvider';
import { Panel, PanelSection, Stage, StageDock, ToolIntro, Workbench } from '../components/Workbench';
import { ChoiceCard, FieldLabel, Segmented } from '../components/controls';
import { loadImageFromFile, stripExtension } from '../lib/image';
import { PALETTES, renderPalette, type ColorMatching, type DitheringMode } from '../lib/palette';
import { MONO_FONT } from '../theme';

const DITHER_OPTIONS: { value: DitheringMode; label: string; title: string }[] = [
  { value: 'none', label: 'None', title: 'No dithering' },
  { value: 'floyd-steinberg', label: 'Floyd', title: 'Floyd–Steinberg error diffusion' },
  { value: 'ordered', label: 'Bayer', title: 'Ordered (Bayer matrix)' },
  { value: 'atkinson', label: 'Atkinson', title: 'Atkinson (classic Mac)' },
];

const MATCHING_OPTIONS: { value: ColorMatching; label: string; title: string }[] = [
  { value: 'euclidean', label: 'Euclidean', title: 'Straight RGB distance' },
  { value: 'perceptual', label: 'Perceptual', title: 'Luma-weighted distance' },
  { value: 'manhattan', label: 'Manhattan', title: 'Sum of channel differences' },
];

function splitLabel(label: string): [string, string] {
  const [name, ...rest] = label.split(' - ');
  return [name, rest.join(' - ')];
}

export function Palette() {
  const notify = useNotification();
  const imgRef = useRef<HTMLImageElement | null>(null);
  const originalRef = useRef<HTMLCanvasElement>(null);
  const paletteRef = useRef<HTMLCanvasElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [paletteId, setPaletteId] = useState('gameboy');
  const [dithering, setDithering] = useState<DitheringMode>('floyd-steinberg');
  const [matching, setMatching] = useState<ColorMatching>('perceptual');
  const [download, setDownload] = useState<{ url: string; name: string } | null>(null);
  const [split, setSplit] = useState(50);

  const loaded = version > 0;

  useEffect(() => {
    if (!loaded || !imgRef.current) return;
    const img = imgRef.current;
    const result = renderPalette(img, paletteId, dithering, matching);

    const original = originalRef.current;
    if (original) {
      original.width = result.width;
      original.height = result.height;
      original.getContext('2d')?.drawImage(img, 0, 0, result.width, result.height);
    }
    const out = paletteRef.current;
    if (out) {
      out.width = result.width;
      out.height = result.height;
      out.getContext('2d')?.putImageData(result.imageData, 0, 0);
      out.toBlob((blob) => {
        if (!blob) return;
        setDownload((prev) => {
          if (prev) URL.revokeObjectURL(prev.url);
          return { url: URL.createObjectURL(blob), name: `${stripExtension(fileName ?? 'palette_image')}_${paletteId}.png` };
        });
      }, 'image/png');
    }
  }, [loaded, version, paletteId, dithering, matching, fileName]);

  const handleFiles = async (files: File[]) => {
    const file = files[0];
    if (!file.type.startsWith('image/')) {
      notify('Please select a valid image file.', 'error');
      return;
    }
    try {
      imgRef.current = await loadImageFromFile(file);
      setFileName(file.name);
      setVersion((v) => v + 1);
    } catch {
      notify('Could not load that image.', 'error');
    }
  };

  const current = PALETTES.find((p) => p.id === paletteId) ?? PALETTES[0];

  return (
    <Workbench panelWidth={350}>
      <Panel
        footer={
          <DownloadButton size="large" fullWidth href={download?.url ?? ''} download={download?.name ?? ''} disabled={!download} label="Download converted PNG" />
        }
      >
        <ToolIntro />
        <PanelSection title="Source">
          <FileDropZone accept="image/*" title={fileName ?? 'Choose an image'} hint="Any image the browser can open" onFiles={handleFiles} />
        </PanelSection>
        <PanelSection title={`Palette · ${PALETTES.length}`}>
          <Box role="radiogroup" aria-label="Color palette" sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            {PALETTES.map((p) => {
              const [name, blurb] = splitLabel(p.label);
              const selected = p.id === paletteId;
              return (
                <ChoiceCard
                  key={p.id}
                  selected={selected}
                  onClick={() => setPaletteId(p.id)}
                  sx={{ flexDirection: 'column', alignItems: 'stretch', gap: 0.75, p: 1.25, borderColor: selected ? 'primary.main' : 'transparent' }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'baseline' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                      {name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {blurb}
                    </Typography>
                  </Box>
                  <Swatches colors={p.colors} />
                </ChoiceCard>
              );
            })}
          </Box>
        </PanelSection>
        <PanelSection title="Rendering">
          <Box>
            <FieldLabel>Dithering</FieldLabel>
            <Segmented aria-label="Dithering" value={dithering} onChange={setDithering} options={DITHER_OPTIONS} />
          </Box>
          <Box>
            <FieldLabel>Color matching</FieldLabel>
            <Segmented aria-label="Color matching" value={matching} onChange={setMatching} options={MATCHING_OPTIONS} />
          </Box>
        </PanelSection>
      </Panel>

      <Stage
        backdrop="dots"
        onFiles={loaded ? handleFiles : undefined}
        overlay={
          loaded && (
            <StageDock>
              <Box sx={{ px: 1, display: 'flex', alignItems: 'center', gap: 1.25 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {splitLabel(current.label)[0]}
                </Typography>
                <Box sx={{ width: 120 }}>
                  <Swatches colors={current.colors} />
                </Box>
              </Box>
            </StageDock>
          )
        }
      >
        {!loaded && (
          <FileDropZone
            variant="hero"
            accept="image/*"
            icon={PaletteRoundedIcon}
            title="Drop an image to recolor"
            hint="Then drag across it to compare the original with the palette version."
            onFiles={handleFiles}
          />
        )}
        <Box sx={{ display: loaded ? 'block' : 'none', pb: 8, maxWidth: '100%' }}>
          <CompareSlider split={split} onSplit={setSplit}>
            <canvas ref={paletteRef} />
            <canvas ref={originalRef} />
          </CompareSlider>
        </Box>
      </Stage>
    </Workbench>
  );
}

function Swatches({ colors }: { colors: string[] }) {
  const shown = colors.slice(0, 32);
  return (
    <Box sx={{ display: 'flex', height: 10, borderRadius: 1, overflow: 'hidden', boxShadow: 'inset 0 0 0 1px rgba(127,127,127,0.25)' }}>
      {shown.map((color, i) => (
        <Box key={`${color}-${i}`} title={color} sx={{ flex: 1, bgcolor: color }} />
      ))}
    </Box>
  );
}

/** Two stacked canvases: the second child is revealed left of the divider. */
function CompareSlider({ split, onSplit, children }: { split: number; onSplit: (value: number) => void; children: [React.ReactNode, React.ReactNode] }) {
  const boxRef = useRef<HTMLDivElement>(null);

  const moveTo = (clientX: number) => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    onSplit(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)));
  };

  return (
    <Box
      ref={boxRef}
      role="slider"
      tabIndex={0}
      aria-label="Compare original and converted"
      aria-valuenow={Math.round(split)}
      aria-valuemin={0}
      aria-valuemax={100}
      onPointerDown={(e) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        moveTo(e.clientX);
      }}
      onPointerMove={(e) => {
        if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) moveTo(e.clientX);
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') onSplit(Math.max(0, split - 5));
        if (e.key === 'ArrowRight') onSplit(Math.min(100, split + 5));
      }}
      sx={(theme) => ({
        position: 'relative',
        lineHeight: 0,
        cursor: 'ew-resize',
        touchAction: 'none',
        userSelect: 'none',
        maxWidth: '100%',
        boxShadow: theme.palette.mode === 'dark' ? '0 24px 60px -20px rgba(0,0,0,0.8)' : '0 24px 50px -24px rgba(0,0,0,0.35)',
        outline: 'none',
        '& canvas': { display: 'block', maxWidth: '100%', maxHeight: '72vh', width: 'auto', height: 'auto', imageRendering: 'pixelated' },
        '& canvas:nth-of-type(2)': { position: 'absolute', inset: 0, width: '100%', height: '100%', maxHeight: 'none', clipPath: `inset(0 ${100 - split}% 0 0)` },
        '&:focus-visible .handle-knob': { boxShadow: `0 0 0 4px ${alpha(theme.palette.primary.main, 0.4)}` },
      })}
    >
      {children}
      <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: `${split}%`, width: 2, ml: '-1px', bgcolor: '#fff', boxShadow: '0 0 8px rgba(0,0,0,0.5)', pointerEvents: 'none' }}>
        <Box
          className="handle-knob"
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 30,
            height: 30,
            borderRadius: '50%',
            bgcolor: '#fff',
            color: '#111',
            display: 'grid',
            placeItems: 'center',
            fontSize: 13,
            fontWeight: 700,
            lineHeight: 1,
            boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
          }}
        >
          ⇆
        </Box>
      </Box>
      <Tag side="left">Original</Tag>
      <Tag side="right">Palette</Tag>
    </Box>
  );
}

function Tag({ side, children }: { side: 'left' | 'right'; children: React.ReactNode }) {
  return (
    <Box
      sx={{
        position: 'absolute',
        top: 10,
        [side]: 10,
        px: 1,
        py: 0.5,
        borderRadius: 1.5,
        bgcolor: 'rgba(0,0,0,0.6)',
        color: '#fff',
        fontFamily: MONO_FONT,
        fontSize: '0.68rem',
        lineHeight: 1.2,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        pointerEvents: 'none',
      }}
    >
      {children}
    </Box>
  );
}
