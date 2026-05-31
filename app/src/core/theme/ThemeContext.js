import React, { createContext, useContext, useMemo } from 'react';
import { FT, FTD } from '../../theme';
import { accentVariants } from '../../theme/accent';

const ThemeContext = createContext({ F: FT, dark: false });

// `accent` (PS-49) is an optional resolved hex. When present, it overrides the
// theme's `coral`/`coralD` accent at composition time — every consumer of
// `F.coral` (and `palette(F)`) inherits it. NULL → the default Flow coral.
export function ThemeProvider({ dark, accent, children }) {
  const value = useMemo(() => {
    const base = dark ? FTD : FT;
    if (!accent) return { F: base, dark: !!dark };
    const { coral, coralD } = accentVariants(accent, !!dark);
    return { F: { ...base, coral, coralD }, dark: !!dark };
  }, [dark, accent]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
