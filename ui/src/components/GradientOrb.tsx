import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../lib/theme';

type OrbVariant = 'mint' | 'peach' | 'lavender' | 'sky' | 'rose';

interface GradientOrbProps {
  variant?: OrbVariant;
  size?: number;
  style?: object;
}

const ORB_COLORS: Record<OrbVariant, [string, string]> = {
  mint: [colors.gradientMint, '#f5f5f500'],
  peach: [colors.gradientPeach, '#f5f5f500'],
  lavender: [colors.gradientLavender, '#f5f5f500'],
  sky: [colors.gradientSky, '#f5f5f500'],
  rose: [colors.gradientRose, '#f5f5f500'],
};

export function GradientOrb({ variant = 'mint', size = 200, style }: GradientOrbProps) {
  const gradientColors = ORB_COLORS[variant];

  return (
    <View
      style={[
        styles.container,
        { width: size, height: size, borderRadius: size / 2 },
        style,
      ]}
    >
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0.2, y: 0.2 }}
        end={{ x: 0.8, y: 0.8 }}
        style={[styles.gradient, { borderRadius: size / 2 }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    opacity: 0.6,
  },
  gradient: {
    flex: 1,
  },
});
