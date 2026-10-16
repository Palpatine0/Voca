import { webFormContent } from '../../src/lib/layout';
import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../src/components/Button';
import { TextInput } from '../../src/components/TextInput';
import { PhotoImport } from '../../src/components/PhotoImport';
import { api } from '../../src/lib/api';
import { capitalizeWords } from '../../src/lib/words';
import { TAB_DOCK_CLEARANCE } from '../../src/lib/navigation';
import { supportsOfflineAudio } from '../../src/lib/audio';
import { useAuth } from '../../src/context/AuthContext';
import { useDeck } from '../../src/context/DeckContext';
import { radii, spacing, typography, useTheme } from '../../src/lib/theme';

export default function AddScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const deck = useDeck();
  const adding = useRef(false);
  const [term, setTerm] = useState('');
  const [definition, setDefinition] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [method, setMethod] = useState<'manual' | 'photo'>('manual');

  const handleAddWord = async () => {
    if (adding.current || !user) return;
    const cleanTerm = capitalizeWords(term.trim());
    const cleanDefinition = definition.trim();

    if (!cleanTerm) {
      setError('Enter a word to add to your deck.');
      setSavedId(null);
      return;
    }

    setError(null);
    setSavedId(null);
    adding.current = true;
    setLoading(true);

    try {
      const { word } = await api.createWord(
        cleanTerm,
        cleanDefinition || undefined,
        user.id
      );
      setTerm('');
      setDefinition('');
      setSavedId(word.id);

      try {
        await deck.remember(word);
      } catch {
        setError('Word added, but it could not be saved offline. Free up storage and refresh Library.');
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to add this word right now.'
      );
    } finally {
      adding.current = false;
      setLoading(false);
    }
  };
  const saved = deck.entries.find((entry) => entry.word.id === savedId);
  const saveMessage = saved?.audioReady
    ? 'Added with offline pronunciation'
    : saved?.enrichmentComplete && !supportsOfflineAudio
      ? 'Added with online pronunciation'
      : saved
        ? 'Added. Preparing a short meaning, photo, and pronunciation.'
        : 'Added to your deck';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.canvas }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={[styles.content, webFormContent]}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <View
              style={[
                styles.iconPlate,
                { backgroundColor: theme.colors.surfaceStrong },
              ]}
            >
              <Ionicons name="sparkles-outline" size={20} color={theme.colors.ink} />
            </View>
            <Text style={[typography.displayMd, styles.title, { color: theme.colors.ink }]}>
              Add a word
            </Text>
            <Text style={[typography.bodyMd, { color: theme.colors.muted }]}>
              Capture a new idea now. Voca will help you remember it later.
            </Text>
          </View>

          <View style={[styles.methods, { backgroundColor: theme.colors.surfaceStrong }]} accessibilityRole="tablist">
            {(['manual', 'photo'] as const).map((value) => <Pressable key={value}
              accessibilityRole="tab" accessibilityState={{ selected: method === value }}
              onPress={() => setMethod(value)}
              style={[styles.method, method === value && { backgroundColor: theme.colors.surfaceCard }]}>
              <Text style={[typography.button, { color: method === value ? theme.colors.ink : theme.colors.muted }]}>
                {value === 'manual' ? 'Type a word' : 'From a photo'}
              </Text>
            </Pressable>)}
          </View>

          {method === 'photo' ? <PhotoImport key={user?.id} /> : <View
            style={[
              styles.formCard,
              {
                backgroundColor: theme.colors.surfaceCard,
                borderColor: theme.colors.hairline,
              },
              theme.elevation.card,
            ]}
          >
            <TextInput
              label="Word"
              value={term}
              onChangeText={(value) => {
                setTerm(capitalizeWords(value));
                if (error) setError(null);
                if (savedId) setSavedId(null);
              }}
              placeholder="e.g. ephemeral"
              autoCapitalize="words"
              maxLength={200}
              autoCorrect={false}
              returnKeyType="next"
              error={error && !term.trim() ? error : undefined}
            />

            <TextInput
              label="Definition"
              value={definition}
              onChangeText={setDefinition}
              placeholder="Optional — a short meaning is added automatically"
              multiline
              textAlignVertical="top"
              style={styles.definitionInput}
            />

            {error && (term.trim() || savedId) ? (
              <Text style={[typography.caption, { color: theme.colors.semanticError }]}>
                {error}
              </Text>
            ) : null}

            {savedId ? (
              <View
                style={[
                  styles.successMessage,
                  { backgroundColor: theme.colors.surfaceStrong },
                ]}
              >
                <Ionicons
                  name="checkmark-circle-outline"
                  size={18}
                  color={theme.colors.semanticSuccess}
                />
                <Text style={[typography.caption, { flex: 1, color: theme.colors.bodyStrong }]}>
                  {saveMessage}
                </Text>
              </View>
            ) : null}

            <Button
              label="Add to deck"
              onPress={handleAddWord}
              loading={loading}
              style={styles.submitButton}
            />
          </View>}

          <Text style={[typography.caption, styles.helper, { color: theme.colors.muted }]}>
            {supportsOfflineAudio
              ? 'Saved pronunciation is available in Library, even offline. Illustrations stay online.'
              : 'Pronunciation plays online in the browser. Use the mobile app for offline audio.'}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    padding: spacing.lg,
    paddingBottom: TAB_DOCK_CLEARANCE,
  },
  header: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  iconPlate: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    marginBottom: spacing.xs,
  },
  formCard: {
    borderWidth: 1,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  methods: { flexDirection: 'row', padding: 4, borderRadius: radii.pill, marginBottom: spacing.lg },
  method: { flex: 1, minHeight: 44, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  definitionInput: {
    minHeight: 104,
  },
  successMessage: {
    minHeight: 40,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  submitButton: {
    marginTop: spacing.xs,
  },
  helper: {
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
