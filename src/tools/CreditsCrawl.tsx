import { useEffect, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import Dialog from '@mui/material/Dialog';
import CircularProgress from '@mui/material/CircularProgress';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import MovieRoundedIcon from '@mui/icons-material/MovieRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import { ToolShell } from '../components/ToolShell';
import { useNotification } from '../components/NotificationProvider';
import { CREDIT_FONTS, fontToCssFamily, googleFontHref, recordCreditsCrawl, type CreditItem } from '../lib/creditsCrawl';

interface Entry {
  id: string;
  name: string;
  title: string;
}
interface Category {
  id: string;
  name: string;
  entries: Entry[];
}

let counter = 0;
const uid = () => `cc-${Date.now()}-${counter++}`;

const newEntry = (): Entry => ({ id: uid(), name: '', title: '' });
const newCategory = (): Category => ({ id: uid(), name: '', entries: [newEntry()] });

export function CreditsCrawl() {
  const notify = useNotification();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [font, setFont] = useState('Poppins');
  const [categories, setCategories] = useState<Category[]>([newCategory()]);
  const [open, setOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = googleFontHref(font);
    document.head.appendChild(link);
    return () => link.remove();
  }, [font]);

  const updateCategory = (id: string, patch: Partial<Category>) =>
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const updateEntry = (catId: string, entryId: string, patch: Partial<Entry>) =>
    setCategories((prev) =>
      prev.map((c) =>
        c.id === catId ? { ...c, entries: c.entries.map((e) => (e.id === entryId ? { ...e, ...patch } : e)) } : c,
      ),
    );

  const collect = (): CreditItem[] => {
    const data: CreditItem[] = [];
    for (const cat of categories) {
      const name = cat.name.trim();
      if (!name) continue;
      data.push({ type: 'category', text: name });
      for (const entry of cat.entries) {
        const n = entry.name.trim();
        if (n) data.push({ type: 'entry', name: n, title: entry.title.trim() || null });
      }
    }
    return data;
  };

  const generate = async () => {
    const data = collect();
    if (data.length === 0) {
      notify('Add at least one category with a name, and at least one person.', 'error');
      return;
    }
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
      setVideoUrl(null);
    }
    setOpen(true);
    setRecording(true);
    // Wait a frame so the dialog canvas is mounted.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const canvas = canvasRef.current;
    if (!canvas) {
      setRecording(false);
      return;
    }
    try {
      const url = await recordCreditsCrawl(canvas, data, font);
      setVideoUrl(url);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Recording failed.', 'error');
      setOpen(false);
    } finally {
      setRecording(false);
    }
  };

  const close = () => setOpen(false);

  return (
    <ToolShell
      title="End Credits Crawl Generator"
      description="Add categories, names, and optional roles. Choose a font, then preview and export a WebM video."
      action={
        <TextField
          select
          size="small"
          label="Font"
          value={font}
          onChange={(e) => setFont(e.target.value)}
          sx={{ minWidth: 200 }}
        >
          {CREDIT_FONTS.map((f) => (
            <MenuItem key={f} value={f}>
              {f}
            </MenuItem>
          ))}
        </TextField>
      }
    >
      <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
        <Button variant="outlined" startIcon={<AddRoundedIcon />} onClick={() => setCategories((prev) => [...prev, newCategory()])}>
          Add Category
        </Button>
        <Button startIcon={<MovieRoundedIcon />} onClick={generate}>
          Preview & Export
        </Button>
      </Stack>
      <Typography variant="body2" color="text.secondary">
        Tip: Leave “Role” blank to show just the person’s name.
      </Typography>

      <Stack spacing={2} sx={{ fontFamily: `${fontToCssFamily(font)}, 'DM Sans', sans-serif` }}>
        {categories.map((cat) => (
          <Paper key={cat.id} variant="outlined" sx={{ p: 2.5, borderRadius: 3, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <TextField
                fullWidth
                label="Category name"
                placeholder="e.g., Audio Production Team"
                value={cat.name}
                onChange={(e) => updateCategory(cat.id, { name: e.target.value })}
              />
              <IconButton
                aria-label="Remove category"
                onClick={() => setCategories((prev) => prev.filter((c) => c.id !== cat.id))}
              >
                <CloseRoundedIcon />
              </IconButton>
            </Stack>
            <Stack spacing={1}>
              {cat.entries.map((entry) => (
                <Stack key={entry.id} direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
                  <TextField size="small" label="Name" value={entry.name} onChange={(e) => updateEntry(cat.id, entry.id, { name: e.target.value })} sx={{ flex: 1 }} />
                  <TextField size="small" label="Role (optional)" value={entry.title} onChange={(e) => updateEntry(cat.id, entry.id, { title: e.target.value })} sx={{ flex: 1 }} />
                  <IconButton
                    aria-label="Remove entry"
                    size="small"
                    onClick={() => updateCategory(cat.id, { entries: cat.entries.filter((en) => en.id !== entry.id) })}
                  >
                    <CloseRoundedIcon fontSize="small" />
                  </IconButton>
                </Stack>
              ))}
            </Stack>
            <Button
              size="small"
              variant="text"
              startIcon={<AddRoundedIcon />}
              onClick={() => updateCategory(cat.id, { entries: [...cat.entries, newEntry()] })}
              sx={{ alignSelf: 'flex-start' }}
            >
              Add Name/Role
            </Button>
          </Paper>
        ))}
      </Stack>

      <Dialog open={open} onClose={close} maxWidth="lg" fullWidth>
        <Box sx={{ position: 'relative', backgroundColor: '#000' }}>
          <IconButton onClick={close} aria-label="Close preview" sx={{ position: 'absolute', top: 8, right: 8, zIndex: 2, color: '#fff', background: 'rgba(0,0,0,0.4)' }}>
            <CloseRoundedIcon />
          </IconButton>
          <Box component="canvas" ref={canvasRef} width={1920} height={1080} sx={{ width: '100%', display: 'block' }} />
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, p: 2, alignItems: 'center', backgroundColor: 'background.paper' }}>
            {recording && (
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <CircularProgress size={18} />
                <Typography variant="body2">Recording…</Typography>
              </Stack>
            )}
            <Button component="a" href={videoUrl ?? undefined} download="credits-crawl.webm" disabled={!videoUrl} startIcon={<DownloadRoundedIcon />}>
              Download Video
            </Button>
          </Box>
        </Box>
      </Dialog>
    </ToolShell>
  );
}
