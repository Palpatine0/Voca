import { Image } from 'expo-image';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { PronunciationButton } from './PronunciationButton';
import { Word } from '../lib/api';
import { radii, spacing, typography, useTheme } from '../lib/theme';

interface FlashCardProps {
  word: Word;
}

export function FlashCard({ word }: FlashCardProps) {
  const theme = useTheme();
  const [flipped, setFlipped] = useState(false);
  const rotation = useSharedValue(0);

  const flipCard = () => {
    const toValue = flipped ? 0 : 1;
    rotation.value = withTiming(toValue, { duration: 400 });
    setFlipped(!flipped);
  };

  const frontStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1200 },
      { rotateY: `${interpolate(rotation.value, [0, 1], [0, 180])}deg` },
    ],
    backfaceVisibility: 'hidden' as const,
  }));

  const backStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1200 },
      { rotateY: `${interpolate(rotation.value, [0, 1], [180, 360])}deg` },
    ],
    backfaceVisibility: 'hidden' as const,
  }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={flipped ? 'Show word' : 'Reveal definition'}
      onPress={flipCard}
      style={styles.wrapper}
    >
      {/* Front */}
      <Animated.View
        style={[
          styles.card,
          frontStyle,
          {
            backgroundColor: theme.colors.surfaceCard,
            borderColor: theme.colors.hairline,
          },
          theme.elevation.card,
        ]}
      >
        <Text style={[typography.captionUppercase, { color: theme.colors.mutedSoft }]}>
          TERM
        </Text>
        <Text
          style={[
            typography.displayLg,
            { color: theme.colors.ink, marginTop: spacing.md },
          ]}
        >
          {word.term}
        </Text>
        {word.pronunciation_url && (
          <PronunciationButton
            userId={word.user_id}
            wordId={word.id}
            audioUrl={word.pronunciation_url}
          />
        )}
        <Text
          style={[
            typography.caption,
            { color: theme.colors.mutedSoft, marginTop: spacing.xl },
          ]}
        >
          Tap to reveal
        </Text>
      </Animated.View>

      {/* Back */}
      <Animated.View
        style={[
          styles.card,
          styles.cardBack,
          backStyle,
          {
            backgroundColor: theme.colors.surfaceCard,
            borderColor: theme.colors.hairline,
          },
          theme.elevation.card,
        ]}
      >
        <Text style={[typography.captionUppercase, { color: theme.colors.mutedSoft }]}>
          DEFINITION
        </Text>
        <Text
          style={[
            typography.titleMd,
            { color: theme.colors.ink, marginTop: spacing.md },
          ]}
        >
          {word.definition || 'No definition yet'}
        </Text>
        {word.image_url && (
          <Image
            source={word.image_url}
            cachePolicy="memory"
            contentFit="cover"
            style={styles.imagePreview}
            accessibilityLabel={`Illustration for ${word.term}`}
          />
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    maxWidth: 360,
    aspectRatio: 3 / 4,
    maxHeight: 420,
  },
  card: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radii.xxl,
    borderWidth: 1,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBack: {
    position: 'absolute',
  },
  imagePreview: {
    marginTop: spacing.lg,
    width: '100%',
    height: 120,
    borderRadius: radii.lg,
  },
});
