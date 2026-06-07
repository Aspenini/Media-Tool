import { createTheme, type Theme, type ThemeOptions } from '@mui/material/styles';

export type ThemeMode = 'light' | 'dark';

const sharedTypography: ThemeOptions['typography'] = {
  fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif",
  h1: { fontWeight: 700, letterSpacing: '-0.02em' },
  h2: { fontWeight: 700, letterSpacing: '-0.01em' },
  h3: { fontWeight: 600 },
  h4: { fontWeight: 600 },
  h5: { fontWeight: 600 },
  h6: { fontWeight: 600 },
  button: { fontWeight: 600, textTransform: 'none' },
};

const MONO = "'JetBrains Mono', ui-monospace, monospace";

function buildTheme(mode: ThemeMode): Theme {
  const isDark = mode === 'dark';

  return createTheme({
    cssVariables: true,
    palette: {
      mode,
      primary: { main: '#6366f1' },
      secondary: { main: '#22d3ee' },
      ...(isDark
        ? {
            background: { default: '#0c1222', paper: '#131c30' },
            divider: 'rgba(148, 163, 184, 0.16)',
            text: { primary: '#f8fafc', secondary: '#94a3b8' },
          }
        : {
            background: { default: '#f1f5f9', paper: '#ffffff' },
            divider: 'rgba(15, 23, 42, 0.12)',
            text: { primary: '#0f172a', secondary: '#475569' },
          }),
    },
    shape: { borderRadius: 14 },
    typography: sharedTypography,
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          'code, pre, textarea.mono': { fontFamily: MONO },
          '::-webkit-scrollbar': { width: 10, height: 10 },
          '::-webkit-scrollbar-thumb': {
            backgroundColor: isDark ? 'rgba(148,163,184,0.3)' : 'rgba(15,23,42,0.2)',
            borderRadius: 8,
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: 'none' },
        },
      },
      MuiButton: {
        defaultProps: { variant: 'contained', disableElevation: true },
        styleOverrides: { root: { borderRadius: 10 } },
      },
      MuiTab: {
        styleOverrides: {
          root: { minHeight: 56, fontWeight: 600, textTransform: 'none' },
        },
      },
    },
  });
}

const themeCache = new Map<ThemeMode, Theme>();

export function getTheme(mode: ThemeMode): Theme {
  let theme = themeCache.get(mode);
  if (!theme) {
    theme = buildTheme(mode);
    themeCache.set(mode, theme);
  }
  return theme;
}

export const MONO_FONT = MONO;
