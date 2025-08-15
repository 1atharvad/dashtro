export const getDesignTokens = (mode: 'light' | 'dark') => ({
  palette: {
    mode,
    ...(mode === 'light'
      ? {
          background: {
            default: '#f5f5f5',
            paper: '#fff',
            paperLight: '#fff',
          },
          pageBkColor: '#fff2e0',
          asideBkColor: '#ead8a4',
          asideTextColor: '#212529',
          appTextColor: '#0a4641',
          helperTextColor: 'rgba(0, 0, 0, 0.6)',
          modeComplementColor: '0, 0, 0',
          borderColor: '0, 0, 0'
        }
      : {
          background: {
            default: '#2f3136',
            paper: '#0d1117',
            paperLight: '#1e2022',
          },
          pageBkColor: '#2f3136',
          asideBkColor: '#1e1e2e',
          asideTextColor: '#e1e1e6',
          asideSecondaryColor: '#cccccc',
          appTextColor: '#666666',
          helperTextColor: 'rgba(255, 255, 255, 0.6)',
          modeComplementColor: '255, 255, 255',
          borderColor: '255, 255, 255'
        }),
  },
  typography: {
    fontFamily: `'Raleway', 'Roboto', 'Arial', sans-serif`,
    fontWeightMedium: 700,
  },
});