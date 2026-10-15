import React from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { radii, spacing, typography, useTheme } from '../lib/theme';

interface RatingButtonsProps {
  onRate: (quality: number) => void;
  disabled?: boolean;
}

const RATINGS = [
  { quality: 1, label: 'Again', sublabel: 'Forgot' },
  { quality: 3, label: 'Hard', sublabel: 'With effort' },
  { quality: 4, label: 'Good', sublabel: 'Remembered' },
  { quality: 5, label: 'Easy', sublabel: 'Right away' },
] as const;

export function RatingButtons({ onRate, disabled }: RatingButtonsProps) {
  const theme = useTheme();
  const compact = useWindowDimensions().width < 540;

  return (
    <View style={styles.container}>
      {RATINGS.map(({ quality, label, sublabel }) => (
        <Pressable
          key={quality}
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={() => onRate(quality)}
          disabled={disabled}
          style={({ pressed }) => [
            styles.button,
            compact && styles.compactButton,
            {
              backgroundColor: pressed
                ? theme.colors.surfaceStrong
                : theme.colors.surfaceCard,
              borderColor: theme.colors.hairline,
              opacity: disabled ? 0.5 : 1,
            },
          ]}
        >
          <Text style={[typography.bodyStrong, { color: theme.colors.ink }]}>
            {label}
          </Text>
          <Text
            style={[
              typography.caption,
              { color: theme.colors.mutedSoft, marginTop: 2, textAlign: 'center' },
            ]}
          >
            {sublabel}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  compactButton: { flexBasis: '44%' },
  button: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
});
