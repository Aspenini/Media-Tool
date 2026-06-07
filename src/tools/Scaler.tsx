import { useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Stack from '@mui/material/Stack';
import AutoFixHighRoundedIcon from '@mui/icons-material/AutoFixHighRounded';
import { ToolShell } from '../components/ToolShell';
import { FileDropZone } from '../components/FileDropZone';
import { PreviewSurface } from '../components/PreviewSurface';
import { DownloadButton } from '../components/DownloadButton';
import { useNotification } from '../components/NotificationProvider';
import { loadImageFromFile, scaleImageToCanvas, stripExtension } from '../lib/image';

export function Scaler() {
  const notify = useNotification();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [factor, setFactor] = useState('2');
  const [file, setFile] = useState<File | null>(null);
  const [download, setDownload] = useState<{ url: string; name: string } | null>(null);

  const handleScale = async () => {
    const value = parseFloat(factor);
    if (!file || !Number.isFinite(value) || value <= 0) {
      notify('Please select an image and enter a positive scale factor.', 'error');
      return;
    }
    try {
      const img = await loadImageFromFile(file);
      const canvas = canvasRef.current;
      if (!canvas) return;
      scaleImageToCanvas(img, value, canvas);
      canvas.toBlob((blob) => {
        if (!blob) return;
        setDownload((prev) => {
          if (prev) URL.revokeObjectURL(prev.url);
          return { url: URL.createObjectURL(blob), name: `${stripExtension(file.name)}_upscaled.png` };
        });
      }, 'image/png');
      notify('Image scaled successfully!', 'success');
    } catch {
      notify('Could not load that image.', 'error');
    }
  };

  return (
    <ToolShell
      title="Scaler"
      description="Pixel-perfect image scaling. Uses nearest-neighbor interpolation to scale images by any factor without blurring — ideal for pixel art and sprites."
    >
      <FileDropZone
        accept="image/*"
        title={file ? file.name : 'Drop an image here'}
        hint="or click to browse — PNG, JPG, WEBP, BMP"
        onFiles={(files) => {
          setFile(files[0]);
          setDownload(null);
        }}
      />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
        <TextField
          type="number"
          label="Scale factor"
          value={factor}
          onChange={(e) => setFactor(e.target.value)}
          slotProps={{ htmlInput: { step: 'any', min: 0 } }}
          sx={{ maxWidth: 220 }}
        />
        <Button onClick={handleScale} startIcon={<AutoFixHighRoundedIcon />} disabled={!file}>
          Scale Image
        </Button>
      </Stack>
      <PreviewSurface label="Result" checkered>
        <Box
          component="canvas"
          ref={canvasRef}
          sx={{ maxWidth: '100%', imageRendering: 'pixelated', display: download ? 'block' : 'none' }}
        />
      </PreviewSurface>
      {download && <DownloadButton href={download.url} download={download.name} label="Download Scaled Image" />}
    </ToolShell>
  );
}
