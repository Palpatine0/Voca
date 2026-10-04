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

export default function RegisterScreen() {
  const theme = useTheme();
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSignUp = async () => {
    if (loading) return;
    if (!email.trim() || !password.trim()) {
      setError('Please fill in all fields.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setError(null);
    setLoading(true);
    const { error: err, needsEmailConfirmation } = await signUp(email.trim(), password);
    setLoading(false);
    if (err) {
      setError(err);
    } else {
      setSuccess(needsEmailConfirmation);
    }
  };

  if (success) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.canvas }]}>
        <View style={styles.container}>
          <Text style={[typography.displayMd, { color: theme.colors.ink }]}>
            Check your email
          </Text>
          <Text
            style={[
              typography.bodyMd,
              { color: theme.colors.muted, marginTop: spacing.sm },
            ]}
          >
            We sent a confirmation link to {email}. Please verify your email to
            continue.
          </Text>
          <View style={{ marginTop: spacing.xl }}>
            <Link href="/(auth)/login" asChild>
              <Pressable
                style={[
                  styles.buttonOutline,
                  { borderColor: theme.colors.hairlineStrong },
                ]}
              >
                <Text style={[typography.button, { color: theme.colors.ink }]}>
                  Back to Sign In
                </Text>
              </Pressable>
            </Link>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.canvas }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={[typography.displayMd, { color: theme.colors.ink }]}>
              Create account
            </Text>
            <Text
              style={[
                typography.bodyMd,
                { color: theme.colors.muted, marginTop: spacing.xs },
              ]}
            >
              Start building your vocabulary
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
                autoComplete="new-password"
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
                placeholder="Confirm password"
                placeholderTextColor={theme.colors.mutedSoft}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoComplete="new-password"
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
              onPress={handleSignUp}
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
                  Create Account
                </Text>
              )}
            </Pressable>
          </View>

          <View style={styles.footer}>
            <Text style={[typography.bodySm, { color: theme.colors.muted }]}>
              Already have an account?{' '}
            </Text>
            <Link href="/(auth)/login" asChild>
              <Pressable>
                <Text style={[typography.bodyStrong, { color: theme.colors.ink }]}>
                  Sign In
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
  buttonOutline: {
    height: 44,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.xl,
  },
});
