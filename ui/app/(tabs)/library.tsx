import { webContent } from '../../src/lib/layout';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../src/components/Button';
import { PronunciationButton } from '../../src/components/PronunciationButton';
import { WordEditor } from '../../src/components/WordEditor';
import { useAuth } from '../../src/context/AuthContext';
import { useDeck } from '../../src/context/DeckContext';
import { supportsOfflineAudio } from '../../src/lib/audio';
import { Word } from '../../src/lib/api';
import { LibraryFilter, LibrarySort, reviewLabel, visibleWords } from '../../src/lib/library';
import { TAB_DOCK_CLEARANCE } from '../../src/lib/navigation';
import { waitForReviewSaves } from '../../src/lib/review';
import { radii, spacing, typography, useTheme } from '../../src/lib/theme';

export default function LibraryScreen() {
  const deck = useDeck();
  const { user } = useAuth();
  const focused = useIsFocused();
  return <LibraryContent key={user?.id} deck={deck} focused={focused} />;
}

export function LibraryContent({ deck, focused }: { deck: ReturnType<typeof useDeck>; focused: boolean }) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [sort, setSort] = useState<LibrarySort>('newest');
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const selected = deck.entries.find((entry) => entry.word.id === selectedWord?.id)?.word ?? selectedWord;
  const entries = visibleWords(deck.entries, query, filter, sort, now);

  useEffect(() => {
    if (!focused) { setSelectedWord(null); return; }
    let active = true;
    setNow(Date.now());
    void waitForReviewSaves().then(() => { if (active) void deck.refresh(); });
    const clock = setInterval(() => setNow(Date.now()), 60_000);
    return () => { active = false; clearInterval(clock); };
  }, [focused, deck.refresh]);

  return <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.canvas }]}>
    <FlatList contentContainerStyle={[styles.content, webContent]} data={entries} keyExtractor={(entry) => entry.word.id}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
      refreshing={deck.syncing} onRefresh={() => void deck.refresh(true)}
      ListHeaderComponent={<View style={styles.header}>
        <Text style={[typography.displayMd, { color: theme.colors.ink }]}>Library</Text>
        <Text style={[typography.bodyMd, styles.description, { color: theme.colors.muted }]}>
          {deck.entries.length} {deck.entries.length === 1 ? 'word' : 'words'} to make your own.
        </Text>
        <View style={[styles.search, { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.hairline }]}>
          <Ionicons name="search-outline" size={20} color={theme.colors.muted} />
          <TextInput accessibilityLabel="Search words and definitions" placeholder="Search words and meanings" placeholderTextColor={theme.colors.muted}
            value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false}
            style={[typography.bodyMd, { flex: 1, color: theme.colors.ink, minHeight: 44 }]} />
          {query.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery('')} style={styles.clear}>
            <Ionicons name="close-circle" size={20} color={theme.colors.muted} />
          </Pressable>}
        </View>
        <View style={styles.filters}>
          {(['all', 'due', ...(supportsOfflineAudio ? ['offline'] : [])] as LibraryFilter[]).map((value) => <Pressable key={value}
            accessibilityRole="button" accessibilityState={{ selected: filter === value }} onPress={() => setFilter(value)}
            style={[styles.filter, { backgroundColor: filter === value ? theme.colors.primary : theme.colors.surfaceCard, borderColor: theme.colors.hairline }]}>
            <Text style={[typography.caption, { color: filter === value ? theme.colors.onPrimary : theme.colors.body }]}>{value === 'all' ? 'All words' : value === 'due' ? 'Due now' : 'Downloaded'}</Text>
          </Pressable>)}
        </View>
        <View style={styles.tools}>
          <Text style={[typography.caption, { color: theme.colors.muted, flex: 1 }]}>{entries.length} shown</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={sort === 'newest' ? 'Sort alphabetically' : 'Sort newest first'}
            onPress={() => setSort(sort === 'newest' ? 'alphabetical' : 'newest')} style={styles.sort}>
            <Ionicons name="swap-vertical-outline" size={16} color={theme.colors.body} />
            <Text style={[typography.caption, { color: theme.colors.body }]}>{sort === 'newest' ? 'Newest first' : 'A–Z'}</Text>
          </Pressable>
        </View>
        {notice && <Text accessibilityLiveRegion="polite" style={[typography.caption, styles.description, { color: theme.colors.bodyStrong }]}>{notice}</Text>}
        {deck.message && <Text accessibilityRole="alert" style={[typography.caption, styles.description, { color: theme.colors.semanticError }]}>{deck.message}</Text>}
        <Button label="Refresh and retry" variant="outline" onPress={() => void deck.refresh(true)} loading={deck.syncing} style={{ marginTop: spacing.base }} />
      </View>}
      ListEmptyComponent={!deck.loaded ? <ActivityIndicator color={theme.colors.primary} /> : <View style={styles.empty}>
        <Ionicons name="book-outline" size={32} color={theme.colors.muted} />
        <Text style={[typography.titleMd, { color: theme.colors.ink }]}>{deck.entries.length ? 'No matching words' : 'Your collection starts here'}</Text>
        <Text style={[typography.bodyMd, { color: theme.colors.muted, textAlign: 'center' }]}>
          {deck.entries.length ? 'Try another search or change the filter.' : 'No saved words yet. Add a word to get started.'}
        </Text>
        {deck.entries.length > 0 && <Button label="Show all words" variant="outline" onPress={() => { setQuery(''); setFilter('all'); }} />}
      </View>}
      renderItem={({ item }) => <View style={[styles.card, { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.hairline }]}>
        <View style={styles.cardRow}>
          <Pressable accessibilityRole="button" accessibilityLabel={'Edit ' + item.word.term} onPress={() => { setSelectedWord(item.word); setNotice(null); }} style={styles.wordButton}>
            <Text style={[typography.titleMd, { color: theme.colors.ink }]}>{item.word.term}</Text>
            <Text numberOfLines={2} style={[typography.bodySm, styles.description, { color: theme.colors.body }]}>{item.word.definition || (item.word.enrichment?.definition_status === 'not_found' ? 'No dictionary match · tap to add a meaning' : 'Finding a short meaning…')}</Text>
          </Pressable>
          {focused && !selectedWord && item.word.pronunciation_url && <PronunciationButton userId={item.word.user_id} wordId={item.word.id} audioUrl={item.word.pronunciation_url} />}
        </View>
        <Text style={[typography.captionUppercase, styles.description, { color: theme.colors.muted }]}>{reviewLabel(item.word.next_review_at, now)}</Text>
        <Text style={[typography.caption, styles.description, { color: theme.colors.muted }]}>
          {item.audioReady ? 'Pronunciation saved offline' : !supportsOfflineAudio && item.word.pronunciation_url ? 'Online pronunciation' : item.attempts ? 'Audio pending · will retry' : 'Preparing pronunciation…'}
        </Text>
        {!item.enrichmentComplete && item.audioReady && <Text style={[typography.caption, { color: theme.colors.muted }]}>Meaning or photo pending · will retry</Text>}
      </View>}
    />
    {focused && selected && <WordEditor key={selected.id} word={selected} updateWord={deck.updateWord} removeWord={deck.removeWord}
      onClose={() => setSelectedWord(null)} onSaved={setNotice} />}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: TAB_DOCK_CLEARANCE },
  header: { paddingTop: spacing.lg, marginBottom: spacing.lg },
  description: { marginTop: spacing.xs },
  search: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg, paddingHorizontal: spacing.sm, borderRadius: radii.lg, borderWidth: 1 },
  clear: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.base },
  filter: { minHeight: 44, borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: spacing.base, alignItems: 'center', justifyContent: 'center' },
  tools: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs },
  sort: { minHeight: 44, flexDirection: 'row', gap: spacing.xs, alignItems: 'center' },
  card: { borderWidth: 1, borderRadius: radii.xl, padding: spacing.lg, marginBottom: spacing.sm },
  cardRow: { flexDirection: 'row', gap: spacing.base, alignItems: 'flex-start' },
  wordButton: { flex: 1, minHeight: 44 },
  empty: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.base },
});
