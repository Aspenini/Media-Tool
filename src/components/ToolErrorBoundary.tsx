import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { MONO_FONT } from '../theme';

interface Props {
  toolName: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
  /** Bumped on retry so the tool remounts from scratch. */
  attempt: number;
}

/** Keeps one tool's crash inside its own tab instead of blanking the whole app. */
export class ToolErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[${this.props.toolName}] crashed:`, error, info.componentStack);
  }

  private retry = () => this.setState((s) => ({ error: null, attempt: s.attempt + 1 }));

  override render() {
    const { error, attempt } = this.state;
    if (!error) return <Fragment key={attempt}>{this.props.children}</Fragment>;

    return (
      <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', p: 3 }}>
        <Box sx={{ maxWidth: 480, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
          <ErrorOutlineRoundedIcon color="error" sx={{ fontSize: 48 }} />
          <Typography variant="h5">{this.props.toolName} hit a problem</Typography>
          <Typography color="text.secondary">
            The other tools still work. Reloading this one starts it fresh — anything you had loaded here is cleared.
          </Typography>
          <Button onClick={this.retry} startIcon={<RefreshRoundedIcon />} size="large">
            Reload {this.props.toolName}
          </Button>
          <Box
            component="pre"
            sx={{
              mt: 1,
              p: 1.5,
              maxWidth: '100%',
              overflow: 'auto',
              borderRadius: 2,
              bgcolor: 'action.hover',
              fontFamily: MONO_FONT,
              fontSize: '0.75rem',
              color: 'text.secondary',
              textAlign: 'left',
              whiteSpace: 'pre-wrap',
            }}
          >
            {error.message || String(error)}
          </Box>
        </Box>
      </Box>
    );
  }
}
