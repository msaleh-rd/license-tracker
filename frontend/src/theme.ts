import { createTheme, type PaletteMode } from '@mui/material/styles';

const darkPalette = {
  primary: { main: '#7dd3fc' },
  secondary: { main: '#f59e0b' },
  success: { main: '#34d399' },
  warning: { main: '#fb923c' },
  error: { main: '#f87171' },
  background: {
    default: '#07111f',
    paper: 'rgba(10, 18, 32, 0.85)',
  },
  text: {
    primary: '#f8fafc',
    secondary: '#94a3b8',
  },
};

const lightPalette = {
  primary: { main: '#0ea5e9' },
  secondary: { main: '#f59e0b' },
  success: { main: '#22c55e' },
  warning: { main: '#f97316' },
  error: { main: '#ef4444' },
  background: {
    default: '#f8fafc',
    paper: '#ffffff',
  },
  text: {
    primary: '#0f172a',
    secondary: '#64748b',
  },
};

export function createAppTheme(mode: PaletteMode = 'dark') {
  const palette = mode === 'dark' ? darkPalette : lightPalette;

  return createTheme({
    palette: {
      mode,
      ...palette,
    } as any,
    typography: {
      fontFamily: '"Manrope", "Segoe UI", sans-serif',
      h1: { fontWeight: 800 },
      h2: { fontWeight: 800 },
      h3: { fontWeight: 700 },
      h4: { fontWeight: 700 },
      button: { textTransform: 'none', fontWeight: 700 },
    },
    shape: { borderRadius: 18 },
    components: {
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            ...(mode === 'dark'
              ? {
                  backdropFilter: 'blur(18px)',
                  borderBottom: '1px solid rgba(148, 163, 184, 0.12)',
                }
              : {
                  borderBottom: '1px solid rgba(226, 232, 240, 0.6)',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                }),
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            ...(mode === 'dark'
              ? {
                  backdropFilter: 'blur(18px)',
                  border: '1px solid rgba(148, 163, 184, 0.15)',
                  boxShadow: '0 16px 60px rgba(2, 6, 23, 0.45)',
                }
              : {
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                  border: '1px solid rgba(226, 232, 240, 0.6)',
                }),
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            borderRadius: 999,
            paddingInline: 18,
          },
          outlined: {
            ...(mode === 'dark'
              ? {}
              : {
                  borderColor: 'rgba(148, 163, 184, 0.3)',
                  '&:hover': {
                    borderColor: 'rgba(148, 163, 184, 0.5)',
                    backgroundColor: 'rgba(148, 163, 184, 0.05)',
                  },
                }),
          },
        },
      },
      MuiTextField: {
        defaultProps: { variant: 'filled' },
      },
      MuiFilledInput: {
        styleOverrides: {
          root: {
            borderRadius: 14,
            overflow: 'hidden',
            ...(mode === 'dark'
              ? {
                  backgroundColor: 'rgba(15, 23, 42, 0.8)',
                  '&:hover': {
                    backgroundColor: 'rgba(15, 23, 42, 0.95)',
                  },
                }
              : {
                  backgroundColor: 'rgba(226, 232, 240, 0.3)',
                  '&:hover': {
                    backgroundColor: 'rgba(226, 232, 240, 0.5)',
                  },
                }),
          },
          input: {
            paddingTop: 22,
            paddingBottom: 10,
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            fontWeight: 700,
          },
          filled: {
            ...(mode === 'dark'
              ? {}
              : {
                  backgroundColor: 'rgba(148, 163, 184, 0.12)',
                }),
          },
        },
      },
    },
  });
};

export const getThemeColors = (mode: PaletteMode) => ({
  // Card tone backgrounds and text colors with WCAG AA contrast
  cardTones: {
    neutral: mode === 'dark'
      ? { bg: 'rgba(59, 130, 246, 0.16)', fg: '#bfdbfe' }
      : { bg: 'rgba(59, 130, 246, 0.12)', fg: '#1e40af' },
    danger: mode === 'dark'
      ? { bg: 'rgba(239, 68, 68, 0.16)', fg: '#fecaca' }
      : { bg: 'rgba(239, 68, 68, 0.12)', fg: '#991b1b' },
    warning: mode === 'dark'
      ? { bg: 'rgba(245, 158, 11, 0.16)', fg: '#fde68a' }
      : { bg: 'rgba(245, 158, 11, 0.12)', fg: '#92400e' },
    success: mode === 'dark'
      ? { bg: 'rgba(34, 197, 94, 0.16)', fg: '#bbf7d0' }
      : { bg: 'rgba(34, 197, 94, 0.12)', fg: '#15803d' },
    info: mode === 'dark'
      ? { bg: 'rgba(14, 165, 233, 0.16)', fg: '#bae6fd' }
      : { bg: 'rgba(14, 165, 233, 0.12)', fg: '#0c4a6e' },
  },

  // Status badge colors with proper contrast
  statusColors: {
    'Expired': mode === 'dark' ? '#f87171' : '#dc2626',
    'Urgent': mode === 'dark' ? '#fb923c' : '#ea580c',
    'Review': mode === 'dark' ? '#fbbf24' : '#ca8a04',
    'Missing Expiry Info': mode === 'dark' ? '#facc15' : '#a16207',
    'Active': mode === 'dark' ? '#34d399' : '#059669',
  },

  // Component backgrounds
  componentBg: mode === 'dark'
    ? 'rgba(15, 23, 42, 0.65)'
    : 'rgba(226, 232, 240, 0.4)',

  componentBgDark: mode === 'dark'
    ? 'rgba(15, 23, 42, 0.7)'
    : 'rgba(226, 232, 240, 0.5)',

  // Gradient backgrounds
  gradientBg: mode === 'dark'
    ? 'linear-gradient(135deg, rgba(12, 18, 35, 0.95), rgba(14, 50, 76, 0.8))'
    : 'linear-gradient(135deg, rgba(226, 232, 240, 0.6), rgba(203, 213, 225, 0.5))',

  // Heatmap colors
  heatmapPrimary: mode === 'dark'
    ? '#7dd3fc'
    : '#0ea5e9',

  // Recharts tooltip
  tooltipBg: mode === 'dark'
    ? 'rgba(255, 255, 255, 0.95)'
    : 'rgba(255, 255, 255, 0.95)',
  tooltipBorder: mode === 'dark'
    ? 'rgba(148, 163, 184, 0.25)'
    : 'rgba(226, 232, 240, 0.5)',
  tooltipText: mode === 'dark'
    ? '#000000'
    : '#0f172a',
});

export const PALETTE = [
  '#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4',
  '#42d4f4', '#f032e6', '#bfef45', '#fabed4', '#469990',
  '#dcbeff', '#9a6324', '#fffac8', '#800000', '#aaffc3',
  '#808000', '#ffd8b1', '#000075', '#a9a9a9', '#ffe119'
];
export const PALETTE_LIGHT = [
  '#b71540', '#1e8449', '#1a237e', '#c0392b', '#6c3483',
  '#117a8b', '#8e24aa', '#6b8e23', '#c0392b', '#1a5276',
  '#7d3c98', '#6e2c00', '#b7950b', '#641e16', '#196f3d',
  '#556b2f', '#af601a', '#1b2631', '#5d6d7e', '#b7950b'
];
export const theme = createAppTheme('dark');