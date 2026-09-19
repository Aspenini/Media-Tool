import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';

export interface FooterAction {
  label: ReactNode;
  /** Defaults to a download icon for links. */
  icon?: ReactNode;
  /** Put the icon after the label (e.g. a forward arrow). */
  iconEnd?: boolean;
  onClick?: () => void;
  /** Render as a download link instead of a button. */
  href?: string;
  download?: string;
  disabled?: boolean;
  /** Swap the icon for a spinner (and the label for `busyLabel`). */
  busy?: boolean;
  busyLabel?: ReactNode;
  variant?: 'contained' | 'outlined';
  title?: string;
}

interface ExportFooterProps {
  primary: FooterAction;
  /** Extra controls on the same row as the primary action (e.g. a copy button). */
  aside?: ReactNode;
  /** Full-width follow-up actions under the primary one. */
  secondary?: FooterAction | false | null | (FooterAction | false | null)[];
  /** 0–100 shows a determinate bar; null hides it. */
  progress?: number | null;
  status?: ReactNode;
}

function ActionButton({ action, size }: { action: FooterAction; size: 'large' | 'medium' }) {
  const icon = action.busy ? <CircularProgress size={18} color="inherit" /> : (action.icon ?? (action.href ? <DownloadRoundedIcon /> : undefined));
  const common = {
    size,
    variant: action.variant ?? (size === 'large' ? 'contained' : 'outlined'),
    disabled: action.disabled || action.busy,
    title: action.title,
    sx: { flex: 1 },
    ...(action.iconEnd ? { endIcon: icon } : { startIcon: icon }),
  } as const;
  const label = action.busy && action.busyLabel ? action.busyLabel : action.label;

  if (action.href !== undefined) {
    return (
      <Button {...common} component="a" href={action.href || undefined} download={action.download}>
        {label}
      </Button>
    );
  }
  return (
    <Button {...common} onClick={action.onClick}>
      {label}
    </Button>
  );
}

/** The standard bottom-of-panel export area. Pass it to `<Panel footer>`. */
export function ExportFooter({ primary, aside, secondary, progress, status }: ExportFooterProps) {
  const follow = (Array.isArray(secondary) ? secondary : [secondary]).filter((a): a is FooterAction => !!a);
  return (
    <>
      {progress != null && <LinearProgress variant="determinate" value={progress} aria-label="Progress" />}
      <Box sx={{ display: 'flex', gap: 1 }}>
        <ActionButton action={primary} size="large" />
        {aside}
      </Box>
      {follow.map((action, i) => (
        <Box key={i} sx={{ display: 'flex' }}>
          <ActionButton action={action} size="medium" />
        </Box>
      ))}
      {status && (
        <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
          {status}
        </Typography>
      )}
    </>
  );
}
