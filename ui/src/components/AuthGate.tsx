import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { spacing, typography, useTheme } from '../lib/theme';
import { Button } from './Button';

export function AuthGate({
  authenticated = true,
  children,
}: {
  authenticated?: boolean;
  children: React.ReactNode;
}) {
  const { bootstrapped, session, sessionError, retrySession, passwordRecovery } = useAuth();
  const theme = useTheme();

  if (!bootstrapped) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.canvas }]}>
        {sessionError ? (
          <>
            <Text
              accessibilityRole="alert"
              style={[typography.bodyMd, styles.message, { color: theme.colors.body }]}
            >
              {sessionError}
            </Text>
            <Button label="Try again" onPress={retrySession} />
          </>
        ) : (
          <ActivityIndicator
            accessibilityLabel="Restoring session"
            color={theme.colors.primary}
          />
        )}
      </View>
    );
  }

  if (passwordRecovery && session) return <Redirect href="/reset-password" />;
  if (authenticated && !session) return <Redirect href="/(auth)/login" />;
  if (!authenticated && session) return <Redirect href="/(tabs)" />;

  // Clear screen state when accounts change, even without an intermediate logout.
  return (
    <React.Fragment key={session?.user.id ?? 'signed-out'}>
      {children}
    </React.Fragment>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.lg,
  },
  message: { textAlign: 'center' },
});
