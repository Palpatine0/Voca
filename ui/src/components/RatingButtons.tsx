import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radii, spacing, typography, useTheme } from '../lib/theme';

interface RatingButtonsProps {
  onRate: (quality: number) => void;
  disabled?: boolean;
}

const RATINGS = [
  { quality: 1, label: 'Again', sublabel: '< 1 day' },
  { quality: 3, label: 'Hard', sublabel: '1 day' },
  { quality: 4, label: 'Good', sublabel: 'Scheduled' },
  { quality: 5, label: 'Easy', sublabel: 'Long' },
] as const;

export function RatingButtons({ onRate, disabled }: RatingButtonsProps) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      {RATINGS.map(({ quality, label, sublabel }) => (
        <Pressable
          key={quality}
          onPress={() => onRate(quality)}
          disabled={disabled}
          style={({ pressed }) => [
            styles.button,
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
              { color: theme.colors.mutedSoft, marginTop: 2 },
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
    gap: spacing.xs,
  },
  button: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
});
