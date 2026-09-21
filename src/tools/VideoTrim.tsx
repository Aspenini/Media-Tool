import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import MovieFilterRoundedIcon from '@mui/icons-material/MovieFilterRounded';
import PauseRoundedIcon from '@mui/icons-material/PauseRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded';
import VolumeOffRoundedIcon from '@mui/icons-material/VolumeOffRounded';
import VolumeUpRoundedIcon from '@mui/icons-material/VolumeUpRounded';
import { useIncomingFiles } from '../components/FileBridge';
import { SendToButton } from '../components/SendToButton';
import { FileButton, FileDropZone } from '../components/FileDropZone';
import { ExportFooter } from '../components/ExportFooter';
import { FileQueueList } from '../components/FileQueueList';
import { useNotification } from '../components/NotificationProvider';
import { Artboard, Panel, PanelSection, Stage, StageTag, ToolIntro, Workbench } from '../components/Workbench';
import { useFileQueue } from '../hooks/useFileQueue';
import { downloadEach, fileFromUrl } from '../lib/download';
import { formatBytes } from '../lib/format';
import { clampRange, formatTimecode, isVideoFile, parseTimecode, probeVideo, trimmedName, trimVideoFile, extensionForVideo } from '../lib/videoTrim';
import { MONO_FONT } from '../theme';

const ACCEPT = 'video/*,.mp4,.webm,.mov,.m4v,.ogv,.mkv';

interface Result {
  url: string;
  name: string;
  bytes: number;
}

interface Item {
  id: string;
  file: File;
  status: 'loading' | 'ready' | 'error';
  url: string | null;
  duration: number;
  width: number;
  height: number;
  start: number;
  end: number;
  result: Result | null;
}

function disposeItem(item: Item) {
  if (item.url) URL.revokeObjectURL(item.url);
  if (item.result) URL.revokeObjectURL(item.result.url);
}

function withoutResult(item: Item): Item {
  if (!item.result) return item;
  URL.revokeObjectURL(item.result.url);
  return { ...item, result: null };
}

