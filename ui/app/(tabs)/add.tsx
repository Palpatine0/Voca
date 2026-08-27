import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../../src/components/Button';
import { TextInput } from '../../src/components/TextInput';
import { api } from '../../src/lib/api';
import { radii, spacing, typography, useTheme } from '../../src/lib/theme';

export default function AddScreen() {
  const theme = useTheme();
  const [term, setTerm] = useState('');
  const [definition, setDefinition] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleAddWord = async () => {
    const cleanTerm = term.trim();
    const cleanDefinition = definition.trim();

    if (!cleanTerm) {
      setError('Enter a word to add to your deck.');
      setSaved(false);
      return;
    }

    setError(null);
    setSaved(false);
    setLoading(true);

    try {
      await api.createWord(cleanTerm, cleanDefinition || undefined);
      setTerm('');
      setDefinition('');
      setSaved(true);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Unable to add this word right now.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.canvas }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.content}
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

          <View
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
                setTerm(value);
                if (error) setError(null);
                if (saved) setSaved(false);
              }}
              placeholder="e.g. ephemeral"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              error={error && !term.trim() ? error : undefined}
            />

            <TextInput
              label="Definition"
              value={definition}
              onChangeText={setDefinition}
              placeholder="What does it mean?"
              multiline
              textAlignVertical="top"
              style={styles.definitionInput}
            />

            {error && term.trim() ? (
              <Text style={[typography.caption, { color: theme.colors.semanticError }]}>
                {error}
              </Text>
            ) : null}

            {saved ? (
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
                <Text style={[typography.caption, { color: theme.colors.bodyStrong }]}>
                  Added to your deck
                </Text>
              </View>
            ) : null}

            <Button
              label="Add to deck"
              onPress={handleAddWord}
              loading={loading}
              style={styles.submitButton}
            />
          </View>

          <Text style={[typography.caption, styles.helper, { color: theme.colors.muted }]}>
            You can add pronunciation and imagery after saving.
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
    paddingBottom: spacing.xxl,
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
