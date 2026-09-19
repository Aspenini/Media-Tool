import { alpha, createTheme, type Theme } from '@mui/material/styles';

export type ThemeMode = 'light' | 'dark';

export const BODY_FONT = "'Roboto Flex', Roboto, system-ui, -apple-system, sans-serif";
export const DISPLAY_FONT = BODY_FONT;
export const MONO_FONT = "'Roboto Mono', ui-monospace, 'SFMono-Regular', monospace";

/** Accent for the app chrome (app bar, tabs). Tools never change it. */
export const APP_ACCENT = '#6366f1';

export interface ThemeRequest {
  mode: ThemeMode;
  accent: string;
  /** Replace the body font (e.g. a terminal-style tool going all-mono). */
  bodyFont?: string;
}

// Material 3-style neutral surfaces.
const NEUTRALS = {
  dark: {
    default: '#111318',
    paper: '#1a1c21',
    raised: '#23262c',
    divider: 'rgba(255, 255, 255, 0.1)',
    text: '#e3e3e8',
    muted: '#a0a2ab',
  },
  light: {
    default: '#f5f6fa',
    paper: '#ffffff',
    raised: '#ffffff',
    divider: 'rgba(0, 0, 0, 0.1)',
    text: '#1b1c20',
    muted: '#5d5f69',
  },
} as const;

declare module '@mui/material/styles' {
  interface TypeBackground {
    raised: string;
  }
}

function buildTheme({ mode, accent, bodyFont = BODY_FONT }: ThemeRequest): Theme {
  const n = NEUTRALS[mode];
  const isDark = mode === 'dark';
  const outline = isDark ? 'rgba(255,255,255,0.24)' : 'rgba(0,0,0,0.24)';

  return createTheme({
    palette: {
      mode,
      primary: { main: accent },
      background: { default: n.default, paper: n.paper, raised: n.raised },
      divider: n.divider,
      text: { primary: n.text, secondary: n.muted },
    },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: bodyFont,
      h4: { fontWeight: 600, letterSpacing: '-0.01em' },
      h5: { fontWeight: 600, letterSpacing: '-0.005em' },
      h6: { fontWeight: 600 },
      button: { fontWeight: 600, textTransform: 'none', letterSpacing: '0.01em' },
      overline: { fontWeight: 600, letterSpacing: '0.08em', fontSize: '0.7rem', lineHeight: 1.6 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { backgroundColor: n.default },
          'code, pre, kbd': { fontFamily: MONO_FONT },
        },
      },
      MuiPaper: {
        styleOverrides: { root: { backgroundImage: 'none' } },
      },
      MuiButton: {
        defaultProps: { variant: 'contained', disableElevation: true },
        styleOverrides: {
          root: { borderRadius: 999, paddingInline: 18 },
          sizeSmall: { paddingInline: 12 },
          sizeLarge: { paddingBlock: 10 },
          outlined: { borderColor: outline },
        },
      },
      MuiTextField: {
        defaultProps: { size: 'small', fullWidth: true },
      },
      MuiOutlinedInput: {
        styleOverrides: { root: { borderRadius: 8 } },
      },
      MuiSlider: {
        defaultProps: { size: 'small' },
      },
      MuiToggleButtonGroup: {
        styleOverrides: {
          grouped: {
            borderColor: outline,
            '&:first-of-type': { borderTopLeftRadius: 999, borderBottomLeftRadius: 999 },
            '&:last-of-type': { borderTopRightRadius: 999, borderBottomRightRadius: 999 },
          },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 600,
            fontSize: '0.8rem',
            paddingBlock: 6,
            color: n.text,
            '&.Mui-selected': {
              color: n.text,
              backgroundColor: alpha(accent, isDark ? 0.3 : 0.16),
              '&:hover': { backgroundColor: alpha(accent, isDark ? 0.36 : 0.22) },
            },
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: { textTransform: 'none', fontWeight: 600, minHeight: 48, letterSpacing: '0.01em' },
        },
      },
      MuiDialog: {
        styleOverrides: { paper: { borderRadius: 24 } },
      },
      MuiLinearProgress: {
        styleOverrides: { root: { borderRadius: 4, height: 6 } },
      },
    },
  });
}

const themeCache = new Map<string, Theme>();

export function getTheme(request: ThemeRequest): Theme {
  const key = `${request.mode}|${request.accent}|${request.bodyFont ?? ''}`;
  let theme = themeCache.get(key);
  if (!theme) {
    theme = buildTheme(request);
    themeCache.set(key, theme);
  }
  return theme;
}
