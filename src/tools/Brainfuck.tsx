import { useMemo, useState, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import SouthRoundedIcon from '@mui/icons-material/SouthRounded';
import { useNotification } from '../components/NotificationProvider';
import { useTool } from '../components/Workbench';
import { runBrainfuck, stripBrainfuck, textToBrainfuck } from '../lib/brainfuck';
import { MONO_FONT } from '../theme';

export function Brainfuck() {
  const notify = useNotification();
  const tool = useTool();
  const [input, setInput] = useState('Hello, world!');
  const [decodeInput, setDecodeInput] = useState('');
  const [decodeOutput, setDecodeOutput] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const encoded = useMemo(() => textToBrainfuck(input), [input]);

  const copy = async () => {
    if (!encoded) {
      notify('No code to copy!', 'error');
      return;
    }
    try {
      await navigator.clipboard.writeText(encoded);
      notify('Brainfuck code copied to clipboard!', 'success');
    } catch {
      notify('Failed to copy code. Please select and copy manually.', 'error');
    }
  };

  const download = () => {
    if (!encoded) {
      notify('No code to download!', 'error');
      return;
    }
    const blob = new Blob([encoded], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'brainfuck_code.bf';
    a.click();
    URL.revokeObjectURL(url);
  };

  const run = (source = decodeInput) => {
    setRunError(null);
    if (!stripBrainfuck(source)) {
      setDecodeOutput(null);
      notify('Paste Brainfuck code to run.', 'error');
      return;
    }
    try {
      const { output, error } = runBrainfuck(source);
      setDecodeOutput(output);
      if (error) setRunError(error);
    } catch {
      setDecodeOutput(null);
      setRunError('Runtime error while executing Brainfuck.');
    }
  };

  const ops = stripBrainfuck(decodeInput).length;

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', bgcolor: '#07090a', fontFamily: MONO_FONT, p: { xs: 1.5, md: 2.5 }, gap: { xs: 1.5, md: 2 } }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2, flexWrap: 'wrap', px: 0.5 }}>
        <Typography sx={{ fontFamily: MONO_FONT, fontWeight: 600, color: 'primary.main', fontSize: '1.1rem' }}>
          ~/{tool.name.toLowerCase()} <Box component="span" sx={{ color: 'text.secondary' }}>$</Box>
        </Typography>
        <Typography sx={{ fontFamily: MONO_FONT, color: 'text.secondary', fontSize: '0.8rem' }}>{tool.description}</Typography>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: { xs: 1.5, md: 2 } }}>
        {/* Encode */}
        <Pane
          title="encode"
          subtitle="text → program"
          actions={
            <>
              <Tooltip title="Copy program">
                <IconButton size="small" onClick={copy} aria-label="Copy program">
                  <ContentCopyRoundedIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Download .bf">
                <IconButton size="small" onClick={download} aria-label="Download as .bf">
                  <DownloadRoundedIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Send to the runner">
                <IconButton
                  size="small"
                  aria-label="Send program to the runner"
                  onClick={() => {
                    setDecodeInput(encoded);
                    run(encoded);
                  }}
                >
                  <PlayArrowRoundedIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            </>
          }
        >
          <Field label="input.txt" value={input} onChange={setInput} placeholder="Type some text…" minRows={3} grow={0} />
          <Divider label={`${input.length} chars → ${encoded.length} ops`} />
          <Field label="program.bf" value={encoded} readOnly placeholder="The program appears here." accent grow={1} />
        </Pane>

        {/* Run */}
        <Pane
          title="run"
          subtitle="program → output"
          actions={
            <Button size="small" onClick={() => run()} startIcon={<PlayArrowRoundedIcon />} sx={{ fontFamily: MONO_FONT, py: 0.25 }}>
              run
            </Button>
          }
        >
          <Field
            label="source.bf"
            value={decodeInput}
            onChange={setDecodeInput}
            placeholder="Paste Brainfuck here — anything that isn't + - < > [ ] . , is ignored. Ctrl+Enter runs it."
            onSubmit={() => run()}
            grow={1}
          />
          <Divider label={ops ? `${ops} ops` : 'waiting'} />
          <Box sx={{ minHeight: 110, px: 2, py: 1.5 }}>
            <Typography sx={{ fontFamily: MONO_FONT, fontSize: '0.7rem', color: 'text.secondary', mb: 0.75 }}>stdout</Typography>
            <Box
              component="pre"
              sx={{
                m: 0,
                fontFamily: MONO_FONT,
                fontSize: '0.95rem',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                color: 'primary.main',
                textShadow: (t) => `0 0 12px ${alpha(t.palette.primary.main, 0.45)}`,
                '&::after': {
                  content: '"▍"',
                  animation: 'bf-blink 1s steps(1) infinite',
                  ml: 0.25,
                },
                '@keyframes bf-blink': { '50%': { opacity: 0 } },
              }}
            >
              {decodeOutput ?? ''}
            </Box>
            {runError && <Typography sx={{ fontFamily: MONO_FONT, fontSize: '0.8rem', color: '#ff6b6b', mt: 1 }}>error: {runError}</Typography>}
          </Box>
        </Pane>
      </Box>
    </Box>
  );
}

