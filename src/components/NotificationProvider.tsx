import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Snackbar from '@mui/material/Snackbar';
import Typography from '@mui/material/Typography';
import Grow from '@mui/material/Grow';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorRoundedIcon from '@mui/icons-material/ErrorRounded';
import InfoRoundedIcon from '@mui/icons-material/InfoRounded';
import WarningRoundedIcon from '@mui/icons-material/WarningRounded';

export type NotificationType = 'info' | 'success' | 'error' | 'warning';

interface NotificationState {
  open: boolean;
  message: string;
  type: NotificationType;
  key: number;
}

type NotifyFn = (message: string, type?: NotificationType) => void;

const NotificationContext = createContext<NotifyFn | null>(null);

const ICONS = {
  info: InfoRoundedIcon,
  success: CheckCircleRoundedIcon,
  error: ErrorRoundedIcon,
  warning: WarningRoundedIcon,
} as const;

const COLORS: Record<NotificationType, string> = {
  info: '#6aa8ff',
  success: '#3ccf7a',
  error: '#ff5d5d',
  warning: '#ffb33c',
};

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<NotificationState>({ open: false, message: '', type: 'info', key: 0 });

  const notify = useCallback<NotifyFn>((message, type = 'info') => {
    setState((prev) => ({ open: true, message, type, key: prev.key + 1 }));
  }, []);

  const handleClose = useCallback((_event?: unknown, reason?: string) => {
    if (reason === 'clickaway') return;
    setState((prev) => ({ ...prev, open: false }));
  }, []);

  const Icon = ICONS[state.type];

  return (
    <NotificationContext.Provider value={notify}>
      {children}
      <Snackbar
        key={state.key}
        open={state.open}
        autoHideDuration={state.type === 'error' ? 5200 : 3200}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        slots={{ transition: Grow }}
      >
        <Box
          role={state.type === 'error' ? 'alert' : 'status'}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.25,
            pl: 1.5,
            pr: 0.5,
            py: 0.75,
            maxWidth: 420,
            borderRadius: 3,
            bgcolor: '#1d1d21',
            color: '#f1f1f3',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 16px 40px -12px rgba(0,0,0,0.6)',
          }}
        >
          <Icon sx={{ fontSize: 18, color: COLORS[state.type], flexShrink: 0 }} />
          <Typography variant="body2" sx={{ flex: 1, py: 0.5 }}>
            {state.message}
          </Typography>
          <IconButton size="small" onClick={handleClose} aria-label="Dismiss" sx={{ color: 'rgba(255,255,255,0.6)' }}>
            <CloseRoundedIcon fontSize="small" />
          </IconButton>
        </Box>
      </Snackbar>
    </NotificationContext.Provider>
  );
}

export function useNotification(): NotifyFn {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotification must be used within a NotificationProvider');
  return ctx;
}
