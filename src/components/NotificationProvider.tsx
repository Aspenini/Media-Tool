import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Slide, { type SlideProps } from '@mui/material/Slide';

export type NotificationType = 'info' | 'success' | 'error' | 'warning';

interface NotificationState {
  open: boolean;
  message: string;
  type: NotificationType;
  key: number;
}

type NotifyFn = (message: string, type?: NotificationType) => void;

const NotificationContext = createContext<NotifyFn | null>(null);

function SlideUp(props: SlideProps) {
  return <Slide {...props} direction="up" />;
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<NotificationState>({
    open: false,
    message: '',
    type: 'info',
    key: 0,
  });

  const notify = useCallback<NotifyFn>((message, type = 'info') => {
    setState((prev) => ({ open: true, message, type, key: prev.key + 1 }));
  }, []);

  const handleClose = useCallback((_event?: unknown, reason?: string) => {
    if (reason === 'clickaway') return;
    setState((prev) => ({ ...prev, open: false }));
  }, []);

  const value = useMemo(() => notify, [notify]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <Snackbar
        key={state.key}
        open={state.open}
        autoHideDuration={3200}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        slots={{ transition: SlideUp }}
      >
        <Alert
          onClose={handleClose}
          severity={state.type}
          variant="filled"
          sx={{ width: '100%', boxShadow: 6 }}
        >
          {state.message}
        </Alert>
      </Snackbar>
    </NotificationContext.Provider>
  );
}

export function useNotification(): NotifyFn {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotification must be used within a NotificationProvider');
  return ctx;
}
