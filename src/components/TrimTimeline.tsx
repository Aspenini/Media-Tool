import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import Box from '@mui/material/Box';
import { formatTimecode } from '../lib/videoTrim';

/** In/out range on a video's timeline: drag either handle to trim, anywhere else to scrub. */
export function TrimTimeline({
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