export function VideoTrim() {
  const notify = useNotification();
  const queue = useFileQueue<Item>({
    create: (file, id) => ({
      id,
      file,
      status: 'loading',
      url: null,
      duration: 0,
      width: 0,
      height: 0,
      start: 0,
      end: 0,
      result: null,
    }),
    dispose: disposeItem,
  });
  const items = queue.items;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null;
  const busy = progress !== null;
  const ready = items.filter((item) => item.status === 'ready' && item.url);
  const exported = items.filter((item) => item.result);

  const addFiles = (files: File[]) => {
    const videos = files.filter(isVideoFile);
    if (!videos.length) {
      notify('Drop a video file — MP4, WebM, MOV and similar.', 'error');
      return;
    }
    if (videos.length < files.length) notify('Skipped files that aren’t video.', 'warning');
    const added = queue.add(videos);
    if (!selectedId && added[0]) setSelectedId(added[0].id);
    for (const item of added) {
      probeVideo(item.file)
        .then((info) => {
          queue.update(item.id, {
            status: 'ready',
            url: info.url,
            duration: info.duration,
            width: info.width,
            height: info.height,
            start: 0,
            end: info.duration,
          });
        })
        .catch(() => {
          queue.update(item.id, { status: 'error' });
          notify(`Couldn't read ${item.file.name}.`, 'error');
        });
    }
  };

  useIncomingFiles(addFiles);

  const setRange = (id: string, start: number, end: number) => {
    queue.update(id, (item) => {
      const next = clampRange(start, end, item.duration);
      const cleared = item.result ? withoutResult(item) : item;
      return { ...cleared, ...next };
    });
  };

  const cancel = () => abortRef.current?.abort();

  const runExport = async (which: Item[]) => {
    const todo = which.filter((item) => item.status === 'ready');
    if (!todo.length) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setProgress(0);
    const used = new Set<string>();
    const finished: Result[] = [];
    let failures = 0;
    let cancelled = false;

    for (let n = 0; n < todo.length; n++) {
      if (controller.signal.aborted) {
        cancelled = true;
        break;
      }
      const item = todo[n];
      setRunningId(item.id);
      try {
        const blob = await trimVideoFile({
          file: item.file,
          start: item.start,
          end: item.end,
          signal: controller.signal,
          onProgress: (p) => setProgress(Math.round(((n + p) / todo.length) * 100)),
        });
        const ext = extensionForVideo(blob);
        let name = trimmedName(item.file.name, item.start, item.end, ext);
        for (let k = 2; used.has(name); k++) name = trimmedName(item.file.name, item.start, item.end, ext).replace(/(\.[^.]+)$/, `_${k}$1`);
        used.add(name);
        const result: Result = { url: URL.createObjectURL(blob), name, bytes: blob.size };
        finished.push(result);
        queue.update(item.id, (current) => {
          if (current.result) URL.revokeObjectURL(current.result.url);
          return { result };
        });
      } catch (error) {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
          cancelled = true;
          break;
        }
        failures++;
        notify(`${item.file.name}: ${error instanceof Error ? error.message : 'export failed'}`, 'error');
      }
      setProgress(Math.round(((n + 1) / todo.length) * 100));
    }

    setRunningId(null);
    setProgress(null);
    abortRef.current = null;
    if (cancelled) {
      notify('Export cancelled.', 'info');
      return;
    }
    void downloadEach(finished);
    if (!failures && finished.length) {
      notify(`Exported ${finished.length} clip${finished.length === 1 ? '' : 's'}.`, 'success');
    }
  };

  const clipLength = selected && selected.status === 'ready' ? selected.end - selected.start : 0;

  return (
    <Workbench panelWidth={360}>
      <Panel
        footer={
          <ExportFooter
            progress={busy ? progress : null}
            primary={{
              label: selected?.status === 'ready' ? 'Export clip' : 'Export',
              icon: <MovieFilterRoundedIcon />,
              busy,
              busyLabel: 'Exporting…',
              onClick: () => void runExport(selected ? [selected] : []),
              disabled: !selected || selected.status !== 'ready' || busy,
            }}
            secondary={[
              busy && {
                label: 'Cancel',
                onClick: cancel,
              },
              !busy && ready.length > 1 && {
                label: `Export all ${ready.length} clips`,
                icon: <DownloadRoundedIcon />,
                onClick: () => void runExport(ready),
              },
              !busy && exported.length > 0 && {
                label: exported.length === 1 ? 'Download again' : `Download all ${exported.length} again`,
                icon: <DownloadRoundedIcon />,
                onClick: () => void downloadEach(exported.map((item) => item.result!)),
              },
            ]}
            status="The trimmed clip is re-encoded in the browser as WebM or MP4, with audio when the browser allows it."
          />
        }
      >
        <ToolIntro />
        <PanelSection title="Videos" flush>
          <FileButton variant="contained" multiple accept={ACCEPT} onFiles={addFiles} startIcon={<AddRoundedIcon />} disabled={busy}>
            Add videos
          </FileButton>
          {items.length > 0 && (
            <>
              <FileQueueList
                items={items}
                selectedId={selected?.id}
                onSelect={busy ? undefined : setSelectedId}
                onRemove={busy ? undefined : (id) => {
                  queue.remove(id);
                  if (selectedId === id) setSelectedId(null);
                }}
                disabled={busy}
                status={(item) => (item.id === runningId ? 'running' : item.result ? 'done' : 'idle')}
                meta={(item) =>
                  item.status === 'error'
                    ? 'failed'
                    : item.status === 'loading'
                      ? 'reading…'
                      : formatTimecode(item.end - item.start)
                }
              />
              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Tooltip title="Remove all">
                  <span>
                    <IconButton onClick={() => { queue.clear(); setSelectedId(null); }} disabled={busy} aria-label="Remove all videos">
                      <DeleteOutlineRoundedIcon />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
            </>
          )}
        </PanelSection>

        {selected?.status === 'ready' && (
          <PanelSection title="Selection">
            <Typography variant="body2" color="text.secondary">
              {selected.width}×{selected.height} · {formatTimecode(selected.duration)} total · {formatBytes(selected.file.size)}
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
              <TimeField
                label="Start"
                value={selected.start}
                disabled={busy}
                onCommit={(time) => setRange(selected.id, time, selected.end)}
              />
              <TimeField
                label="End"
                value={selected.end}
                disabled={busy}
                onCommit={(time) => setRange(selected.id, selected.start, time)}
              />
            </Box>
            <Typography sx={{ fontFamily: MONO_FONT, fontSize: '0.8rem', color: 'text.secondary' }}>
              Clip {formatTimecode(clipLength)}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button
                size="small"
                variant="outlined"
                disabled={busy}
                onClick={() => setRange(selected.id, videoRef.current?.currentTime ?? selected.start, selected.end)}
              >
                Start here
              </Button>
              <Button
                size="small"
                variant="outlined"
                disabled={busy}
                onClick={() => setRange(selected.id, selected.start, videoRef.current?.currentTime ?? selected.end)}
              >
                End here
              </Button>
            </Box>
          </PanelSection>
        )}
      </Panel>

      <Stage
        backdrop="void"
        center={!items.length}
        onFiles={busy ? undefined : addFiles}
        dropLabel="Drop to add videos"
        overlay={selected?.status === 'ready' && <StageTag>{formatTimecode(clipLength)} selected</StageTag>}
      >
        {!items.length ? (
          <FileDropZone
            variant="hero"
            multiple
            accept={ACCEPT}
            icon={MovieFilterRoundedIcon}
            title="Drop a video to trim"
            hint="Set in and out points, then export just that slice. MP4, WebM, MOV and other formats your browser can play."
            onFiles={addFiles}
          />
        ) : selected?.status === 'loading' ? (
          <Typography color="text.secondary">Reading video…</Typography>
        ) : selected?.status === 'error' ? (
          <Typography color="error.main">Couldn’t read this video.</Typography>
        ) : selected?.url ? (
          <ClipStage
            key={selected.id}
            item={selected}
            videoRef={videoRef}
            disabled={busy}
            onRange={(start, end) => setRange(selected.id, start, end)}
            result={selected.result}
          />
        ) : (
          <Typography color="text.secondary">Select a video.</Typography>
        )}
      </Stage>
    </Workbench>
  );
}

