export const getDesignTokens = (mode: 'light' | 'dark') => ({
  palette: {
    mode,
    ...(mode === 'light'
      ? {
          background: {
            default: '#f4f7f6',
            paper: '#ffffff',
            paperLight: '#ffffff',
          },
          pageBkColor: '#dbdbdb',
          asideBkColor: '#0f3d38',
          asideTextColor: '#e8f5f3',
          appTextColor: '#1c2b29',
          helperTextColor: 'rgba(0, 0, 0, 0.5)',
          modeComplementColor: '0, 0, 0',
          borderColor: '28, 43, 41',
          // MUI's own defaults (secondary rgba(0,0,0,.6) ~5.7:1, disabled
          // rgba(0,0,0,.38) ~2.9:1) are tuned for a white surface but read as
          // washed out — the same opacity values look fine in dark mode only
          // because fading white toward black degrades contrast far slower
          // than fading black toward white. Explicit, better-balanced values
          // for light only; dark keeps MUI's defaults, which are already fine.
          text: {
            primary: '#212121',
            secondary: '#4f4f4f',        // ~7.4:1 — matches --cms-text-muted
            disabled: 'rgba(0, 0, 0, 0.66)', // ~7.2:1
          },
          // MUI's automatic contrastText picker put white on these — actually
          // ~3:1, failing WCAG. augmentColor() needs `main` restated (it
          // can't derive light/dark/contrastText from contrastText alone) —
          // these are MUI's own default light-mode main values, unchanged.
          warning: { main: '#ed6c02', contrastText: '#000000' },
          info: { main: '#0288d1', contrastText: '#000000' },
          error: { main: '#b00020' },
        }
      : {
          background: {
            default: '#121212',
            paper: '#212121',
            paperLight: '#2a2a2a',
          },
          pageBkColor: '#121212',
          asideBkColor: '#1a1a1a',
          asideTextColor: '#e6edf3',
          asideSecondaryColor: '#8b949e',
          appTextColor: '#8b949e',
          helperTextColor: 'rgba(255, 255, 255, 0.5)',
          modeComplementColor: '255, 255, 255',
          borderColor: '255, 255, 255',
          // Same fix as light mode — worse here, since dark mode's warning/
          // info tints are lighter (meant to pop against a dark bg), which
          // makes white text on them even less readable (~2:1). These are
          // MUI's own default dark-mode main values, unchanged.
          warning: { main: '#ffa726', contrastText: '#000000' },
          info: { main: '#29b6f6', contrastText: '#000000' },
        }),
  },
  typography: {
    fontFamily: `'Raleway', 'Roboto', 'Arial', sans-serif`,
    fontWeightMedium: 700,
  },
  components: {
    MuiDialog: {
      defaultProps: {
        TransitionProps: {
          onEnter: () => { (document.activeElement as HTMLElement)?.blur?.(); },
        },
      },
    },
    // MUI's own Avatar default (no src, e.g. initials) falls back to a pale
    // grey with white text — under ~2:1 contrast in light mode. --cms-chrome
    // / --cms-chrome-text are identical in both themes (the brand teal chrome
    // color), so this is one fixed, always-compliant style, not a per-mode one.
    MuiAvatar: {
      styleOverrides: {
        root: {
          backgroundColor: 'var(--cms-chrome)',
          color: 'var(--cms-chrome-text)',
        },
      },
    },
  },
});