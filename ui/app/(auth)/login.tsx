import { Link } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/context/AuthContext';
import { radii, spacing, typography, useTheme } from '../../src/lib/theme';

export default function LoginScreen() {
  const theme = useTheme();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSignIn = async () => {
    if (loading) return;
    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields.');
      return;
    }
    setError(null);
    setLoading(true);
    const { error: err } = await signIn(email.trim(), password);
    setLoading(false);
    if (err) {
      setError(err);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.canvas }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={[typography.displayMd, { color: theme.colors.ink }]}>
              Welcome back
            </Text>
            <Text
              style={[
                typography.bodyMd,
                { color: theme.colors.muted, marginTop: spacing.xs },
              ]}
            >
              Sign in to continue your learning
            </Text>
          </View>

          <View style={styles.form}>
            <View
              style={[
                styles.inputWrapper,
                {
                  backgroundColor: theme.colors.surfaceCard,
                  borderColor: theme.colors.hairlineStrong,
                },
              ]}
            >
              <TextInput
                style={[typography.bodyMd, { color: theme.colors.ink, flex: 1 }]}
                placeholder="Email"
                placeholderTextColor={theme.colors.mutedSoft}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />
            </View>

            <View
              style={[
                styles.inputWrapper,
                {
                  backgroundColor: theme.colors.surfaceCard,
                  borderColor: theme.colors.hairlineStrong,
                },
              ]}
            >
              <TextInput
                style={[typography.bodyMd, { color: theme.colors.ink, flex: 1 }]}
                placeholder="Password"
                placeholderTextColor={theme.colors.mutedSoft}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="password"
              />
            </View>

            {error && (
              <Text
                style={[
                  typography.caption,
                  { color: theme.colors.semanticError, marginTop: spacing.xs },
                ]}
              >
                {error}
              </Text>
            )}

            <Pressable
              onPress={handleSignIn}
              disabled={loading}
              style={({ pressed }) => [
                styles.button,
                {
                  backgroundColor: pressed
                    ? theme.colors.primaryActive
                    : theme.colors.primary,
                  opacity: loading ? 0.7 : 1,
                },
              ]}
            >
              {loading ? (
                <ActivityIndicator color={theme.colors.onPrimary} size="small" />
              ) : (
                <Text style={[typography.button, { color: theme.colors.onPrimary }]}>
                  Sign In
                </Text>
              )}
            </Pressable>
          </View>

          <View style={styles.footer}>
            <Text style={[typography.bodySm, { color: theme.colors.muted }]}>
              Don't have an account?{' '}
            </Text>
            <Link href="/(auth)/register" asChild>
              <Pressable>
                <Text style={[typography.bodyStrong, { color: theme.colors.ink }]}>
                  Sign Up
                </Text>
              </Pressable>
            </Link>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  header: {
    marginBottom: spacing.xxl,
  },
  form: {
    gap: spacing.base,
  },
  inputWrapper: {
    height: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: spacing.base,
    justifyContent: 'center',
  },
  button: {
    height: 44,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
});
