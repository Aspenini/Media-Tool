import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import { ToolShell } from '../components/ToolShell';
import { FileDropZone } from '../components/FileDropZone';
import { DownloadButton } from '../components/DownloadButton';
import { useNotification } from '../components/NotificationProvider';
import { drawDiagonalSlice, extractNumber, loadImageFromFile, type DiagonalDirection } from '../lib/image';

interface SliceOutput {
  url: string;
  name: string;
}

export function Slicer() {
  const notify = useNotification();
  const [file1, setFile1] = useState<File | null>(null);
  const [file2, setFile2] = useState<File | null>(null);
  const [direction, setDirection] = useState<'left' | 'right'>('left');
  const [allDirections, setAllDirections] = useState(false);
  const [outputs, setOutputs] = useState<SliceOutput[]>([]);

  const handleGenerate = async () => {
    if (!file1 || !file2) {
      notify('Please upload both images first.', 'error');
      return;
    }
    try {
      const [img1, img2] = await Promise.all([loadImageFromFile(file1), loadImageFromFile(file2)]);
      const num1 = extractNumber(file1.name);
      const num2 = extractNumber(file2.name);
      const w = img1.width;
      const h = img1.height;

      const make = (a: HTMLImageElement, b: HTMLImageElement, dir: DiagonalDirection, name: string): SliceOutput => ({
        url: drawDiagonalSlice(a, b, w, h, dir),
        name,
      });

      const results: SliceOutput[] = allDirections
        ? [
            make(img1, img2, 'tl2br', `tl2br_${num1}_${num2}.png`),
            make(img2, img1, 'tl2br', `tl2br_${num2}_${num1}.png`),
            make(img1, img2, 'tr2bl', `tr2bl_${num1}_${num2}.png`),
            make(img2, img1, 'tr2bl', `tr2bl_${num2}_${num1}.png`),
          ]
        : [make(img1, img2, direction === 'left' ? 'tl2br' : 'tr2bl', `${direction === 'left' ? 'tl2br' : 'tr2bl'}_${num1}_${num2}.png`)];

      setOutputs(results);
      notify('Images generated successfully!', 'success');
    } catch {
      notify('Could not process the images.', 'error');
    }
  };

  return (
    <ToolShell
      title="Diagonal Image Slicer"
      description="Diagonally slice and combine two images with pixel precision. Generate a single variant or all four diagonal combinations at once."
    >
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
        <FileDropZone accept="image/*" title={file1 ? file1.name : 'First image'} hint="click or drop" onFiles={(f) => setFile1(f[0])} />
        <FileDropZone accept="image/*" title={file2 ? file2.name : 'Second image'} hint="click or drop" onFiles={(f) => setFile2(f[0])} />
      </Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
        <TextField
          select
          label="Direction"
          value={direction}
          onChange={(e) => setDirection(e.target.value as 'left' | 'right')}
          disabled={allDirections}
          sx={{ minWidth: 320 }}
        >
          <MenuItem value="left">Diagonal (Top-left to Bottom-right)</MenuItem>
          <MenuItem value="right">Diagonal (Top-right to Bottom-left)</MenuItem>
        </TextField>
        <FormControlLabel
          control={<Checkbox checked={allDirections} onChange={(e) => setAllDirections(e.target.checked)} />}
          label="Generate all diagonal variants"
        />
        <Button onClick={handleGenerate}>Generate</Button>
      </Stack>
      {outputs.length > 0 && (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fill, minmax(220px, 1fr))' } }}>
          {outputs.map((out) => (
            <Box key={out.name} sx={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center' }}>
              <Box
                component="img"
                src={out.url}
                alt={out.name}
                sx={{ maxWidth: '100%', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}
              />
              <DownloadButton href={out.url} download={out.name} label={out.name} />
            </Box>
          ))}
        </Box>
      )}
    </ToolShell>
  );
}
