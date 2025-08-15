// theme.d.ts
export {};

declare module '@mui/material/styles' {
  interface TypeBackground {
    paperLight: string;
  }

  interface Palette {
    pageBkColor: string;
    asideBkColor: string;
    asideTextColor: string;
    asideSecondaryColor: string;
    appTextColor: string;
    helperTextColor: string;
    modeComplementColor: string;
    borderColor: string;
  }
  interface PaletteOptions {
    pageBkColor?: string;
    asideBkColor?: string;
    asideTextColor?: string;
    asideSecondaryColor?: string;
    appTextColor?: string;
    helperTextColor?: string;
    modeComplementColor?: string;
    borderColor?: string;
  }
}
