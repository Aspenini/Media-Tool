import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import AspectRatioRoundedIcon from '@mui/icons-material/AspectRatioRounded';
import { useIncomingFiles } from '../components/FileBridge';
import { SendToButton } from '../components/SendToButton';
import { FileDropZone } from '../components/FileDropZone';
import { useNotification } from '../components/NotificationProvider';
import { usePersistentState } from '../hooks/usePersistentState';
import { Artboard, Panel, PanelSection, Stage, StageDock, StageTag, ToolIntro, Workbench } from '../components/Workbench';
import { ExportFooter } from '../components/ExportFooter';
import { Segmented, Stat } from '../components/controls';
import { canvasSizeProblem, loadImageFromFile, scaleImageToCanvas, stripExtension } from '../lib/image';
import { fileFromUrl } from '../lib/download';
import { MONO_FONT } from '../theme';

const PRESETS = [2, 3, 4, 8, 16] as const;

export function Scaler() {
  const notify = useNotification();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [factor, setFactor] = usePersistentState('factor', '4');
  const [file, setFile] = useState<File | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [download, setDownload] = useState<{ url: string; name: string } | null>(null);

  const value = parseFloat(factor);
  const valid = Number.isFinite(value) && value > 0;
  const outW = img && valid ? Math.max(1, Math.round(img.width * value)) : 0;
  const outH = img && valid ? Math.max(1, Math.round(img.height * value)) : 0;
  // Check before allocating: an oversized canvas freezes or crashes the tab.
  const tooBig = img && valid ? canvasSizeProblem(outW, outH) : null;

  const handleFiles = async (files: File[]) => {
    try {
      const next = await loadImageFromFile(files[0]);
      setFile(files[0]);
      setImg(next);
    } catch {
      notify('Could not load that image.', 'error');
    }
  };

  useIncomingFiles(handleFiles);

  // Re-render the scaled output whenever the source or factor changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!img || !file || !canvas || !valid || tooBig) return;
    try {
      scaleImageToCanvas(img, value, canvas);
    } catch {
      notify('That scale is too large for the browser to draw.', 'error');
      return;
    }
    let cancelled = false;
    canvas.toBlob((blob) => {
      if (!blob || cancelled) return;
      setDownload((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { url: URL.createObjectURL(blob), name: `${stripExtension(file.name)}_${value}x.png` };
      });
    }, 'image/png');
    return () => {
      cancelled = true;
    };
  }, [img, file, value, valid, tooBig, notify]);

  const preset = PRESETS.find((p) => p === value);

  return (
    <Workbench>
      <Panel
        footer={
          <ExportFooter
            primary={{ href: download?.url ?? '', download: download?.name, disabled: !download || !!tooBig, label: img ? `Download ${outW}×${outH} PNG` : 'Download' }}
          />
        }
      >
        <ToolIntro />
        <PanelSection title="Source">
          <FileDropZone
            accept="image/*"
            title={file ? file.name : 'Choose an image'}
            hint={img ? `${img.width} × ${img.height}px` : 'PNG, JPG, WEBP, BMP'}
            onFiles={handleFiles}
          />
        </PanelSection>
        <PanelSection title="Scale factor">
          <Segmented
            aria-label="Scale preset"
            value={preset ?? -1}
            onChange={(v) => setFactor(String(v))}
            options={PRESETS.map((p) => ({ value: p, label: `${p}×` }))}
          />
          <TextField
            type="number"
            label="Custom factor"
            value={factor}
            onChange={(e) => setFactor(e.target.value)}
            error={!valid || !!tooBig}
            helperText={!valid ? 'Enter a number above zero.' : tooBig ? 'Too large — try a smaller factor.' : 'Fractions work too — 0.5 halves the image.'}
            slotProps={{ htmlInput: { step: 'any', min: 0 } }}
          />
        </PanelSection>
        {img && (
          <PanelSection title="Output">
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              <Stat label="Before" value={`${img.width}×${img.height}`} />
              <Stat label="After" value={valid ? `${outW}×${outH}` : '—'} accent />
            </Box>
            <SendToButton kind="image" disabled={!download} getFile={() => (download ? fileFromUrl(download.url, download.name) : null)} />
          </PanelSection>
        )}
      </Panel>

      <Stage
        backdrop="grid"
        onFiles={img ? handleFiles : undefined}
        overlay={
          img && (
            <>
              <StageTag>nearest neighbor · {factor}×</StageTag>
              <StageDock>
                <ToggleButtonGroup exclusive size="small" value={preset ?? null} onChange={(_, v: number | null) => v && setFactor(String(v))} aria-label="Scale factor">
                  {PRESETS.map((p) => (
                    <ToggleButton key={p} value={p} sx={{ fontFamily: MONO_FONT, px: 1.75 }}>
                      {p}×
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              </StageDock>
            </>
          )
        }
      >
        {!img && (
          <FileDropZone
            variant="hero"
            accept="image/*"
            icon={AspectRatioRoundedIcon}
            title="Drop a sprite or pixel art"
            hint="It'll be scaled up with hard, unblurred pixel edges."
            onFiles={handleFiles}
          />
        )}
        {tooBig && (
          <Box sx={{ maxWidth: 420, textAlign: 'center', p: 3, borderRadius: 4, bgcolor: 'background.paper', border: '1px solid', borderColor: 'error.main' }}>
            <Typography variant="h6" sx={{ mb: 0.5 }}>
              That's too big to render
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {tooBig}
            </Typography>
          </Box>
        )}
        <Box sx={{ display: img && !tooBig ? 'block' : 'none', pb: 8, maxWidth: '100%' }}>
          <Artboard pixelated>
            <canvas ref={canvasRef} />
          </Artboard>
          {img && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 1.5, fontFamily: MONO_FONT }}>
              {outW} × {outH}px
            </Typography>
          )}
        </Box>
      </Stage>
    </Workbench>
  );
}
