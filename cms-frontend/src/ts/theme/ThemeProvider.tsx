// ThemeProvider.tsx
import { ThemeProvider, CssBaseline } from '@mui/material';
import { createTheme } from '@mui/material/styles';
import { getDesignTokens } from './theme';
import { useMemo, useState, createContext, useContext, ReactNode } from 'react';

const ColorModeContext = createContext({ toggleColorMode: () => {} });

export const useColorMode = () => useContext(ColorModeContext);

export const CustomThemeProvider = ({ children }: { children: ReactNode }) => {
  const [mode, setMode] = useState<'light' | 'dark'>(() => {
    const storedTheme = localStorage.getItem('theme');
    if (storedTheme) return (storedTheme as 'light' | 'dark') || 'light';

    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    return prefersDark ? 'dark' : 'light';
  });

  const colorMode = {
    toggleColorMode: () => {
      setMode(prev => {
        const newMode = prev === 'light' ? 'dark' : 'light';
        localStorage.setItem('theme', newMode);
        return newMode;
      });
    },
  };

  const theme = useMemo(() => createTheme(getDesignTokens(mode)), [mode]);

  return (
    <ColorModeContext.Provider value={colorMode}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
};
