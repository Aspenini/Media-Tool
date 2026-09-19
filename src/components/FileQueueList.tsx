import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import type { QueuedFile } from '../hooks/useFileQueue';
import { formatBytes } from '../lib/format';
import { MONO_FONT } from '../theme';

export type QueueStatus = 'idle' | 'running' | 'done';

interface FileQueueListProps<T extends QueuedFile> {
  items: readonly T[];
  onRemove?: (id: string) => void;
  /** Per-row progress state; `running` shows a bar under the row. */
  status?: (item: T, index: number) => QueueStatus;
  /** Right-hand detail; defaults to the file size. */
  meta?: (item: T, index: number) => ReactNode;
  /** Makes rows selectable. */
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  disabled?: boolean;
}

function rowDetail(state: QueueStatus, fallback: ReactNode): ReactNode {
  if (state === 'done') return <CheckRoundedIcon sx={{ fontSize: 16, verticalAlign: 'middle' }} />;
  if (state === 'running') return 'working…';
  return fallback;
}

/** The standard list for tools that queue several files. */
export function FileQueueList<T extends QueuedFile>({ items, onRemove, status, meta, selectedId, onSelect, disabled }: FileQueueListProps<T>) {
  return (
    <Box role="list" sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper', overflow: 'hidden' }}>
      {items.map((item, i) => {
        const state = status?.(item, i) ?? 'idle';
        const selected = selectedId === item.id;
        return (
          <Box
            key={item.id}
            role="listitem"
            sx={(theme) => ({
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              borderTop: i ? '1px solid' : 0,
              borderColor: 'divider',
              bgcolor: selected ? alpha(theme.palette.primary.main, 0.12) : 'transparent',
            })}
          >
            <ButtonBase
              disabled={!onSelect}
              onClick={() => onSelect?.(item.id)}
              aria-pressed={onSelect ? selected : undefined}
              sx={{
                flex: 1,
                minWidth: 0,
                display: 'grid',
                gridTemplateColumns: '28px minmax(0, 1fr) auto',
                alignItems: 'center',
                gap: 1.5,
                pl: 2,
                pr: 1,
                py: 1.25,
                textAlign: 'left',
                '&.Mui-disabled': { pointerEvents: 'none' },
              }}
            >
              <Typography sx={{ fontFamily: MONO_FONT, fontSize: '0.75rem', color: selected ? 'primary.main' : 'text.secondary' }}>
                {String(i + 1).padStart(2, '0')}
              </Typography>
              <Typography variant="body2" noWrap title={item.file.name} sx={{ fontWeight: selected ? 650 : 550, color: selected ? 'primary.main' : 'text.primary' }}>
                {item.file.name}
              </Typography>
              <Typography component="div" sx={{ fontFamily: MONO_FONT, fontSize: '0.75rem', color: state === 'done' ? 'primary.main' : 'text.secondary' }}>
                {rowDetail(state, meta?.(item, i) ?? formatBytes(item.file.size))}
              </Typography>
            </ButtonBase>
            {onRemove && (
              <IconButton size="small" aria-label={`Remove ${item.file.name}`} disabled={disabled} onClick={() => onRemove(item.id)} sx={{ mr: 1 }}>
                <CloseRoundedIcon fontSize="small" />
              </IconButton>
            )}
            {state === 'running' && <LinearProgress sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, borderRadius: 0 }} />}
          </Box>
        );
      })}
    </Box>
  );
}