function TimeField({ label, value, disabled, onCommit }: { label: string; value: number; disabled: boolean; onCommit: (time: number) => void }) {
  const [text, setText] = useState(formatTimecode(value));
  useEffect(() => setText(formatTimecode(value)), [value]);
  const commit = () => {
    const parsed = parseTimecode(text);
    if (parsed == null) {
      setText(formatTimecode(value));
      return;
    }
    onCommit(parsed);
  };
  return (
    <TextField
      label={label}
      value={text}
      disabled={disabled}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      slotProps={{ input: { sx: { fontFamily: MONO_FONT } } }}
    />
  );
}

function ClipStage({
  item,
  videoRef,
  disabled,
  onRange,
  result,
}: {
  item: Item;
  videoRef: RefObject<HTMLVideoElement | null>;
  disabled: boolean;
  onRange: (start: number, end: number) => void;
  result: Result | null;
}) {
  const [currentTime, setCurrentTime] = useState(0);
  const [paused, setPaused] = useState(true);
  const [muted, setMuted] = useState(true);
  const selectionPlay = useRef(false);
  const endRef = useRef(item.end);
  endRef.current = item.end;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let raf = 0;
    const onVolume = () => setMuted(video.muted);
    const sync = () => {
      setCurrentTime(video.currentTime);
      setPaused(video.paused);
      if (selectionPlay.current && video.currentTime >= endRef.current - 0.04) {
        video.pause();
        video.currentTime = endRef.current;
        selectionPlay.current = false;
      }
    };
    const tick = () => {
      sync();
      if (!video.paused && !video.ended) raf = requestAnimationFrame(tick);
    };
    const onPlay = () => {
      setPaused(false);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };
    const onPause = () => {
      cancelAnimationFrame(raf);
      setPaused(true);
      sync();
    };
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('seeked', sync);
    video.addEventListener('timeupdate', sync);
    video.addEventListener('volumechange', onVolume);
    return () => {
      cancelAnimationFrame(raf);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('seeked', sync);
      video.removeEventListener('timeupdate', sync);
      video.removeEventListener('volumechange', onVolume);
    };
  }, [item.id, videoRef]);

  const seek = (time: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.min(Math.max(0, time), item.duration);
    setCurrentTime(video.currentTime);
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    selectionPlay.current = false;
    if (video.paused) void video.play();
    else video.pause();
  };

  const playSelection = () => {
    const video = videoRef.current;
    if (!video) return;
    selectionPlay.current = true;
    video.currentTime = item.start;
    void video.play();
  };

  return (
    <Box sx={{ width: '100%', maxWidth: 960, display: 'flex', flexDirection: 'column', gap: 2, my: 'auto' }}>
      <Artboard>
        <Box
          component="video"
          ref={videoRef}
          src={item.url ?? undefined}
          playsInline
          muted={muted}
          preload="auto"
          onClick={disabled ? undefined : togglePlay}
          sx={{ width: '100%', height: 'auto', display: 'block', cursor: disabled ? 'default' : 'pointer' }}
        />
      </Artboard>

      <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        <TrimTimeline
          duration={item.duration}
          currentTime={currentTime}
          start={item.start}
          end={item.end}
          disabled={disabled}
          onSeek={seek}
          onChangeRange={(start, end) => {
            onRange(start, end);
            seek(Math.abs(start - item.start) >= Math.abs(end - item.end) ? start : end);
          }}
        />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Tooltip title={paused ? 'Play' : 'Pause'}>
            <span>
              <IconButton size="small" disabled={disabled} onClick={togglePlay} aria-label={paused ? 'Play' : 'Pause'}>
                {paused ? <PlayArrowRoundedIcon /> : <PauseRoundedIcon />}
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Play selection">
            <span>
              <IconButton size="small" disabled={disabled} onClick={playSelection} aria-label="Play selection">
                <ReplayRoundedIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title={muted ? 'Unmute preview' : 'Mute preview'}>
            <IconButton
              size="small"
              disabled={disabled}
              onClick={() => {
                const video = videoRef.current;
                if (!video) return;
                video.muted = !video.muted;
                setMuted(video.muted);
              }}
              aria-label={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? <VolumeOffRoundedIcon fontSize="small" /> : <VolumeUpRoundedIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Typography sx={{ fontFamily: MONO_FONT, fontSize: '0.8rem', color: 'text.secondary', ml: 1 }}>
            {formatTimecode(currentTime)} / {formatTimecode(item.duration)}
          </Typography>
          <Box sx={{ flex: 1 }} />
          {result && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography variant="caption" color="text.secondary">
                {formatBytes(result.bytes)}
              </Typography>
              <SendToButton kind="video" compact getFile={() => fileFromUrl(result.url, result.name)} />
              <Tooltip title={`Download ${result.name}`}>
                <IconButton size="small" component="a" href={result.url} download={result.name} aria-label={`Download ${result.name}`}>
                  <DownloadRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          )}
        </Box>
      </Paper>
    </Box>
  );
}

