import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../src/components/Button';
import { GradientOrb } from '../../src/components/GradientOrb';
import { api, WordStats } from '../../src/lib/api';
import { waitForReviewSaves } from '../../src/lib/review';
import { radii, spacing, typography, useTheme } from '../../src/lib/theme';

export default function HomeScreen() {
  const theme = useTheme();
  const [stats, setStats] = useState<WordStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const focused = useRef(false);
  const requestId = useRef(0);

  const fetchStats = useCallback(async () => {
    const request = ++requestId.current;
    setLoading(true);
    setError(false);
    try {
      await waitForReviewSaves();
      if (!focused.current || request !== requestId.current) return;
      const data = await api.getWordStats();
      if (focused.current && request === requestId.current) setStats(data);
    } catch {
      if (focused.current && request === requestId.current) setError(true);
    } finally {
      if (focused.current && request === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    void fetchStats();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void fetchStats();
    });
    return () => {
      focused.current = false;
      requestId.current += 1;
      subscription.remove();
    };
  }, [fetchStats]));

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchStats();
  };
  const currentStats = !loading && !error ? stats : null;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.canvas }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[typography.displayMd, { color: theme.colors.ink }]}>
            Voca
          </Text>
        </View>

        {/* Hero card with gradient orbs */}
        <View style={styles.heroWrapper}>
          <GradientOrb
            variant="mint"
            size={180}
            style={styles.orbTopRight}
          />
          <GradientOrb
            variant="peach"
            size={120}
            style={styles.orbBottomLeft}
          />

          <View
            style={[
              styles.heroCard,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.hairline,
              },
              theme.elevation.card,
            ]}
          >
            <Text style={[typography.captionUppercase, { color: theme.colors.muted }]}>
              TODAY'S REVIEW
            </Text>
            {loading ? (
              <ActivityIndicator
                accessibilityLabel="Loading review counts"
                color={theme.colors.primary}
                style={{ marginTop: spacing.lg }}
              />
            ) : error ? (
              <>
                <Text
                  accessibilityRole="alert"
                  style={[
                    typography.bodyMd,
                    { color: theme.colors.semanticError, marginTop: spacing.lg, textAlign: 'center' },
                  ]}
                >
                  Couldn't load your word counts.
                </Text>
                <Button label="Try again" onPress={fetchStats} style={{ marginTop: spacing.lg }} />
              </>
            ) : currentStats && (
              <>
                <Text
                  style={[
                    typography.displayXl,
                    { color: theme.colors.ink, marginTop: spacing.sm },
                  ]}
                >
                  {currentStats.due}
                </Text>
                <Text style={[typography.bodyMd, { color: theme.colors.muted }]}>
                  {currentStats.due === 1 ? 'word' : 'words'} due for review
                </Text>

                <Pressable
                  onPress={() => router.push('/(tabs)/review')}
                  disabled={currentStats.due === 0}
                  style={({ pressed }) => [
                    styles.reviewButton,
                    {
                      backgroundColor: pressed
                        ? theme.colors.primaryActive
                        : theme.colors.primary,
                      opacity: currentStats.due === 0 ? 0.4 : 1,
                    },
                  ]}
                >
                  <Text style={[typography.button, { color: theme.colors.onPrimary }]}>
                    {currentStats.due > 0 ? 'Start Review' : 'All caught up'}
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View
            style={[
              styles.statCard,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.hairline,
              },
            ]}
          >
            <Text style={[typography.displaySm, { color: theme.colors.ink }]}>
              {currentStats?.total ?? '—'}
            </Text>
            <Text style={[typography.caption, { color: theme.colors.muted }]}>
              Total words
            </Text>
          </View>

          <View
            style={[
              styles.statCard,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.hairline,
              },
            ]}
          >
            <Text style={[typography.displaySm, { color: theme.colors.ink }]}>
              {currentStats ? currentStats.total - currentStats.due : '—'}
            </Text>
            <Text style={[typography.caption, { color: theme.colors.muted }]}>
              Not due
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  header: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  heroWrapper: {
    position: 'relative',
    marginBottom: spacing.lg,
  },
  orbTopRight: {
    position: 'absolute',
    top: -40,
    right: -60,
    zIndex: -1,
  },
  orbBottomLeft: {
    position: 'absolute',
    bottom: -30,
    left: -40,
    zIndex: -1,
  },
  heroCard: {
    borderRadius: radii.xxl,
    borderWidth: 1,
    padding: spacing.xl,
    alignItems: 'center',
  },
  reviewButton: {
    marginTop: spacing.lg,
    height: 44,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.lg,
    alignItems: 'center',
  },
});
