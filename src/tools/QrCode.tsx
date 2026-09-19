import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import QrCode2RoundedIcon from '@mui/icons-material/QrCode2Rounded';
import SwapVertRoundedIcon from '@mui/icons-material/SwapVertRounded';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { DownloadButton } from '../components/DownloadButton';
import { useNotification } from '../components/NotificationProvider';
import { Panel, PanelSection, Stage, ToolIntro, Workbench } from '../components/Workbench';
import { FieldLabel, Segmented, SliderField } from '../components/controls';
import { MONO_FONT } from '../theme';

type Ecl = 'L' | 'M' | 'Q' | 'H';

const ECL_OPTIONS: { value: Ecl; label: string; title: string }[] = [
  { value: 'L', label: 'L · 7%', title: 'Low — recovers ~7% damage' },
  { value: 'M', label: 'M · 15%', title: 'Medium — recovers ~15% damage' },
  { value: 'Q', label: 'Q · 25%', title: 'Quartile — recovers ~25% damage' },
  { value: 'H', label: 'H · 30%', title: 'High — recovers ~30% damage' },
];

export function QrCodeTool() {
  const notify = useNotification();
  const previewRef = useRef<HTMLDivElement>(null);
  const [content, setContent] = useState('https://media-tool.aspenini.com');
  const [ecl, setEcl] = useState<Ecl>('M');
  const [size, setSize] = useState(512);
  const [margin, setMargin] = useState(2);
  const [format, setFormat] = useState<'png' | 'svg'>('png');
  const [dark, setDark] = useState('#111111');
  const [light, setLight] = useState('#ffffff');
  const [download, setDownload] = useState<{ url: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Regenerate as you type, lightly debounced.
  useEffect(() => {
    const text = content.trim();
    const container = previewRef.current;
    if (!container) return;
    if (!text) {
      container.innerHTML = '';
      setDownload(null);
      setError(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const options = {
        errorCorrectionLevel: ecl,
        width: Math.min(Math.max(size || 256, 64), 1024),
        margin,
        color: { dark, light },
      } as const;
      try {
        if (format === 'svg') {
          const svg = await QRCode.toString(text, { ...options, type: 'svg' });
          if (cancelled) return;
          container.innerHTML = svg;
          const blob = new Blob([svg], { type: 'image/svg+xml' });
          setDownload((prev) => {
            if (prev?.url.startsWith('blob:')) URL.revokeObjectURL(prev.url);
            return { url: URL.createObjectURL(blob), name: 'qrcode.svg' };
          });
        } else {
          const canvas = document.createElement('canvas');
          await QRCode.toCanvas(canvas, text, options);
          if (cancelled) return;
          container.replaceChildren(canvas);
          setDownload((prev) => {
            if (prev?.url.startsWith('blob:')) URL.revokeObjectURL(prev.url);
            return { url: canvas.toDataURL('image/png'), name: 'qrcode.png' };
          });
        }
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [content, ecl, size, margin, format, dark, light]);

  const copyImage = async () => {
    const canvas = previewRef.current?.querySelector('canvas');
    if (!canvas) return;
    try {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
      if (!blob) throw new Error('empty');
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      notify('QR code copied to the clipboard.', 'success');
    } catch {
      notify('Copying images is not supported here — use Download instead.', 'error');
    }
  };

  const hasCode = !!content.trim() && !error;

  return (
    <Workbench panelWidth={360}>
      <Panel
        footer={
          <DownloadButton
            size="large"
            fullWidth
            href={download?.url ?? ''}
            download={download?.name ?? ''}
            disabled={!download || !hasCode}
            label={`Download ${format.toUpperCase()}`}
          />
        }
      >
        <ToolIntro />
        <PanelSection title="Content">
          <TextField
            multiline
            minRows={4}
            maxRows={10}
            placeholder="Text, a URL, a Wi-Fi string…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            helperText={`${content.length} characters`}
            slotProps={{ htmlInput: { 'aria-label': 'Content to encode', spellCheck: false } }}
          />
        </PanelSection>
        <PanelSection title="Encoding">
          <Box>
            <FieldLabel>Error correction</FieldLabel>
            <Segmented aria-label="Error correction" value={ecl} onChange={setEcl} options={ECL_OPTIONS} />
          </Box>
          <SliderField label="Export size" value={size} onChange={setSize} min={64} max={1024} step={32} format={(v) => `${v}px`} />
          <SliderField label="Quiet zone" value={margin} onChange={setMargin} min={0} max={10} step={1} format={(v) => `${v} modules`} />
        </PanelSection>
        <PanelSection
          title="Colors"
          action={
            <Tooltip title="Swap colors">
              <IconButton
                size="small"
                aria-label="Swap colors"
                onClick={() => {
                  setDark(light);
                  setLight(dark);
                }}
              >
                <SwapVertRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          }
        >
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
            <ColorField label="Modules" value={dark} onChange={setDark} />
            <ColorField label="Background" value={light} onChange={setLight} />
          </Box>
        </PanelSection>
        <PanelSection title="Format">
          <Segmented
            aria-label="Output format"
            value={format}
            onChange={setFormat}
            options={[
              { value: 'png', label: 'PNG' },
              { value: 'svg', label: 'SVG' },
            ]}
          />
        </PanelSection>
      </Panel>

      <Stage backdrop="dots">
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2.5 }}>
          <Box
            sx={{
              p: 2,
              borderRadius: 5,
              bgcolor: light,
              boxShadow: (t) => (t.palette.mode === 'dark' ? '0 30px 80px -30px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.06)' : '0 30px 60px -30px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.06)'),
              display: hasCode ? 'block' : 'none',
              transition: 'background-color 200ms',
            }}
          >
            <Box
              ref={previewRef}
              onDoubleClick={format === 'png' ? copyImage : undefined}
              sx={{
                width: 'min(64vw, 380px)',
                aspectRatio: '1 / 1',
                lineHeight: 0,
                '& canvas, & svg': { width: '100% !important', height: '100% !important', imageRendering: 'pixelated', display: 'block' },
              }}
            />
          </Box>
          {hasCode ? (
            <Typography sx={{ fontFamily: MONO_FONT, fontSize: '0.75rem', color: 'text.secondary', textAlign: 'center' }}>
              {size}×{size} · ECC {ecl} · {format.toUpperCase()}
              {format === 'png' && ' · double-click to copy'}
            </Typography>
          ) : (
            <Box sx={{ textAlign: 'center', color: 'text.secondary', maxWidth: 320 }}>
              <QrCode2RoundedIcon sx={{ fontSize: 64, opacity: 0.4 }} />
              <Typography variant="h6" color="text.primary" sx={{ mt: 1 }}>
                {error ? 'Too much to encode' : 'Start typing'}
              </Typography>
              <Typography variant="body2">{error ?? 'Your QR code appears here and updates as you type.'}</Typography>
            </Box>
          )}
        </Box>
      </Stage>
    </Workbench>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Box
      component="label"
      sx={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        p: 1,
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        cursor: 'pointer',
        '&:hover': { borderColor: 'text.secondary' },
        '&:focus-within': { borderColor: 'primary.main' },
      }}
    >
      <Box sx={{ width: 28, height: 28, borderRadius: 1.5, bgcolor: value, boxShadow: 'inset 0 0 0 1px rgba(127,127,127,0.35)', flexShrink: 0 }} />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>
          {label}
        </Typography>
        <Typography sx={{ fontFamily: MONO_FONT, fontSize: '0.8rem' }}>{value.toUpperCase()}</Typography>
      </Box>
      <Box
        component="input"
        type="color"
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        aria-label={label}
        sx={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
      />
    </Box>
  );
}