function TrimTimeline({
  duration,
  currentTime,
  start,
  end,
  disabled,
  onSeek,
  onChangeRange,
}: {
  duration: number;
  currentTime: number;
  start: number;
  end: number;
  disabled?: boolean;
  onSeek: (time: number) => void;
  onChangeRange: (start: number, end: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<'start' | 'end' | 'playhead' | null>(null);

  const timeAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || duration <= 0) return 0;
    return Math.min(duration, Math.max(0, ((clientX - rect.left) / rect.width) * duration));
  };

  const pct = (time: number) => (duration > 0 ? `${(time / duration) * 100}%` : '0%');

  const applyDrag = (clientX: number) => {
    const t = timeAt(clientX);
    const kind = dragRef.current;
    if (kind === 'start') onChangeRange(t, end);
    else if (kind === 'end') onChangeRange(start, t);
    else onSeek(t);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || duration <= 0) return;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = event.clientX - rect.left;
    const px = (time: number) => (time / duration) * rect.width;
    const dStart = Math.abs(x - px(start));
    const dEnd = Math.abs(x - px(end));
    const slop = 14;
    if (dStart <= slop && dStart <= dEnd) dragRef.current = 'start';
    else if (dEnd <= slop) dragRef.current = 'end';
    else dragRef.current = 'playhead';
    event.currentTarget.setPointerCapture(event.pointerId);
    applyDrag(event.clientX);
  };

  return (
    <Box
      ref={trackRef}
      role="slider"
      aria-label="Trim range"
      aria-valuemin={0}
      aria-valuemax={duration}
      aria-valuenow={currentTime}
      aria-valuetext={`${formatTimecode(start)} to ${formatTimecode(end)}`}
      tabIndex={disabled ? -1 : 0}
      onPointerDown={onPointerDown}
      onPointerMove={(event) => {
        if (!dragRef.current) return;
        applyDrag(event.clientX);
      }}
      onPointerUp={() => {
        dragRef.current = null;
      }}
      onPointerCancel={() => {
        dragRef.current = null;
      }}
      onKeyDown={(event) => {
        if (disabled) return;
        const step = event.shiftKey ? 1 : 0.1;
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          onSeek(currentTime - step);
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          onSeek(currentTime + step);
        }
      }}
      sx={{
        position: 'relative',
        height: 36,
        cursor: disabled ? 'default' : 'pointer',
        userSelect: 'none',
        touchAction: 'none',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Box sx={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 8, mt: '-4px', borderRadius: 999, bgcolor: 'action.hover' }} />
      <Box
        sx={{
          position: 'absolute',
          left: pct(start),
          width: `calc(${pct(end)} - ${pct(start)})`,
          top: '50%',
          height: 8,
          mt: '-4px',
          borderRadius: 999,
          bgcolor: 'primary.main',
        }}
      />
      <Handle left={pct(start)} />
      <Handle left={pct(end)} />
      <Box
        sx={(theme) => ({
          position: 'absolute',
          left: pct(currentTime),
          top: 4,
          bottom: 4,
          width: 2,
          ml: '-1px',
          bgcolor: theme.palette.mode === 'dark' ? '#fff' : '#111',
          borderRadius: 1,
          pointerEvents: 'none',
        })}
      />
    </Box>
  );
}

function Handle({ left }: { left: string }) {
  return (
    <Box
      sx={(theme) => ({
        position: 'absolute',
        left,
        top: '50%',
        width: 14,
        height: 22,
        ml: '-7px',
        mt: '-11px',
        borderRadius: 1,
        bgcolor: 'primary.main',
        boxShadow: `0 0 0 2px ${theme.palette.background.paper}`,
        pointerEvents: 'none',
      })}
    />
  );
}
