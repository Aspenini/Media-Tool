import { useEffect, useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import MovieRoundedIcon from '@mui/icons-material/MovieRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded';
import { useNotification } from '../components/NotificationProvider';
import { usePersistentState } from '../hooks/usePersistentState';
import { ChoiceCard } from '../components/controls';
import { Panel, PanelSection, Stage, StageTag, ToolIntro, Workbench } from '../components/Workbench';
import { ExportFooter } from '../components/ExportFooter';
import { CREDIT_FONTS, fontToCssFamily, recordCreditsCrawl, type CreditItem } from '../lib/creditsCrawl';
import { MONO_FONT } from '../theme';

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

const newEntry = (name = '', title = ''): Entry => ({ id: uid(), name, title });
const newCategory = (name = '', entries: Entry[] = [newEntry()]): Category => ({ id: uid(), name, entries });

const STARTER: Category[] = [
  newCategory('Directed by', [newEntry('Your Name')]),
  newCategory('Cast', [newEntry('Someone Wonderful', 'The Hero'), newEntry('Another Person', 'The Friend')]),
];

// Mirror the recorder's 1920×1080 layout in container-width units (1920px = 100cqw).
const PX = 100 / 1920;
const CATEGORY_PX = 60;
const ENTRY_PX = 40;
const LINE_PX = 80;
const SCROLL_PX_PER_SEC = 120;

/** One stylesheet for every selectable face, so the picker can preview them all. */
function allFontsHref(): string {
  const families = CREDIT_FONTS.map((f) => `family=${f.replace(/ /g, '+')}:wght@400;700`).join('&');
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}

export function CreditsCrawl() {
  const notify = useNotification();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [font, setFont] = usePersistentState('font', 'Playfair Display');
  const [categories, setCategories] = useState<Category[]>(STARTER);
  const [open, setOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [replayKey, setReplayKey] = useState(0);

  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = allFontsHref();
    document.head.appendChild(link);
    return () => link.remove();
  }, []);

  const updateCategory = (id: string, patch: Partial<Category>) =>
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const updateEntry = (catId: string, entryId: string, patch: Partial<Entry>) =>
    setCategories((prev) =>
      prev.map((c) =>
        c.id === catId ? { ...c, entries: c.entries.map((e) => (e.id === entryId ? { ...e, ...patch } : e)) } : c,
      ),
    );

  const data = useMemo<CreditItem[]>(() => {
    const out: CreditItem[] = [];
    for (const cat of categories) {
      const name = cat.name.trim();
      if (!name) continue;
      out.push({ type: 'category', text: name });
      for (const entry of cat.entries) {
        const n = entry.name.trim();
        if (n) out.push({ type: 'entry', name: n, title: entry.title.trim() || null });
      }
    }
    return out;
  }, [categories]);

  const generate = async () => {
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

  const contentPx = data.reduce((h, item) => h + (item.type === 'category' ? LINE_PX * 2 : LINE_PX), 0);
  const travelPx = 1080 * 2 + contentPx;
  const seconds = travelPx / SCROLL_PX_PER_SEC;
  const family = `${fontToCssFamily(font)}, Arial, sans-serif`;

  return (
    <Workbench panelWidth={420}>
      <Panel
        footer={
          <ExportFooter
            primary={{ label: `Record 1080p WebM · ~${Math.ceil(seconds)}s`, icon: <MovieRoundedIcon />, onClick: generate, disabled: !data.length }}
          />
        }
      >
        <ToolIntro />
        <PanelSection title="Typeface">
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0.75 }}>
            {CREDIT_FONTS.map((f) => {
              const selected = f === font;
              return (
                <ChoiceCard
                  key={f}
                  role="button"
                  selected={selected}
                  onClick={() => setFont(f)}
                  sx={{ flexDirection: 'column', alignItems: 'center', textAlign: 'center', px: 1, py: 1.25, minWidth: 0 }}
                >
                  <Typography sx={{ fontFamily: `${fontToCssFamily(f)}, serif`, fontSize: '1.3rem', lineHeight: 1.1, color: selected ? 'primary.main' : 'text.primary' }}>
                    Aa
                  </Typography>
                  <Typography noWrap sx={{ fontSize: '0.68rem', color: 'text.secondary', mt: 0.5 }}>
                    {f}
                  </Typography>
                </ChoiceCard>
              );
            })}
          </Box>
        </PanelSection>
        <PanelSection
          title="Credits"
          action={
            <Button size="small" variant="outlined" startIcon={<AddRoundedIcon />} onClick={() => setCategories((prev) => [...prev, newCategory()])}>
              Category
            </Button>
          }
        >
          {categories.map((cat, ci) => (
            <Box key={cat.id} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: 1.5, pr: 0.5, py: 0.5, bgcolor: 'action.hover' }}>
                <Typography sx={{ fontFamily: MONO_FONT, fontSize: '0.7rem', color: 'primary.main' }}>{String(ci + 1).padStart(2, '0')}</Typography>
                <InputBase
                  fullWidth
                  placeholder="Category, e.g. Sound Design"
                  value={cat.name}
                  onChange={(e) => updateCategory(cat.id, { name: e.target.value })}
                  sx={{ fontWeight: 700, fontSize: '0.92rem' }}
                  slotProps={{ input: { 'aria-label': 'Category name' } }}
                />
                <Tooltip title="Remove category">
                  <IconButton size="small" aria-label="Remove category" onClick={() => setCategories((prev) => prev.filter((c) => c.id !== cat.id))}>
                    <CloseRoundedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
              <Box sx={{ px: 1, py: 0.75, display: 'flex', flexDirection: 'column' }}>
                {cat.entries.map((entry) => (
                  <Box
                    key={entry.id}
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr auto',
                      alignItems: 'center',
                      gap: 1,
                      pl: 0.5,
                      borderRadius: 1.5,
                      '&:hover .remove-entry': { opacity: 1 },
                      '&:focus-within': { bgcolor: 'action.hover' },
                    }}
                  >
                    <InputBase
                      placeholder="Name"
                      value={entry.name}
                      onChange={(e) => updateEntry(cat.id, entry.id, { name: e.target.value })}
                      sx={{ fontSize: '0.88rem' }}
                      slotProps={{ input: { 'aria-label': 'Name' } }}
                    />
                    <InputBase
                      placeholder="Role (optional)"
                      value={entry.title}
                      onChange={(e) => updateEntry(cat.id, entry.id, { title: e.target.value })}
                      sx={{ fontSize: '0.88rem', color: 'text.secondary' }}
                      slotProps={{ input: { 'aria-label': 'Role' } }}
                    />
                    <IconButton
                      className="remove-entry"
                      size="small"
                      aria-label="Remove name"
                      onClick={() => updateCategory(cat.id, { entries: cat.entries.filter((en) => en.id !== entry.id) })}
                      sx={{ opacity: { xs: 1, md: 0.35 } }}
                    >
                      <CloseRoundedIcon sx={{ fontSize: 15 }} />
                    </IconButton>
                  </Box>
                ))}
                <Button
                  size="small"
                  variant="text"
                  startIcon={<AddRoundedIcon />}
                  onClick={() => updateCategory(cat.id, { entries: [...cat.entries, newEntry()] })}
                  sx={{ alignSelf: 'flex-start', color: 'text.secondary', mt: 0.25 }}
                >
                  Name
                </Button>
              </Box>
            </Box>
          ))}
        </PanelSection>
      </Panel>

      <Stage
        backdrop="void"
        overlay={
          <>
            <StageTag>live preview · {font}</StageTag>
            <Box sx={{ position: 'absolute', top: 10, right: 12, zIndex: 5 }}>
              <Tooltip title="Restart preview">
                <IconButton size="small" onClick={() => setReplayKey((k) => k + 1)} sx={{ color: 'rgba(255,255,255,0.6)' }}>
                  <ReplayRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </>
        }
      >
        <Box sx={{ width: '100%', maxWidth: 1280 }}>
          <Box
            sx={{
              position: 'relative',
              width: '100%',
              aspectRatio: '16 / 9',
              bgcolor: '#000',
              overflow: 'hidden',
              containerType: 'inline-size',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.08), 0 40px 120px -40px rgba(224,179,90,0.25)',
              '@keyframes crawl': {
                from: { transform: 'translateY(var(--crawl-from))' },
                to: { transform: 'translateY(var(--crawl-to))' },
              },
            }}
          >
            {data.length === 0 ? (
              <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,0.35)', fontFamily: MONO_FONT, fontSize: '0.8rem' }}>
                add a category and a name
              </Box>
            ) : (
              <Box
                key={`${replayKey}-${travelPx}`}
                style={
                  {
                    '--crawl-from': `${56.25}cqw`,
                    '--crawl-to': `${-(contentPx + 1080) * PX}cqw`,
                  } as React.CSSProperties
                }
                sx={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 0,
                  textAlign: 'center',
                  color: '#fff',
                  fontFamily: family,
                  animation: `crawl ${seconds}s linear infinite`,
                  willChange: 'transform',
                }}
              >
                {data.map((item, i) =>
                  item.type === 'category' ? (
                    <Box key={i} sx={{ height: `${LINE_PX * 2 * PX}cqw`, fontWeight: 700, fontSize: `${CATEGORY_PX * PX}cqw`, lineHeight: 1, transform: 'translateY(-0.8em)' }}>
                      {item.text}
                    </Box>
                  ) : (
                    <Box key={i} sx={{ height: `${LINE_PX * PX}cqw`, fontWeight: 400, fontSize: `${ENTRY_PX * PX}cqw`, lineHeight: 1, transform: 'translateY(-0.8em)' }}>
                      {item.title ? `${item.name} - ${item.title}` : item.name}
                    </Box>
                  ),
                )}
              </Box>
            )}
          </Box>
          <Typography sx={{ mt: 1.5, fontFamily: MONO_FONT, fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
            1920×1080 · {data.filter((d) => d.type === 'entry').length} names · {Math.ceil(seconds)}s runtime
          </Typography>
        </Box>
      </Stage>

      <Dialog open={open} onClose={() => !recording && setOpen(false)} maxWidth="lg" fullWidth>
        <Box sx={{ position: 'relative', bgcolor: '#000' }}>
          <IconButton
            onClick={() => setOpen(false)}
            disabled={recording}
            aria-label="Close"
            sx={{ position: 'absolute', top: 8, right: 8, zIndex: 2, color: '#fff', bgcolor: 'rgba(0,0,0,0.5)' }}
          >
            <CloseRoundedIcon />
          </IconButton>
          <Box component="canvas" ref={canvasRef} width={1920} height={1080} sx={{ width: '100%', display: 'block' }} />
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, p: 2, alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            {recording ? (
              <>
                <CircularProgress size={16} />
                <Typography variant="body2">Recording in real time — keep this tab visible…</Typography>
              </>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {videoUrl ? 'Done. Your video is ready.' : ''}
              </Typography>
            )}
          </Box>
          <Button component="a" href={videoUrl ?? undefined} download="credits-crawl.webm" disabled={!videoUrl} startIcon={<DownloadRoundedIcon />}>
            Download WebM
          </Button>
        </Box>
      </Dialog>
    </Workbench>
  );
}
