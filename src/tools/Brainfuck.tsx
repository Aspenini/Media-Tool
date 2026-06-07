import { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Divider from '@mui/material/Divider';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import { ToolShell } from '../components/ToolShell';
import { useNotification } from '../components/NotificationProvider';
import { MONO_FONT } from '../theme';
import { runBrainfuck, stripBrainfuck, textToBrainfuck } from '../lib/brainfuck';

const monoInput = { sx: { fontFamily: MONO_FONT } };

export function Brainfuck() {
  const notify = useNotification();
  const [input, setInput] = useState('');
  const [decodeInput, setDecodeInput] = useState('');
  const [decodeOutput, setDecodeOutput] = useState('');

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
    notify('Brainfuck code downloaded!', 'success');
  };

  const run = () => {
    if (!stripBrainfuck(decodeInput)) {
      setDecodeOutput('');
      notify('Paste Brainfuck code to run.', 'error');
      return;
    }
    try {
      const { output, error } = runBrainfuck(decodeInput);
      setDecodeOutput(output);
      if (error) notify(error, 'error');
    } catch {
      setDecodeOutput('');
      notify('Runtime error while executing Brainfuck.', 'error');
    }
  };

  return (
    <ToolShell title="Brainfuck Encoder & Decoder" description="Encode text into a Brainfuck program that prints it, or run Brainfuck code to see its output.">
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <TextField label="Input text" placeholder="Enter text to encode..." value={input} onChange={(e) => setInput(e.target.value)} multiline minRows={3} fullWidth />
        <TextField label="Brainfuck code" value={encoded} slotProps={{ input: monoInput, htmlInput: { readOnly: true } }} multiline minRows={5} fullWidth placeholder="Encoded Brainfuck code will appear here..." />
        <Stack direction="row" spacing={2}>
          <Button variant="outlined" onClick={copy} startIcon={<ContentCopyRoundedIcon />}>
            Copy Code
          </Button>
          <Button variant="outlined" onClick={download} startIcon={<DownloadRoundedIcon />}>
            Download as .bf
          </Button>
        </Stack>
      </Box>
      <Divider sx={{ my: 1 }} />
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <TextField label="Decode — Brainfuck program" placeholder="Paste Brainfuck code here (non-BF characters are ignored)..." value={decodeInput} onChange={(e) => setDecodeInput(e.target.value)} slotProps={{ input: monoInput }} multiline minRows={4} fullWidth />
        <Button onClick={run} startIcon={<PlayArrowRoundedIcon />} sx={{ alignSelf: 'flex-start' }}>
          Run / Decode
        </Button>
        <TextField label="Output" value={decodeOutput} slotProps={{ input: monoInput, htmlInput: { readOnly: true } }} multiline minRows={3} fullWidth placeholder="Program output appears here..." />
      </Box>
    </ToolShell>
  );
}
