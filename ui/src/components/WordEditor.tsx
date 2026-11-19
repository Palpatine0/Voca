import type { RegenerationTarget } from '../lib/api';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Word } from '../lib/api';
import { reviewLabel } from '../lib/library';
import { capitalizeWords } from '../lib/words';
import { radii, spacing, typography, useTheme } from '../lib/theme';
import { PronunciationButton } from './PronunciationButton';
import { TextInput } from './TextInput';
import { WordSources } from './WordSources';

interface Props {
  word: Word;
  updateWord: (id: string, updates: Pick<Word, 'term' | 'definition'>) => Promise<string | null>;
  regenerateWord: (id: string, target?: RegenerationTarget) => Promise<string | null>;
  removeWord: (id: string) => Promise<string | null>;
  onClose: () => void;
  onSaved: (notice: string) => void;
}

function ActionIcon({ label, icon, onPress, disabled, tone = 'neutral' }: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  disabled?: boolean;
  tone?: 'neutral' | 'primary' | 'danger';
}) {
  const { colors } = useTheme();
  const backgroundColor = tone === 'primary' ? colors.primary : colors.surfaceCard;
  const color = tone === 'danger' ? colors.semanticError : tone === 'primary' ? colors.onPrimary : colors.ink;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }}
    {...(Platform.OS === 'web' ? { title: label } : {})}
    disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.action, {
      backgroundColor, borderColor: tone === 'danger' ? colors.semanticError : tone === 'primary' ? colors.primary : colors.hairlineStrong,
      opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
    }]}>
    <Ionicons name={icon} size={21} color={color} />
  </Pressable>;
}

