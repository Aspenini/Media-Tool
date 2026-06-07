import { useRef, useState } from 'react';
import QRCode from 'qrcode';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Stack from '@mui/material/Stack';
import QrCode2RoundedIcon from '@mui/icons-material/QrCode2Rounded';
import { ToolShell } from '../components/ToolShell';
import { PreviewSurface } from '../components/PreviewSurface';
import { DownloadButton } from '../components/DownloadButton';
import { useNotification } from '../components/NotificationProvider';

type Ecl = 'L' | 'M' | 'Q' | 'H';

const ECL_OPTIONS: { value: Ecl; label: string }[] = [
  { value: 'L', label: 'L - Low (~7%)' },
  { value: 'M', label: 'M - Medium (~15%)' },
  { value: 'Q', label: 'Q - Quartile (~25%)' },
  { value: 'H', label: 'H - High (~30%)' },
];

export function QrCodeTool() {
  const notify = useNotification();
  const previewRef = useRef<HTMLDivElement>(null);
  const [content, setContent] = useState('');
  const [ecl, setEcl] = useState<Ecl>('M');
  const [size, setSize] = useState(256);
  const [margin, setMargin] = useState(2);
  const [format, setFormat] = useState<'png' | 'svg'>('png');
  const [dark, setDark] = useState('#000000');
  const [light, setLight] = useState('#ffffff');
  const [download, setDownload] = useState<{ url: string; name: string } | null>(null);

  const generate = async () => {
    const text = content.trim();
    if (!text) {
      notify('Please enter content to encode.', 'error');
      return;
    }
    const container = previewRef.current;
    if (!container) return;
    const options = {
      errorCorrectionLevel: ecl,
      width: Math.min(Math.max(size || 256, 64), 1024),
      margin,
      color: { dark, light },
    } as const;

    try {
      container.innerHTML = '';
      if (format === 'svg') {
        const svg = await QRCode.toString(text, { ...options, type: 'svg' });
        container.innerHTML = svg;
        const svgEl = container.querySelector('svg');
        if (svgEl) {
          svgEl.style.maxWidth = '100%';
          svgEl.style.height = 'auto';
        }
        const blob = new Blob([svg], { type: 'image/svg+xml' });
        setDownload((prev) => {
          if (prev) URL.revokeObjectURL(prev.url);
          return { url: URL.createObjectURL(blob), name: 'qrcode.svg' };
        });
      } else {
        const canvas = document.createElement('canvas');
        await QRCode.toCanvas(canvas, text, options);
        canvas.style.maxWidth = '100%';
        canvas.style.height = 'auto';
        container.appendChild(canvas);
        setDownload((prev) => {
          if (prev?.url.startsWith('blob:')) URL.revokeObjectURL(prev.url);
          return { url: canvas.toDataURL('image/png'), name: 'qrcode.png' };
        });
      }
      notify('QR Code generated successfully!', 'success');
    } catch (error) {
      notify('Error generating QR Code: ' + (error instanceof Error ? error.message : String(error)), 'error');
    }
  };

  return (
    <ToolShell title="QR Code Generator" description="Generate customizable QR codes. Enter text or a URL to encode, then tune size, error correction, margin, and colors.">
      <TextField
        label="Content to encode"
        placeholder="Enter text or URL..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        multiline
        minRows={3}
        fullWidth
      />
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, 1fr)' } }}>
        <TextField select label="Error correction" value={ecl} onChange={(e) => setEcl(e.target.value as Ecl)}>
          {ECL_OPTIONS.map((o) => (
            <MenuItem key={o.value} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField type="number" label="Size (px)" value={size} onChange={(e) => setSize(Number(e.target.value))} slotProps={{ htmlInput: { min: 64, max: 1024, step: 32 } }} />
        <TextField type="number" label="Margin" value={margin} onChange={(e) => setMargin(Number(e.target.value))} slotProps={{ htmlInput: { min: 0, max: 10 } }} />
        <TextField select label="Output format" value={format} onChange={(e) => setFormat(e.target.value as 'png' | 'svg')}>
          <MenuItem value="png">PNG</MenuItem>
          <MenuItem value="svg">SVG</MenuItem>
        </TextField>
        <TextField type="color" label="Foreground" value={dark} onChange={(e) => setDark(e.target.value)} />
        <TextField type="color" label="Background" value={light} onChange={(e) => setLight(e.target.value)} />
      </Box>
      <Stack direction="row" spacing={2}>
        <Button onClick={generate} startIcon={<QrCode2RoundedIcon />}>
          Generate QR Code
        </Button>
      </Stack>
      <PreviewSurface label="Preview">
        <Box ref={previewRef} sx={{ display: 'flex', justifyContent: 'center', minHeight: 64, '& canvas, & svg': { borderRadius: 1 } }} />
      </PreviewSurface>
      {download && <DownloadButton href={download.url} download={download.name} label="Download QR Code" />}
    </ToolShell>
  );
}
