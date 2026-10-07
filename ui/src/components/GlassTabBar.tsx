import type { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_DOCK_GAP, TAB_DOCK_HEIGHT } from '../lib/navigation';
import { useTheme } from '../lib/theme';

function useReducedTransparency() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.matchMedia) {
      const preference = window.matchMedia('(prefers-reduced-transparency: reduce)');
      setReduced(preference.matches);
      const update = () => setReduced(preference.matches);
      preference.addEventListener('change', update);
      return () => preference.removeEventListener('change', update);
    }
    let active = true;
    void AccessibilityInfo.isReduceTransparencyEnabled().then((value) => {
      if (active) setReduced(value);
    }).catch(() => undefined);
    const listener = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduced);
    return () => { active = false; listener.remove(); };
  }, []);
  return reduced;
}

function GlassTabBarBackground({ isDark }: { isDark: boolean }) {
  const reduced = useReducedTransparency();
  const solid = isDark ? '#242426' : '#f9f9fb';

  return (
    <View
      pointerEvents="none"
      accessible={false}
      style={[
        styles.glass,
        { backgroundColor: reduced ? solid : isDark ? 'rgba(28,28,30,0.42)' : 'rgba(255,255,255,0.3)' },
      ]}
    >
      {!reduced && (
        <>
          <BlurView
            tint={isDark ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight'}
            intensity={80}
            {...(Platform.OS === 'android' ? { experimentalBlurMethod: 'dimezisBlurView' as const } : {})}
            style={StyleSheet.absoluteFill}
          />
          <LinearGradient
            colors={isDark
              ? ['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.02)', 'rgba(255,255,255,0.07)']
              : ['rgba(255,255,255,0.72)', 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0.4)']}
            locations={[0, 0.48, 1]}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </>
      )}
      <View style={[styles.rim, { borderColor: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.92)' }]} />
      <View style={[styles.innerRim, { borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(142,142,147,0.12)' }]} />
    </View>
  );
}

export function useGlassTabBarOptions(): BottomTabNavigationOptions {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const side = Math.max(16, (width - 480) / 2);

  return {
    headerShown: false,
    tabBarHideOnKeyboard: true,
    tabBarLabelPosition: 'below-icon',
    tabBarActiveTintColor: isDark ? '#64b5ff' : '#007aff',
    tabBarInactiveTintColor: isDark ? '#c7c7cc' : '#55555c',
    tabBarActiveBackgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(118,118,128,0.12)',
    tabBarBackground: () => <GlassTabBarBackground isDark={isDark} />,
    tabBarStyle: {
      position: 'absolute',
      left: side,
      right: side,
      bottom: insets.bottom + TAB_DOCK_GAP,
      height: TAB_DOCK_HEIGHT,
      paddingTop: 6,
      paddingBottom: 6,
      paddingHorizontal: 6,
      borderTopWidth: 0,
      borderRadius: TAB_DOCK_HEIGHT / 2,
      backgroundColor: 'transparent',
      shadowColor: '#161a25',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: isDark ? 0.32 : 0.14,
      shadowRadius: 20,
      elevation: 12,
    },
    tabBarItemStyle: {
      borderRadius: 30,
      marginHorizontal: 2,
      paddingTop: 5,
      paddingBottom: 5,
    },
    tabBarIconStyle: { marginBottom: 1 },
    tabBarLabelStyle: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '600',
      letterSpacing: 0,
    },
  };
}

const styles = StyleSheet.create({
  glass: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: TAB_DOCK_HEIGHT / 2,
    overflow: 'hidden',
  },
  rim: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: TAB_DOCK_HEIGHT / 2,
    borderWidth: 1,
  },
  innerRim: {
    position: 'absolute', top: 1, bottom: 1, left: 1, right: 1,
    borderRadius: TAB_DOCK_HEIGHT / 2 - 1,
    borderWidth: 0.5,
  },
});
