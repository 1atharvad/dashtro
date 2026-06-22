// ThemeProvider.tsx
import { ThemeProvider, CssBaseline } from '@mui/material';
import { createTheme } from '@mui/material/styles';
import { getDesignTokens } from './theme';
import { useMemo, useState, createContext, useContext, ReactNode } from 'react';

interface ColorModeContextValue {
  mode: 'light' | 'dark';
  toggleColorMode: () => void;
}

const ColorModeContext = createContext<ColorModeContextValue>({
  mode: 'light',
  toggleColorMode: () => {},
});

export const useColorMode = () => useContext(ColorModeContext);

export const CustomThemeProvider = ({ children }: { children: ReactNode }) => {
  const [mode, setMode] = useState<'light' | 'dark'>(() => {
    const storedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialMode = (storedTheme as 'light' | 'dark') || (prefersDark ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', initialMode === 'dark');
    return initialMode;
  });

  const colorMode = useMemo<ColorModeContextValue>(() => ({
    mode,
    toggleColorMode: () => {
      setMode(prev => {
        const newMode = prev === 'light' ? 'dark' : 'light';
        localStorage.setItem('theme', newMode);
        document.documentElement.classList.toggle('dark', newMode === 'dark');
        return newMode;
      });
    },
  }), [mode]);

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
