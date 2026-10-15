import { webFormContent } from '../../src/lib/layout';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../src/components/Button';
import { FlashCard } from '../../src/components/FlashCard';
import { GradientOrb } from '../../src/components/GradientOrb';
import { RatingButtons } from '../../src/components/RatingButtons';
import { api, Word } from '../../src/lib/api';
import { TAB_DOCK_CLEARANCE } from '../../src/lib/navigation';
import { saveReview, waitForReviewSaves } from '../../src/lib/review';
import { radii, spacing, typography, useTheme } from '../../src/lib/theme';

export default function ReviewScreen() {
  const theme = useTheme();
  const [words, setWords] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const focused = useRef(false);
  const requestId = useRef(0);
  const pendingReview = useRef<ReturnType<typeof api.submitReview> | null>(null);

  const fetchDue = useCallback(async () => {
    const request = ++requestId.current;
    setLoading(true);
    setLoadError(false);
    setSubmitError(false);
    setSubmitting(false);
    setWords([]);
    setCurrentIndex(0);
    try {
      await waitForReviewSaves();
      if (!focused.current || request !== requestId.current) return;
      const { words: due } = await api.getDueWords();
      if (focused.current && request === requestId.current) setWords(due);
    } catch {
      if (focused.current && request === requestId.current) setLoadError(true);
    } finally {
      if (focused.current && request === requestId.current) setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    void fetchDue();
    return () => {
      focused.current = false;
      requestId.current += 1;
      // Unmount the card on blur so its pronunciation cannot keep playing.
      setWords([]);
      setLoading(true);
    };
  }, [fetchDue]));

  const handleRate = async (quality: number) => {
    const word = words[currentIndex];
    if (!word || loading || !focused.current || pendingReview.current) return;

    const request = requestId.current;
    setSubmitting(true);
    setSubmitError(false);
    const submission = saveReview(word.id, quality);
    pendingReview.current = submission;
    try {
      await submission;
      if (focused.current && request === requestId.current) {
        setCurrentIndex((i) => i + 1);
      }
    } catch {
      if (focused.current && request === requestId.current) setSubmitError(true);
    } finally {
      if (pendingReview.current === submission) pendingReview.current = null;
      if (focused.current && request === requestId.current) setSubmitting(false);
    }
  };

  const currentWord = words[currentIndex];
  const isComplete = !loading && !loadError && !currentWord;

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.canvas }]}>
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (loadError) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.canvas }]}>
        <View style={styles.center}>
          <Text style={[typography.displaySm, { color: theme.colors.ink }]}>
            Couldn't load your review
          </Text>
          <Text
            accessibilityRole="alert"
            style={[typography.bodyMd, styles.message, { color: theme.colors.semanticError }]}
          >
            Check your connection and try again.
          </Text>
          <Button label="Try again" onPress={fetchDue} style={{ marginTop: spacing.lg }} />
          <Button
            label="Back to Home"
            variant="outline"
            onPress={() => router.replace('/(tabs)')}
            style={{ marginTop: spacing.sm }}
          />
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
            onPress={() => router.replace('/(tabs)')}
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
      <ScrollView contentContainerStyle={[styles.container, webFormContent]}>
        {/* Progress */}
        <View style={styles.progressRow}>
          <Pressable onPress={() => router.replace('/(tabs)')}>
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
          <FlashCard key={currentWord.id} word={currentWord} />
        </View>

        {/* Rating buttons */}
        <View style={styles.ratingArea}>
          {submitError && (
            <Text
              accessibilityRole="alert"
              style={[typography.caption, styles.message, { color: theme.colors.semanticError }]}
            >
              Couldn't save your review. Try your rating again.
            </Text>
          )}
          <Text
            style={[
              typography.caption,
              { color: theme.colors.muted, textAlign: 'center', marginBottom: spacing.sm },
            ]}
          >
            {submitting ? 'Saving your review…' : 'How well did you remember?'}
          </Text>
          <RatingButtons onRate={handleRate} disabled={submitting} />
        </View>
      </ScrollView>
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
    paddingBottom: TAB_DOCK_CLEARANCE,
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: TAB_DOCK_CLEARANCE,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.base,
  },
  cardArea: {
    flex: 1,
    minHeight: 320,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingArea: {
    paddingBottom: spacing.lg,
  },
  message: {
    textAlign: 'center',
    marginVertical: spacing.sm,
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
