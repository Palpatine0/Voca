import { Link, type Href } from 'expo-router';
import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radii, spacing, typography, useTheme } from '../lib/theme';

export function AuthScreen({ title, description, children }: {
  title: string; description: string; children: React.ReactNode;
}) {
  const theme = useTheme();
  return <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.canvas }]}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.frame}>
          <View style={styles.brand}>
            <Text style={[typography.displayMd, { color: theme.colors.ink }]}>Voca</Text>
            <Text style={[typography.caption, { color: theme.colors.muted }]}>A little practice. A world of words.</Text>
          </View>
          <View testID="auth-card" style={[styles.card, { backgroundColor: theme.colors.surfaceCard, borderColor: theme.colors.hairline }]}>
            <View style={styles.heading}>
              <Text accessibilityRole="header" style={[typography.displayMd, { color: theme.colors.ink }]}>{title}</Text>
              <Text style={[typography.bodyMd, { color: theme.colors.muted }]}>{description}</Text>
            </View>
            <View style={styles.form}>{children}</View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

export function AuthLink({ href, children }: { href: Href<string>; children: string }) {
  const theme = useTheme();
  return <Link href={href} style={[typography.bodyStrong, styles.link, { color: theme.colors.ink }]}>{children}</Link>;
}

export function AuthMessage({ children, error = false }: { children: string; error?: boolean }) {
  const theme = useTheme();
  return <Text accessibilityRole={error ? 'alert' : undefined} accessibilityLiveRegion="polite"
    style={[typography.bodySm, { color: error ? theme.colors.semanticError : theme.colors.body }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg, paddingVertical: spacing.xxl },
  frame: { width: '100%', maxWidth: 460, alignSelf: 'center', gap: spacing.xl },
  brand: { alignItems: 'center', gap: spacing.xxs },
  card: { padding: spacing.lg, borderRadius: radii.xxl, borderWidth: 1 },
  heading: { gap: spacing.sm, marginBottom: spacing.xl },
  form: { gap: spacing.base },
  link: { textAlign: 'center', paddingVertical: spacing.sm, textDecorationLine: 'underline' },
});
