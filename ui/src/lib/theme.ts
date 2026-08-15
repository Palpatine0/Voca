import { useColorScheme } from 'react-native';
import { Platform } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';

export type ThemeName = 'light' | 'dark';

export interface Palette {
  bg: string;
  bgElevated: string;
  surface: string;
  border: string;
  text: string;
  textMuted: string;
  textDisabled: string;
  textOnAccent: string;
  accent: string;
  accentPressed: string;
  accentSoft: string;
  danger: string;
  dangerDark: string;
  shadow: string;
  success: string;
  warning: string;
}

const RAUSCH = '#ff385c';
const DEEP_RAUSCH = '#e00b41';
const NEAR_BLACK = '#222222';

const lightPalette: Palette = {
  bg: '#ffffff',
  bgElevated: '#ffffff',
  surface: '#f2f2f2',
  border: '#c1c1c1',
  text: NEAR_BLACK,
  textMuted: '#6a6a6a',
  textDisabled: 'rgba(0,0,0,0.24)',
  textOnAccent: '#ffffff',
  accent: RAUSCH,
  accentPressed: DEEP_RAUSCH,
  accentSoft: 'rgba(255, 56, 92, 0.10)',
  danger: '#c13515',
  dangerDark: '#b32505',
  shadow: '#000000',
  success: '#2b8a3e',
  warning: '#b86b00',
};

const darkPalette: Palette = {
  bg: '#121212',
  bgElevated: '#1a1a1a',
  surface: '#2a2a2a',
  border: '#3a3a3a',
  text: '#f2f2f2',
  textMuted: '#a3a3a3',
  textDisabled: 'rgba(255,255,255,0.28)',
  textOnAccent: '#ffffff',
  accent: RAUSCH,
  accentPressed: DEEP_RAUSCH,
  accentSoft: 'rgba(255, 56, 92, 0.22)',
  danger: '#ff6b5c',
  dangerDark: '#e85d4f',
  shadow: '#000000',
  success: '#4caf77',
  warning: '#e0a42e',
};

export const radii = {
  sm: 8,
  badge: 14,
  card: 20,
  large: 32,
  pill: 999,
} as const;

export const typography = {
  sectionHeading: {
    fontSize: 28,
    fontWeight: '700' as const,
    lineHeight: 40,
    letterSpacing: 0,
  },
  navTitle: {
    fontSize: 20,
    fontWeight: '600' as const,
    lineHeight: 24,
    letterSpacing: -0.18,
  },
  cardHeading: {
    fontSize: 22,
    fontWeight: '600' as const,
    lineHeight: 26,
    letterSpacing: -0.44,
  },
  body: {
    fontSize: 14,
    fontWeight: '400' as const,
    lineHeight: 20,
  },
  bodyMedium: {
    fontSize: 14,
    fontWeight: '500' as const,
    lineHeight: 18,
  },
  ui: {
    fontSize: 16,
    fontWeight: '500' as const,
    lineHeight: 20,
  },
  uiSemibold: {
    fontSize: 16,
    fontWeight: '600' as const,
    lineHeight: 20,
  },
  caption: {
    fontSize: 13,
    fontWeight: '400' as const,
    lineHeight: 16,
  },
} satisfies Record<string, TextStyle>;

export function cardElevation(isDark: boolean): ViewStyle {
  return (
    Platform.select<ViewStyle>({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: isDark ? 0.32 : 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: isDark ? 6 : 4,
      },
      default: {},
    }) ?? {}
  );
}

export function useTheme(): {
  name: ThemeName;
  colors: Palette;
  isDark: boolean;
  elevation: { card: ViewStyle };
} {
  const system = useColorScheme();
  const resolved: ThemeName = system === 'dark' ? 'dark' : 'light';
  const isDark = resolved === 'dark';
  const colors = isDark ? darkPalette : lightPalette;
  return {
    name: resolved,
    colors,
    isDark,
    elevation: { card: cardElevation(isDark) },
  };
}
