import React, { createContext, useContext, useMemo } from 'react';
import { FT, FTD } from '../../theme';

const ThemeContext = createContext({ F: FT, dark: false });

export function ThemeProvider({ dark, children }) {
  const value = useMemo(() => ({ F: dark ? FTD : FT, dark: !!dark }), [dark]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