function Pane({ title, subtitle, actions, children }: { title: string; subtitle: string; actions: ReactNode; children: ReactNode }) {
  return (
    <Box
      sx={{
        minHeight: { xs: 420, md: 0 },
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 3,
        border: '1px solid rgba(255,255,255,0.08)',
        bgcolor: '#0d1011',
        overflow: 'hidden',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, pl: 1.5, pr: 1, height: 40, borderBottom: '1px solid rgba(255,255,255,0.08)', bgcolor: 'rgba(255,255,255,0.02)' }}>
        <Box sx={{ display: 'flex', gap: 0.75 }}>
          {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
            <Box key={c} sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: c, opacity: 0.8 }} />
          ))}
        </Box>
        <Typography sx={{ fontFamily: MONO_FONT, fontSize: '0.8rem', fontWeight: 600, ml: 0.5 }}>{title}</Typography>
        <Typography sx={{ fontFamily: MONO_FONT, fontSize: '0.75rem', color: 'text.secondary', flex: 1 }} noWrap>
          {subtitle}
        </Typography>
        {actions}
      </Box>
      {children}
    </Box>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 0.5, color: 'text.secondary', borderTop: '1px dashed rgba(255,255,255,0.08)', borderBottom: '1px dashed rgba(255,255,255,0.08)' }}>
      <SouthRoundedIcon sx={{ fontSize: 13 }} />
      <Typography sx={{ fontFamily: MONO_FONT, fontSize: '0.7rem' }}>{label}</Typography>
    </Box>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  readOnly?: boolean;
  accent?: boolean;
  minRows?: number;
  grow: number;
}

function Field({ label, value, onChange, onSubmit, placeholder, readOnly, accent, minRows = 4, grow }: FieldProps) {
  return (
    <Box sx={{ flex: grow || 'none', minHeight: 0, display: 'flex', flexDirection: 'column', px: 2, pt: 1.25, pb: 1 }}>
      <Typography sx={{ fontFamily: MONO_FONT, fontSize: '0.7rem', color: 'text.secondary', mb: 0.5 }}>{label}</Typography>
      <Box
        component="textarea"
        value={value}
        placeholder={placeholder}
        readOnly={readOnly}
        rows={minRows}
        spellCheck={false}
        aria-label={label}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange?.(e.target.value)}
        onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
          if (onSubmit && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            onSubmit();
          }
        }}
        sx={{
          flex: grow ? 1 : 'none',
          minHeight: 0,
          width: '100%',
          resize: 'none',
          border: 0,
          outline: 'none',
          p: 0,
          bgcolor: 'transparent',
          fontFamily: MONO_FONT,
          fontSize: '0.88rem',
          lineHeight: 1.6,
          color: accent ? 'primary.main' : 'text.primary',
          wordBreak: 'break-all',
          '&::placeholder': { color: 'text.secondary', opacity: 0.8 },
        }}
      />
    </Box>
  );
}
