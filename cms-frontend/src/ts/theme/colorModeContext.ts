import { createContext, useContext } from 'react';
import type { ColorModeContextValue } from '@ts/types/constants';

export const ColorModeContext = createContext<ColorModeContextValue>({
  mode: 'light',
  toggleColorMode: () => {},
});

export const useColorMode = () => useContext(ColorModeContext);
