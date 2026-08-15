import { Platform, useColorScheme } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';

export type ThemeName = 'light' | 'dark';

// ---------------------------------------------------------------------------
// Colors — ElevenLabs editorial palette from DESIGN.md
// ---------------------------------------------------------------------------

export const colors = {
  primary: '#292524',
  primaryActive: '#0c0a09',
  ink: '#0c0a09',
  body: '#4e4e4e',
  bodyStrong: '#292524',
  muted: '#777169',
  mutedSoft: '#a8a29e',

  hairline: '#e7e5e4',
  hairlineSoft: '#f0efed',
  hairlineStrong: '#d6d3d1',

  canvas: '#f5f5f5',
  canvasSoft: '#fafafa',
  canvasDeep: '#0c0a09',
  surfaceCard: '#ffffff',
  surfaceStrong: '#f0efed',
  surfaceDark: '#0c0a09',
  surfaceDarkElevated: '#1c1917',

  onPrimary: '#ffffff',
  onDark: '#ffffff',
  onDarkSoft: '#a8a29e',

  gradientMint: '#a7e5d3',
  gradientPeach: '#f4c5a8',
  gradientLavender: '#c8b8e0',
  gradientSky: '#a8c8e8',
  gradientRose: '#e8b8c4',

  semanticError: '#dc2626',
  semanticSuccess: '#16a34a',
} as const;

// Dark palette: inverted canvas with retained brand gradients
export const colorsDark = {
  primary: '#ffffff',
  primaryActive: '#e7e5e4',
  ink: '#f5f5f5',
  body: '#a8a29e',
  bodyStrong: '#e7e5e4',
  muted: '#777169',
  mutedSoft: '#57534e',

  hairline: '#292524',
  hairlineSoft: '#1c1917',
  hairlineStrong: '#44403c',

  canvas: '#0c0a09',
  canvasSoft: '#1c1917',
  canvasDeep: '#0c0a09',
  surfaceCard: '#1c1917',
  surfaceStrong: '#292524',
  surfaceDark: '#0c0a09',
  surfaceDarkElevated: '#292524',

  onPrimary: '#0c0a09',
  onDark: '#ffffff',
  onDarkSoft: '#a8a29e',

  gradientMint: '#a7e5d3',
  gradientPeach: '#f4c5a8',
  gradientLavender: '#c8b8e0',
  gradientSky: '#a8c8e8',
  gradientRose: '#e8b8c4',

  semanticError: '#ef4444',
  semanticSuccess: '#22c55e',
} as const;

export type ColorTokens = {
  [K in keyof typeof colors]: string;
};

// ---------------------------------------------------------------------------
// Typography — Waldenburg substitute (EB Garamond 300) + Inter
// ---------------------------------------------------------------------------

export const fontFamily = {
  serif: 'EBGaramond_400Regular',
  sans: 'Inter_400Regular',
  sansMedium: 'Inter_500Medium',
  sansSemiBold: 'Inter_600SemiBold',
} as const;

export const typography = {
  displayXl: {
    fontFamily: fontFamily.serif,
    fontSize: 48,
    fontWeight: '300' as const,
    lineHeight: 52,
    letterSpacing: -0.96,
  },
  displayLg: {
    fontFamily: fontFamily.serif,
    fontSize: 36,
    fontWeight: '300' as const,
    lineHeight: 42,
    letterSpacing: -0.36,
  },
  displayMd: {
    fontFamily: fontFamily.serif,
    fontSize: 32,
    fontWeight: '300' as const,
    lineHeight: 36,
    letterSpacing: -0.32,
  },
  displaySm: {
    fontFamily: fontFamily.serif,
    fontSize: 24,
    fontWeight: '300' as const,
    lineHeight: 29,
    letterSpacing: 0,
  },
  titleMd: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 20,
    fontWeight: '500' as const,
    lineHeight: 27,
    letterSpacing: 0,
  },
  titleSm: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 18,
    fontWeight: '500' as const,
    lineHeight: 26,
    letterSpacing: 0.18,
  },
  bodyMd: {
    fontFamily: fontFamily.sans,
    fontSize: 16,
    fontWeight: '400' as const,
    lineHeight: 24,
    letterSpacing: 0.16,
  },
  bodyStrong: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 16,
    fontWeight: '500' as const,
    lineHeight: 24,
    letterSpacing: 0.16,
  },
  bodySm: {
    fontFamily: fontFamily.sans,
    fontSize: 15,
    fontWeight: '400' as const,
    lineHeight: 22,
    letterSpacing: 0.15,
  },
  caption: {
    fontFamily: fontFamily.sans,
    fontSize: 14,
    fontWeight: '400' as const,
    lineHeight: 21,
    letterSpacing: 0,
  },
  captionUppercase: {
    fontFamily: fontFamily.sansSemiBold,
    fontSize: 12,
    fontWeight: '600' as const,
    lineHeight: 17,
    letterSpacing: 0.96,
    textTransform: 'uppercase' as const,
  },
  button: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 15,
    fontWeight: '500' as const,
    lineHeight: 15,
    letterSpacing: 0,
  },
  navLink: {
    fontFamily: fontFamily.sansMedium,
    fontSize: 15,
    fontWeight: '500' as const,
    lineHeight: 21,
    letterSpacing: 0,
  },
} satisfies Record<string, TextStyle>;

// ---------------------------------------------------------------------------
// Spacing — 4px base unit
// ---------------------------------------------------------------------------

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  base: 16,
  md: 20,
  lg: 24,
  xl: 32,
  xxl: 48,
  section: 96,
} as const;

// ---------------------------------------------------------------------------
// Border Radius
// ---------------------------------------------------------------------------

export const radii = {
  none: 0,
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 24,
  pill: 9999,
  full: 9999,
} as const;

// ---------------------------------------------------------------------------
// Elevation
// ---------------------------------------------------------------------------

export function cardElevation(isDark: boolean): ViewStyle {
  return (
    Platform.select<ViewStyle>({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: isDark ? 0.32 : 0.04,
        shadowRadius: 16,
      },
      android: {
        elevation: isDark ? 8 : 4,
      },
      default: {},
    }) ?? {}
  );
}

// ---------------------------------------------------------------------------
// Theme hook
// ---------------------------------------------------------------------------

export interface Theme {
  name: ThemeName;
  colors: ColorTokens;
  isDark: boolean;
  elevation: { card: ViewStyle };
}

export function useTheme(): Theme {
  const system = useColorScheme();
  const resolved: ThemeName = system === 'dark' ? 'dark' : 'light';
  const isDark = resolved === 'dark';
  const palette = isDark ? colorsDark : colors;
  return {
    name: resolved,
    colors: palette,
    isDark,
    elevation: { card: cardElevation(isDark) },
  };
}