export function WordEditor({ word, updateWord, regenerateWord, removeWord, onClose, onSaved }: Props) {
  const theme = useTheme();
  const [term, setTerm] = useState(word.term);
  const [definition, setDefinition] = useState(word.definition ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const locked = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const renamed = capitalizeWords(term.trim()) !== capitalizeWords(word.term);
  const dirty = term.trim() !== word.term || definition.trim() !== (word.definition ?? '');
  const close = () => { if (!locked.current) onClose(); };

  const save = async (remove: boolean) => {
    if (locked.current) return;
    if (!remove && (!term.trim() || term.trim().length > 200 || definition.length > 4000)) {
      setError('Enter a word of 1–200 characters and a definition under 4,000 characters.');
      return;
    }
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      const warning = remove ? await removeWord(word.id) : await updateWord(word.id, { term: capitalizeWords(term.trim()), definition: definition.trim() || null });
      if (!active.current) return;
      onSaved(warning || (remove ? `“${word.term}” removed from your deck.` : `“${capitalizeWords(term.trim())}” updated.`));
      onClose();
    } catch (failure) {
      if (active.current) setError(failure instanceof Error ? failure.message : 'Unable to save. Please try again.');
    } finally {
      if (active.current) { locked.current = false; setBusy(false); }
    }
  };

  const regenerate = async (target?: RegenerationTarget) => {
    if (locked.current || dirty) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      const warning = await regenerateWord(word.id, target);
      if (!active.current) return;
      onSaved(warning || `Content for “${word.term}” regenerated.`);
      onClose();
    } catch (failure) {
      if (active.current) setError(failure instanceof Error ? failure.message : 'Unable to regenerate. Please try again.');
    } finally {
      if (active.current) { locked.current = false; setBusy(false); }
    }
  };

  return <Modal visible transparent animationType="slide" onRequestClose={close}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
      <Pressable accessibilityLabel="Close word details" accessibilityRole="button" style={StyleSheet.absoluteFill} onPress={close} disabled={busy} />
      <SafeAreaView edges={['bottom']} style={[styles.sheet, { backgroundColor: theme.colors.surfaceCard }]}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={[typography.displaySm, { color: theme.colors.ink, flex: 1 }]}>Word details</Text>
          {busy && <ActivityIndicator accessibilityLabel="Updating word" color={theme.colors.ink} />}
          {!confirmDelete && <ActionIcon label="Save changes" icon="checkmark" tone="primary" disabled={!dirty || busy} onPress={() => void save(false)} />}
          <Pressable accessibilityRole="button" accessibilityLabel="Close details" disabled={busy} onPress={close} style={styles.close}>
            <Ionicons name="close" size={24} color={theme.colors.ink} />
          </Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <View style={styles.schedule}>
            <Text style={[typography.captionUppercase, { color: theme.colors.muted }]}>{reviewLabel(word.next_review_at)}</Text>
            <Text style={[typography.caption, { color: theme.colors.muted }]}>
              {word.last_reviewed_at ? `Current interval: ${word.interval} ${word.interval === 1 ? 'day' : 'days'}` : 'Ready for your first review'}
            </Text>
          </View>
          {word.image_url && !renamed && !imageFailed && <Image source={word.image_url} cachePolicy="memory" contentFit="cover" style={styles.image}
            accessibilityLabel={`Illustration for ${word.term}`} onError={() => setImageFailed(true)} />}
          <TextInput label="Word" value={term} onChangeText={(value) => setTerm(capitalizeWords(value))} autoCapitalize="words" autoCorrect={false} editable={!busy && !confirmDelete} maxLength={200} />
          <TextInput label="Definition" value={definition} onChangeText={setDefinition} multiline textAlignVertical="top"
            placeholder="What does it mean?" editable={!busy && !confirmDelete} maxLength={4000} style={styles.definition} />
          {!dirty && <WordSources word={word} />}
          {renamed && <Text style={[typography.caption, { color: theme.colors.muted }]}>Changing the word refreshes its pronunciation and illustration. Your review schedule stays the same.</Text>}
          {!renamed && !busy && !confirmDelete && word.pronunciation_url && <PronunciationButton userId={word.user_id} wordId={word.id} audioUrl={word.pronunciation_url} />}
          {error && <Text accessibilityRole="alert" style={[typography.caption, { color: theme.colors.semanticError }]}>{error}</Text>}
          {confirmDelete ? <View style={[styles.confirmation, { backgroundColor: theme.colors.canvasSoft }]}>
            <Text style={[typography.titleSm, { color: theme.colors.ink }]}>Remove “{word.term}”?</Text>
            <Text style={[typography.bodySm, { color: theme.colors.body }]}>This removes the word, its review history, and its offline audio on this device. This cannot be undone.</Text>
            <View style={styles.actions}>
              <ActionIcon label="Keep word" icon="arrow-undo-outline" disabled={busy} onPress={() => { setConfirmDelete(false); setError(null); }} />
              <ActionIcon label="Delete word" icon="trash" tone="danger" disabled={busy} onPress={() => void save(true)} />
            </View>
          </View> : <View style={[styles.toolbar, { borderColor: theme.colors.hairline }]}>
            <Text style={[typography.captionUppercase, { color: theme.colors.muted }]}>Regenerate</Text>
            <View style={styles.actions}>
              <ActionIcon label="Regenerate audio" icon="mic-outline" disabled={busy || dirty} onPress={() => void regenerate('audio')} />
              <ActionIcon label="Regenerate image" icon="image-outline" disabled={busy || dirty} onPress={() => void regenerate('image')} />
              <ActionIcon label="Regenerate explanation" icon="document-text-outline" disabled={busy || dirty} onPress={() => void regenerate('definition')} />
              <ActionIcon label="Regenerate missing content" icon="refresh-outline" disabled={busy || dirty} onPress={() => void regenerate()} />
              <View style={styles.removeAction}>
                <ActionIcon label="Remove word" icon="trash-outline" tone="danger" disabled={busy} onPress={() => { setConfirmDelete(true); setError(null); }} />
              </View>
            </View>
            {dirty && <Text style={[typography.caption, { color: theme.colors.muted }]}>Save your edits before regenerating.</Text>}
          </View>}
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(12,10,9,0.35)' },
  sheet: { maxHeight: '90%', width: '100%', maxWidth: 640, alignSelf: 'center', borderTopLeftRadius: radii.xxl, borderTopRightRadius: radii.xxl },
  header: { flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.lg, paddingRight: spacing.sm, paddingTop: spacing.sm },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.lg, gap: spacing.lg },
  schedule: { gap: spacing.xs },
  definition: { minHeight: 104 },
  image: { width: '100%', height: 160, borderRadius: radii.lg },
  action: { width: 44, height: 44, borderRadius: radii.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  toolbar: { gap: spacing.sm, paddingTop: spacing.base, borderTopWidth: 1 },
  removeAction: { marginLeft: 'auto' },
  confirmation: { padding: spacing.base, borderRadius: radii.lg, gap: spacing.base },
});
