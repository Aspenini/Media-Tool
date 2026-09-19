import { useState } from 'react';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import CircularProgress from '@mui/material/CircularProgress';
import DriveFileMoveRoundedIcon from '@mui/icons-material/DriveFileMoveRounded';
import { useNotification } from './NotificationProvider';
import { receiversFor, useSendTo, type FileKind } from './FileBridge';
import { useTool } from './Workbench';

interface SendToButtonProps {
  /** Builds the file to hand over; called only once a destination is picked. */
  getFile: () => Promise<File | null> | File | null;
  kind: FileKind;
  /** Icon-only, for tight spots like result cards. */
  compact?: boolean;
  disabled?: boolean;
  label?: string;
}

/** "Open in …" — hands a result straight to another tool, no download round-trip. */
export function SendToButton({ getFile, kind, compact, disabled, label = 'Open in' }: SendToButtonProps) {
  const tool = useTool();
  const sendTo = useSendTo();
  const notify = useNotification();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const targets = receiversFor(kind, tool.id);
  if (!targets.length) return null;

  const pick = async (target: (typeof targets)[number]) => {
    setAnchor(null);
    setBusy(true);
    try {
      const file = await getFile();
      if (!file) {
        notify('Nothing to send yet.', 'error');
        return;
      }
      sendTo(target, [file]);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Couldn't hand that over.", 'error');
    } finally {
      setBusy(false);
    }
  };

  const icon = busy ? <CircularProgress size={16} /> : <DriveFileMoveRoundedIcon fontSize="small" />;

  return (
    <>
      {compact ? (
        <Tooltip title={`${label}…`}>
          <span>
            <IconButton size="small" disabled={disabled || busy} onClick={(e) => setAnchor(e.currentTarget)} aria-label={`${label}…`}>
              {icon}
            </IconButton>
          </span>
        </Tooltip>
      ) : (
        <Button size="small" variant="outlined" disabled={disabled || busy} onClick={(e) => setAnchor(e.currentTarget)} startIcon={icon}>
          {label}…
        </Button>
      )}
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
        {targets.map((target) => {
          const Icon = target.icon;
          return (
            <MenuItem key={target.id} onClick={() => void pick(target)}>
              <ListItemIcon>
                <Icon fontSize="small" sx={{ color: target.accent }} />
              </ListItemIcon>
              <ListItemText primary={target.name} secondary={target.tagline} />
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
}
