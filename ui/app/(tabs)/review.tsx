import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashCard } from '../../src/components/FlashCard';
import { GradientOrb } from '../../src/components/GradientOrb';
import { RatingButtons } from '../../src/components/RatingButtons';
import { api, Word } from '../../src/lib/api';
import { radii, spacing, typography, useTheme } from '../../src/lib/theme';

export default function ReviewScreen() {
  const theme = useTheme();
  const [words, setWords] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const fetchDue = useCallback(async () => {
    try {
      const { words: due } = await api.getDueWords();
      setWords(due);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDue();
  }, [fetchDue]);

  const handleRate = async (quality: number) => {
    const word = words[currentIndex];
    if (!word || submitting) return;

    setSubmitting(true);
    try {
      await api.submitReview(word.id, quality);
    } catch {}
    setSubmitting(false);

    if (currentIndex < words.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      setWords([]);
    }
  };

  const currentWord = words[currentIndex];
  const isComplete = !loading && (words.length === 0 || !currentWord);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.canvas }]}>
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (isComplete) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.canvas }]}>
        <View style={styles.center}>
          <GradientOrb variant="lavender" size={160} style={{ marginBottom: spacing.xl }} />
          <Text style={[typography.displaySm, { color: theme.colors.ink }]}>
            All done!
          </Text>
          <Text
            style={[
              typography.bodyMd,
              { color: theme.colors.muted, marginTop: spacing.xs, textAlign: 'center' },
            ]}
          >
            You've reviewed all words due today.{'\n'}Come back tomorrow.
          </Text>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.backButton,
              {
                backgroundColor: pressed
                  ? theme.colors.primaryActive
                  : theme.colors.primary,
              },
            ]}
          >
            <Text style={[typography.button, { color: theme.colors.onPrimary }]}>
              Back to Home
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.canvas }]}>
      <View style={styles.container}>
        {/* Progress */}
        <View style={styles.progressRow}>
          <Pressable onPress={() => router.back()}>
            <Text style={[typography.bodyStrong, { color: theme.colors.ink }]}>
              ← Back
            </Text>
          </Pressable>
          <Text style={[typography.caption, { color: theme.colors.muted }]}>
            {currentIndex + 1} / {words.length}
          </Text>
        </View>

        {/* Card */}
        <View style={styles.cardArea}>
          <FlashCard word={currentWord} />
        </View>

        {/* Rating buttons */}
        <View style={styles.ratingArea}>
          <Text
            style={[
              typography.caption,
              { color: theme.colors.muted, textAlign: 'center', marginBottom: spacing.sm },
            ]}
          >
            How well did you remember?
          </Text>
          <RatingButtons onRate={handleRate} disabled={submitting} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.base,
  },
  cardArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingArea: {
    paddingBottom: spacing.lg,
  },
  backButton: {
    marginTop: spacing.xl,
    height: 44,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
