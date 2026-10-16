import { Ionicons } from '@expo/vector-icons';
import { randomUUID } from 'expo-crypto';
import { Image } from 'expo-image';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useDeck } from '../context/DeckContext';
import { api } from '../lib/api';
import { capitalizeWords } from '../lib/words';
import { choosePhoto, PhotoSource } from '../lib/photo';
import { radii, spacing, typography, useTheme } from '../lib/theme';
import { Button } from './Button';

const keyFor = (word: string) => word.trim().normalize('NFKC').toLocaleLowerCase('en');

export function PhotoImport() {
  const { user } = useAuth();
  const deck = useDeck();
  return user ? <PhotoImportContent key={user.id} userId={user.id} deck={deck} /> : null;
}

interface PhotoImportProps {
  userId: string;
  deck: Pick<ReturnType<typeof useDeck>, 'entries' | 'loaded' | 'remember'>;
  client?: Pick<typeof api, 'scanPhoto' | 'createWord'>;
  pickPhoto?: typeof choosePhoto;
}

export function PhotoImportContent({ userId, deck, client = api, pickPhoto = choosePhoto }: PhotoImportProps) {
  const theme = useTheme();
  const active = useRef(true);
  const operation = useRef(0);
  const locked = useRef(false);
  const ids = useRef(new Map<string, string>());
  const [photo, setPhoto] = useState<string | null>(null);
  const [words, setWords] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<'choosing' | 'scanning' | 'saving' | null>(null);
  const [scanned, setScanned] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const existing = new Set([...deck.entries.map((entry) => keyFor(entry.word.term)), ...added]);
  const pending = words.filter((word) => selected.has(word) && !existing.has(keyFor(word)));

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; operation.current += 1; };
  }, []);

  const scan = async (source?: PhotoSource) => {
    if (locked.current) return;
    locked.current = true;
    const run = ++operation.current;
    const current = () => active.current && operation.current === run;
    setError(null);
    setBusy(source ? 'choosing' : 'scanning');
    try {
      const image = source ? await pickPhoto(source) : photo;
      if (!image || !current()) return;
      setPhoto(image);
      setWords([]);
      setSelected(new Set());
      setScanned(false);
      setNotice(null);
      setBusy('scanning');
      const result = await client.scanPhoto(image, userId);
      if (!current()) return;
      setWords(result.words);
      setTruncated(result.truncated);
      setScanned(true);
    } catch (failure) {
      if (current()) setError(failure instanceof Error ? failure.message : 'Unable to read this photo. Please try again.');
    } finally {
      if (current()) { locked.current = false; setBusy(null); }
    }
  };

  const cancelScan = () => {
    operation.current += 1;
    locked.current = false;
    setBusy(null);
  };

  const addSelected = async () => {
    if (locked.current || !pending.length || !deck.loaded) return;
    locked.current = true;
    setBusy('saving');
    setError(null);
    setNotice(null);
    let count = 0;
    let storageFailed = false;
    try {
      for (const term of pending) {
        if (!active.current) break;
        const key = keyFor(term);
        // Keep the same id across retries, including a lost response after save.
        let id = ids.current.get(key);
        if (!id) { id = randomUUID(); ids.current.set(key, id); }
        const { word } = await client.createWord(capitalizeWords(term), undefined, userId, id);
        if (!active.current) break;
        count += 1;
        setAdded((previous) => new Set([...previous, key]));
        setSelected((previous) => { const next = new Set(previous); next.delete(term); return next; });
        try { await deck.remember(word); } catch { storageFailed = true; }
      }
    } catch (failure) {
      if (active.current) setError(`${failure instanceof Error ? failure.message : 'Unable to save words.'} Your remaining selection is ready to retry.`);
    } finally {
      if (active.current) {
        if (count) setNotice(`${count} ${count === 1 ? 'word added' : 'words added'}. ${storageFailed
          ? 'Some words could not be saved offline. Free up storage and refresh Library.'
          : 'Pronunciation and illustrations will continue preparing in Library.'}`);
        locked.current = false;
        setBusy(null);
      }
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.hairline }]}>
      <View style={styles.heading}>
        <Ionicons name="scan-outline" size={24} color={theme.colors.ink} />
        <Text style={[typography.titleMd, { color: theme.colors.ink }]}>Words from a photo</Text>
      </View>
      <Text style={[typography.bodySm, { color: theme.colors.muted }]}>
        Photograph printed English text, then choose the words you want to remember.
      </Text>
      <View style={styles.actions}>
        <Button label="Take photo" variant="outline" onPress={() => { void scan('camera'); }} disabled={Boolean(busy)} style={styles.action} />
        <Button label="Choose photo" variant="outline" onPress={() => { void scan('library'); }} disabled={Boolean(busy)} style={styles.action} />
      </View>
      <Text style={[typography.caption, { color: theme.colors.muted }]}>
        Your photo is sent to Voca to read the text. It is not stored on the server.
      </Text>
      {photo && <Image source={{ uri: `data:image/jpeg;base64,${photo}` }} contentFit="contain" cachePolicy="memory" style={styles.photo} accessibilityLabel="Selected photo" />}
      {busy && <View style={styles.progress} accessibilityLiveRegion="polite">
        <ActivityIndicator color={theme.colors.ink} />
        <Text style={[typography.caption, { color: theme.colors.body }]}>
          {busy === 'choosing' ? 'Opening photo…' : busy === 'scanning' ? 'Reading your photo…' : 'Adding selected words…'}
        </Text>
      </View>}
      {(busy === 'choosing' || busy === 'scanning') && <Button label="Cancel scan" variant="outline" onPress={cancelScan} />}
      {error && <Text accessibilityRole="alert" style={[typography.caption, { color: theme.colors.semanticError }]}>{error}</Text>}
      {!busy && photo && !scanned && <Button label="Try scan again" variant="outline" onPress={() => { void scan(); }} />}
      {scanned && !words.length && <Text style={[typography.bodySm, { color: theme.colors.body }]}>
        No readable words found. Try a well-lit, closer photo with the text upright.
      </Text>}
      {words.length > 0 && <>
        <Text style={[typography.caption, { color: theme.colors.body }]}>
          Tap to select · {pending.length} selected
        </Text>
        <View style={styles.chips}>
          {words.map((word) => {
            const saved = existing.has(keyFor(word));
            const checked = selected.has(word) && !saved;
            return <Pressable key={word} accessibilityRole="checkbox" accessibilityLabel={saved ? `${word}, already in deck` : word}
              accessibilityState={{ checked, disabled: saved || Boolean(busy) }} disabled={saved || Boolean(busy)}
              onPress={() => setSelected((previous) => {
                const next = new Set(previous);
                if (next.has(word)) next.delete(word); else next.add(word);
                return next;
              })}
              style={[styles.chip, { backgroundColor: checked ? theme.colors.primary : theme.colors.canvasSoft, borderColor: checked ? theme.colors.primary : theme.colors.hairline, opacity: saved ? 0.55 : 1 }]}
            >
              <Text style={[typography.bodySm, { color: checked ? theme.colors.onPrimary : theme.colors.ink }]}>{word}</Text>
              {(checked || saved) && <Ionicons name={saved ? 'checkmark-done' : 'checkmark'} size={15} color={checked ? theme.colors.onPrimary : theme.colors.muted} />}
            </Pressable>;
          })}
        </View>
        {truncated && <Text style={[typography.caption, { color: theme.colors.muted }]}>Showing the first 150 words. Scan a smaller section for the rest.</Text>}
        <Button label={`Add ${pending.length || ''}${pending.length ? ' ' : ''}selected ${pending.length === 1 ? 'word' : 'words'}`} onPress={() => { void addSelected(); }}
          loading={busy === 'saving'} disabled={Boolean(busy) || !pending.length || !deck.loaded} />
      </>}
      {notice && <Text accessibilityLiveRegion="polite" style={[typography.caption, { color: theme.colors.bodyStrong }]}>{notice}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radii.xl, padding: spacing.lg, gap: spacing.base },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  action: { flexGrow: 1, paddingHorizontal: spacing.base },
  photo: { width: '100%', height: 144, borderRadius: radii.md },
  progress: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: spacing.base, minHeight: 44, flexDirection: 'row', gap: spacing.xs, alignItems: 'center' },
});
