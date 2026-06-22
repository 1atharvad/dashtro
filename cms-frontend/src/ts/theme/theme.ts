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
          borderColor: '28, 43, 41'
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
          borderColor: '255, 255, 255'
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
  },
});