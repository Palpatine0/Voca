import React from 'react';
import { useIsFocused } from '@react-navigation/native';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../src/components/Button';
import { PronunciationButton } from '../../src/components/PronunciationButton';
import { useDeck } from '../../src/context/DeckContext';
import { supportsOfflineAudio } from '../../src/lib/audio';
import { radii, spacing, typography, useTheme } from '../../src/lib/theme';

export default function LibraryScreen() {
  const theme = useTheme();
  const deck = useDeck();
  const focused = useIsFocused();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.canvas }]}>
      <FlatList
        contentContainerStyle={styles.content}
        data={deck.entries}
        keyExtractor={(entry) => entry.word.id}
        refreshing={deck.syncing}
        onRefresh={() => void deck.refresh(true)}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[typography.displayMd, { color: theme.colors.ink }]}>Library</Text>
            <Text style={[typography.bodyMd, styles.description, { color: theme.colors.muted }]}>
              {supportsOfflineAudio
                ? 'Your saved words and pronunciation, ready wherever you go.'
                : 'Your words. Offline pronunciation is available in the mobile app.'}
            </Text>
            {deck.message && (
              <Text accessibilityRole="alert" style={[typography.caption, styles.description, { color: theme.colors.semanticError }]}>
                {deck.message}
              </Text>
            )}
            <Button label="Refresh and retry" variant="outline" onPress={() => void deck.refresh(true)}
              loading={deck.syncing} style={{ marginTop: spacing.base }} />
          </View>
        }
        ListEmptyComponent={deck.loaded ? (
          <Text style={[typography.bodyMd, { color: theme.colors.muted }]}>No saved words yet. Add a word to get started.</Text>
        ) : <ActivityIndicator color={theme.colors.primary} />}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.hairline }]}>
            <Text style={[typography.titleMd, { color: theme.colors.ink }]}>{item.word.term}</Text>
            {item.word.definition && <Text style={[typography.bodyMd, styles.description, { color: theme.colors.body }]}>{item.word.definition}</Text>}
            <Text style={[typography.caption, styles.description, { color: theme.colors.muted }]}>
              {item.audioReady ? 'Pronunciation saved offline'
                : !supportsOfflineAudio && item.word.pronunciation_url ? 'Online pronunciation'
                  : item.attempts ? 'Audio pending · will retry' : 'Preparing pronunciation…'}
            </Text>
            {!item.enrichmentComplete && item.audioReady && (
              <Text style={[typography.caption, { color: theme.colors.muted }]}>Illustration pending · will retry</Text>
            )}
            {focused && item.word.pronunciation_url && (
              <PronunciationButton key={item.word.id} userId={item.word.user_id}
                wordId={item.word.id} audioUrl={item.word.pronunciation_url} />
            )}
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { paddingVertical: spacing.lg, marginBottom: spacing.base },
  description: { marginTop: spacing.xs },
  card: { borderWidth: 1, borderRadius: radii.xl, padding: spacing.lg, marginBottom: spacing.sm },
});
